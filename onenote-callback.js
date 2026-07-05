/*
  Tiny standalone HTTP server that handles the Microsoft OAuth2 callback.
  Run this alongside the bot:  node onenote-callback.js
  Or add it to ecosystem.config.js as a second PM2 process.

  Microsoft will redirect to MS_REDIRECT_URI (e.g. http://localhost:3636/auth/callback)
  after the user authorises. This server exchanges the code for tokens and stores them.
*/
require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { log } = require('./utils/logger.js');
const { exchangeCode, createPage, createPageWithAttachment, buildHtmlContent, toAppDeepLink, checkOneNoteHealth } = require('./utils/onenote.js');
const { appendNoteByTitle } = require('./utils/onenotePost.js');
const { postToChannel, dmUser } = require('./utils/notify.js');
const { id: ownerId } = require('./config/owner.json');
const PORT = process.env.MS_CALLBACK_PORT || 3636;

const WEBHOOK_SECRET  = process.env.WEBHOOK_SECRET;
const ONENOTE_LOG_CHANNEL = process.env.ONENOTE_LOG_CHANNEL || '1406112392651210802';

async function postNoteToDiscord(title, appUrl, webUrl) {
    try {
        const lines = [title];
        if (webUrl) lines.push('', webUrl);
        await postToChannel(ONENOTE_LOG_CHANNEL, lines.join('\n'));

        // Post the app deep link as its own message (raw, no formatting) so it
        // can be selected and copied cleanly on mobile.
        if (appUrl) await postToChannel(ONENOTE_LOG_CHANNEL, appUrl);
    } catch (err) {
        log('onenote', `Failed to post note to Discord: ${err.message}`);
    }
}

// Log errors to the channel AND DM the owner so failures aren't missed.
async function postErrorToDiscord(context, detail) {
    const summary = typeof detail === 'object' ? JSON.stringify(detail) : String(detail);
    const message = `⚠️ OneNote webhook error (${context})\n\`\`\`\n${summary.slice(0, 1500)}\n\`\`\``;
    try { await postToChannel(ONENOTE_LOG_CHANNEL, message); }
    catch (err) { log('onenote', `Failed to post error to Discord channel: ${err.message}`); }
    try { await dmUser(ownerId, message); }
    catch (err) { log('onenote', `Failed to DM error to owner: ${err.message}`); }
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error('Invalid JSON')); }
        });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // ── GET /health ─────────────────────────────────────────────────────────
    // Read-only probe used by the watchdog. Verifies the same dependency chain a
    // /onenote/post relies on (owner token + configured section + reachable
    // Graph API) WITHOUT creating a page.
    //   200 { status: 'healthy' }   = all good
    //   200 { status: 'throttled' } = Graph is rate-limiting us (e.g. during a
    //                                 backup) — degraded but expected, NOT a
    //                                 hard failure, so the dashboard stays green.
    //   503                          = a real failure (auth, config, unreachable).
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/onenote/health')) {
        if (!WEBHOOK_SECRET || !ownerId) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'Webhook not configured (missing WEBHOOK_SECRET or ownerId)' }));
        }
        try {
            const result = await checkOneNoteHealth(ownerId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                ok: true,
                status: result.throttled ? 'throttled' : 'healthy',
                degraded: !!result.throttled,
                ...(result.throttled ? { note: 'Graph rate-limited (20166) — transient, likely a backup running', retryAfter: result.retryAfter } : {}),
                sectionId: result.sectionId,
                ts: Date.now(),
            }));
        } catch (err) {
            log('onenote', `Health check failed: ${err.message}`);
            const detail = err.response?.data ?? err.message;
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: typeof detail === 'object' ? JSON.stringify(detail) : String(detail) }));
        }
    }

    // ── POST /onenote/post ──────────────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/onenote/post') {
        if (!WEBHOOK_SECRET || !ownerId) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Webhook not configured (missing WEBHOOK_SECRET or ownerId)' }));
        }

        const authHeader = (req.headers['x-webhook-secret'] || req.headers['authorization']?.replace(/^Bearer /, '') || url.searchParams.get('secret') || '').trim();
        if (authHeader !== WEBHOOK_SECRET) {
            console.warn(`Webhook auth failed — received length ${authHeader.length}, expected ${WEBHOOK_SECRET.length}`);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }

        let body;
        try { body = await readBody(req); }
        catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
            postErrorToDiscord('invalid JSON', err.message);
            return;
        }

        const { title, content = null, urls = [], html = null, file = null, mimeType = 'application/octet-stream', fileName = 'attachment' } = body;
        if (!title) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'title is required' }));
            postErrorToDiscord('missing title', 'Request body had no title field');
            return;
        }

        try {
            let page;
            if (file) {
                const fileBuffer = Buffer.from(file, 'base64');
                const htmlContent = content ? buildHtmlContent(content, urls) : '';
                page = await createPageWithAttachment(ownerId, title, htmlContent, fileBuffer, mimeType, fileName);
            } else {
                let resolvedHtml = html ?? buildHtmlContent(content, urls);
                if (html) {
                    const bodyMatch = resolvedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                    if (bodyMatch) resolvedHtml = bodyMatch[1];
                    else resolvedHtml = resolvedHtml.replace(/<\/?(html|head|body)[^>]*>/gi, '');
                }
                page = await createPage(ownerId, title, resolvedHtml);
            }
            const webUrl = page.links?.oneNoteWebUrl?.href ?? null;
            const appUrl = toAppDeepLink(page.links?.oneNoteClientUrl?.href) ?? null;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, title, webUrl, appUrl }));
            postNoteToDiscord(title, appUrl, webUrl);
            return;
        } catch (err) {
            const detail = err.response?.data ?? err.message;
            log('onenote', `Webhook post error: ${detail}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: detail }));
            postErrorToDiscord(`API error${title ? ` — "${title}"` : ''}`, detail);
            return;
        }
    }

    // ── POST /onenote/append ────────────────────────────────────────────────
    // Append-only: adds text/HTML to the END of an existing page matched by its
    // exact title. Creates the page if it doesn't exist yet. Same auth as /post.
    if (req.method === 'POST' && url.pathname === '/onenote/append') {
        if (!WEBHOOK_SECRET || !ownerId) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Webhook not configured (missing WEBHOOK_SECRET or ownerId)' }));
        }

        const authHeader = (req.headers['x-webhook-secret'] || req.headers['authorization']?.replace(/^Bearer /, '') || url.searchParams.get('secret') || '').trim();
        if (authHeader !== WEBHOOK_SECRET) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }

        let body;
        try { body = await readBody(req); }
        catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
            postErrorToDiscord('append: invalid JSON', err.message);
            return;
        }

        const { title, content = null, html = null, items = null } = body;
        if (!title) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'title is required' }));
            postErrorToDiscord('append: missing title', 'Request body had no title field');
            return;
        }
        if (content == null && html == null && !(Array.isArray(items) && items.length)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'content, items, or html is required' }));
            return;
        }

        try {
            // If raw HTML is supplied, strip any wrapping <html>/<body> tags.
            let appendHtml = html;
            if (appendHtml) {
                const bodyMatch = appendHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                appendHtml = bodyMatch ? bodyMatch[1] : appendHtml.replace(/<\/?(html|head|body)[^>]*>/gi, '');
            }

            const result = await appendNoteByTitle(ownerId, title, content, { html: appendHtml, items });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, ...result }));
            postNoteToDiscord(`${result.created ? '🆕 Created' : '➕ Appended to'}: ${result.title}`, result.appUrl, result.webUrl);
            return;
        } catch (err) {
            const detail = err.response?.data ?? err.message;
            log('onenote', `Webhook append error: ${detail}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: detail }));
            postErrorToDiscord(`append API error${title ? ` — "${title}"` : ''}`, detail);
            return;
        }
    }

    // ── GET /auth/callback ───────────────────────────────────────────────────
    if (url.pathname !== '/auth/callback') {
        res.writeHead(404);
        return res.end('Not found');
    }

    const code   = url.searchParams.get('code');
    const userId = url.searchParams.get('state');
    const error  = url.searchParams.get('error');

    if (error || !code || !userId) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        return res.end(`<h2>❌ Authorization failed</h2><p>${error || 'Missing code or state'}</p>`);
    }

    try {
        await exchangeCode(code, userId);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <h2>✅ Microsoft account linked!</h2>
            <p>You can close this tab and go back to Discord.</p>
            <p>Run <strong>/onenote-setup</strong> to pick your notebook section, then <strong>/onenote</strong> to start sending notes.</p>
        `);
        console.log(`✅ OAuth tokens saved for Discord user ${userId}`);
    } catch (err) {
        const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        log('onenote', `OAuth exchange error: ${detail}`);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h2>❌ Token exchange failed</h2><p>${detail}</p>`);
    }
});

server.listen(PORT, () => {
    console.log(`🔑 OneNote OAuth callback server listening on http://localhost:${PORT}/auth/callback`);
    console.log(`📨 OneNote webhook endpoint: POST http://localhost:${PORT}/onenote/post`);
    console.log(`❤️  Health probe: GET http://localhost:${PORT}/health`);
});
