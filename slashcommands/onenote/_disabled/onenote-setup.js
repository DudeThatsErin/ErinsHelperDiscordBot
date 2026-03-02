const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getNotebooks, getSections, saveSectionId } = require('../../utils/onenote.js');

module.exports = {
    name: 'onenote-setup',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('onenote-setup')
        .setDescription('Choose which OneNote notebook and section to send notes to')
        .addStringOption(opt =>
            opt.setName('notebook_id')
                .setDescription('Notebook ID from /onenote-notebooks (leave blank to list notebooks)')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('section_id')
                .setDescription('Section ID to save as your default target')
                .setRequired(false)
        ),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const notebookId = interaction.options.getString('notebook_id');
        const sectionId  = interaction.options.getString('section_id');

        try {
            // If both provided, save the section
            if (notebookId && sectionId) {
                await saveSectionId(interaction.user.id, sectionId);
                return interaction.editReply({ content: `✅ Default OneNote section set! You can now use \`/onenote\` to send notes.` });
            }

            // If only notebook provided, list its sections
            if (notebookId) {
                const sections = await getSections(interaction.user.id, notebookId);
                if (!sections.length) return interaction.editReply({ content: '📭 No sections found in that notebook.' });

                const embed = new EmbedBuilder()
                    .setColor(0x7719AA)
                    .setTitle('📓 Sections — copy an ID and run `/onenote-setup` again')
                    .setDescription(sections.map(s => `**${s.displayName}**\n\`${s.id}\``).join('\n\n'));
                return interaction.editReply({ embeds: [embed] });
            }

            // Default: list notebooks
            const notebooks = await getNotebooks(interaction.user.id);
            if (!notebooks.length) return interaction.editReply({ content: '📭 No notebooks found on your account.' });

            const embed = new EmbedBuilder()
                .setColor(0x7719AA)
                .setTitle('📚 Your OneNote Notebooks')
                .setDescription(
                    notebooks.map(n => `**${n.displayName}**\n\`${n.id}\``).join('\n\n') +
                    '\n\n*Run `/onenote-setup notebook_id:[id]` to list its sections.*'
                );
            return interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error('onenote-setup error:', err.message);
            return interaction.editReply({ content: `❌ ${err.message}` });
        }
    }
};
