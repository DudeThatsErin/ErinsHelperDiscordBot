const o = require('../config/owner.json');
const { prefix } = require('../config/config.json');
const { runBackupAndReport, ONENOTE_LOG_CHANNEL } = require('../utils/onenoteBackupRun.js');
const { log } = require('../utils/logger');

module.exports = {
    name: 'backup',
    aliases: ['onenote-backup', 'obsidian-backup', 'ob'],
    ownerOnly: true,
    async execute(message) {
        if (message.author.id !== o.id && message.author.id !== o.altID) {
            return message.reply({ content: '❌ Only Erin can use this command.' });
        }

        // Optional flag: --force / -f re-downloads every page.
        const body = message.content.slice(prefix.length).replace(/^\S+\s*/, '').trim();
        const force = /^(--force|-f)\b/i.test(body);

        await message.reply({
            content: `🔄 OneNote → Obsidian backup started${force ? ' (full re-download)' : ''}. `
                + `Results will post in <#${ONENOTE_LOG_CHANNEL}>.`,
        });

        try {
            await runBackupAndReport(message.client, { force, requestedBy: message.author.id });
        } catch (err) {
            log('backup', `Error occurred while executing backup command: ${err.message}`);
            console.error('Error executing backup command:', err);
            await message.channel.send({ content: `❌ Backup crashed: ${err.message}` }).catch(() => {});
        }
    },
};
