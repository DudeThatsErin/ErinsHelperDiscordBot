const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

const STATUS_EMOJI = { todo: '⬜', 'in-progress': '🟡', done: '✅' };
const STATUS_COLOR = { todo: 0x99aab5, 'in-progress': 0xfee75c, done: 0x57f287 };

module.exports = {
    name: 'task-details',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('task-details')
        .setDescription('View full details of a task')
        .addIntegerOption(opt =>
            opt.setName('task')
                .setDescription('Task number (ID)')
                .setRequired(true)
        ),
    async execute(interaction) {
        const taskId = interaction.options.getInteger('task');
        const task = await tasks.getTask(taskId);
        if (!task) return interaction.reply({ content: `❌ No task found with ID \`#${taskId}\`.`, ephemeral: true });

        const [subtaskList, imageList] = await Promise.all([
            tasks.getSubtasks(taskId),
            tasks.getImages(taskId)
        ]);

        const status = task.status || 'todo';
        const embed = new EmbedBuilder()
            .setColor(STATUS_COLOR[status] || 0x5865F2)
            .setTitle(`${STATUS_EMOJI[status] || '⬜'} #${task.id} — ${task.title}`)
            .addFields({ name: '📂 Project', value: task.project_name, inline: true })
            .addFields({ name: '📌 Status', value: status, inline: true });

        if (task.description) {
            embed.addFields({ name: '📝 Description', value: task.description });
        }

        if (subtaskList.length) {
            const subtaskText = subtaskList
                .map(s => `${s.done ? '✅' : '⬜'} \`#${s.id}\` ${s.title}`)
                .join('\n');
            embed.addFields({ name: '🔖 Subtasks', value: subtaskText });
        }

        if (imageList.length) {
            const imageText = imageList
                .map(img => `\`img#${img.id}\` ${img.label ? `**${img.label}** — ` : ''}${img.url}`)
                .join('\n');
            embed.addFields({ name: '🖼️ Images', value: imageText });
            if (imageList.length === 1) embed.setImage(imageList[0].url);
        }

        embed.setFooter({ text: `Task #${task.id} · Created ${new Date(task.created_at).toLocaleDateString()}` });
        return interaction.reply({ embeds: [embed] });
    }
};
