const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPrograms } = require('../../utils/testflightStore');

module.exports = {
    name: 'testflight-list',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('testflight-list')
        .setDescription('List the TestFlight programs currently being watched'),
    async execute(interaction) {
        const programs = getPrograms();

        if (!programs.length) {
            return interaction.reply({ content: `📭 No TestFlight programs are being tracked. Use \`/testflight-add\` to add one.`, flags: 64 });
        }

        const embed = new EmbedBuilder()
            .setTitle('Tracked TestFlight Programs')
            .setColor(0x1ea0e1)
            .setDescription(programs.map((p, i) => `**${i + 1}.** ${p.name}\n> \`${p.id}\` · https://testflight.apple.com/join/${p.id}`).join('\n\n'))
            .setFooter({ text: `${programs.length} program(s) tracked` });

        return interaction.reply({ embeds: [embed], flags: 64 });
    }
};
