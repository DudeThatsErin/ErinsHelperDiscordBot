const fs = require('fs');
const path = require('path');
const { runBackup } = require('../onenote-backup');

const ONENOTE_LOG_CHANNEL = '1406112392651210802';

// ── Self-contained Discord logger ─────────────────────────────
async function postToLog(client, content) {
    try {
        if (!client) {
            console.error('No Discord client provided.');
            return;
        }

        const channel = await client.channels.fetch(ONENOTE_LOG_CHANNEL);
        if (channel?.isTextBased()) {
            await channel.send({ content });
        }
    } catch (err) {
        console.error('Failed to post to Discord:', err.message);
    }
}

// ── Simple in-process lock (prevents duplicate notifications) ─
let notifyLock = false;

// ── Main entrypoint ───────────────────────────────────────────
async function runBackupAndReport(client, { force = false, requestedBy = null } = {}) {

    // prevent duplicate notifications in same process
    if (notifyLock) {
        console.log('⚠️ Backup already reporting — skipping duplicate Discord message.');
        return runBackup({ force });
    }

    notifyLock = true;

    try {
        await postToLog(
            client,
            `🔄 **OneNote backup started**` +
            (requestedBy ? ` _requested by <@${requestedBy}>_` : '')
        );

        const summary = await runBackup({ force });

        const msg =
            `✅ **OneNote backup complete**\n` +
            `📄 Created: ${summary.created}\n` +
            `✏️ Updated: ${summary.updated}\n` +
            `⏭️ Skipped: ${summary.skipped}\n` +
            `❌ Failed: ${summary.failed}`;

        await postToLog(client, msg);

        return summary;

    } catch (err) {
        console.error('Backup error:', err);

        await postToLog(
            client,
            `❌ **OneNote backup failed**: ${err.message}`
        );

        throw err;

    } finally {
        notifyLock = false;
    }
}

if (require.main === module) {
    (async () => {
        try {
            console.log("🟣 Running OneNote Backup via PM2 wrapper...");

            const summary = await runBackupAndReport(null, {
                force: false,
                requestedBy: null
            });

            console.log("DONE:", summary);
            process.exit(0);

        } catch (err) {
            console.error("Backup failed:", err);
            process.exit(1);
        }
    })();
}

module.exports = {
    runBackupAndReport,
    ONENOTE_LOG_CHANNEL
};