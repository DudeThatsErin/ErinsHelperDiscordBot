const o = require('../config/owner.json');
const { prefix } = require('../config/config.json');
const { appendFromMessage } = require('../utils/onenotePost.js');

module.exports = {
    name: 'append',
    aliases: ['ap', 'log', 'addnote', 'addnoteitem', 'addnoteentry'],
    ownerOnly: true,
    async execute(message) {
        if (message.author.id !== o.id && message.author.id !== o.altID) {
            return message.reply({ content: '❌ Only Erin can use this command.' });
        }

        // Everything after the command word, keeping newlines so the first line
        // can be the page title and the rest the text to append.
        const withoutPrefix = message.content.slice(prefix.length);
        const firstSpace = withoutPrefix.search(/\s/);
        let body = firstSpace === -1 ? '' : withoutPrefix.slice(firstSpace + 1).trim();

        // Optional leading flag: --list / -l turns each following line into a bullet.
        let list = false;
        const flag = body.match(/^(--list|-l)\b[ \t]*/i);
        if (flag) {
            list = true;
            body = body.slice(flag[0].length);
        }

        if (!body) {
            return message.reply({
                content: [
                    '**Usage:** `!append <title> | <text to append>`',
                    'Or put the title on the first line and the text on the following line(s).',
                    'Appends to an existing note with that exact title (quotes & emojis are fine).',
                    "If the note doesn't exist yet, it will be created.",
                    '',
                    '**List mode:** `!append --list <title>` then one item per line:',
                    '```',
                    '!append --list Shopping',
                    'Milk',
                    'Eggs',
                    '```',
                ].join('\n'),
            });
        }

        return appendFromMessage(message, body, { list });
    },
};
