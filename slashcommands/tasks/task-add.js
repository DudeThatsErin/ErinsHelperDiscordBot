const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

module.exports = {
    name: 'task-add',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('task-add')
        .setDescription('Add a new task to a project')
        .addStringOption(opt =>
            opt.setName('project')
                .setDescription('Project name or number')
                .setRequired(true)
        ),
    async execute(interaction) {
        const projectInput = interaction.options.getString('project');
        const identifier = isNaN(projectInput) ? projectInput : parseInt(projectInput);
        const project = await tasks.getProject(identifier);
        if (!project) return interaction.reply({ content: `❌ No project found matching \`${projectInput}\`. Use \`/project-add\` to create it first.`, ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId(`task-add:${project.id}`)
            .setTitle(`New Task — ${project.name}`);

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder({ label: 'Task Title' })
                    .setCustomId('title')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(200)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder({ label: 'Description' })
                    .setCustomId('description')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1000)
                    .setPlaceholder('Optional — describe the task')
                    .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder({ label: 'Image URL' })
                    .setCustomId('image')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(1000)
                    .setRequired(false)
                    .setPlaceholder('https://... (optional)')
            )
        );

        return interaction.showModal(modal);
    },
    async handleModal(interaction) {
        const [, projectId] = interaction.customId.split(':');
        const title = interaction.fields.getTextInputValue('title').trim();
        const description = interaction.fields.getTextInputValue('description').trim() || null;
        const imageInput = interaction.fields.getTextInputValue('image').trim() || null;

        const project = await tasks.getProject(parseInt(projectId));
        if (!project) return interaction.reply({ content: `❌ Project not found.`, ephemeral: true });

        const result = await tasks.addTask(project.id, title, description);
        if (!result.success) return interaction.reply({ content: `❌ Failed to add task: ${result.error}`, ephemeral: true });

        if (imageInput) {
            await tasks.addImage(result.id, imageInput, null);
        }

        return interaction.reply({
            content: `✅ Task \`#${result.id}\` added to **${project.name}**:\n> **${title}**${description ? `\n> ${description}` : ''}${imageInput ? `\n> 🖼️ ${imageInput}` : ''}`
        });
    }
};
