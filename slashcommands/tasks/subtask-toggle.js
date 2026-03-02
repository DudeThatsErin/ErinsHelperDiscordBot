const { SlashCommandBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

module.exports = {
    name: 'subtask-toggle',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('subtask-toggle')
        .setDescription('Toggle a subtask between done and not done')
        .addIntegerOption(opt =>
            opt.setName('subtask')
                .setDescription('Subtask number (ID)')
                .setRequired(true)
        ),
    async execute(interaction) {
        const subtaskId = interaction.options.getInteger('subtask');

        const subtask = await require('../../database.js').get('SELECT * FROM subtasks WHERE id = ?', [subtaskId]);
        if (!subtask) return interaction.reply({ content: `❌ No subtask found with ID \`#${subtaskId}\`.`, ephemeral: true });

        const result = await tasks.toggleSubtask(subtaskId);
        if (!result.success) return interaction.reply({ content: `❌ Failed to toggle subtask: ${result.error}`, ephemeral: true });

        const newState = subtask.done === 0 ? '✅ Done' : '⬜ Not done';
        return interaction.reply({ content: `🔄 Subtask \`#${subtaskId}\` — **${subtask.title}** — marked as **${newState}**.` });
    }
};
