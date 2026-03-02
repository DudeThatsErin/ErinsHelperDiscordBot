const { SlashCommandBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

module.exports = {
    name: 'project-add',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('project-add')
        .setDescription('Create a new project')
        .addStringOption(opt =>
            opt.setName('name')
                .setDescription('Project name')
                .setRequired(true)
        ),
    async execute(interaction) {
        const name = interaction.options.getString('name');
        const result = await tasks.addProject(name);
        if (!result.success) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `✅ Project **${name}** created (Project #${result.id}).` });
    }
};
