const { SlashCommandBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

module.exports = {
    name: 'project-delete',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('project-delete')
        .setDescription('Delete a project and ALL its tasks, subtasks, and images')
        .addStringOption(opt =>
            opt.setName('project')
                .setDescription('Project name or number')
                .setRequired(true)
        ),
    async execute(interaction) {
        const projectInput = interaction.options.getString('project');
        const identifier = isNaN(projectInput) ? projectInput : parseInt(projectInput);
        const project = await tasks.getProject(identifier);
        if (!project) return interaction.reply({ content: `❌ No project found matching \`${projectInput}\`.`, ephemeral: true });

        const result = await tasks.deleteProject(project.id);
        if (!result.success) return interaction.reply({ content: `❌ Failed to delete project: ${result.error}`, ephemeral: true });

        return interaction.reply({ content: `🗑️ Project **${project.name}** (and all its tasks) deleted.` });
    }
};
