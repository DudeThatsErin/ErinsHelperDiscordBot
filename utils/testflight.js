const https = require('https');
const { EmbedBuilder } = require('discord.js');
const { getPrograms } = require('./testflightStore');
const { state: botState } = require('../database.js');

const EMBED_TITLE = 'TestFlight Watcher';
const STATE_KEY = 'testflight_status_message_id';

const REQUEST_HEADERS = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'accept-language': 'en-US,en;q=0.9',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36'
};

const INTERVAL_MS = 30000;

// Tracks current status per program id: { available: bool, error: bool }
const statusCache = {};

// The single persistent Discord message we keep editing
let statusMessage = null;

function fetchPage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: REQUEST_HEADERS }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function isFull(html) {
    return html.includes('This beta is full.') || html.includes("This beta isn't accepting any new testers right now.");
}

function buildEmbed(programs, lastChecked) {
    const embed = new EmbedBuilder()
        .setTitle(EMBED_TITLE)
        .setColor(0x1ea0e1)
        .setFooter({ text: `Last checked: ${lastChecked}` });

    if (!programs.length) {
        embed.setDescription('No programs are being tracked. Use `/testflight-add` to add one.');
        return embed;
    }

    const fields = programs.map(p => {
        const state = statusCache[p.id];
        let value;
        if (!state) {
            value = '⏳ Checking...';
        } else if (state.error) {
            value = '⚠️ Check failed (will retry)';
        } else if (state.available) {
            value = `✅ **Available!** → [Join TestFlight](https://testflight.apple.com/join/${p.id})`;
        } else {
            value = '🔴 Full';
        }
        return { name: p.name || p.id, value, inline: false };
    });

    embed.addFields(fields);
    return embed;
}

async function runChecks(programs, channel, pingUserId) {
    for (const program of programs) {
        try {
            const html = await fetchPage(`https://testflight.apple.com/join/${program.id}`);
            const available = !isFull(html);
            const prev = statusCache[program.id];
            const becameAvailable = available && prev && !prev.available && !prev.error;
            statusCache[program.id] = { available, error: false };
            if (becameAvailable && pingUserId && channel) {
                await channel.send(`<@${pingUserId}> ${program.name || program.id} is now available!`).catch(err =>
                    console.warn(`[TestFlight] Failed to send ping: ${err.message}`)
                );
            }
        } catch (err) {
            statusCache[program.id] = { available: false, error: true };
            console.warn(`[TestFlight] [${program.name || program.id}] Request failed: ${err.message}`);
        }
    }
}

function formatTimestamp() {
    // Display in Erin's local Central time (auto-switches CST/CDT for DST).
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZoneName: 'short'
    });
}

// Delete every existing TestFlight Watcher message the bot has posted in the
// channel. This guarantees we never accumulate duplicates, even for orphans
// that were posted before message-id persistence existed.
async function clearOldStatusMessages(channel, exceptId = null) {
    try {
        const recent = await channel.messages.fetch({ limit: 50 });
        const mine = recent.filter(m =>
            m.author.id === channel.client.user.id &&
            m.id !== exceptId &&
            m.embeds.some(e => e.title === EMBED_TITLE)
        );
        for (const message of mine.values()) {
            await message.delete().catch(err =>
                console.warn(`[TestFlight] Could not delete old status message ${message.id}: ${err.message}`)
            );
        }
        if (mine.size) console.log(`[TestFlight] Cleared ${mine.size} old status message(s).`);
    } catch (err) {
        console.warn(`[TestFlight] Failed to scan channel for old status messages: ${err.message}`);
    }
}

async function startTestFlightWatcher(client) {
    const jsonConfig = require('../config/settings.json');
    const channelId = jsonConfig.channels?.testflight;
    const pingUserId = jsonConfig.testflight?.pingUserId;

    if (!channelId) {
        console.log('[TestFlight] No channel configured, watcher not started.');
        return;
    }

    const channel = await client.channels.fetch(channelId).catch(err => {
        console.warn(`[TestFlight] Could not fetch channel ${channelId}: ${err.message}`);
        return null;
    });

    if (!channel) return;

    console.log(`[TestFlight] Watching every ${INTERVAL_MS / 1000}s in channel ${channelId}. Program list is read live each cycle.`);

    const run = async () => {
        // Read the program list fresh every cycle so /testflight-add and
        // /testflight-remove take effect without restarting the bot.
        const programs = getPrograms();

        // Drop cached state for programs that are no longer tracked.
        const activeIds = new Set(programs.map(p => p.id));
        for (const id of Object.keys(statusCache)) {
            if (!activeIds.has(id)) delete statusCache[id];
        }

        await runChecks(programs, channel, pingUserId);
        const embed = buildEmbed(programs, formatTimestamp());

        // Edit the message we already created this session.
        if (statusMessage) {
            try {
                await statusMessage.edit({ embeds: [embed] });
                return;
            } catch (err) {
                console.warn(`[TestFlight] Failed to edit status message, creating a fresh one: ${err.message}`);
                statusMessage = null;
            }
        }

        // Creating a new message (e.g. first run after a restart): wipe out
        // every previous TestFlight Watcher message in the channel first so we
        // never leave orphans behind, then post a fresh one and remember its id.
        await clearOldStatusMessages(channel);

        try {
            statusMessage = await channel.send({ embeds: [embed] });
            botState.set(STATE_KEY, statusMessage.id);
        } catch (err) {
            console.warn(`[TestFlight] Failed to send status message: ${err.message}`);
            statusMessage = null;
        }
    };

    await run();
    setInterval(run, INTERVAL_MS);
}

module.exports = { startTestFlightWatcher };
