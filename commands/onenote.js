const o = require('../config/owner.json');
const { prefix } = require('../config/config.json');
const { postNoteFromMessage } = require('../utils/onenotePost.js');

module.exports = {
    name: 'onenote',
    aliases: ['note', 'on'],
    ownerOnly: true,
    async execute(message) {
        if (message.author.id !== o.id && message.author.id !== o.altID) {
            return message.reply({ content: '❌ Only Erin can use this command.' });
        }

        // Grab everything after the command word, preserving newlines so the
        // first line can be used as the title and the rest as the body.
        const withoutPrefix = message.content.slice(prefix.length);
        const firstSpace = withoutPrefix.search(/\s/);
        const body = firstSpace === -1 ? '' : withoutPrefix.slice(firstSpace + 1).trim();

        if (!body && message.attachments.size === 0) {
            return message.reply({
                content: [
                    '**Usage:** `!onenote <title> | <content>`',
                    'Or put the title on the first line and the body on following lines.',
                    'You can also attach images/files.',
                ].join('\n'),
            });
        }

        return postNoteFromMessage(message, body);
    },
};
