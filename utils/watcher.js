// Generic, config-driven watcher engine.
//
// Generalises the TestFlight watcher: instead of one hard-coded check, it polls
// any list of user-defined watchers and pings Discord when something changes.
// Supported watcher types:
//   • text  — fetch a page, notify when a substring/regex appears (or disappears).
//             e.g. restock ("Add to cart"), a page saying "In stock".
//   • json  — fetch a JSON API, read a field by path, notify on change or when a
//             numeric threshold is crossed. e.g. price drops, GitHub release tag.
//   • rss   — fetch an RSS/Atom feed, notify on brand-new items.
//   • hash  — fetch a page, notify when its content (or a regex slice) changes.
//
// State (last value/hash/feed-ids) is persisted per watcher so change detection
// survives restarts. The very first observation only establishes a baseline — it
// never notifies — so adding a watcher (or a restart) can't spam you.
const axios = require('axios');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const {
    getWatchers, getState, setState,
} = require('./watcherStore.js');
const settings = require('../config/settings.json');
const { id: ownerId } = require('../config/owner.json');

const TICK_MS = 30000; // how often we wake up to see which watchers are due
const REQUEST_HEADERS = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
async function fetchBody(url) {
    const res = await axios.get(url, {
        headers: REQUEST_HEADERS,
        timeout: 20000,
        maxContentLength: 10 * 1024 * 1024,
        responseType: 'text',
        transformResponse: [(d) => d], // keep the raw string for every type
        validateStatus: (s) => s >= 200 && s < 400,
    });
    return String(res.data ?? '');
}

// Resolve a dotted/indexed path like "assets[0].name" against an object.
function getByPath(obj, pathStr) {
    if (!pathStr) return obj;
    const parts = String(pathStr).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let cur = obj;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

function compareNums(op, a, b) {
    switch (op) {
        case 'lt':  return a < b;
        case 'lte': return a <= b;
        case 'gt':  return a > b;
        case 'gte': return a >= b;
        case 'eq':  return a === b;
        case 'ne':  return a !== b;
        default:    return false;
    }
}

// Build a RegExp from a "/pattern/flags" string, or null if it's a plain string.
function asRegex(pattern) {
    const m = /^\/(.*)\/([a-z]*)$/is.exec(pattern);
    if (!m) return null;
    try { return new RegExp(m[1], m[2] || 'i'); } catch { return null; }
}

function textMatches(body, pattern) {
    const rx = asRegex(pattern);
    if (rx) return rx.test(body);
    return body.toLowerCase().includes(String(pattern).toLowerCase());
}

function decodeEntities(s) {
    return String(s || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/<[^>]+>/g, '')
        .trim();
}

// Minimal RSS/Atom parser (regex-based; no XML dependency). Returns newest-first
// list of { id, title, link }.
function parseFeed(xml) {
    const items = [];
    const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
    for (const b of blocks) {
        const titleM = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(b);
        const title = titleM ? decodeEntities(titleM[1]) : '(untitled)';

        let link = '';
        const linkText = /<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(b);
        if (linkText && linkText[1].trim()) link = decodeEntities(linkText[1]);
        if (!link) {
            const linkHref = /<link\b[^>]*href=["']([^"']+)["']/i.exec(b);
            if (linkHref) link = linkHref[1];
        }

        const guidM = /<guid\b[^>]*>([\s\S]*?)<\/guid>/i.exec(b) || /<id\b[^>]*>([\s\S]*?)<\/id>/i.exec(b);
        const guid = guidM ? decodeEntities(guidM[1]) : '';

        const id = (guid || link || title).trim();
        if (id) items.push({ id, title, link });
    }
    return items;
}

function fmtVal(v) {
    if (v == null) return '_none_';
    if (typeof v === 'object') return '`' + JSON.stringify(v).slice(0, 120) + '`';
    return '`' + String(v).slice(0, 120) + '`';
}

// ── Per-type evaluation ──────────────────────────────────────────────────────
// Each returns { notify, headline, detail, newState, status } where `status` is
// a short human string for /watch-list and `newState` is persisted.
function evaluate(watcher, body, prev) {
    switch (watcher.type) {
        case 'text': return evalText(watcher, body, prev);
        case 'json': return evalJson(watcher, body, prev);
        case 'rss':  return evalRss(watcher, body, prev);
        case 'hash': return evalHash(watcher, body, prev);
        default:     return { notify: false, status: 'unknown type', newState: prev };
    }
}

function evalText(watcher, body, prev) {
    const found = textMatches(body, watcher.match);
    const conditionMet = watcher.matchMode === 'absent' ? !found : found;
    const first = prev.conditionMet === undefined;
    const notify = !first && conditionMet && !prev.conditionMet;
    const what = watcher.matchMode === 'absent'
        ? `"${watcher.match}" disappeared`
        : `"${watcher.match}" appeared`;
    return {
        notify,
        headline: `${watcher.name}: ${what}`,
        detail: `Pattern \`${watcher.match}\` (mode: ${watcher.matchMode}) is now **${conditionMet ? 'MET' : 'not met'}**.`,
        newState: { conditionMet },
        status: conditionMet ? '✅ condition met' : '… waiting',
    };
}

function evalJson(watcher, body, prev) {
    let json;
    try { json = JSON.parse(body); }
    catch { return { notify: false, status: '⚠️ invalid JSON', newState: prev, error: 'Response was not valid JSON' }; }

    const value = getByPath(json, watcher.jsonPath);

    if (watcher.compare === 'changed') {
        const first = prev.value === undefined;
        const changed = !first && JSON.stringify(prev.value) !== JSON.stringify(value);
        return {
            notify: changed,
            headline: `${watcher.name}: value changed`,
            detail: `\`${watcher.jsonPath}\` changed from ${fmtVal(prev.value)} → ${fmtVal(value)}.`,
            newState: { value },
            status: `current: ${fmtVal(value)}`,
        };
    }

    const num = Number(value);
    const th = Number(watcher.value);
    const conditionMet = Number.isFinite(num) && compareNums(watcher.compare, num, th);
    const first = prev.conditionMet === undefined;
    const notify = !first && conditionMet && !prev.conditionMet;
    return {
        notify,
        headline: `${watcher.name}: ${fmtVal(value)} ${watcher.compare} ${th}`,
        detail: `\`${watcher.jsonPath}\` = ${fmtVal(value)} — condition (\`${watcher.compare} ${th}\`) is now **${conditionMet ? 'MET' : 'not met'}**.`,
        newState: { conditionMet, value },
        status: `current: ${fmtVal(value)} (${watcher.compare} ${th} → ${conditionMet})`,
    };
}

function evalRss(watcher, body, prev) {
    const items = parseFeed(body);
    const prevSeen = Array.isArray(prev.seen) ? prev.seen : null;
    const first = prevSeen === null;

    const currentIds = items.map(i => i.id);
    const seenSet = new Set(prevSeen || []);
    const fresh = first ? [] : items.filter(i => !seenSet.has(i.id));

    // Persist the union (current + previous), newest-first, capped.
    const union = [...currentIds, ...(prevSeen || [])];
    const dedupedSeen = [...new Set(union)].slice(0, 200);

    const detail = fresh.slice(0, 5)
        .map(i => i.link ? `• [${i.title}](${i.link})` : `• ${i.title}`)
        .join('\n');

    return {
        notify: fresh.length > 0,
        headline: `${watcher.name}: ${fresh.length} new item(s)`,
        detail,
        newState: { seen: dedupedSeen },
        status: `${items.length} item(s); latest: ${items[0] ? `"${items[0].title}"` : '—'}`,
    };
}

function evalHash(watcher, body, prev) {
    let content = body;
    if (watcher.selector) {
        const rx = asRegex(watcher.selector) || new RegExp(watcher.selector, 'i');
        const m = rx.exec(body);
        content = m ? (m[1] ?? m[0]) : '';
    }
    const hash = crypto.createHash('sha1').update(content).digest('hex');
    const first = prev.hash === undefined;
    const notify = !first && prev.hash !== hash;
    return {
        notify,
        headline: `${watcher.name}: content changed`,
        detail: `The watched content changed (hash ${prev.hash ? `\`${prev.hash.slice(0, 8)}\` → ` : ''}\`${hash.slice(0, 8)}\`).`,
        newState: { hash },
        status: first ? 'baseline set' : 'tracking changes',
    };
}

// ── Notification ─────────────────────────────────────────────────────────────
function resolveChannelId(watcher) {
    return watcher.notifyChannelId || settings.channels?.watchers || null;
}

async function notify(client, watcher, result) {
    const channelId = resolveChannelId(watcher);
    if (!channelId) {
        console.warn(`[Watcher] "${watcher.id}" triggered but no notify channel is configured.`);
        return;
    }
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        console.warn(`[Watcher] Could not fetch notify channel ${channelId} for "${watcher.id}".`);
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x3ebc38)
        .setTitle(`🔔 ${result.headline}`)
        .setURL(/^https?:\/\//i.test(watcher.url) ? watcher.url : null)
        .setDescription(result.detail || null)
        .addFields(
            { name: 'Type', value: watcher.type, inline: true },
            { name: 'Watcher', value: `\`${watcher.id}\``, inline: true },
        )
        .setFooter({ text: watcher.url.slice(0, 200) })
        .setTimestamp();

    const content = watcher.ping ? `<@${ownerId}>` : undefined;
    await channel.send({ content, embeds: [embed] }).catch(err =>
        console.warn(`[Watcher] Failed to send notification for "${watcher.id}": ${err.message}`)
    );
}

// ── Core check ───────────────────────────────────────────────────────────────
// Runs a single watcher: fetch → evaluate → persist state → notify if needed.
// Returns { status, notified, error } for callers like /watch-check.
async function checkWatcher(client, watcher, prevState = null) {
    const prev = prevState || getState(watcher.id);
    const merged = { ...prev, lastChecked: Date.now() };

    let result;
    try {
        const body = await fetchBody(watcher.url);
        result = evaluate(watcher, body, prev);
    } catch (err) {
        merged.lastError = err.message;
        merged.lastStatus = `⚠️ fetch failed: ${err.message}`;
        setState(watcher.id, merged);
        console.warn(`[Watcher] "${watcher.id}" check failed: ${err.message}`);
        return { status: merged.lastStatus, notified: false, error: err.message };
    }

    Object.assign(merged, result.newState);
    merged.lastError = result.error || null;
    merged.lastStatus = result.error ? result.status : result.status;
    setState(watcher.id, merged);

    let notified = false;
    if (result.notify && client) {
        await notify(client, watcher, result);
        notified = true;
        console.log(`[Watcher] "${watcher.id}" triggered: ${result.headline}`);
    }
    return { status: merged.lastStatus, notified, error: result.error || null };
}

// Force a single watcher to run now, ignoring its interval (used by /watch-check).
async function runWatcherOnce(client, watcher) {
    return checkWatcher(client, watcher);
}

// ── Scheduler ────────────────────────────────────────────────────────────────
async function tick(client) {
    const now = Date.now();
    const watchers = getWatchers().filter(w => w.enabled !== false);
    for (const w of watchers) {
        const st = getState(w.id);
        const intervalMs = (w.intervalSec || 300) * 1000;
        if (st.lastChecked && (now - st.lastChecked) < intervalMs) continue;
        await checkWatcher(client, w, st).catch(err =>
            console.warn(`[Watcher] Unexpected error for "${w.id}": ${err.message}`)
        );
    }
}

function startWatchers(client) {
    const count = getWatchers().length;
    console.log(`[Watcher] Engine started (tick every ${TICK_MS / 1000}s, ${count} watcher(s) configured).`);
    // Kick off shortly after startup, then on every tick. The watcher list and
    // per-watcher intervals are read fresh each tick, so add/remove take effect
    // without a restart.
    setTimeout(() => tick(client).catch(() => {}), 5000);
    setInterval(() => tick(client).catch(() => {}), TICK_MS);
}

module.exports = {
    startWatchers, runWatcherOnce, checkWatcher,
    // exported for testing:
    evaluate, parseFeed, getByPath, textMatches, compareNums,
};
