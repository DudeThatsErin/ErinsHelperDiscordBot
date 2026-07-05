/*
  Uptime watchdog. Periodically pings the OneNote webhook server's health probe
  (which exercises the same dependency chain as POST /onenote/post) and DMs the
  owner on Discord the moment it starts returning non-200 / becomes unreachable.

  Reuses the generalized notifier in utils/notify.js. Run as its own process:
      node watchdog.js
  or via PM2 (see ecosystem.config.js).

  State-machine behaviour (so you aren't spammed):
    - Alerts once when a target transitions UP -> DOWN (after FAIL_THRESHOLD
      consecutive failures).
    - Sends a reminder every REMINDER_MS while it stays DOWN.
    - Sends a recovery notice once when it comes back DOWN -> UP.
*/
require('dotenv').config();
const axios = require('axios');
const { alert } = require('./utils/notify.js');
const { id: ownerId } = require('./config/owner.json');

const PORT             = process.env.MS_CALLBACK_PORT || 3636;
const BASE_URL         = process.env.WATCHDOG_BASE_URL || `http://localhost:${PORT}`;
const INTERVAL_MS      = Number(process.env.WATCHDOG_INTERVAL_MS)   || 60_000;   // check cadence
const TIMEOUT_MS       = Number(process.env.WATCHDOG_TIMEOUT_MS)    || 20_000;   // per-request timeout
const FAIL_THRESHOLD   = Number(process.env.WATCHDOG_FAIL_THRESHOLD) || 2;       // consecutive fails before alerting
const REMINDER_MS      = Number(process.env.WATCHDOG_REMINDER_MS)   || 30 * 60_000; // re-alert cadence while down
const ALERT_CHANNEL    = process.env.WATCHDOG_ALERT_CHANNEL || null;             // optional channel mirror

// Targets to monitor. Override with WATCHDOG_TARGETS (JSON array of
// { name, method, url, expectStatus }). By default we probe the health
// endpoint, which reports the real health of the /onenote/post pipeline.
function loadTargets() {
    if (process.env.WATCHDOG_TARGETS) {
        try { return JSON.parse(process.env.WATCHDOG_TARGETS); }
        catch (err) { console.error('Invalid WATCHDOG_TARGETS JSON, using defaults:', err.message); }
    }
    return [
        { name: 'onenote /health', method: 'GET', url: `${BASE_URL}/health`, expectStatus: 200 },
    ];
}

const targets = loadTargets();

// Per-target runtime state: whether it's currently considered down, how many
// consecutive failures we've seen, and when we last alerted.
const state = new Map(targets.map(t => [t.name, { down: false, fails: 0, lastAlert: 0 }]));

async function probe(target) {
    const started = Date.now();
    try {
        const res = await axios.request({
            method: target.method || 'GET',
            url: target.url,
            timeout: TIMEOUT_MS,
            // Never throw on HTTP status; we classify it ourselves below.
            validateStatus: () => true,
        });
        const expected = target.expectStatus || 200;
        const ok = res.status === expected;
        const ms = Date.now() - started;
        if (ok) return { ok: true, ms };
        const body = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data ?? '');
        return { ok: false, ms, reason: `HTTP ${res.status}${body ? ` — ${body.slice(0, 400)}` : ''}` };
    } catch (err) {
        return { ok: false, ms: Date.now() - started, reason: err.code || err.message };
    }
}

function fmt(target, extra) {
    return `**${target.name}**\n\`${target.method || 'GET'} ${target.url}\`\n${extra}`;
}

async function notify(content) {
    await alert(content, { userId: ownerId, channelId: ALERT_CHANNEL });
}

async function checkTarget(target) {
    const st = state.get(target.name);
    const result = await probe(target);

    if (result.ok) {
        st.fails = 0;
        if (st.down) {
            st.down = false;
            st.lastAlert = 0;
            console.log(`[watchdog] RECOVERED: ${target.name} (${result.ms}ms)`);
            await notify(`✅ RECOVERED — ${fmt(target, `Responding normally again (${result.ms}ms).`)}`);
        }
        return;
    }

    // Failure path.
    st.fails += 1;
    console.warn(`[watchdog] FAIL (${st.fails}/${FAIL_THRESHOLD}): ${target.name} — ${result.reason}`);

    const now = Date.now();
    const justWentDown = !st.down && st.fails >= FAIL_THRESHOLD;
    const dueForReminder = st.down && now - st.lastAlert >= REMINDER_MS;

    if (justWentDown) {
        st.down = true;
        st.lastAlert = now;
        await notify(`🚨 DOWN — ${fmt(target, `Failed ${st.fails} check(s) in a row.\nReason: ${result.reason}`)}`);
    } else if (dueForReminder) {
        st.lastAlert = now;
        const downMins = Math.round((now - (st.downSince || now)) / 60000);
        await notify(`🔁 STILL DOWN (${downMins}m) — ${fmt(target, `Reason: ${result.reason}`)}`);
    }

    if (justWentDown) st.downSince = now;
}

async function tick() {
    await Promise.all(targets.map(t => checkTarget(t).catch(err =>
        console.error(`[watchdog] checkTarget(${t.name}) threw:`, err.message))));
}

console.log(`🐕 Watchdog started — monitoring ${targets.length} target(s) every ${INTERVAL_MS / 1000}s:`);
targets.forEach(t => console.log(`   • ${t.name}: ${t.method || 'GET'} ${t.url} (expect ${t.expectStatus || 200})`));
if (!ownerId) console.warn('[watchdog] No owner id configured — DM alerts will be skipped.');

// Run one check immediately, then on the interval.
tick();
setInterval(tick, INTERVAL_MS);
