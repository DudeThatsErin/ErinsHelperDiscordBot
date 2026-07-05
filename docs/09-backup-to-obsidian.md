# 06 — OneNote → Obsidian Backup (ELI5)

This explains the **backup** side: a robot that copies everything OUT of OneNote
and into an Obsidian vault (as Markdown), on a schedule, saved in git.

> **One sentence:** Every night, a little program reads all your OneNote pages,
> turns them into plain Markdown files, saves them into the `OneNoteBackup`
> vault, and takes a git "snapshot" so you never lose them.

The earlier chapters were about **putting notes INTO** OneNote. This one is the
opposite direction: **getting them OUT** for safekeeping.

---

## Why build this at all?

- **OneNote is a black box.** Your notes live on Microsoft's servers in a format
  you can't easily read, search with other tools, or keep forever. If your
  account ever broke, you'd be stuck.
- **Markdown is future-proof.** Plain text files open in anything, forever.
- **Obsidian + git = time machine.** Every backup is a git commit, so you can see
  what changed and roll back. Push it to GitHub and you have an off-site copy too.

**ELI5:** OneNote is like a fancy notebook you can only read inside Microsoft's
building. This makes photocopies in a plain format and keeps them in your own
filing cabinet (the vault) — with a logbook of every change (git).

---

## Where things live

- **The vault (your copy):** `/home/ubuntu/Obsidian/OneNoteBackup`
  (next to your `Erin-Second-Brain` vault). It's a **git repository**.
- **The engine:** `utils/onenoteSync.js` (the brains).
- **The runner:** `onenote-backup.js` (the button that starts a backup + git save).
- **The memory:** the `onenote_backup` table in `bot.db` (remembers what's already
  backed up so it doesn't redo everything).

Inside the vault, notes are organised the same way as OneNote:

```
OneNoteBackup/
├── <Notebook>/
│   └── <Section>/
│       └── <Page Title>.md
├── attachments/        ← images pulled out of pages
└── README.md
```

---

## How one backup works (step by step)

1. **Log in** — reuses the *same* Microsoft tokens the poster already uses
   (`utils/onenote.js`). No new login.
2. **Find every page** — walks through each notebook → each section → each page.
   Sections it can't read (password-protected/encrypted) are **skipped**, not
   crashed on.
3. **Skip unchanged pages** — it compares each page's "last modified" time to what
   it saved last time. Only **new or changed** pages are re-downloaded. (This is
   the `onenote_backup` table doing its job — the first run does all of them;
   later runs are fast.)
4. **Download the page** — grabs the page as HTML from Microsoft Graph.
5. **Convert HTML → Markdown** — using a library called **Turndown**, so headings,
   lists, links, etc. come out as clean Markdown.
6. **Save images** — any inline pictures are downloaded into `attachments/` and
   the note is rewritten to point at the local copy (so it works offline).
7. **Rescue handwriting** — if the page has ink, it fetches the InkML strokes and
   draws them into an SVG image (see the Handwriting section below).
8. **Write the file** — saves `<Title>.md` with a little info header
   (*frontmatter*) recording where it came from.
9. **Git snapshot** — stages everything, makes a commit like
   `OneNote backup 2026-… — +3 ~1`, and pushes if a remote is set up.

---

## What's in each note file (frontmatter)

At the top of every `.md` file is a small YAML block:

```yaml
---
onenote_id: "0-abc…"        # the exact OneNote page it came from
title: "Reasons I love OneNote"
notebook: "Erin's Cortex"
section: "References"
created: 2026-06-30T21:27:36Z
modified: 2026-06-30T21:27:36Z
onenote_url: "https://…"     # open the original in OneNote
has_handwriting: true        # only present when the page contained ink
source: onenote
---
```

**Why store this?** So the next backup can match a file to its OneNote page (using
`onenote_id`), update the right file, and know whether it changed (`modified`).
It also gives you a clickable link back to the original.

---

## Handwriting / ink (the tricky one)

OneNote handwriting is a special case. Microsoft's normal page HTML **throws ink
away** and just leaves `<!-- InkNode is not supported -->` comments — so a naive
backup loses all your handwriting, not even as a picture.

To rescue it, the engine:

1. **Detects ink** — if the page HTML has those "InkNode is not supported"
   comments, it knows there's handwriting.
2. **Asks for the strokes** — re-fetches the page with `?includeinkml=true`, which
   returns **InkML**: the raw pen strokes as lists of X/Y coordinates.
3. **Draws them** — converts every stroke into an SVG `<polyline>` (correctly
   scaled from OneNote's *himetric* units to real pixels) and saves one
   `…-ink.svg` image into `attachments/`.
4. **Embeds it** — adds a `## ✍️ Handwriting` section to the note pointing at the
   SVG, and sets `has_handwriting: true` in the frontmatter.

**Why SVG?** It's vector, so your handwriting stays crisp at any zoom, the files
are small-ish, it renders in Obsidian offline, and it's plain text (git-friendly).

**Limits to know:**
- It captures the **strokes**, not OneNote's colours/pen thickness (drawn as a
  consistent dark line on white).
- Microsoft's handwriting-to-**text** recognition isn't exposed here, so ink is
  saved as a **picture**, not searchable text.
- Ink is only re-rendered when a page is (re)synced — run `--force` once to
  backfill handwriting on pages that were saved before this feature existed.

---

## Triggering it from Discord

You can kick off a backup on demand — progress + results post to the
**mod-botspam** channel (the same one the OneNote poster logs to).

- **Prefix:** `!backup` (aliases `!onenote-backup`, `!ob`). Add `--force` to
  re-download everything: `!backup --force`.
- **Slash:** `/onenote-backup` (optional `force: true` toggle).

Both are **owner-only**. Under the hood the command runs the exact same
`onenote-backup.js` the 3 AM job uses, and a **lock file** stops a manual run from
colliding with the nightly one.

> The **slash** command only appears after you deploy commands (`!createcommands`).
> The **prefix** command works immediately after a bot restart.

---

## Why it's ONE-WAY (important!)

The backup only goes **OneNote → Obsidian**. If you edit a note *inside* the
`OneNoteBackup` vault, that change will **not** go back to OneNote, and it may be
**overwritten** on the next backup.

**Why on purpose?** Two-way sync needs "conflict handling" (deciding who wins when
both sides changed) — that's complex and risky. For a *backup*, one-way is safer
and simpler: OneNote is always the source of truth, the vault is always a faithful
copy. (We can add two-way later if you ever want it.)

---

## How it runs automatically (and survives reboots)

It's a **PM2 cron job** defined in `ecosystem.config.js`:

- Runs **every day at 03:00** server time (`cron_restart: '0 3 * * *'`).
- `autorestart: false` + `exec_mode: 'fork'` → it's a **one-shot**: it runs, saves,
  exits, and waits for the next 3am. It does **not** run constantly.
- Because we ran `pm2 save` and the `pm2-ubuntu` startup service is enabled, PM2
  **re-registers the job after a server reboot** automatically.

**ELI5:** It's an alarm clock. At 3am it wakes up, does the backup, and goes back
to sleep. If the server restarts, the alarm clock is still set.

---

## Doing it yourself / handy commands

Run a backup right now (from `/var/www/ErinHelperDiscordBot`):

```bash
node onenote-backup.js            # incremental (only changed pages) + git commit
node onenote-backup.js --force    # re-download EVERYTHING
node onenote-backup.js --no-git   # just sync files, don't commit
```

Trigger the scheduled job manually / check it:

```bash
pm2 restart onenote-backup            # run the scheduled job right now
pm2 logs onenote-backup --lines 40    # see what it did
pm2 describe onenote-backup           # confirm the cron schedule
```

Connect a remote so backups push off-site:

```bash
git -C /home/ubuntu/Obsidian/OneNoteBackup remote add origin <your-repo-url>
git -C /home/ubuntu/Obsidian/OneNoteBackup push -u origin main
```

---

## Things that could trip you up

- **Rate limits.** If you have lots of pages, Microsoft may throttle (HTTP 429).
  The engine waits and retries automatically, and pauses briefly between pages.
- **Encrypted sections** are skipped (Microsoft won't hand them over).
- **Duplicate titles** in the same section get a short id suffix so files don't
  clobber each other.
- **First run is slow** (downloads everything); nightly runs are quick (only
  changes).
