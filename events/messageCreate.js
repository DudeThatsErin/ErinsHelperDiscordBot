
const { prefix } = require('../config/config.json');

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
                    console.error(`Error executing prefix command ${commandName}:`, error);
                    message.reply({ content: '❌ There was an error executing that command.' }).catch(() => {});
                }
                return;
            }
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

            await message.reply({ content: parts.join('\n\n') });
        }
    }
}