const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

module.exports = {
    name: 'task-edit',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('task-edit')
        .setDescription('Edit a task — opens a popup with current values pre-filled')
        .addIntegerOption(opt =>
            opt.setName('task')
                .setDescription('Task number (ID)')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('status')
                .setDescription('New status (optional — change via popup or set here)')
                .setRequired(false)
                .addChoices(
                    { name: '⬜ Todo', value: 'todo' },
                    { name: '🟡 In Progress', value: 'in-progress' },
                    { name: '✅ Done', value: 'done' }
                )
        ),
    async execute(interaction) {
        const taskId = interaction.options.getInteger('task');
        const status = interaction.options.getString('status');

        const task = await tasks.getTask(taskId);
        if (!task) return interaction.reply({ content: `❌ No task found with ID \`#${taskId}\`.`, ephemeral: true });

        if (status) {
            const result = await tasks.updateTask(taskId, { status });
            if (!result.success) return interaction.reply({ content: `❌ Failed to update status: ${result.error}`, ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`task-edit:${taskId}`)
            .setTitle(`Edit Task #${taskId}`);

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder({ label: 'Task Title' })
                    .setCustomId('title')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(200)
                    .setValue(task.title)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder({ label: 'Description' })
                    .setCustomId('description')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1000)
                    .setValue(task.description || '')
                    .setPlaceholder('Optional — describe the task')
                    .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder({ label: 'Image URL' })
                    .setCustomId('image')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(1000)
                    .setRequired(false)
                    .setPlaceholder('https://... adds a new image to this task')
            )
        );

        return interaction.showModal(modal);
    },
    async handleModal(interaction) {
        const [, taskId] = interaction.customId.split(':');
        const title = interaction.fields.getTextInputValue('title').trim();
        const description = interaction.fields.getTextInputValue('description').trim() || null;
        const imageInput = interaction.fields.getTextInputValue('image').trim() || null;

        const fields = { title };
        if (description !== null) fields.description = description;

        const result = await tasks.updateTask(parseInt(taskId), fields);
        if (!result.success) return interaction.reply({ content: `❌ Failed to update task: ${result.error}`, ephemeral: true });

        if (imageInput) {
            await tasks.addImage(parseInt(taskId), imageInput, null);
        }

        return interaction.reply({
            content: `✅ Task \`#${taskId}\` updated.${imageInput ? `\n> 🖼️ New image added: ${imageInput}` : ''}`
        });
    }
};
