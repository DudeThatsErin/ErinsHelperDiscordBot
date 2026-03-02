const { SlashCommandBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

module.exports = {
    name: 'task-delete',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('task-delete')
        .setDescription('Delete a task and all its subtasks/images')
        .addIntegerOption(opt =>
            opt.setName('task')
                .setDescription('Task number (ID)')
                .setRequired(true)
        ),
    async execute(interaction) {
        const taskId = interaction.options.getInteger('task');
        const task = await tasks.getTask(taskId);
        if (!task) return interaction.reply({ content: `❌ No task found with ID \`#${taskId}\`.`, ephemeral: true });

        const result = await tasks.deleteTask(taskId);
        if (!result.success) return interaction.reply({ content: `❌ Failed to delete task: ${result.error}`, ephemeral: true });

        return interaction.reply({ content: `🗑️ Task \`#${taskId}\` — **${task.title}** — deleted (including all subtasks and images).` });
    }
};
