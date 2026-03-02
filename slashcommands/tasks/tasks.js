const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

const STATUS_EMOJI = { todo: '⬜', 'in-progress': '🟡', done: '✅' };

module.exports = {
    name: 'tasks',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('tasks')
        .setDescription('View all tasks, optionally filtered by project')
        .addStringOption(opt =>
            opt.setName('project')
                .setDescription('Project name or number to filter by')
                .setRequired(false)
        ),
    async execute(interaction) {
        const projectInput = interaction.options.getString('project');

        if (projectInput) {
            const identifier = isNaN(projectInput) ? projectInput : parseInt(projectInput);
            const project = await tasks.getProject(identifier);
            if (!project) return interaction.reply({ content: `❌ No project found matching \`${projectInput}\`.`, ephemeral: true });

            const taskList = await tasks.getTasksByProject(project.id);
            if (!taskList.length) return interaction.reply({ content: `📂 **${project.name}** has no tasks yet. Use \`/task-add\` to add one.`, ephemeral: true });

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`📂 ${project.name}`)
                .setDescription(taskList.map(t => `\`#${t.id}\` ${STATUS_EMOJI[t.status] || '⬜'} ${t.title}`).join('\n'))
                .setFooter({ text: `${taskList.length} task(s) · Use /task-details [task #] for more info` });

            return interaction.reply({ embeds: [embed] });
        }

        const allProjects = await tasks.getAllProjects();
        if (!allProjects.length) return interaction.reply({ content: `📭 No projects yet. Use \`/project-add\` to create one.`, ephemeral: true });

        const allTasks = await tasks.getAllTasks();

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 All Tasks by Project');

        for (const project of allProjects) {
            const projectTasks = allTasks.filter(t => t.project_id === project.id);
            const value = projectTasks.length
                ? projectTasks.map(t => `\`#${t.id}\` ${STATUS_EMOJI[t.status] || '⬜'} ${t.title}`).join('\n')
                : '_No tasks yet_';
            embed.addFields({ name: `📂 ${project.name} (Project #${project.id})`, value });
        }

        embed.setFooter({ text: 'Use /task-details [task #] for full info · /tasks [project] to filter' });
        return interaction.reply({ embeds: [embed] });
    }
};
