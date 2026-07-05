
const { prefix } = require('../config/config.json');
const o = require('../config/owner.json');
const { postNoteFromMessage } = require('../utils/onenotePost.js');
const { log } = require('../utils/logger');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {

        if (message.author.bot) return;

        // Handle prefix commands
        if (message.content.startsWith(prefix)) {
            const args = message.content.slice(prefix.length).trim().split(/\s+/);
            const commandName = args.shift().toLowerCase();

            const command = client.commands.get(commandName)
                || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

            if (command) {
                try {
                    await command.execute(message, args, client);
                } catch (error) {
                    log('messageCreate', `Error executing prefix command ${commandName}: ${error.message}`);
                    console.error(`Error executing prefix command ${commandName}:`, error);
                    message.reply({ content: '❌ There was an error executing that command.' }).catch(() => {});
                }
                return;
            }
        }

        // DM the bot to post straight to OneNote (owner only). The first line is
        // the title, the rest is the body. Attachments are included too.
        if (!message.guild && (message.author.id === o.id || message.author.id === o.altID)) {
            if (message.content.trim() || message.attachments.size > 0) {
                try {
                    await postNoteFromMessage(message, message.content);
                } catch (error) {
                    log('messageCreate', `Error posting OneNote note from DM: ${error.message}`);
                    console.error('Error posting OneNote note from DM:', error);
                    message.reply({ content: '❌ There was an error posting that note.' }).catch(() => {});
                }
            }
            return;
        }

        // Check for OneNote/OneDrive links
        const webLinkRegex = /https?:\/\/onedrive\.live\.com\/[^\s]+/i;
        const inAppLinkRegex = /onenote:https?:\/\/[^\s]+/i;

        const webLinkMatch = message.content.match(webLinkRegex);
        const inAppLinkMatch = message.content.match(inAppLinkRegex);

        if (webLinkMatch || inAppLinkMatch) {
            const webLink = webLinkMatch ? webLinkMatch[0] : null;
            const inAppLink = inAppLinkMatch
                ? inAppLinkMatch[0]
                : webLink.replace(/https?:\/\/onedrive\.live\.com\//i, 'onenote:https://onedrive.live.com/');

            const parts = [];
            if (webLink) parts.push(`Web Link: | [Test Link](<${webLink}>)\n\`\`\`\n${webLink}\n\`\`\``);
            if (inAppLink) parts.push(`OneNote (Opens in the app): \n\`\`\`\n${inAppLink}\n\`\`\`\nThis cannot be tested through Discord.`);

            log('messageCreate', `Posting OneNote links from message: ${message.id}`);
            await message.reply({ content: parts.join('\n\n') });
        }
    }
}