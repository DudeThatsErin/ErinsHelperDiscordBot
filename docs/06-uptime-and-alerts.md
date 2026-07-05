# 06 — Uptime & Alerts (The Watchdog)

This chapter explains the **watchdog**: the little robot that keeps an eye on the
OneNote system and **pokes you on Discord** the moment it stops working — so you
find out from a DM, not from a note that silently never showed up.

> **One sentence:** Every minute, a robot quietly asks the Mailbox server "are you
> OK?"; if it says no (or doesn't answer), the robot **DMs you on Discord**, and
> DMs you again when things recover.

---

## Why this exists (the problem it solves)

Before the watchdog, if `/onenote/post` broke — expired Azure secret, dead
Mailbox server, Microsoft outage — you'd only notice when you *tried* to save a
note and it failed. The failure was **silent** until you happened to need it.

The bot already knew how to complain when a post failed (it logged errors to a
Discord channel). The idea here was simple: **generalize that "tell me on Discord"
habit into an always-on health check** that runs on its own, whether or not you're
posting anything.

---

## The players (two new pieces)

| Piece | File | Job (ELI5) |
|-------|------|------------|
| **The health probe** | `GET /health` in `onenote-callback.js` | A "are you OK?" button on the Mailbox server. Pressing it checks everything a real post needs — **without creating a note**. |
| **The watchdog** | `watchdog.js` (its own PM2 program) | Presses that button every minute and DMs you if the answer is bad. |
| **The messenger** | `utils/notify.js` | Shared "send a Discord message" toolbox — can post to a channel **and/or** slide into your DMs. |

**Why a third program?** Same reasoning as the bot vs. the Mailbox server: the
watchdog is a *different job* (watching), so it runs as its **own** PM2 process.
If the Mailbox server crashes, the watchdog is still alive to **notice and tell
you**. A babysitter that dies with the baby is useless.

---

## The `/health` button — why it doesn't create a note

The obvious idea is "just have the watchdog POST a test note every minute." But
that would litter your OneNote with a junk page every 60 seconds. Bad.

Instead, `/health` runs the **same checklist a real post depends on**, but stops
just short of writing anything:

1. Can we get a **valid Microsoft token** for you? (refreshes it if expired)
2. Is a **OneNote section** configured to post into?
3. Is **Microsoft Graph reachable**? (a tiny read-only "peek" at that section)

If all three pass → **`200 OK`** (`{"ok":true,...}`). If any fail → **`503`**
with the reason. So a green `/health` genuinely means "a `/post` would work right
now," and a red one means "it wouldn't" — **without side effects.**

```
Watchdog ──"are you OK?"──► GET /health ──► token? section? Graph reachable?
                                              │
                              all good ───────┴──► 200  (stay quiet)
                              anything bad ───────► 503  (DM the owner!)
```

---

## How the watchdog behaves (and why it won't spam you)

A naive watchdog that DMs on *every* failed check would blow up your phone if
something stays down for an hour (60 DMs!). So `watchdog.js` acts like a sensible
human using a small **state machine**:

- **Goes DOWN:** only alerts after a few failures in a row (default **2**), so a
  one-off blip doesn't cry wolf. You get **one** "🚨 DOWN" DM.
- **Stays DOWN:** sends a "🔁 STILL DOWN" reminder only every so often (default
  **30 minutes**) — enough to not forget, not enough to be annoying.
- **Recovers:** sends **one** "✅ RECOVERED" DM so you know it's fixed.

> **ELI5:** It tells you when the light turns red, nudges you occasionally while
> it's still red, and tells you once when it turns green again. It does **not**
> scream every single second.

It also treats **"no answer at all"** (server down, timeout, connection refused)
exactly like a bad answer — because from your point of view, both mean "broken."

---

## The messenger (`utils/notify.js`) — the "generalize it" part

The error-logging code used to have Discord-posting logic baked directly into
`onenote-callback.js`. We pulled that out into one shared toolbox so **everything**
uses the same plumbing:

- `postToChannel(id, text)` — post to a log channel.
- `dmUser(id, text)` — slide into someone's DMs (remembers the DM channel so it
  doesn't re-look-it-up every time).
- `alert(text, { channelId, userId })` — do both; if one fails the other still
  goes through.

**Why bother?** Now the watchdog, the post-error logger, and any future feature
all share one well-behaved "tell me on Discord" function instead of three
slightly-different copies. As a bonus, webhook **errors now also DM you**, not
just log to the channel.

---

## Where it's wired in

- **New PM2 program** in `ecosystem.config.js`: `watchdog` (`watchdog.js`).
- **Who gets DMed:** the owner from `config/owner.json`.
- **Knobs** (all optional, sensible defaults) live in `.env` — see the table below.

| Variable | Default | What it does |
|----------|---------|--------------|
| `WATCHDOG_BASE_URL` | `http://localhost:3636` | Which server to probe. |
| `WATCHDOG_INTERVAL_MS` | `60000` (1 min) | How often to check. |
| `WATCHDOG_TIMEOUT_MS` | `20000` | How long to wait for an answer before calling it dead. |
| `WATCHDOG_FAIL_THRESHOLD` | `2` | Failures in a row before the DOWN alert. |
| `WATCHDOG_REMINDER_MS` | `1800000` (30 min) | How often to re-alert while still down. |
| `WATCHDOG_ALERT_CHANNEL` | *(none)* | Optional channel to mirror alerts to (owner is always DMed). |
| `WATCHDOG_TARGETS` | *(the `/health` probe)* | Advanced: JSON list to watch other URLs too. |

Handy commands:

```bash
pm2 list                            # is "watchdog" online?
pm2 logs watchdog --lines 50        # see check results / alerts
pm2 restart watchdog                # after editing watchdog.js or .env knobs
curl -s http://localhost:3636/health   # press the button yourself
```

---

## Try it yourself (safe test)

The healthy path is silent, so to *see* an alert, point the watchdog at a URL
that's guaranteed to fail for a moment:

```bash
# In .env, temporarily:  WATCHDOG_TARGETS=[{"name":"fake","method":"GET","url":"http://localhost:9/nope"}]
pm2 restart watchdog
# → after 2 failed checks you'll get a "🚨 DOWN" DM. Revert .env and restart to stop.
```

---

## If the watchdog itself misbehaves

- **No DMs ever arrive:** make sure `config/owner.json` has your Discord user ID
  and the bot shares a server with you (Discord blocks DMs from total strangers).
- **Too many/too few alerts:** tune `WATCHDOG_FAIL_THRESHOLD` and
  `WATCHDOG_REMINDER_MS`.
- **`watchdog` keeps restarting in `pm2 list`:** run `pm2 logs watchdog` — usually
  a bad `WATCHDOG_TARGETS` JSON string (it falls back to defaults but logs why).

Back to the start: [`README.md`](./README.md)
