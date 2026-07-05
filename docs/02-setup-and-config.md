# 02 — Setup & Config (The Plumbing)

This is the "how it's wired" chapter. You normally don't touch any of this after
it's set up — but here's what each piece is and **why** it exists.

---

## 1. The secrets (`.env` file)

The project reads its secrets from `/var/www/ErinHelperDiscordBot/.env`
(loaded by `require('dotenv').config()`). These are **never** committed to git.

| Variable | What it is | Why it's needed |
|----------|------------|-----------------|
| `DISCORD_TOKEN` | The Discord bot's password | Lets the bot log into Discord. |
| `MS_CLIENT_ID` | Azure app "username" | Identifies our app to Microsoft. |
| `MS_CLIENT_SECRET` | Azure app "password" | Proves our app is allowed to get tokens. **This is the value that expires periodically** — see troubleshooting. |
| `MS_REDIRECT_URI` | `https://erinskidds.com/onenote/callback` | Where Microsoft sends you back after login. Must match Azure exactly. |
| `MS_CALLBACK_PORT` | `3636` | The port the Mailbox web server listens on locally. |
| `WEBHOOK_SECRET` | A long random password | Protects `/onenote/post` and `/onenote/append` so only you can post. |

> **ELI5:** `MS_CLIENT_ID`/`MS_CLIENT_SECRET` are the app's login to Microsoft.
> `WEBHOOK_SECRET` is the password *you* type when your phone talks to the server.

---

## 2. The Microsoft (Azure) side — why it exists

To post to your OneNote, Microsoft requires a registered "application" in the
**Azure Portal** (Azure Active Directory → App registrations). That app has:

- A **Client ID** and a **Client Secret** (→ your `.env`).
- A **Redirect URI** that must be listed as `https://erinskidds.com/onenote/callback`.
- **API permissions**: `Notes.Create`, `Notes.ReadWrite`, `offline_access`.

**Why:** This is Microsoft's security model — you can't just post to someone's
OneNote; you register an app, the user consents once, and Microsoft issues tokens.

---

## 3. Nginx — the internet doorman

Your server runs many sites. **Nginx** decides which incoming web request goes
where. For OneNote, three public paths are forwarded to the Mailbox server on
`localhost:3636`:

```nginx
# /etc/nginx/sites-available/erinskidds.com  (simplified)

location /onenote/callback {          # Microsoft login redirect
    proxy_pass http://localhost:3636/auth/callback;   # note: path is rewritten
}

location /onenote/post {              # create a new note
    proxy_pass http://localhost:3636/onenote/post;
    client_max_body_size 20m;         # allow larger bodies (e.g. attachments)
}

location /onenote/append {            # append to a note
    proxy_pass http://localhost:3636/onenote/append;
    client_max_body_size 20m;
}
```

**Why a doorman at all?** The Node server listens only on `localhost:3636`
(private). Nginx gives it a public HTTPS address on `erinskidds.com` and handles
the SSL certificate. Note the callback path is **rewritten** from
`/onenote/callback` (public) to `/auth/callback` (what the server actually listens
for internally).

> **If you ever add a new endpoint**, you must add a matching `location` block in
> Nginx and reload it (`sudo nginx -t && sudo systemctl reload nginx`).

---

## 4. PM2 — the babysitter

**PM2** keeps the programs running forever and restarts them if they crash or
the server reboots. Config is in `ecosystem.config.js`:

- **Program 1:** the Discord bot (`index.js`).
- **Program 2:** `onenote-callback` (`onenote-callback.js`) — the Mailbox server.
- **Program 3:** `watchdog` (`watchdog.js`) — the uptime monitor that DMs you if
  the Mailbox server's health check fails (see [`06-uptime-and-alerts.md`](./06-uptime-and-alerts.md)).

Handy commands (run from anywhere):

```bash
pm2 list                              # see both programs and their status
pm2 restart onenote-callback          # restart just the web/mailbox server
pm2 restart helperbot                 # restart just the Discord bot
pm2 logs onenote-callback --lines 50  # view recent web-server logs
```

> **ELI5:** If a program falls asleep, PM2 pokes it awake. If you change code,
> you `pm2 restart` the affected program so it picks up the changes.

---

## 5. The database (`bot.db`, SQLite)

`database.js` sets up small tables. The two that matter for OneNote:

- **`ms_tokens`** — your Microsoft login: `access_token`, `refresh_token`,
  `expires_at`, and `onenote_section_id` (which section new notes go to).
- **`onenote_page_cache`** — a speed shortcut mapping a note **title → page id**
  so appends don't have to search every section every time (see file 04).

**Why a database?** So logins survive restarts (you don't have to re-auth every
time the bot reboots) and so appends are fast.

---

## 6. First-time linking (do this once)

1. In Discord, run **`/onenote-auth`** → click the Microsoft link, log in.
2. Run **`/onenote-setup`** → it lists your **notebooks**; pick one to list its
   **sections**; save a **section** as your default target.
3. Done. New notes now land in that section, and the API works.

Next: [`03-using-it.md`](./03-using-it.md)
