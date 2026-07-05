const axios = require('axios');
const db = require('../database.js');

const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_AUTH_URL  = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const GRAPH_BASE   = 'https://graph.microsoft.com/v1.0';

const SCOPES = 'offline_access Notes.Create Notes.ReadWrite';

function getClientId()     { return process.env.MS_CLIENT_ID; }
function getClientSecret() { return process.env.MS_CLIENT_SECRET; }
function getRedirectUri()  { return process.env.MS_REDIRECT_URI; }

// Build the OAuth2 authorization URL
function buildAuthUrl(stateUserId) {
    const params = new URLSearchParams({
        client_id:     getClientId(),
        response_type: 'code',
        redirect_uri:  getRedirectUri(),
        response_mode: 'query',
        scope:         SCOPES,
        state:         stateUserId,
    });
    return `${MS_AUTH_URL}?${params.toString()}`;
}

// Exchange an auth code for tokens and persist them
async function exchangeCode(code, userId) {
    const res = await axios.post(MS_TOKEN_URL, new URLSearchParams({
        client_id:     getClientId(),
        client_secret: getClientSecret(),
        code,
        redirect_uri:  getRedirectUri(),
        grant_type:    'authorization_code',
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    await saveTokens(userId, res.data);
    return res.data;
}

// Refresh an expired access token
async function refreshAccessToken(userId) {
    const row = await db.get('SELECT * FROM ms_tokens WHERE user_id = ?', [userId]);
    if (!row) throw new Error('No token found for this user. Run /onenote-auth first.');

    const res = await axios.post(MS_TOKEN_URL, new URLSearchParams({
        client_id:     getClientId(),
        client_secret: getClientSecret(),
        refresh_token: row.refresh_token,
        grant_type:    'refresh_token',
        scope:         SCOPES,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    await saveTokens(userId, res.data, row.onenote_section_id);
    return res.data.access_token;
}

async function saveTokens(userId, tokenData, sectionId = null) {
    const expiresAt = Date.now() + (tokenData.expires_in * 1000);
    await db.run(`
        INSERT INTO ms_tokens (user_id, access_token, refresh_token, expires_at, onenote_section_id, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = CASE WHEN excluded.refresh_token IS NOT NULL THEN excluded.refresh_token ELSE refresh_token END,
            expires_at = excluded.expires_at,
            onenote_section_id = CASE WHEN excluded.onenote_section_id IS NOT NULL THEN excluded.onenote_section_id ELSE onenote_section_id END,
            updated_at = CURRENT_TIMESTAMP
    `, [userId, tokenData.access_token, tokenData.refresh_token || null, expiresAt, sectionId]);
}

// Get a valid access token, refreshing if needed
async function getAccessToken(userId) {
    const row = await db.get('SELECT * FROM ms_tokens WHERE user_id = ?', [userId]);
    if (!row) throw new Error('Not authenticated with Microsoft. Run `/onenote-auth` first.');

    if (Date.now() < row.expires_at - 60000) {
        return row.access_token;
    }
    return refreshAccessToken(userId);
}

// Save which section to post to
async function saveSectionId(userId, sectionId) {
    await db.run('UPDATE ms_tokens SET onenote_section_id = ? WHERE user_id = ?', [sectionId, userId]);
}

// Fetch all notebooks
async function getNotebooks(userId) {
    const token = await getAccessToken(userId);
    const res = await axios.get(`${GRAPH_BASE}/me/onenote/notebooks`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.data.value;
}

// Fetch sections for a notebook
async function getSections(userId, notebookId) {
    const token = await getAccessToken(userId);
    const res = await axios.get(`${GRAPH_BASE}/me/onenote/notebooks/${notebookId}/sections`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.data.value;
}

// Post a new page to the configured section
async function createPage(userId, title, htmlContent) {
    const token = await getAccessToken(userId);
    const row = await db.get('SELECT onenote_section_id FROM ms_tokens WHERE user_id = ?', [userId]);
    if (!row?.onenote_section_id) throw new Error('No OneNote section configured. Run `/onenote-setup` first.');

    const pageHtml = `<!DOCTYPE html>
<html>
  <head><title>${escapeHtml(title)}</title></head>
  <body>${htmlContent}</body>
</html>`;

    const res = await axios.post(
        `${GRAPH_BASE}/me/onenote/sections/${row.onenote_section_id}/pages`,
        pageHtml,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/html' } }
    );
    return res.data;
}

// Post a new page with one or more inline binary attachments via multipart.
// `attachments` is an array of { buffer, mimeType, fileName }. Images are
// embedded with <img>; all other files with <object> (shown as an attachment).
async function createPageWithAttachments(userId, title, htmlContent, attachments = []) {
    if (!attachments.length) return createPage(userId, title, htmlContent);

    const token = await getAccessToken(userId);
    const row = await db.get('SELECT onenote_section_id FROM ms_tokens WHERE user_id = ?', [userId]);
    if (!row?.onenote_section_id) throw new Error('No OneNote section configured. Run `/onenote-setup` first.');

    let tags = '';
    const parts = attachments.map((att, i) => {
        const partName = `attachment${i}`;
        const mimeType = att.mimeType || 'application/octet-stream';
        const fileName = att.fileName || partName;
        const isImage = /^image\//i.test(mimeType);
        tags += isImage
            ? `<p><img src="name:${partName}" alt="${escapeHtml(fileName)}" /></p>`
            : `<p><object data-attachment="${escapeHtml(fileName)}" data="name:${partName}" type="${mimeType}" /></p>`;
        return { partName, mimeType, buffer: att.buffer };
    });

    const boundary = `----OneNoteBoundary${Date.now()}`;
    const pageHtml = `<!DOCTYPE html>
<html>
  <head><title>${escapeHtml(title)}</title></head>
  <body>${htmlContent}${tags}</body>
</html>`;

    const chunks = [
        Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="Presentation"\r\n` +
            `Content-Type: text/html\r\n\r\n` +
            pageHtml + `\r\n`,
            'utf8'
        ),
    ];
    for (const p of parts) {
        chunks.push(Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${p.partName}"\r\n` +
            `Content-Type: ${p.mimeType}\r\n\r\n`,
            'utf8'
        ));
        chunks.push(p.buffer);
        chunks.push(Buffer.from('\r\n', 'utf8'));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));

    const res = await axios.post(
        `${GRAPH_BASE}/me/onenote/sections/${row.onenote_section_id}/pages`,
        Buffer.concat(chunks),
        {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        }
    );
    return res.data;
}

// Single-attachment convenience wrapper (kept for the webhook server).
async function createPageWithAttachment(userId, title, htmlContent, fileBuffer, mimeType, fileName = 'attachment') {
    return createPageWithAttachments(userId, title, htmlContent, [{ buffer: fileBuffer, mimeType, fileName }]);
}

// Keep old name as alias for backwards compatibility
const createPageWithImage = createPageWithAttachment;

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Convert the Microsoft Graph `oneNoteClientUrl` into the OneNote app deep-link
// format that opens the page directly in the installed client.
//
// Graph returns:
//   onenote:https://d.docs.live.net/<cid>/Documents/<Notebook>[/<Groups>]/<Section>.one#<Page>&section-id=<guid>&page-id=<guid>&end
// We want:
//   onenote:<Section>.one#<Page>&section-id={<guid>}&page-id={<guid>}&end&base-path=https://d.docs.live.net/<cid>/Documents/<Notebook>[/<Groups>]
//
// The path that precedes the section file is moved into a `&base-path=` parameter,
// and the id GUIDs are wrapped in braces (the app expects `{guid}`).
function toAppDeepLink(clientUrl) {
    if (!clientUrl || typeof clientUrl !== 'string') return clientUrl;

    const PREFIX = 'onenote:';
    if (!clientUrl.startsWith(PREFIX)) return clientUrl;

    const rest = clientUrl.slice(PREFIX.length);

    // Split the file path from the page fragment at the section-file boundary.
    const marker = '.one#';
    const idx = rest.indexOf(marker);
    if (idx === -1) return clientUrl; // unexpected format, leave unchanged

    const pathPart = rest.slice(0, idx);                 // https://.../Documents/<Notebook>[/<Groups>]/<Section>
    const fragment = rest.slice(idx + marker.length);    // <Page>&section-id=<guid>&page-id=<guid>&end

    // Separate the section name (last path segment) from the base path.
    const lastSlash = pathPart.lastIndexOf('/');
    if (lastSlash === -1) return clientUrl;
    const basePath = pathPart.slice(0, lastSlash);       // https://.../Documents/<Notebook>[/<Groups>]
    const sectionName = pathPart.slice(lastSlash + 1);   // <Section>

    // Wrap bare GUIDs in braces (skip any that are already braced).
    const withBraces = fragment.replace(
        /=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b/g,
        '={$1}'
    );

    return `${PREFIX}${sectionName}.one#${withBraces}&base-path=${basePath}`;
}

// Escape text and turn URLs into links. Newlines are left untouched so callers
// can decide the line spacing.
function escapeAndLink(text) {
    return escapeHtml(String(text))
        .replace(/(https?:\/\/[^\s]+)/g, (url) => `<a href="${url}">${url}</a>`);
}

// Render a block of text where each provided line is separated by ONE empty
// line (i.e. a blank line between lines). This is the default paragraph style.
function paragraphWithGaps(text) {
    return escapeAndLink(text)
        .replace(/\r\n?/g, '\n')
        .replace(/\n/g, '<br /><br />');
}

// Build append-body HTML from flexible input:
//   - a string            -> a paragraph; each line separated by one blank line
//   - an array of strings  -> a bulleted <ul> list
//   - the `items` option   -> also rendered as a bulleted list (after `content`)
// Strings are HTML-escaped. To append your own raw markup, use the `html`
// field/option instead (which bypasses escaping entirely).
function buildAppendHtml(content, { items = null } = {}) {
    let html = '';
    let bullets = items;

    if (Array.isArray(content)) {
        // Treat the array as list items (unless explicit items were given).
        if (!bullets) bullets = content;
        else html += `<p>${content.map(paragraphWithGaps).join('<br /><br />')}</p>`;
    } else if (content != null && String(content).trim() !== '') {
        html += `<p>${paragraphWithGaps(content)}</p>`;
    }

    if (Array.isArray(bullets)) {
        const lis = bullets
            .filter((i) => i != null && String(i).trim() !== '')
            .map((i) => `<li>${escapeAndLink(i).replace(/\r\n?|\n/g, '<br />')}</li>`)
            .join('');
        if (lis) html += `<ul>${lis}</ul>`;
    }

    return html;
}

// Build HTML body from text, links, and image URLs
function buildHtmlContent(text, urls) {
    let html = '';

    if (text) {
        // Auto-linkify URLs and separate each provided line by one blank line
        // (same default spacing as the append API).
        html += `<p>${paragraphWithGaps(text)}</p>`;
    }

    for (const url of urls) {
        const trimmed = url.trim();
        if (!trimmed) continue;
        if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(trimmed)) {
            html += `<p><img src="${trimmed}" alt="image" /></p>`;
        } else {
            html += `<p><a href="${trimmed}">${trimmed}</a></p>`;
        }
    }

    return html;
}

// ── Title→page cache ─────────────────────────────────────────────────────
// Remembers where a given title lives so frequent appends skip the (slow)
// section sweep. Purely an optimisation: a miss just falls back to searching,
// and a stale entry is cleared automatically when an append 404s.
async function cachePage(userId, title, page) {
    if (!page?.id) return;
    await db.run(`
        INSERT INTO onenote_page_cache (user_id, title, page_id, web_href, client_href, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, title) DO UPDATE SET
            page_id = excluded.page_id,
            web_href = excluded.web_href,
            client_href = excluded.client_href,
            updated_at = CURRENT_TIMESTAMP
    `, [userId, String(title).trim(), page.id, page.links?.oneNoteWebUrl?.href ?? null, page.links?.oneNoteClientUrl?.href ?? null]).catch(() => {});
}

async function getCachedPage(userId, title) {
    const row = await db.get('SELECT * FROM onenote_page_cache WHERE user_id = ? AND title = ?', [userId, String(title).trim()]).catch(() => null);
    if (!row) return null;
    return {
        id: row.page_id,
        title,
        links: { oneNoteWebUrl: { href: row.web_href }, oneNoteClientUrl: { href: row.client_href } },
        _cached: true,
    };
}

async function clearCachedPage(userId, title) {
    await db.run('DELETE FROM onenote_page_cache WHERE user_id = ? AND title = ?', [userId, String(title).trim()]).catch(() => {});
}

// Scan a single section for an exact-title match (newest pages first). Returns
// null if not found, or if the section can't be read (e.g. encrypted/password-
// protected sections return error 20185) — those are skipped, not fatal.
async function scanSectionForTitle(token, sectionId, target) {
    let url = `${GRAPH_BASE}/me/onenote/sections/${sectionId}/pages?$select=id,title,links&$top=100&$orderby=lastModifiedDateTime%20desc`;
    try {
        for (let i = 0; i < 5 && url; i++) {
            const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
            const match = res.data.value.find((p) => (p.title || '').trim() === target);
            if (match) return match;
            url = res.data['@odata.nextLink'] || null;
        }
    } catch (err) {
        const code = err.response?.data?.error?.code;
        // Encrypted/inaccessible sections are expected; skip them quietly. Log
        // anything unexpected so genuine problems stay visible.
        if (code !== '20185') {
            console.warn(`[OneNote] Skipping section ${sectionId} during title search: ${code || err.message}`);
        }
        return null;
    }
    return null;
}

// Find a page by its exact title. By default this searches ALL of the user's
// sections (across every notebook): the configured section is checked first as
// a fast path, then the remaining sections newest-first. Pass a `sectionId` to
// restrict the search to a single section. Matching is done in JS (not an OData
// $filter) so quotes, emojis, pipes, etc. need no escaping. When several pages
// share a title, the most recently modified match wins.
//
// Note: Graph rejects the account-wide /me/onenote/pages endpoint for accounts
// with many sections (error 20266), so we must query per section.
async function findPageByTitle(userId, title, { sectionId = null, useCache = true } = {}) {
    const token = await getAccessToken(userId);
    const target = String(title).trim();

    if (sectionId) {
        return scanSectionForTitle(token, sectionId, target);
    }

    // Fastest path: a remembered page id for this exact title.
    if (useCache) {
        const cached = await getCachedPage(userId, target);
        if (cached) return cached;
    }

    // Fast path: the configured section is where notes usually live.
    const row = await db.get('SELECT onenote_section_id FROM ms_tokens WHERE user_id = ?', [userId]);
    const configured = row?.onenote_section_id || null;
    if (configured) {
        const hit = await scanSectionForTitle(token, configured, target);
        if (hit) { await cachePage(userId, target, hit); return hit; }
    }

    // Fall back to sweeping every other section, most recently modified first.
    let sUrl = `${GRAPH_BASE}/me/onenote/sections?$select=id&$top=100&$orderby=lastModifiedDateTime%20desc`;
    const sectionIds = [];
    for (let i = 0; i < 10 && sUrl; i++) {
        const res = await axios.get(sUrl, { headers: { Authorization: `Bearer ${token}` } });
        for (const s of res.data.value) {
            if (s.id !== configured) sectionIds.push(s.id);
        }
        sUrl = res.data['@odata.nextLink'] || null;
    }

    for (const id of sectionIds) {
        const hit = await scanSectionForTitle(token, id, target);
        if (hit) { await cachePage(userId, target, hit); return hit; }
    }
    return null;
}

// Append HTML to the END of an existing page's body. This is append-only: it
// never edits, replaces, or removes any existing content on the page.
async function appendToPage(userId, pageId, htmlContent) {
    const token = await getAccessToken(userId);
    const commands = [{
        target: 'body',
        action: 'append',
        position: 'after',
        content: htmlContent,
    }];
    // A successful PATCH returns 204 No Content.
    await axios.patch(
        `${GRAPH_BASE}/me/onenote/pages/${pageId}/content`,
        commands,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
}

// Fetch a single page's metadata (used to recover its links after an append).
async function getPageLinks(userId, pageId) {
    const token = await getAccessToken(userId);
    const res = await axios.get(`${GRAPH_BASE}/me/onenote/pages/${pageId}?$select=id,title,links`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
}

// Is this error Microsoft Graph throttling us? Graph returns 429 (and sometimes
// 503) with error code 20166 ("app has issued too many requests…") — e.g. while
// a large backup is running. That's transient and expected, not a real outage.
function isThrottleError(err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const code = data?.error?.code ?? data?.code;
    const message = data?.error?.message ?? err.message ?? '';
    return status === 429 || String(code) === '20166' || /too many requests/i.test(message);
}

// Lightweight, read-only health check that exercises the exact same
// dependencies a /onenote/post would need — a valid (refreshable) access token,
// a configured section, and a reachable Graph API — WITHOUT creating a page.
// Throws with a descriptive message on real failures. Graph throttling is NOT
// treated as a failure: it returns { ok: true, throttled: true } so a running
// backup doesn't flip the dashboard red.
async function checkOneNoteHealth(userId) {
    const token = await getAccessToken(userId); // refreshes if expired
    const row = await db.get('SELECT onenote_section_id FROM ms_tokens WHERE user_id = ?', [userId]);
    if (!row?.onenote_section_id) throw new Error('No OneNote section configured. Run `/onenote-setup`.');

    // A cheap GET on the configured section confirms the token actually works.
    try {
        await axios.get(`${GRAPH_BASE}/me/onenote/sections/${row.onenote_section_id}?$select=id,displayName`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000,
        });
    } catch (err) {
        if (isThrottleError(err)) {
            const retryAfter = Number(err.response?.headers?.['retry-after']) || null;
            return { ok: true, throttled: true, sectionId: row.onenote_section_id, retryAfter };
        }
        throw err;
    }
    return { ok: true, sectionId: row.onenote_section_id };
}

module.exports = { buildAuthUrl, exchangeCode, getAccessToken, saveSectionId, getNotebooks, getSections, createPage, createPageWithImage, createPageWithAttachment, createPageWithAttachments, buildHtmlContent, saveTokens, toAppDeepLink, findPageByTitle, appendToPage, getPageLinks, cachePage, clearCachedPage, buildAppendHtml, checkOneNoteHealth };
