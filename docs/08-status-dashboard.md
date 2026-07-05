# 08 — Status Dashboard (The Dashboard)

This chapter explains the **status dashboard**: a little private web page at
`https://erinskidds.com/dashboard` that shows, at a glance, whether your server
and bots are healthy — and what the bot has been up to lately.

> **One sentence:** One web page that answers four questions —
> "**Are my programs running?**", "**Is the server stressed?**", "**What has
> the bot done recently?**", and "**Am I still inside Oracle's free tier?**" — and
> lets you **start/stop/restart** any program with a click, refreshing itself
> every few seconds.

---

## Why this exists (the problem it solves)

You already have the **watchdog** (file 06) that DMs you when OneNote posting
breaks. That's great for *emergencies* — but it only shouts about **one** thing,
and only when it's already broken.

Sometimes you just want to **glance** and see the whole picture:

- Is the Discord bot online? Did it restart 200 times overnight?
- Is the disk about to fill up? Is CPU pinned?
- Did my OneNote notes/tasks actually get saved to the database?

Before the dashboard, answering those meant SSH-ing into the server and typing
`pm2 list`, `df -h`, `free -m`, and poking at the SQLite file by hand. The
dashboard turns all of that into **one bookmark**.

> **ELI5:** The watchdog is the smoke alarm (screams when there's a fire). The
> dashboard is the thermostat on the wall (walk by, glance, know everything's
> fine).

---

## The players (three pieces)

| Piece | File | Job (ELI5) |
|-------|------|------------|
| **The data collector** | `src/app/api/status/route.ts` (in the `erinskidds.com` website) | A web address (`/api/status`). On `GET` it gathers PM2 + system + database + free-tier facts as one JSON package; on `POST` it runs a PM2 start/stop/restart command. |
| **The wall display** | `src/app/dashboard/page.tsx` | The actual page you look at. Asks the collector for fresh data every 5 seconds and draws the cards, bars, and activity list. |
| **The doorman with a lock** | Nginx basic-auth on `/dashboard` and `/api/status` | Requires a username + password before letting anyone see any of it. |

**Why does this live inside the `erinskidds.com` website and not the bot?**
The bot's job is Discord + OneNote. The website already runs on the server (as a
PM2 program called `erinskidds.com`), already sits behind Nginx on a real HTTPS
domain, and is already built to serve web pages. Bolting a dashboard onto it
means **no new server, no new port, no new PM2 process** — it just becomes a new
page on a site that was already there. Reusing what exists beats spinning up
something new.

---

## How a glance travels (from your eyeball to the answer)

```
                         ┌──────────────────────────────────────────┐
  You open               │  Nginx (the doorman)                      │
  /dashboard  ─────────► │  asks for username + password FIRST       │
  in a browser           └───────────────┬──────────────────────────┘
                                          │ (correct password)
                                          ▼
                         ┌──────────────────────────────────────────┐
                         │  Website (Next.js on :3000)               │
                         │  draws the page, then every 5s asks…      │
                         └───────────────┬──────────────────────────┘
                                          │  GET /api/status
                                          ▼
                         ┌──────────────────────────────────────────┐
                         │  The data collector gathers 3 things:     │
                         │   1. PM2 processes   → runs `pm2 jlist`   │
                         │   2. System health   → Node `os` + `df`   │
                         │   3. Bot activity    → reads bot.db        │
                         └───────────────┬──────────────────────────┘
                                          ▼
                              one JSON package → drawn as cards
```

---

## What each card shows (and where the numbers come from)

| Card | What you see | Where it comes from |
|------|--------------|---------------------|
| **OneNote /health** | Healthy/Degraded badge, response time, HTTP status, the configured section id, any error, plus a little bar strip of the **recent probe history**. | The dashboard calls the Mailbox server's `GET /health` (see file 06) and times it. This is the same "are you OK?" button the watchdog presses — now you can *see* it. |
| **PM2 Processes** | Every program (bot, website, onenote-callback, watchdog…), a green/red dot, uptime, restart count, CPU %, memory — plus **Start / Stop / Restart** buttons per program. | `pm2 jlist` for the status; the buttons `POST` back to `/api/status`, which runs `pm2 <action> <name>`. |
| **System** | CPU load bars, memory used/total, disk used/free, how long the server's been up. | Node's built-in `os` module (`loadavg`, `totalmem`…) + the `df` command for disk. |
| **Oracle Always Free** | Your **public IP**, plus OCPUs, memory, block storage, and egress each shown as *used / free-tier max*. Memory & storage also show **actual live usage** underneath. | Node `os` (cores + RAM) + `df` (storage) + `/proc/net/dev` (egress since boot). Public IP from the OCI metadata service, falling back to a configured value. |
| **Bot Database** | Counts: projects, tasks (+ done), subtasks, OneNote pages cached, reaction roles, linked accounts. Plus "last write" time. | Read straight from the bot's `bot.db` (see below). |
| **Recent Activity** | The newest ~30 things the bot saved — tasks, subtasks, projects, OneNote pages — newest first, with "how long ago". | One `UNION` query across those tables in `bot.db`, sorted by timestamp. |

---

## The clever bits (and why they're built this way)

### 1. Why it reads the database with the `sqlite3` command, not a library

The natural instinct is "install a SQLite library in the website." But the bot's
database (`better-sqlite3`) uses **compiled native code** tied to a specific
Node version. Adding it to the website means another heavy dependency that can
break on the next `npm install` or Node upgrade.

Instead, the collector shells out to the **`sqlite3` command-line tool** that's
already installed on the server, and asks for the answer in JSON
(`sqlite3 -readonly -json bot.db "SELECT …"`). Two wins:

- **`-readonly`** means the dashboard **physically cannot** change or corrupt the
  bot's data. It can look, never touch.
- **No new dependency** to compile or keep in sync. The website stays lightweight.

> **ELI5:** Rather than hiring a translator who lives in the website, we borrow
> the translator already standing in the hallway — and we only let it *read the
> letter aloud*, never rewrite it.

### 2. Why the "Recent Activity" is one big UNION query

There's no single "activity log" table — the bot spreads its work across
`tasks`, `subtasks`, `projects`, and `onenote_page_cache`. Rather than invent a
new logging table (and change the bot to write to it), the dashboard **derives**
a feed from what's already there: it grabs the newest rows from each table,
stamps each with a type label, and sorts them together by time. Zero changes to
the bot were needed.

### 3. Why it polls every 5 seconds instead of anything fancy

Live-streaming updates (WebSockets) would be more "impressive," but it's a
**personal** dashboard you glance at — not a trading floor. A plain "ask again
every 5 seconds" (`setTimeout` + `fetch`) is simpler, has no extra moving parts,
and is plenty fresh. Boring on purpose.

### 4. Why it's behind a password (this is the important one)

It's tempting to think "it's just a status page, who cares." But the activity
feed shows **real OneNote page titles and task names** — those are your private
notes. The PM2 card also reveals your server's internal layout (process names,
file paths, restart counts), which is a free map for anyone snooping.

So the whole thing sits behind **HTTP Basic Auth at the Nginx layer**. Nginx
checks the username/password **before** the request ever reaches the website —
so even the raw `/api/status` JSON is locked. Doing it in Nginx (not in the app
code) means the lock is dead-simple, battle-tested, and impossible to
accidentally bypass with a code change.

> **ELI5:** The page isn't "secret nuclear codes," but it *does* have your diary
> titles and a blueprint of the house pinned to it. So we put a lock on the door.

### 5. Why the /health card shares the watchdog's button (and keeps history in memory)

The watchdog (file 06) already presses `GET /health` every minute and DMs you on
failure. The dashboard **reuses that exact button** instead of inventing a second
health check — one definition of "healthy," two audiences (the watchdog for
alerts, the dashboard for glancing).

Each time the dashboard fetches `/api/status`, it also times the `/health` call
and appends the result to a small **in-memory ring buffer** (last 60 checks).
That's what draws the little bar strip. It's deliberately *in memory*, not the
database: this history is a "what's it been doing while I watch" convenience, not
a permanent record — the watchdog is still the source of truth for real
outages/alerts. Restarting the website simply starts the strip fresh.

> **ELI5:** The watchdog is the guard who calls you when the door's broken. The
> dashboard peeks through the same peephole when *you* walk by — and sketches the
> last few peeks on a notepad it keeps in its pocket (wiped when it clocks out).

### 6. Why the Oracle card shows "provisioned" separately from "actual usage"

Oracle's Always Free tier has two *kinds* of limits, and confusing them is easy:

- **Fixed allocations** — OCPUs, RAM, and block storage. These are the shape you
  *provisioned*. Being at 100% is **totally fine and free** — it just means you
  claimed your full free grant. You can't overflow them without deliberately
  buying a bigger paid shape. So these rows read **green** at any level up to the
  ceiling, and show your **actual live usage** (e.g. real disk used) as a smaller
  line underneath, so "192.7 GB provisioned" is never mistaken for "192.7 GB
  full."
- **Metered** — outbound **egress** (10 TB/month). This is the *only* dimension
  that can actually run up a bill, so it's the only one that turns amber as it
  fills. (We read it from `/proc/net/dev`, which is *since last boot*, not per
  billing month — a rough guide, not Oracle's official meter.)

> **ELI5:** Your parking spot is a fixed size (using all of it is free); the
> water meter is what you actually pay for. The card colours them differently on
> purpose.

### 7. Why the Start/Stop/Restart controls live on the *same* URL

The buttons need to be **locked behind the same password** as everything else.
The nginx auth only guards `/dashboard` and `/api/status` — a brand-new endpoint
like `/api/pm2` would sit *outside* those blocks and be wide open. So the control
commands are a `POST` to the **existing** `/api/status`, inheriting its lock for
free. A few guardrails:

- **No shell = no injection.** Commands run via `execFile`/`spawn` with an
  **array** of arguments (`["restart", "watchdog"]`), never a string a shell could
  reinterpret. The process name is also checked against the live PM2 list, so you
  can only act on programs that actually exist.
- **Destructive actions confirm.** Stopping anything — or touching the website
  itself — pops a confirmation first.
- **The self-restart trick.** Restarting `erinskidds.com` restarts the very server
  answering the click, which would normally kill the reply mid-sentence. So that
  one command is **detached** (handed to the PM2 daemon and let go), and the page
  just shows "reconnecting…" and reloads a few seconds later. Stopping the website
  from here is a one-way trip, though — there's nothing left to serve a Start
  button, so you'd bring it back with `pm2 start erinskidds.com` over SSH.

> **ELI5:** The buttons use the same locked door as the rest of the page, and
> they can only press the exact switches that already exist — no making up new
> ones. Rebooting the room you're standing in needs a little "brb" trick.

---

## Where it's wired in

- **Lives inside:** the `erinskidds.com` website (`/var/www/erinskidds.com`),
  which runs as the PM2 program **`erinskidds.com`** on port `3000`.
- **The page:** `src/app/dashboard/page.tsx` → served at
  `https://erinskidds.com/dashboard`.
- **The data:** `src/app/api/status/route.ts` → served at
  `https://erinskidds.com/api/status`.
- **The lock:** two `location` blocks in the Nginx site file
  `/etc/nginx/sites-enabled/erinskidds.com` that add `auth_basic` and point at
  the password file `/etc/nginx/.htpasswd_dashboard`.
- **The chat widget** (the site's "Sasha" bubble) is hidden on `/dashboard` via a
  one-line check in `src/components/ConditionalSashaWidget.tsx`, so the dashboard
  stays clean.

| Knob | Where | What it does |
|------|-------|--------------|
| `BOT_DB_PATH` | `.env.local` in the website (optional) | Which SQLite file to read. Defaults to `/var/www/ErinHelperDiscordBot/bot.db`. |
| `HEALTH_URL` | `.env.local` in the website (optional) | Which health endpoint to probe. Defaults to `http://localhost:3636/health`. |
| `PUBLIC_IP` | `.env.local` in the website (optional) | Fallback public IP if the OCI metadata service can't be reached. Defaults to the known instance IP. |
| `SELF_PM2_NAME` | `.env.local` in the website (optional) | The PM2 name of the website itself, so control actions on it use the detached self-restart path. Defaults to `erinskidds.com`. |
| Refresh rate | `REFRESH_MS` in `page.tsx` | How often the page re-asks for data (default 5000 ms). |
| Username/password | `/etc/nginx/.htpasswd_dashboard` | Change with `htpasswd` (see below). |

Handy commands:

```bash
pm2 list                                   # is "erinskidds.com" online?
pm2 logs erinskidds.com --lines 50         # website logs
pm2 restart erinskidds.com                 # after rebuilding the site

# After changing dashboard code, rebuild the site so the change goes live:
cd /var/www/erinskidds.com && npm run build && pm2 restart erinskidds.com

# Change the dashboard password (or add another user):
sudo htpasswd /etc/nginx/.htpasswd_dashboard someusername
sudo nginx -t && sudo systemctl reload nginx
```

---

## Try it yourself (safe checks)

```bash
# 1. Without a password → should be blocked (401):
curl -s -o /dev/null -w "%{http_code}\n" https://erinskidds.com/api/status

# 2. With the password → should return the JSON package:
curl -s -u 'USERNAME:PASSWORD' https://erinskidds.com/api/status | head -c 400

# 3. Open in a browser (it will prompt for the username/password):
#    https://erinskidds.com/dashboard

# 4. Control a process (start | stop | restart | reload) — needs the password:
curl -s -u 'USERNAME:PASSWORD' -X POST https://erinskidds.com/api/status \
  -H 'Content-Type: application/json' -d '{"action":"restart","name":"watchdog"}'
```

Reading the JSON directly is also the fastest way to sanity-check a card that
looks wrong on the page.

---

## If the dashboard misbehaves

- **PM2 card is empty / shows an error:** the website couldn't run `pm2 jlist`.
  Make sure the website process runs as the **same user** that owns PM2 (`ubuntu`).
- **Bot Database card is empty or errors:** check `BOT_DB_PATH` points at the real
  `bot.db`, and that the file is **readable** by the website's user. The read is
  `-readonly`, so it can never be a *write* permission problem.
- **Everything is public / no password prompt:** the Nginx `auth_basic` blocks
  didn't load. Run `sudo nginx -t` (config OK?) then
  `sudo systemctl reload nginx`. Confirm `/etc/nginx/.htpasswd_dashboard` exists.
- **Changes don't show up:** the site is a **built** app — edits only go live after
  `npm run build` **and** `pm2 restart erinskidds.com`.
- **/health card shows "Degraded" or a timeout:** the Mailbox server (`onenote-callback`)
  is down, or its own health chain is failing — check `pm2 logs onenote-callback`
  and `curl -s http://localhost:3636/health`. If the card is degraded, the watchdog
  is almost certainly DMing you too (that's the point).
- **/health history strip is empty:** it fills as the page polls, and resets on
  every website restart (it's in-memory by design). Just leave the page open a moment.
- **A Start/Stop/Restart button does nothing / errors:** the website user must be
  able to run `pm2` (same `ubuntu` user that owns PM2). Check `pm2 logs erinskidds.com`.
  Restarting the website itself is expected to briefly drop the page ("reconnecting…").
- **Oracle card looks alarming at ~100%:** that's the *fixed allocation* (OCPU/RAM/
  storage) — 100% is free and fine. Only the **egress** row can cost money, and it
  turns amber before it matters. The smaller "actual usage" line shows what's really in use.
- **Disk/CPU numbers look off:** CPU % is derived from the 1-minute load average
  divided by core count, so it's an *approximation*, not a per-instant reading —
  brief spikes above what you'd expect are normal.

Back to the start: [`README.md`](./README.md)
