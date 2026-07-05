# 03 — Using It (Commands & API)

Three ways to send a note: **Discord slash commands**, **Discord prefix
commands / DMs**, and the **web API** (phone Shortcuts, scripts, curl).

---

## A. Discord slash commands

| Command | What it does |
|---------|--------------|
| `/onenote-auth` | Gives you a Microsoft login link (one-time). |
| `/onenote-setup` | Lists notebooks/sections and saves your default section. |
| `/onenote` | Opens a popup (modal) to type a **Title**, **Content**, and **Extra URLs**. Optionally attach an image. Creates a **new** note. |

`/onenote` details:
- Optional **image** attachment is included in the note.
- The popup has three boxes: **Page Title** (required), **Content** (optional
  text/links), **Extra URLs** (one per line).
- After posting, the bot replies with the web link and posts the app deep link as
  its own message (so it's easy to copy on mobile).

All OneNote commands are **owner-only** — only the configured bot owner(s) can use
them.

---

## B. Discord prefix commands & DMs

Prefix is `!`.

| Command | What it does |
|---------|--------------|
| `!onenote <title> \| <body>` | Creates a **new** note. |
| `!append <title> \| <text>` | **Appends** text to the bottom of the note with that title. |
| `!append --list <title> \| a \| b \| c` | Appends a **bulleted list** (`--list` or `-l`). |

You can also **DM the bot** to post a note (handy from mobile). The message text
becomes the note.

> **Tip:** The `|` (pipe) separates the **title** from the **body**. For lists,
> each `|` after the title becomes a separate bullet.

---

## C. The Web API (phone / scripts / curl)

Two endpoints. Both need the secret. You can pass it three ways:
`?secret=...` in the URL, an `x-webhook-secret:` header, or
`Authorization: Bearer ...`.

### Create a new note — `POST /onenote/post`

Body fields:

| Field | Required | Meaning |
|-------|----------|---------|
| `title` | ✅ | The page title. |
| `content` | | Text body. Each line becomes a paragraph. |
| `urls` | | Array of links to add. |
| `html` | | Raw HTML body (used instead of `content`; `<html>/<body>` wrappers are stripped automatically). |
| `file` | | Base64-encoded file to attach. |
| `mimeType` / `fileName` | | Info about the attached file. |

```bash
curl -X POST "https://erinskidds.com/onenote/post?secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "title": "Shopping ideas",
        "content": "milk\neggs\nbread",
        "urls": ["https://example.com/recipe"]
      }'
```

Response:
```json
{ "ok": true, "title": "Shopping ideas",
  "webUrl": "https://…", "appUrl": "onenote:…" }
```

### Append to an existing note — `POST /onenote/append`

Finds the page **by its title** and adds to the bottom. Body fields:

| Field | Required | Meaning |
|-------|----------|---------|
| `title` | ✅ | Title of the page to append to. |
| `content` | | Text to append (string, or an array of lines). |
| `items` | | Array of strings → appended as a **bulleted list**. |
| `html` | | Raw HTML to append. |

```bash
# Append a couple of lines
curl -X POST "https://erinskidds.com/onenote/append?secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Daily Log", "content": "Finished the report." }'

# Append a bulleted list
curl -X POST "https://erinskidds.com/onenote/append?secret=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Daily Log", "items": ["Call bank", "Email Sam", "Gym"] }'
```

> If no page with that title exists yet, the append will fail (it only adds to
> existing pages). Create it first with `/post` or `!onenote`.

---

## Where results show up

Every successful post/append is also announced in a dedicated **Discord log
channel** (id `1406112392651210802`): the title + web link, then the app deep
link as a separate raw message for easy mobile copying. Errors are posted there
too, so you notice failures.

Next: [`04-appending-and-formatting.md`](./04-appending-and-formatting.md)
