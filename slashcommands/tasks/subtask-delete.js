const { SlashCommandBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

module.exports = {
    name: 'subtask-delete',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('subtask-delete')
        .setDescription('Delete a subtask')
        .addIntegerOption(opt =>
            opt.setName('subtask')
                .setDescription('Subtask number (ID)')
                .setRequired(true)
        ),
    async execute(interaction) {
        const subtaskId = interaction.options.getInteger('subtask');

        const subtask = await require('../../database.js').get('SELECT * FROM subtasks WHERE id = ?', [subtaskId]);
        if (!subtask) return interaction.reply({ content: `❌ No subtask found with ID \`#${subtaskId}\`.`, ephemeral: true });

        const result = await tasks.deleteSubtask(subtaskId);
        if (!result.success) return interaction.reply({ content: `❌ Failed to delete subtask: ${result.error}`, ephemeral: true });

        return interaction.reply({ content: `🗑️ Subtask \`#${subtaskId}\` — **${subtask.title}** — deleted.` });
    }
};
