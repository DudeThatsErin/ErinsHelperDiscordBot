const { SlashCommandBuilder } = require('discord.js');
const { buildAuthUrl } = require('../../utils/onenote.js');

module.exports = {
    name: 'onenote-auth',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('onenote-auth')
        .setDescription('Link your Microsoft account to enable OneNote integration'),
    async execute(interaction) {
        const url = buildAuthUrl(interaction.user.id);
        return interaction.reply({
            content: `🔑 Click the link below to authorise Microsoft access.\nOnce you complete the login in your browser, come back and run \`/onenote-setup\` to pick your notebook section.\n\n${url}`,
            ephemeral: true
        });
    }
};
