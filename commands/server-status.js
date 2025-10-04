const Discord = require('discord.js');
const bot = require('../config/bot.json');
const color = require('../config/embed.json');
const { getServerConfig } = require('../utils/serverConfig');

module.exports = {
    name: 'server-status',
    description: 'Pushes an embed to display in the channel about a server update.',
    usage: `/server-status <message>`,
    ownerOnly: 1,
    options: [
        {
            name: 'message',
            description: 'Server status message to announce',
            type: 3,
            required: true
        }
    ],
    async execute(message, args, client) {
        const serverConfig = getServerConfig(message.guild.id);
        if (!serverConfig) {
            return message.reply({ content: 'This command is not configured for this server.' });
        }

        const channel = client.channels.cache.get(serverConfig.announcementsChannelId);
        const reason = args.join(' ');

        if (!channel) {
            return message.reply({ content: 'Could not find the announcements channel!' });
        }

        let embed = new Discord.EmbedBuilder()
            .setColor(parseInt(color.navy_color, 16))
            .setTitle('Server Update!')
            .setDescription(reason)
            .setTimestamp()
            .setFooter({text: 'Want to suggest a feature for the server? Use /suggestions', iconURL: bot.avatar, timestamp: new Date()});

        try {
            await channel.send({ embeds: [embed] });
            message.reply({ content: '✅ Server status update sent!' });
        } catch (error) {
            console.error('Error sending server status:', error);
            message.reply({ content: '❌ Failed to send server status update.' });
        }
    }
};
