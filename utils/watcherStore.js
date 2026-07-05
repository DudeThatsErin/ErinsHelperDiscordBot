// Persistence for the generic watcher framework.
//
// Two kinds of data:
//   1. Watcher DEFINITIONS  → config/settings.json under `watchers` (an array).
//      These are the user-authored things to watch; they're human-editable and
//      survive restarts, mirroring how TestFlight programs are stored.
//   2. Watcher RUNTIME STATE → the bot_state key/value table, one JSON blob per
//      watcher id (key `watcher:<id>`). This holds the last-seen value/hash/feed
//      ids and timing so change-detection survives restarts.
const fs = require('fs');
const path = require('path');
const { state } = require('../database.js');

const SETTINGS_PATH = path.join(__dirname, '../config/settings.json');

function readSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    } catch (err) {
        console.error(`[WatcherStore] Failed to read settings: ${err.message}`);
        return {};
    }
}

function writeSettings(settings) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

const VALID_TYPES = ['text', 'json', 'rss', 'hash'];
const VALID_COMPARES = ['changed', 'lt', 'lte', 'gt', 'gte', 'eq', 'ne'];

function slugify(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'watcher';
}

function getWatchers() {
    const settings = readSettings();
    return Array.isArray(settings.watchers) ? settings.watchers : [];
}

function getWatcher(identifier) {
    if (!identifier) return null;
    const target = String(identifier).trim().toLowerCase();
    return getWatchers().find(w =>
        w.id.toLowerCase() === target || (w.name && w.name.toLowerCase() === target)
    ) || null;
}

// Validate + normalise a watcher definition. Returns { ok, watcher } or
// { ok:false, reason }.
function normaliseWatcher(input) {
    const type = String(input.type || '').trim().toLowerCase();
    if (!VALID_TYPES.includes(type)) return { ok: false, reason: `type must be one of: ${VALID_TYPES.join(', ')}` };

    const url = String(input.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return { ok: false, reason: 'url must start with http(s)://' };

    const name = String(input.name || '').trim();
    if (!name) return { ok: false, reason: 'name is required' };

    const watcher = {
        id: slugify(input.id || name),
        name,
        type,
        url,
        enabled: input.enabled !== false,
        intervalSec: Math.max(30, parseInt(input.intervalSec, 10) || 300),
    };
    if (input.notifyChannelId) watcher.notifyChannelId = String(input.notifyChannelId);
    if (input.ping) watcher.ping = true;

    if (type === 'text') {
        if (!input.match) return { ok: false, reason: 'text watcher needs a `match` string (substring or /regex/)' };
        watcher.match = String(input.match);
        watcher.matchMode = input.matchMode === 'absent' ? 'absent' : 'present';
    } else if (type === 'json') {
        if (!input.jsonPath) return { ok: false, reason: 'json watcher needs a `jsonPath` (e.g. tag_name or assets[0].name)' };
        watcher.jsonPath = String(input.jsonPath);
        const compare = String(input.compare || 'changed').toLowerCase();
        if (!VALID_COMPARES.includes(compare)) return { ok: false, reason: `compare must be one of: ${VALID_COMPARES.join(', ')}` };
        watcher.compare = compare;
        if (compare !== 'changed') {
            if (input.value == null || input.value === '') return { ok: false, reason: `compare "${compare}" needs a threshold \`value\`` };
            watcher.value = input.value;
        }
    } else if (type === 'hash') {
        if (input.selector) watcher.selector = String(input.selector);
    }
    // rss needs nothing extra.

    return { ok: true, watcher };
}

function addWatcher(input) {
    const result = normaliseWatcher(input);
    if (!result.ok) return result;

    const settings = readSettings();
    if (!Array.isArray(settings.watchers)) settings.watchers = [];

    // Ensure a unique id.
    let id = result.watcher.id;
    let n = 2;
    const existingIds = new Set(settings.watchers.map(w => w.id.toLowerCase()));
    while (existingIds.has(id.toLowerCase())) { id = `${result.watcher.id}-${n++}`; }
    result.watcher.id = id;

    settings.watchers.push(result.watcher);
    writeSettings(settings);
    return { ok: true, watcher: result.watcher };
}

function removeWatcher(identifier) {
    if (!identifier) return { ok: false, reason: 'invalid' };
    const target = String(identifier).trim().toLowerCase();

    const settings = readSettings();
    const watchers = Array.isArray(settings.watchers) ? settings.watchers : [];
    const idx = watchers.findIndex(w =>
        w.id.toLowerCase() === target || (w.name && w.name.toLowerCase() === target)
    );
    if (idx === -1) return { ok: false, reason: 'notfound' };

    const [removed] = watchers.splice(idx, 1);
    settings.watchers = watchers;
    writeSettings(settings);
    clearState(removed.id);
    return { ok: true, watcher: removed };
}

function setEnabled(identifier, enabled) {
    const settings = readSettings();
    const watchers = Array.isArray(settings.watchers) ? settings.watchers : [];
    const target = String(identifier).trim().toLowerCase();
    const w = watchers.find(x => x.id.toLowerCase() === target || (x.name && x.name.toLowerCase() === target));
    if (!w) return { ok: false, reason: 'notfound' };
    w.enabled = !!enabled;
    writeSettings(settings);
    return { ok: true, watcher: w };
}

// ── Runtime state (bot_state table) ──────────────────────────────────────────
function stateKey(id) { return `watcher:${id}`; }

function getState(id) {
    const raw = state.get(stateKey(id));
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
}

function setState(id, obj) {
    state.set(stateKey(id), JSON.stringify(obj));
}

function clearState(id) {
    state.delete(stateKey(id));
}

module.exports = {
    getWatchers, getWatcher, addWatcher, removeWatcher, setEnabled,
    getState, setState, clearState,
    VALID_TYPES, VALID_COMPARES, slugify,
};
