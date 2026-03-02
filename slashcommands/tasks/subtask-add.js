const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

module.exports = {
    name: 'subtask-add',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('subtask-add')
        .setDescription('Add a subtask to an existing task — opens a popup')
        .addIntegerOption(opt =>
            opt.setName('task')
                .setDescription('Task number (ID)')
                .setRequired(true)
        ),
    async execute(interaction) {
        const taskId = interaction.options.getInteger('task');

        const task = await tasks.getTask(taskId);
        if (!task) return interaction.reply({ content: `❌ No task found with ID \`#${taskId}\`.`, ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId(`subtask-add:${taskId}`)
            .setTitle(`New Subtask — #${taskId} ${task.title.substring(0, 40)}`);

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder({ label: 'Subtask Title' })
                    .setCustomId('title')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(200)
                    .setRequired(true)
            )
        );

        return interaction.showModal(modal);
    },
    async handleModal(interaction) {
        const [, taskId] = interaction.customId.split(':');
        const title = interaction.fields.getTextInputValue('title').trim();

        const task = await tasks.getTask(parseInt(taskId));
        if (!task) return interaction.reply({ content: `❌ Task not found.`, ephemeral: true });

        const result = await tasks.addSubtask(parseInt(taskId), title);
        if (!result.success) return interaction.reply({ content: `❌ Failed to add subtask: ${result.error}`, ephemeral: true });

        return interaction.reply({ content: `✅ Subtask \`#${result.id}\` added to task \`#${taskId}\` — **${task.title}**:\n> ${title}` });
    }
};
