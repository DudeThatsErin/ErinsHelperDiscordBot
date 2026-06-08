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
const { REST, Routes } = require('discord.js');
const { exchangeCode, createPage, createPageWithAttachment, buildHtmlContent } = require('./utils/onenote.js');
const { id: ownerId } = require('./config/owner.json');
const PORT = process.env.MS_CALLBACK_PORT || 3636;

const WEBHOOK_SECRET  = process.env.WEBHOOK_SECRET;
const ONENOTE_LOG_CHANNEL = '1406112392651210802';

const discordRest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function postNoteToDiscord(title, appUrl, webUrl) {
    try {
        const lines = [title];
        if (appUrl) lines.push('', appUrl);
        if (webUrl) lines.push('', webUrl);
        await discordRest.post(Routes.channelMessages(ONENOTE_LOG_CHANNEL), {
            body: { content: lines.join('\n') }
        });
    } catch (err) {
        console.error('Failed to post note to Discord:', err.message);
    }
}

async function postErrorToDiscord(context, detail) {
    try {
        const summary = typeof detail === 'object' ? JSON.stringify(detail) : String(detail);
        await discordRest.post(Routes.channelMessages(ONENOTE_LOG_CHANNEL), {
            body: { content: `⚠️ OneNote webhook error (${context})\n\`\`\`\n${summary.slice(0, 1800)}\n\`\`\`` }
        });
    } catch (err) {
        console.error('Failed to post error to Discord:', err.message);
    }
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
            const appUrl = page.links?.oneNoteClientUrl?.href ?? null;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, title, webUrl, appUrl }));
            postNoteToDiscord(title, appUrl, webUrl);
            return;
        } catch (err) {
            const detail = err.response?.data ?? err.message;
            console.error('Webhook post error:', detail);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: detail }));
            postErrorToDiscord(`API error${title ? ` — "${title}"` : ''}`, detail);
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
        console.error('OAuth exchange error:', detail);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h2>❌ Token exchange failed</h2><p>${detail}</p>`);
    }
});

server.listen(PORT, () => {
    console.log(`🔑 OneNote OAuth callback server listening on http://localhost:${PORT}/auth/callback`);
    console.log(`📨 OneNote webhook endpoint: POST http://localhost:${PORT}/onenote/post`);
});
