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

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Build HTML body from text, links, and image URLs
function buildHtmlContent(text, urls) {
    let html = '';

    if (text) {
        const escaped = escapeHtml(text);
        // Auto-linkify URLs inside text
        const linked = escaped.replace(
            /(https?:\/\/[^\s]+)/g,
            (url) => `<a href="${url}">${url}</a>`
        );
        html += `<p>${linked.replace(/\n/g, '<br />')}</p>`;
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

module.exports = { buildAuthUrl, exchangeCode, getAccessToken, saveSectionId, getNotebooks, getSections, createPage, buildHtmlContent, saveTokens };
