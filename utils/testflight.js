const https = require('https');
const { EmbedBuilder } = require('discord.js');

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

function getName(html) {
    if (html.includes('<title>Join the ')) {
        return html.split('<title>Join the ')[1].split(' - TestFlight - Apple</title>')[0];
    }
    return 'App';
}

function buildEmbed(programs, lastChecked) {
    const embed = new EmbedBuilder()
        .setTitle('TestFlight Watcher')
        .setColor(0x1ea0e1)
        .setFooter({ text: `Last checked: ${lastChecked}` });

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
                await channel.send(`<@${pingUserId}>`).catch(err =>
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
    return new Date().toUTCString();
}

async function startTestFlightWatcher(client) {
    const jsonConfig = require('../config.json');
    const programs = jsonConfig.testflight?.programs;
    const channelId = jsonConfig.channels?.testflight;
    const pingUserId = jsonConfig.testflight?.pingUserId;

    if (!programs || programs.length === 0) {
        console.log('[TestFlight] No programs configured, watcher not started.');
        return;
    }

    if (!channelId) {
        console.log('[TestFlight] No channel configured, watcher not started.');
        return;
    }

    const channel = await client.channels.fetch(channelId).catch(err => {
        console.warn(`[TestFlight] Could not fetch channel ${channelId}: ${err.message}`);
        return null;
    });

    if (!channel) return;

    console.log(`[TestFlight] Watching ${programs.length} program(s) every ${INTERVAL_MS / 1000}s in channel ${channelId}.`);

    const run = async () => {
        await runChecks(programs, channel, pingUserId);
        const embed = buildEmbed(programs, formatTimestamp());

        try {
            if (!statusMessage) {
                statusMessage = await channel.send({ embeds: [embed] });
            } else {
                await statusMessage.edit({ embeds: [embed] });
            }
        } catch (err) {
            console.warn(`[TestFlight] Failed to send/edit status message: ${err.message}`);
            statusMessage = null;
        }
    };

    await run();
    setInterval(run, INTERVAL_MS);
}

module.exports = { startTestFlightWatcher };
