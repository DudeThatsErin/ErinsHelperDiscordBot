# ErinHelper Bot — Docs (ELI5 Guide)

This folder explains, in plain English, how the **ErinHelper Discord bot** and its
various systems work: what each piece is, how it's built, **why** it's built that
way, and how to use it.

> **One sentence:** A Discord bot on a server that sends notes to OneNote, posts a
> daily morning brief, watches web pages/APIs for changes, keeps itself online,
> and backs everything up.

The docs started life covering just the **OneNote Poster** (files 01–05), which is
still the core feature — so those chapters come first. Later chapters (06+) cover
everything that was added on top.

---

## The 30-second picture

Imagine a few little robots living on the server:

1. **The Discord Bot robot** (`index.js`) — listens in Discord for your commands
   (`!append`, `/onenote`, `/watch-add`, …) and runs the scheduled jobs (daily
   note, watchers).
2. **The Mailbox robot** (`onenote-callback.js`) — a tiny web server that listens
   for internet requests (iPhone Shortcuts, `curl`, etc.) at addresses like
   `/onenote/post` and `/onenote/append`.
3. **The Watchdog robot** (`watchdog`) — pings the mailbox's `/health` and DMs you
   the moment something breaks.

The OneNote pieces all share the **same toolbox** (`utils/onenote.js` +
`utils/onenotePost.js`), so however you send a note (Discord, phone, script), it
behaves **exactly the same**.

```
                 ┌─────────────────────────┐
  Discord  ────► │  Discord Bot (index.js)  │ ─┐
                 └─────────────────────────┘  │      ┌──────────────────────┐
                                               ├────► │  Shared toolbox      │ ───► Microsoft
  iPhone /       ┌─────────────────────────┐  │      │  utils/onenote*.js   │      Graph API ──► OneNote
  curl /    ───► │ Mailbox (onenote-        │ ─┘      └──────────────────────┘
  Shortcuts      │ callback.js) web server  │
                 └─────────────────────────┘
```

---

## Read these in order

| File | What it explains |
|------|------------------|
| [`01-how-it-works.md`](./01-how-it-works.md) | The big picture: the pieces and how a note travels from you to OneNote. |
| [`02-setup-and-config.md`](./02-setup-and-config.md) | The plumbing: Azure login, secrets/env vars, Nginx, PM2 processes. |
| [`03-using-it.md`](./03-using-it.md) | How to actually send notes: Discord commands + the web API (with copy-paste examples). |
| [`04-appending-and-formatting.md`](./04-appending-and-formatting.md) | The clever bits: append-by-title, the cache, cross-section search, and text formatting rules. |
| [`05-troubleshooting.md`](./05-troubleshooting.md) | When something breaks: common errors and the exact fix. |
| [`06-uptime-and-alerts.md`](./06-uptime-and-alerts.md) | The watchdog: how the `/health` probe works and how it DMs you the moment `/onenote/post` breaks. |
| [`08-status-dashboard.md`](./08-status-dashboard.md) | The private **status dashboard** on `erinskidds.com`: PM2 health, disk/CPU, and recent bot activity — behind a password. |
| [`09-backup-to-obsidian.md`](./09-backup-to-obsidian.md) | The reverse direction: nightly **OneNote → Obsidian** Markdown backup, saved in git. |
| [`10-watchers.md`](./10-watchers.md) | The generic **watcher framework**: watch any URL/RSS/API and get pinged on restocks, price drops, new releases, or any change. |

---

## Where everything lives

- **Bot project root:** `/var/www/ErinHelperDiscordBot`
- **Public web addresses (via Nginx on `erinskidds.com`):**
  - `https://erinskidds.com/onenote/callback` — Microsoft login redirect (OAuth)
  - `https://erinskidds.com/onenote/post` — create a **new** note
  - `https://erinskidds.com/onenote/append` — **append** to a note (by title)
- **The three running programs (PM2):** the Discord bot + the `onenote-callback` web server + the `watchdog` uptime monitor (see file 06).

If you only remember one thing: **`/post` makes a new note, `/append` adds to an
existing note.**
