/*
  OneNote -> Obsidian backup engine.

  Pulls every readable OneNote page (across all notebooks/sections) for a user,
  converts the page HTML to Markdown, downloads inline images, and writes the
  result into an Obsidian vault as `<Notebook>/<Section>/<Title>.md` with YAML
  frontmatter. Uses the `onenote_backup` table for incremental syncs so only
  pages whose lastModifiedDateTime changed are re-fetched.

  Reuses the existing OAuth/token logic from utils/onenote.js — no new auth.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const TurndownService = require('turndown');
const db = require('../database.js');
const { getAccessToken, getNotebooks, getSections } = require('./onenote.js');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const VAULT_ROOT = process.env.ONENOTE_BACKUP_DIR || '/home/ubuntu/Obsidian/OneNoteBackup';
const ATTACHMENTS_DIR = 'attachments';

// ── Turndown (HTML -> Markdown) ────────────────────────────────────────────
const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
});
// OneNote sprinkles absolute-positioning wrappers everywhere; keep their text
// but drop the noise. Turndown already unwraps unknown block tags, so we mostly
// just make sure nothing explodes on empty/oddly-styled nodes.
turndown.addRule('stripStyleAttrs', {
    filter: (node) => node.nodeName === 'SPAN' && !node.textContent.trim(),
    replacement: () => '',
});

// ── Small helpers ───────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Make a string safe to use as a file/folder name on disk.
function sanitize(name, fallback = 'Untitled') {
    const cleaned = String(name || '')
        .replace(/[\\/:*?"<>|#^[\]]/g, ' ') // illegal FS + Obsidian-unfriendly chars
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
    return cleaned || fallback;
}

// GET from Graph with a bearer token, retrying once on 429 (rate limit).
async function graphGet(userId, url, config = {}) {
    const token = await getAccessToken(userId);
    try {
        return await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 30000,
            ...config,
        });
    } catch (err) {
        if (err.response?.status === 429) {
            const retryAfter = Number(err.response.headers['retry-after'] || 2);
            await sleep((retryAfter + 1) * 1000);
            const token2 = await getAccessToken(userId);
            return axios.get(url, {
                headers: { Authorization: `Bearer ${token2}` },
                timeout: 30000,
                ...config,
            });
        }
        throw err;
    }
}

// Follow @odata.nextLink to collect every item from a paged Graph collection.
async function graphGetAll(userId, url) {
    const items = [];
    let next = url;
    while (next) {
        const res = await graphGet(userId, next);
        items.push(...(res.data.value || []));
        next = res.data['@odata.nextLink'] || null;
    }
    return items;
}

// ── Discover every page across notebooks/sections ──────────────────────────
async function listAllPages(userId, { log = console.log } = {}) {
    const notebooks = await getNotebooks(userId);
    const pages = [];

    for (const nb of notebooks) {
        let sections = [];
        try {
            sections = await getSections(userId, nb.id);
        } catch (err) {
            log(`  ⚠️  Skipping notebook "${nb.displayName}" sections: ${err.response?.status || err.message}`);
            continue;
        }

        for (const sec of sections) {
            try {
                const url = `${GRAPH_BASE}/me/onenote/sections/${sec.id}/pages`
                    + `?$select=id,title,createdDateTime,lastModifiedDateTime,links`
                    + `&$top=100&$orderby=lastModifiedDateTime desc`;
                const secPages = await graphGetAll(userId, url);
                for (const p of secPages) {
                    pages.push({
                        pageId: p.id,
                        title: p.title || 'Untitled',
                        created: p.createdDateTime,
                        modified: p.lastModifiedDateTime,
                        webUrl: p.links?.oneNoteWebUrl?.href || null,
                        notebook: nb.displayName,
                        section: sec.displayName,
                        sectionId: sec.id,
                    });
                }
            } catch (err) {
                // Encrypted / password-protected / inaccessible sections -> skip.
                log(`  ⚠️  Skipping section "${nb.displayName} / ${sec.displayName}": ${err.response?.status || err.message}`);
            }
        }
    }
    return pages;
}

// ── Fetch + convert a single page ───────────────────────────────────────────
async function fetchPageHtml(userId, pageId) {
    const res = await graphGet(userId, `${GRAPH_BASE}/me/onenote/pages/${pageId}/content`, {
        responseType: 'text',
        transformResponse: [(d) => d], // keep raw HTML string
    });
    return res.data;
}

const EXT_BY_MIME = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
    'image/svg+xml': 'svg', 'image/tiff': 'tiff',
};

// Download every inline <img> resource, save under attachments/, and rewrite the
// src to a path relative to the note file so Obsidian renders it offline.
async function downloadImages(userId, html, slug, notePath) {
    const imgRe = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
    const tasks = [];
    let idx = 0;
    const replacements = new Map();

    let m;
    while ((m = imgRe.exec(html)) !== null) {
        const src = m[1];
        if (!src.startsWith('http') || replacements.has(src)) continue;
        const n = ++idx;
        tasks.push((async () => {
            try {
                const token = await getAccessToken(userId);
                const res = await axios.get(src, {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'arraybuffer',
                    timeout: 60000,
                });
                const mime = (res.headers['content-type'] || '').split(';')[0].trim();
                const ext = EXT_BY_MIME[mime] || 'png';
                const fileName = `${slug}-${n}.${ext}`;
                const absDir = path.join(VAULT_ROOT, ATTACHMENTS_DIR);
                fs.mkdirSync(absDir, { recursive: true });
                fs.writeFileSync(path.join(absDir, fileName), Buffer.from(res.data));
                const rel = path.relative(path.dirname(notePath), path.join(absDir, fileName));
                replacements.set(src, rel.split(path.sep).join('/'));
            } catch (err) {
                // Leave the original src if download fails.
            }
        })());
    }
    await Promise.all(tasks);

    let out = html;
    for (const [src, rel] of replacements) {
        out = out.split(src).join(rel);
    }
    return out;
}

// ── Handwriting / ink (InkML -> SVG) ────────────────────────────────────────
// OneNote's default page HTML drops ink and leaves "<!-- InkNode is not
// supported -->" comments. The real strokes are only available via
// ?includeinkml=true, which returns a multipart body containing InkML. We parse
// the traces (absolute X/Y integers in himetric units) and rasterise them into
// a single SVG so the handwriting is viewable offline in Obsidian.
const HAS_INK_RE = /InkNode is not supported/i;
const HIMETRIC_TO_PX = 96 / 2540; // 1 himetric = 1/100 mm; px @ 96dpi

// Fetch the page with ink and return every <inkml:ink> document as a string.
async function fetchInkMLDocs(userId, pageId) {
    const res = await graphGet(userId, `${GRAPH_BASE}/me/onenote/pages/${pageId}/content?includeinkml=true`, {
        responseType: 'text',
        transformResponse: [(d) => d],
    });
    const raw = res.data || '';
    return [...raw.matchAll(/<inkml:ink\b[\s\S]*?<\/inkml:ink>/gi)].map((m) => m[0]);
}

// Given an InkML doc, work out which point-column is X and which is Y.
function inkChannelIndices(inkml) {
    const names = [...inkml.matchAll(/<inkml:channel\b[^>]*\bname="([^"]+)"/gi)].map((m) => m[1].toUpperCase());
    const xi = names.indexOf('X');
    const yi = names.indexOf('Y');
    return { xi: xi === -1 ? 0 : xi, yi: yi === -1 ? 1 : yi };
}

// Parse a single <inkml:trace> body into an array of [x, y] points.
function parseTrace(body, xi, yi) {
    const pts = [];
    for (const chunk of body.split(',')) {
        const nums = chunk.trim().split(/\s+/);
        if (nums.length <= Math.max(xi, yi)) continue;
        const x = parseFloat(nums[xi]);
        const y = parseFloat(nums[yi]);
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
    }
    return pts;
}

// Render all ink docs for a page into one SVG string. Returns null if no strokes.
function renderInkToSvg(inkDocs) {
    const strokes = [];
    for (const doc of inkDocs) {
        const { xi, yi } = inkChannelIndices(doc);
        for (const t of doc.matchAll(/<inkml:trace\b[^>]*>([\s\S]*?)<\/inkml:trace>/gi)) {
            const pts = parseTrace(t[1], xi, yi);
            if (pts.length >= 2) strokes.push(pts);
            else if (pts.length === 1) strokes.push([pts[0], pts[0]]); // dot
        }
    }
    if (!strokes.length) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of strokes) for (const [x, y] of s) {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }

    const pad = 40; // himetric units of padding
    const sc = HIMETRIC_TO_PX;
    const tx = (x) => ((x - minX + pad) * sc).toFixed(1);
    const ty = (y) => ((y - minY + pad) * sc).toFixed(1);
    const w = ((maxX - minX + pad * 2) * sc).toFixed(1);
    const h = ((maxY - minY + pad * 2) * sc).toFixed(1);

    const polylines = strokes.map((s) => {
        const pts = s.map(([x, y]) => `${tx(x)},${ty(y)}`).join(' ');
        return `<polyline points="${pts}"/>`;
    }).join('\n');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="100%" height="100%" fill="#ffffff"/>
<g fill="none" stroke="#111111" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
${polylines}
</g>
</svg>`;
}

function buildFrontmatter(page, { hasInk = false } = {}) {
    const esc = (s) => String(s ?? '').replace(/"/g, '\\"');
    return [
        '---',
        `onenote_id: "${esc(page.pageId)}"`,
        `title: "${esc(page.title)}"`,
        `notebook: "${esc(page.notebook)}"`,
        `section: "${esc(page.section)}"`,
        page.created ? `created: ${page.created}` : null,
        page.modified ? `modified: ${page.modified}` : null,
        page.webUrl ? `onenote_url: "${esc(page.webUrl)}"` : null,
        hasInk ? 'has_handwriting: true' : null,
        'source: onenote',
        '---',
        '',
    ].filter((l) => l !== null).join('\n');
}

function normalizeMarkdown(text) {
    return String(text || '').replace(/\r\n/g, '\n').trim();
}

function hashString(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

async function hasLocalEdits(filePath, pageId, generatedContent) {
    if (!fs.existsSync(filePath)) return false;
    let existing;
    try {
        existing = fs.readFileSync(filePath, 'utf8');
    } catch {
        return false;
    }

    const currentHash = hashString(existing);
    const row = await db.get('SELECT content_hash FROM onenote_backup WHERE page_id = ?', [pageId]).catch(() => null);
    if (row?.content_hash) {
        return row.content_hash !== currentHash;
    }

    // If we don't have a prior generated hash, be conservative and
    // only treat the file as edited if it does not exactly match the
    // newly generated content.
    return normalizeMarkdown(existing) !== normalizeMarkdown(generatedContent);
}

// ── Sync one page to disk ───────────────────────────────────────────────────
async function syncPage(userId, page, { log = console.log } = {}) {
    const folder = path.join(VAULT_ROOT, sanitize(page.notebook, 'Notebook'), sanitize(page.section, 'Section'));
    fs.mkdirSync(folder, { recursive: true });

    const titleSlug = sanitize(page.title);
    // Disambiguate collisions by suffixing a short slice of the page id.
    const idTail = page.pageId.replace(/[^a-zA-Z0-9]/g, '').slice(-6);
    const notePath = path.join(folder, `${titleSlug}.md`);
    const finalPath = fs.existsSync(notePath) && !isSamePage(notePath, page.pageId)
        ? path.join(folder, `${titleSlug} (${idTail}).md`)
        : notePath;

    let html = await fetchPageHtml(userId, page.pageId);
    html = await downloadImages(userId, html, `${titleSlug}-${idTail}`, finalPath);

    // Strip the outer html/head so turndown focuses on the body content.
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;

    let markdown = turndown.turndown(bodyHtml).trim();

    // Handwriting: if the page has ink, mark it with a placeholder instead of
    // rendering or downloading the strokes. This preserves local edits.
    let hasInk = false;
    if (HAS_INK_RE.test(html)) {
        hasInk = true;
        markdown += '\n\n## ✍️ Handwriting\n\n{{HANDWRITING HERE}}';
        log(`    ✍️  handwriting placeholder added`);
    }

    const content = `${buildFrontmatter(page, { hasInk })}\n# ${page.title}\n\n${markdown}\n`;
    const contentHash = hashString(content);

    if (fs.existsSync(finalPath) && isSamePage(finalPath, page.pageId) && await hasLocalEdits(finalPath, page.pageId, content)) {
        log(`    ⚠️  skipped overwrite for locally edited note: ${finalPath}`);
        await db.run(`
            INSERT INTO onenote_backup (page_id, title, notebook, section_id, section, vault_path, last_modified, synced_at, content_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
            ON CONFLICT(page_id) DO UPDATE SET
                title = excluded.title,
                notebook = excluded.notebook,
                section_id = excluded.section_id,
                section = excluded.section,
                vault_path = excluded.vault_path,
                last_modified = excluded.last_modified,
                synced_at = CURRENT_TIMESTAMP
        `, [page.pageId, page.title, page.notebook, page.sectionId, page.section,
            path.relative(VAULT_ROOT, finalPath), page.modified, null]);
        return null;
    }

    fs.writeFileSync(finalPath, content, 'utf8');

    await db.run(`
        INSERT INTO onenote_backup (page_id, title, notebook, section_id, section, vault_path, last_modified, synced_at, content_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(page_id) DO UPDATE SET
            title = excluded.title,
            notebook = excluded.notebook,
            section_id = excluded.section_id,
            section = excluded.section,
            vault_path = excluded.vault_path,
            last_modified = excluded.last_modified,
            synced_at = CURRENT_TIMESTAMP,
            content_hash = excluded.content_hash
    `, [page.pageId, page.title, page.notebook, page.sectionId, page.section,
        path.relative(VAULT_ROOT, finalPath), page.modified, contentHash]);

    return finalPath;
}

// A note already written for this exact page id? (so we don't create dup files)
function isSamePage(notePath, pageId) {
    try {
        const head = fs.readFileSync(notePath, 'utf8').slice(0, 400);
        return head.includes(`onenote_id: "${pageId}"`);
    } catch {
        return false;
    }
}

// ── Top-level: sync everything ──────────────────────────────────────────────
async function syncAll(userId, { force = false, log = console.log } = {}) {
    fs.mkdirSync(VAULT_ROOT, { recursive: true });
    log('🔎 Discovering pages…');
    const pages = await listAllPages(userId, { log });
    log(`📄 Found ${pages.length} page(s).`);

    const seen = await db.all('SELECT page_id, last_modified FROM onenote_backup', []);
    const seenMap = new Map(seen.map((r) => [r.page_id, r.last_modified]));

    let created = 0, updated = 0, skipped = 0, failed = 0;
    for (const page of pages) {
        const prev = seenMap.get(page.pageId);
        const isNew = !seenMap.has(page.pageId);
        if (!force && !isNew && prev === page.modified) {
            skipped++;
            continue;
        }
        try {
            const result = await syncPage(userId, page, { log });
            if (result === null) {
                skipped++;
                log(`  - skipped ${page.notebook}/${page.section}/${page.title}`);
            } else if (isNew) {
                created++; log(`  + ${page.notebook}/${page.section}/${page.title}`);
            } else {
                updated++; log(`  ~ ${page.notebook}/${page.section}/${page.title}`);
            }
            await sleep(150); // gentle on Graph rate limits
        } catch (err) {
            failed++;
            log(`  ✖ ${page.title}: ${err.response?.status || err.message}`);
        }
    }

    const summary = { total: pages.length, created, updated, skipped, failed };
    log(`✅ Done. created=${created} updated=${updated} skipped=${skipped} failed=${failed}`);
    return summary;
}

module.exports = { syncAll, listAllPages, syncPage, VAULT_ROOT };
