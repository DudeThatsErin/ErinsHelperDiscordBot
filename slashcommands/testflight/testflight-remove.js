const { SlashCommandBuilder } = require('discord.js');
const { removeProgram, getPrograms } = require('../../utils/testflightStore');

module.exports = {
    name: 'testflight-remove',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('testflight-remove')
        .setDescription('Remove a TestFlight program from the watcher')
        .addStringOption(opt =>
            opt.setName('program')
                .setDescription('Join code, full URL, or the exact display name of the program to remove')
                .setRequired(true)
        ),
    async execute(interaction) {
        const input = interaction.options.getString('program');
        const result = removeProgram(input);

        if (!result.ok) {
            const current = getPrograms();
            const list = current.length
                ? current.map(p => `• ${p.name} — \`${p.id}\``).join('\n')
                : '_No programs are currently tracked._';
            return interaction.reply({
                content: `❌ Couldn't find a program matching \`${input}\`.\n\n**Currently tracked:**\n${list}`,
                flags: 64
            });
        }

        const { id, name } = result.program;
        return interaction.reply({
            content: `🗑️ Stopped watching **${name}** (\`${id}\`).`
        });
    }
};
