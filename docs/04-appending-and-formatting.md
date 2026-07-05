# 04 — Appending & Formatting (The Clever Bits)

Appending sounds simple ("add text to a note"), but OneNote makes it tricky. Here
is what happens behind the scenes and **why** each trick exists.

---

## The problem: OneNote wants a page **ID**, you have a **title**

Microsoft Graph appends by page **ID** (a long ugly code), not by the human title
you typed. So when you say *"append to Daily Log"*, the toolbox must first find
the page whose title is "Daily Log". That's the hard part.

---

## Trick 1 — The title→ID cache (`onenote_page_cache`)

The first time we find "Daily Log", we remember its page ID in the
`onenote_page_cache` table. Next time you append to "Daily Log", we skip the
search and go straight to the page.

**Why:** Searching every section is slow. The cache makes repeat appends fast.

---

## Trick 2 — Smart cross-section search (`findPageByTitle`)

If the title isn't cached, we search:

1. **Your configured section first** (most notes live there → usually an instant hit).
2. If not found, **sweep the other sections**, newest-modified first, one at a time.
3. **Skip sections we can't read** (e.g. password-protected/encrypted sections)
   instead of crashing.

**Why not just search everything at once?** Microsoft **rejects** account-wide
page searches on accounts with lots of sections (error `20266: maximum sections
exceeded`). Searching section-by-section avoids that limit and is resilient.

---

## Trick 3 — Self-healing cache

A cached page ID can go **stale** (you deleted or moved the page). When we try to
append and Microsoft complains with:

- `404` (not found),
- `400` with `20112` (invalid entity ID),

…the toolbox **throws away the bad cache entry, re-searches by title, and retries**.
So it fixes itself without you noticing.

**Why:** Otherwise a deleted-and-recreated note would break appends forever.

---

## Trick 4 — Consistent formatting (`buildHtmlContent` / `buildAppendHtml`)

OneNote pages are HTML under the hood. The toolbox turns your plain text into tidy
HTML so notes look the same no matter how you sent them.

Rules:

- **Paragraphs get breathing room.** Multiple lines of text are separated by a
  blank line (`paragraphWithGaps`), so notes aren't a cramped wall of text.
- **Lists stay tight.** Bulleted lists (`items` / `--list`) render as real
  `<ul><li>` bullets with no extra gaps between items.
- **Links** in `urls` become clickable `<a>` links.
- **Raw `html`** is passed through (with `<html>/<head>/<body>` wrappers stripped,
  because Graph wants just the inner body when appending).

**Why two builders?** `buildHtmlContent` builds a whole **new** page body;
`buildAppendHtml` builds just the **snippet** to tack onto the end of an existing
page. They share the same spacing rules so new and appended content look identical.

---

## Putting it together: an append request's life

```
title "Daily Log" + "Finished report"
        │
        ▼
 cache hit? ──yes──► use cached page id ──► PATCH append ──► (if 404/20112: drop cache, re-search, retry)
        │no
        ▼
 findPageByTitle: check configured section → sweep others (skip locked) 
        │
        ▼
 found → cache the id → build HTML snippet → PATCH append → return links
```

Next: [`05-troubleshooting.md`](./05-troubleshooting.md)
