# 05 — Troubleshooting

Real problems we hit, what caused them, and the exact fix.

---

## `502 Bad Gateway` on `/onenote/post` or `/onenote/append`

**Meaning:** Nginx forwarded the request, but nobody answered on port 3636 — i.e.
the Mailbox server isn't running.

**Fix:**
```bash
pm2 list                       # is onenote-callback "stopped"?
pm2 start onenote-callback     # or: pm2 restart onenote-callback
pm2 logs onenote-callback      # check why it died
```

---

## `401 Unauthorized`

**Meaning:** The `WEBHOOK_SECRET` you sent doesn't match the one in `.env`.
(A 401 after fixing a 502 is actually *good news* — it means the server is alive.)

**Fix:** Send the correct secret via `?secret=...`, `x-webhook-secret:` header, or
`Authorization: Bearer ...`. Confirm it matches `.env` (watch for trailing spaces).

---

## `AADSTS700016: Application with identifier 'undefined' was not found`

**Meaning:** `MS_CLIENT_ID` was empty — usually a script that didn't load `.env`.

**Fix:** Run from the bot's directory so `dotenv` loads, or explicitly call
`require('dotenv').config()` at the top of any test script.

---

## `AADSTS7000215: Invalid client secret` / login suddenly stops working

**Meaning:** The **Azure client secret expired** (they have expiry dates).

**Fix:** Create a new client secret in the Azure Portal (App registration →
Certificates & secrets), update `MS_CLIENT_SECRET` in `.env`, then
`pm2 restart onenote-callback helperbot`.

---

## `20266: The number of maximum sections is exceeded`

**Meaning:** An account-wide page search was rejected (too many sections).

**Status:** Already handled — the toolbox searches section-by-section instead of
account-wide (see file 04). If you see this, make sure you're on the current code
and `pm2 restart` it.

---

## `20112: Invalid Entity ID specified` when appending

**Meaning:** A cached page ID is stale (page moved/deleted).

**Status:** Self-healing — the code drops the bad cache entry, re-searches by
title, and retries automatically. If it persists, the page truly may not exist;
recreate it with `/post`.

---

## Append says it can't find the page

**Meaning:** No page with that exact title exists (or it lives in a locked,
encrypted section we can't read).

**Fix:** Create the page first (`/onenote`, `!onenote`, or `/post`), or check the
title spelling. Appends only work on **existing** pages.

---

## The app deep link won't open on iPad / isn't clickable

**Background:** Microsoft returns an `onenote:https://…` link. We rewrite it with
`toAppDeepLink` into the tidy `onenote:<Section>.one#<Page>&…&base-path=…` form,
and we post it as its **own raw message** (not a code block) because code blocks
weren't tappable/selectable on iPad.

**Fix:** Nothing to do — just tap/copy the standalone link message the bot posts.

---

## MODULE_NOT_FOUND when running a test script

**Meaning:** Script was run from a folder (like `/tmp`) with no `node_modules`.

**Fix:** Run it from `/var/www/ErinHelperDiscordBot` so dependencies resolve.

---

## General "did my change take effect?" checklist

```bash
pm2 restart onenote-callback     # after editing onenote-callback.js / utils
pm2 restart helperbot            # after editing Discord command code
pm2 logs onenote-callback --lines 50
sudo nginx -t && sudo systemctl reload nginx   # after editing Nginx config
```
