
module.exports = {
    name: 'messageCreate',
    async execute(message, client) {

        if (message.author.bot) return;

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