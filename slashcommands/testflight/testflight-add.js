const { SlashCommandBuilder } = require('discord.js');
const { addProgram } = require('../../utils/testflightStore');

module.exports = {
    name: 'testflight-add',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('testflight-add')
        .setDescription('Add a TestFlight program to the watcher')
        .addStringOption(opt =>
            opt.setName('id')
                .setDescription('TestFlight join code or full https://testflight.apple.com/join/... URL')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('name')
                .setDescription('Friendly name to display (defaults to the join code)')
                .setRequired(false)
        ),
    async execute(interaction) {
        const idInput = interaction.options.getString('id');
        const name = interaction.options.getString('name');

        const result = addProgram(idInput, name);

        if (!result.ok) {
            if (result.reason === 'exists') {
                return interaction.reply({ content: `⚠️ A program with that join code is already being tracked.`, flags: 64 });
            }
            return interaction.reply({ content: `❌ That doesn't look like a valid TestFlight join code or URL.`, flags: 64 });
        }

        const { id, name: savedName } = result.program;
        return interaction.reply({
            content: `✅ Now watching **${savedName}**\n> Join code: \`${id}\`\n> https://testflight.apple.com/join/${id}\n\nThe watcher will pick it up on its next cycle (within 30s).`
        });
    }
};
