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
const { exchangeCode } = require('./utils/onenote.js');

const PORT = process.env.MS_CALLBACK_PORT || 3636;

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

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
});
