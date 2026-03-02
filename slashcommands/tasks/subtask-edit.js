const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

module.exports = {
    name: 'subtask-edit',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('subtask-edit')
        .setDescription('Edit a subtask — opens a popup with current title pre-filled')
        .addIntegerOption(opt =>
            opt.setName('subtask')
                .setDescription('Subtask number (ID)')
                .setRequired(true)
        ),
    async execute(interaction) {
        const subtaskId = interaction.options.getInteger('subtask');
        const subtask = await require('../../database.js').get('SELECT * FROM subtasks WHERE id = ?', [subtaskId]);
        if (!subtask) return interaction.reply({ content: `❌ No subtask found with ID \`#${subtaskId}\`.`, ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId(`subtask-edit:${subtaskId}`)
            .setTitle(`Edit Subtask #${subtaskId}`);

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder({ label: 'Subtask Title' })
                    .setCustomId('title')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(200)
                    .setValue(subtask.title)
                    .setRequired(true)
            )
        );

        return interaction.showModal(modal);
    },
    async handleModal(interaction) {
        const [, subtaskId] = interaction.customId.split(':');
        const title = interaction.fields.getTextInputValue('title').trim();

        const result = await require('../../database.js').run(
            'UPDATE subtasks SET title = ? WHERE id = ?',
            [title, parseInt(subtaskId)]
        );

        if (!result.changes) return interaction.reply({ content: `❌ Subtask \`#${subtaskId}\` not found.`, ephemeral: true });

        return interaction.reply({ content: `✅ Subtask \`#${subtaskId}\` updated to:\n> ${title}` });
    }
};
