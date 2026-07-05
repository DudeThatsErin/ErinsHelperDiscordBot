# 10 — Watchers (Watch Any URL / RSS / API)

A little robot that keeps an eye on web pages, feeds, and APIs for you and
**pings you in Discord the moment something changes** — a restock, a price drop,
a new GitHub release, a new blog post, or literally any edit to a page.

> **One sentence:** You tell it *what* to watch and *what counts as a change*,
> and it checks on a schedule and messages you when it happens.

It's the same idea as the **TestFlight watcher**, but generalised: instead of one
hard-coded check, you add as many watchers as you like from Discord, each with
its own rules.

---

## The four kinds of watcher

| Type | Watches for… | Great for |
|------|--------------|-----------|
| **text** | a word/phrase (or `/regex/`) **appearing** or **disappearing** on a page | restock ("Add to cart"), "In stock", "Sold out" going away |
| **json** | a field in a JSON API **changing**, or crossing a **number threshold** | price drops (`price < 100`), latest release tag changing |
| **rss** | **new items** in an RSS/Atom feed | GitHub releases, blogs, podcasts, news |
| **hash** | **any change** to a page's content (or a slice of it) | "tell me if this page changes at all" |

---

## The golden rule: the first check never pings you

When you add a watcher, its **first check just takes a snapshot** (the
"baseline") and stays quiet. You only get pinged on the **next** check that finds
a *change* from that baseline. This means adding a watcher — or restarting the
bot — can never spam you. The snapshot is saved to the database, so it survives
restarts.

---

## How it runs

- One background loop wakes up every **30 seconds** and checks which watchers are
  **due** (each watcher has its own `interval`, default **300s**).
- The watcher list is read **fresh every cycle**, so `/watch-add` and
  `/watch-remove` take effect **without restarting** the bot.
- Each watcher's last value/hash/feed-ids and last-check time are stored in the
  `bot_state` table (keyed `watcher:<id>`).

```
  every 30s ─► for each due watcher ─► fetch URL ─► compare to saved snapshot
                                                        │
                              no change ─────────────────┤
                              changed  ─► 🔔 Discord notification + save new snapshot
```

---

## Commands (owner-only)

| Command | What it does |
|---------|--------------|
| `/watch-add` | Create a watcher (see options below). |
| `/watch-remove <id or name>` | Delete a watcher and clear its saved snapshot. |
| `/watch-list` | Show every watcher with its current status + last-check time. |
| `/watch-check <id or name>` | Run one **right now**, ignoring its interval (handy for testing). |

### `/watch-add` options

| Option | For type | Meaning |
|--------|----------|---------|
| `name` | all | Friendly name (the id is auto-derived from it). |
| `type` | all | `text`, `json`, `rss`, or `hash`. |
| `url` | all | The page / API / feed to fetch. |
| `match` | text | Substring, or `/regex/flags`, to look for. |
| `match_mode` | text | `present` (appears — default) or `absent` (disappears). |
| `json_path` | json | Field path, e.g. `tag_name` or `assets[0].name`. |
| `compare` | json | `changed` (default), or `lt` / `lte` / `gt` / `gte` / `eq` / `ne`. |
| `value` | json | The threshold number for `lt`/`gt`/etc. |
| `selector` | hash | Optional `/regex/` to hash only part of the page. |
| `interval` | all | Seconds between checks (min 30, default 300). |
| `channel` | all | Where to post alerts (default: the configured watchers channel). |
| `ping` | all | If on, the alert `@`-mentions you. |

---

## Copy-paste examples

**Restock alert** — ping me when a product page starts saying "Add to cart":
```
/watch-add name:Sneakers type:text url:https://shop.example.com/item/123
           match:Add to cart match_mode:present ping:true
```

**Price drop** — ping me when a JSON price API drops below 100:
```
/watch-add name:Widget Price type:json url:https://api.example.com/item/123
           json_path:price compare:lt value:100 ping:true
```

**New GitHub release (tag changed)**:
```
/watch-add name:Node Release type:json
           url:https://api.github.com/repos/nodejs/node/releases/latest
           json_path:tag_name compare:changed
```

**New items in a feed (GitHub releases Atom, blogs, etc.)**:
```
/watch-add name:Repo Releases type:rss
           url:https://github.com/nodejs/node/releases.atom
```

**Any change to a page** (optionally just part of it):
```
/watch-add name:Policy Page type:hash url:https://example.com/policy
           selector:/<main[\s\S]*?<\/main>/
```

---

## Where results show up

Alerts post to the channel set in `config/settings.json` under
`channels.watchers` (unless a watcher overrides it with its own `channel`). Each
alert is an embed with what changed, the watcher type, and a link to the source.
Turn on `ping` to get an `@`-mention too.

---

## Configuration

Watchers live in `config/settings.json`:

```json
"channels": {
  "watchers": "1406112392651210802"
},
"watchers": [
  {
    "id": "node-release",
    "name": "Node Release",
    "type": "json",
    "url": "https://api.github.com/repos/nodejs/node/releases/latest",
    "enabled": true,
    "intervalSec": 600,
    "jsonPath": "tag_name",
    "compare": "changed",
    "ping": true
  }
]
```

You can hand-edit this file, but it's easier to use `/watch-add`. Set
`"enabled": false` on a watcher to pause it without deleting its history.

---

## Where it lives (files)

- **`utils/watcher.js`** — the engine: fetch, per-type comparison, notifications,
  and the scheduler (`startWatchers`, `runWatcherOnce`).
- **`utils/watcherStore.js`** — reads/writes watcher definitions in
  `settings.json` and each watcher's snapshot in the `bot_state` table.
- **`slashcommands/watch/`** — `watch-add`, `watch-remove`, `watch-list`,
  `watch-check`.
- **`index.js`** — calls `startWatchers(client)` on `clientReady`.

---

## When something's off

| Symptom | Likely cause / fix |
|---------|--------------------|
| No alert ever fires | First check is always a silent baseline; you only get pinged on the *next* change. Use `/watch-check` to force a run. |
| "no notify channel is configured" in logs | Set `channels.watchers` in `settings.json`, or give the watcher its own `channel`. |
| json watcher says "invalid JSON" | The URL isn't returning JSON — check it in a browser. For HTML pages use `text` or `hash` instead. |
| json path returns nothing | Double-check the path (`assets[0].name` style). Look at the raw API response to confirm field names. |
| RSS never finds new items | Some sites block bots; also the *first* check just records what's already there. New items only count going forward. |
| Getting pinged too often | Increase `interval`, or for `hash`, add a `selector` so only the part you care about is compared. |

Back to the [README index](./README.md).
