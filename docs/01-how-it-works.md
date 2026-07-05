# 01 — How It Works (The Big Picture)

## The players

| Piece | File | Job (ELI5) |
|-------|------|------------|
| **Discord Bot** | `index.js` + `commands/` + `slashcommands/` | The robot that listens in Discord for your commands. |
| **Mailbox web server** | `onenote-callback.js` | A tiny website that accepts requests from the internet (your phone, scripts) and also catches the Microsoft login "redirect". |
| **Core toolbox** | `utils/onenote.js` | Knows how to talk to Microsoft: log in, refresh logins, create pages, find pages, append to pages, build HTML. |
| **Note helper** | `utils/onenotePost.js` | The "manager" that both robots call. It decides: new note or append? bullet list or paragraph? and formats the reply. |
| **Memory** | `database.js` (SQLite `bot.db`) | Remembers your Microsoft login tokens, your chosen section, and a cache of "which note has which title". |

**Why split it this way?** So there is exactly **one** place that knows how to talk
to OneNote (the toolbox). Discord, your phone, and scripts all funnel through the
same code, so a note always comes out the same and there are no duplicate,
slightly-different copies of the logic to keep in sync.

---

## Why TWO separate programs (PM2 processes)?

1. **The Discord Bot** needs a permanent connection to Discord.
2. **The Mailbox web server** needs to answer web requests on a port (3636).

These are two different jobs, so they run as two separate processes. If one
crashes, the other keeps working, and PM2 automatically restarts whichever fell
over. (More on PM2 in `02-setup-and-config.md`.)

---

## How a note travels (three doorways, one destination)

### Doorway A — Discord
1. You type `!append My Log | did a thing` (or use `/onenote`).
2. The Discord Bot hands it to the **note helper** (`onenotePost.js`).
3. The helper uses the **toolbox** to talk to Microsoft.
4. OneNote saves the page; the bot replies with a link.

### Doorway B — Your iPhone / a script / curl
1. Your phone Shortcut sends a small JSON package to
   `https://erinskidds.com/onenote/append?secret=...`.
2. **Nginx** (the internet doorman) forwards it to the Mailbox server on port 3636.
3. The Mailbox server checks the secret, then calls the **same note helper**.
4. OneNote saves the page; you get a JSON reply with links.

### Doorway C — Microsoft login (one-time)
1. You run `/onenote-auth` in Discord → it gives you a Microsoft login link.
2. You log in; Microsoft sends you back to
   `https://erinskidds.com/onenote/callback`.
3. Nginx forwards that to the Mailbox server, which **exchanges the login code
   for tokens** and stores them in the database.
4. Now the bot can post on your behalf (and quietly refresh the login forever
   thanks to the `offline_access` permission).

---

## The trip to Microsoft (what the toolbox actually does)

- It uses **Microsoft Graph** (`https://graph.microsoft.com/v1.0`), Microsoft's
  official API for OneNote.
- Every request carries an **access token** (a temporary password). Tokens expire
  after ~1 hour, so the toolbox automatically **refreshes** them using a
  long-lived **refresh token** — you only log in once.
- Permissions requested (called *scopes*): `offline_access Notes.Create
  Notes.ReadWrite`. In English: "let me create and edit notes, and keep working
  after I close the browser."

---

## What OneNote gives back: two links

When a page is created or updated, Microsoft returns:

- **Web link** (`oneNoteWebUrl`) — opens the page in a browser.
- **App link** (`oneNoteClientUrl`) — opens the page in the OneNote app.

The app link that Microsoft returns is clunky, so the toolbox has a small
translator (`toAppDeepLink`) that rewrites it into the tidy
`onenote:<Section>.one#<Page>&...&base-path=...` form that opens cleanly in the
desktop/mobile app. Both links are posted to a Discord log channel and returned
in API responses.

Next: [`02-setup-and-config.md`](./02-setup-and-config.md)
