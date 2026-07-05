// Generalized Discord notifier used by the OneNote webhook server and the
// uptime watchdog. Wraps the raw REST client so callers can post to a channel,
// DM a user, or both, without each entry point re-implementing the plumbing.
const { REST, Routes } = require('discord.js');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Discord messages cap at 2000 chars; leave headroom for code fences etc.
const MAX_CONTENT = 1900;

// DM channels are stable per-user, so cache the id after first lookup.
const dmChannelCache = new Map();

function truncate(content) {
    const str = typeof content === 'string' ? content : String(content);
    return str.length > MAX_CONTENT ? `${str.slice(0, MAX_CONTENT)}…` : str;
}

// Post a plain message to a text channel. No-op if channelId is falsy.
async function postToChannel(channelId, content) {
    if (!channelId) return;
    await rest.post(Routes.channelMessages(channelId), {
        body: { content: truncate(content) },
    });
}

// Resolve (and cache) the DM channel id for a user.
async function getDmChannelId(userId) {
    if (dmChannelCache.has(userId)) return dmChannelCache.get(userId);
    const channel = await rest.post(Routes.userChannels(), {
        body: { recipient_id: userId },
    });
    dmChannelCache.set(userId, channel.id);
    return channel.id;
}

// Send a direct message to a user. No-op if userId is falsy.
async function dmUser(userId, content) {
    if (!userId) return;
    const channelId = await getDmChannelId(userId);
    await rest.post(Routes.channelMessages(channelId), {
        body: { content: truncate(content) },
    });
}

// Fan out a message to any combination of a channel and/or a DM. Each target is
// attempted independently so one failure doesn't suppress the others. Returns
// true if at least one delivery succeeded.
async function alert(content, { channelId = null, userId = null } = {}) {
    let delivered = false;
    if (channelId) {
        try { await postToChannel(channelId, content); delivered = true; }
        catch (err) { console.error('notify: channel post failed:', err.message); }
    }
    if (userId) {
        try { await dmUser(userId, content); delivered = true; }
        catch (err) { console.error('notify: DM failed:', err.message); }
    }
    return delivered;
}

module.exports = { rest, postToChannel, dmUser, alert };
