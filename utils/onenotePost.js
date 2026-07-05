// Shared helpers for posting notes to OneNote from the various entry points
// (slash command, prefix command, and DMs). Keeps the behaviour identical
// everywhere: parse a note, create the page, and format the Discord reply.
const axios = require('axios');
const { createPage, createPageWithAttachments, buildHtmlContent, toAppDeepLink, saveSectionId, findPageByTitle, appendToPage, getPageLinks, cachePage, clearCachedPage, buildAppendHtml } = require('./onenote.js');
const { log } = require('./logger.js');
// OneNote rejects very large requests; anything above this is linked instead of
// embedded as a binary attachment.
const MAX_ATTACHMENT_BYTES = 24 * 1024 * 1024;

function pageLinks(page) {
    return {
        webUrl: page.links?.oneNoteWebUrl?.href ?? null,
        appUrl: toAppDeepLink(page.links?.oneNoteClientUrl?.href) ?? null,
    };
}

async function downloadToBuffer(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000,
    });
    return Buffer.from(res.data);
}

// Turn raw text into a { title, content } pair.
//   - "Title | body text"  -> split on the first pipe
//   - "Title\nbody text"   -> first line is the title, the rest is the body
//   - "Title"              -> title only, no body
function parseNote(body) {
    const trimmed = (body || '').trim();
    if (!trimmed) return { title: null, content: null };

    const pipeIdx = trimmed.indexOf('|');
    if (pipeIdx !== -1) {
        return {
            title: trimmed.slice(0, pipeIdx).trim(),
            content: trimmed.slice(pipeIdx + 1).trim() || null,
        };
    }

    const nl = trimmed.indexOf('\n');
    if (nl !== -1) {
        return {
            title: trimmed.slice(0, nl).trim(),
            content: trimmed.slice(nl + 1).trim() || null,
        };
    }

    return { title: trimmed, content: null };
}

// Create a OneNote page and return its links.
async function createNote(userId, { title, content = null, urls = [] }) {
    const html = buildHtmlContent(content, urls);
    const page = await createPage(userId, title, html);
    return pageLinks(page);
}

// Build the human-readable status line(s) shown after a successful post.
function buildStatus(title, webUrl) {
    const lines = [`✅ Note **"${title}"** sent to OneNote!`];
    if (webUrl) lines.push(`🌐 ${webUrl}`);
    return lines.join('\n');
}

// Status line(s) shown after an append.
function buildAppendStatus(title, webUrl, created) {
    const lines = [created
        ? `✅ Created note **"${title}"** and added your first entry!`
        : `✅ Appended to note **"${title}"**!`];
    if (webUrl) lines.push(`🌐 ${webUrl}`);
    return lines.join('\n');
}

// Append-only: find a page by its exact title and append content to the end of
// it. If no page with that title exists it is created (so the first append
// seeds the note). `content` may be a string or an array of strings (an array
// becomes a bulleted list); pass `{ items }` for an explicit list, or `{ html }`
// to append your own raw HTML (bypasses escaping).
// Returns { created, title, webUrl, appUrl }.
async function appendNoteByTitle(userId, title, content, { createIfMissing = true, html = null, items = null } = {}) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) throw new Error('A note title is required.');

    const bodyHtml = html != null ? html : buildAppendHtml(content, { items });
    if (!bodyHtml || !bodyHtml.trim()) throw new Error('Nothing to append (provide content, items, or html).');

    let existing = await findPageByTitle(userId, cleanTitle);
    if (existing) {
        try {
            await appendToPage(userId, existing.id, bodyHtml);
        } catch (err) {
            // A cached page id can be stale (page deleted/moved/invalid). OneNote
            // signals this with 404, or 400/20112 ("Invalid Entity ID"). Drop the
            // cache entry, search again from scratch, and retry once.
            const status = err.response?.status;
            const code = err.response?.data?.error?.code;
            const staleCache = existing._cached && (status === 404 || status === 400 || code === '20112');
            if (staleCache) {
                await clearCachedPage(userId, cleanTitle);
                existing = await findPageByTitle(userId, cleanTitle, { useCache: false });
                if (existing) await appendToPage(userId, existing.id, bodyHtml);
            } else {
                throw err;
            }
        }
        if (existing) {
            // PATCH returns no body, so reuse the links from the search (or fetch).
            const linkSource = existing.links?.oneNoteWebUrl?.href ? existing : await getPageLinks(userId, existing.id).catch(() => null);
            return { created: false, title: cleanTitle, ...pageLinks(linkSource || {}) };
        }
    }

    if (!createIfMissing) throw new Error(`No OneNote page titled "${cleanTitle}" was found.`);

    const page = await createPage(userId, cleanTitle, bodyHtml);
    await cachePage(userId, cleanTitle, page);
    return { created: true, title: cleanTitle, ...pageLinks(page) };
}

// End-to-end handler for an append from a Discord message (prefix command).
// Normal mode: first line is the title, the rest is the text to append.
// List mode (`list: true`): first line is the title and each remaining line
// becomes a bullet (any leading "-", "*", or "•" the user typed is stripped).
async function appendFromMessage(message, body, { list = false } = {}) {
    let title, content = null, items = null;

    if (list) {
        const lines = body.split(/\r?\n/);
        title = (lines.shift() || '').trim();
        items = lines
            .map((l) => l.replace(/^\s*[-*•]\s?/, '').trim())
            .filter(Boolean);
        if (!title || !items.length) {
            log('append', `Invalid list append from ${message.author.id}: title="${title}", items=${items.length}`);
            return message.reply({
                content: [
                    '❌ For a list, put the **title on the first line** and each **item on its own line**.',
                    'Example:',
                    '```',
                    '!append --list Shopping',
                    'Milk',
                    'Eggs',
                    'Bread',
                    '```',
                ].join('\n'),
            }).catch(() => {});
        }
    } else {
        ({ title, content } = parseNote(body));
        if (!title || !content) {
            return message.reply({
                content: [
                    '❌ Provide a **title** and the **text to append**.',
                    'Examples: `!append My Log | did a thing`',
                    'or put the title on the first line and the text on the next line(s).',
                    'Tip: add `--list` to turn each line into a bullet.',
                ].join('\n'),
            }).catch(() => {});
        }
    }

    try {
        const { created, webUrl, appUrl } = await appendNoteByTitle(message.author.id, title, content, { items });
        await message.reply({ content: buildAppendStatus(title, webUrl, created) });
        if (appUrl) await message.channel.send({ content: appUrl });
    } catch (err) {
        const msg = await handleNoteError(err, message.author.id);
        await message.reply({ content: msg }).catch(() => {});
    }
}

// Convert an error into a friendly Discord message, resetting the stored
// section if OneNote reports it no longer exists.
async function handleNoteError(err, userId) {
    console.error('OneNote post error:', err.response?.data || err.message);

    if (err.response?.data?.error?.code === '20102') {
        await saveSectionId(userId, null).catch(() => {});
        log('onenote', `Cleared section for ${userId} due to 20102 error`);
        return '❌ Your configured OneNote section no longer exists. Please run `/onenote-setup` to pick a new section.';
    }
    if (/Not authenticated/i.test(err.message)) {
        log('onenote', `User ${userId} not authenticated`);
        return '❌ Not linked to Microsoft yet. Run `/onenote-auth` first.';
    }
    if (/No OneNote section configured/i.test(err.message)) {
        log('onenote', `User ${userId} has no section configured`);
        return '❌ No OneNote section configured. Run `/onenote-setup` first.';
    }
    log('onenote', `User ${userId} OneNote error: ${err.message}`);
    return `❌ ${err.message}`;
}

// End-to-end handler for a Discord message (prefix command or DM): parse the
// body, download any attachments and embed them as real binary files in the
// note, create the page, and reply. The app deep link is sent as its own
// message so it can be copied cleanly on mobile.
async function postNoteFromMessage(message, body) {
    const { title: parsedTitle, content } = parseNote(body);
    const attachments = [...message.attachments.values()];

    const title = parsedTitle
        || attachments[0]?.name
        || `Note - ${new Date().toLocaleDateString('en-US')}`;

    if (!parsedTitle && !content && attachments.length === 0) {
        log('onenote', `User ${message.author.id} tried to post an empty note`);
        return message.reply({ content: '❌ Nothing to post. Send a title, some text, or an attachment.' }).catch(() => {});
    }

    // Download each attachment and embed it as binary. Files that are too large
    // or fail to download fall back to being linked in the note body.
    const files = [];
    const fallbackUrls = [];
    for (const att of attachments) {
        if (att.size && att.size > MAX_ATTACHMENT_BYTES) {
            fallbackUrls.push(att.url);
            continue;
        }
        try {
            const buffer = await downloadToBuffer(att.url);
            files.push({
                buffer,
                mimeType: att.contentType || 'application/octet-stream',
                fileName: att.name || 'attachment',
            });
        } catch (err) {
            console.warn(`[OneNote] Failed to download attachment "${att.name}": ${err.message}`);
            fallbackUrls.push(att.url);
        }
    }

    try {
        const html = buildHtmlContent(content, fallbackUrls);
        const page = files.length
            ? await createPageWithAttachments(message.author.id, title, html, files)
            : await createPage(message.author.id, title, html);

        const { webUrl, appUrl } = pageLinks(page);
        await message.reply({ content: buildStatus(title, webUrl) });
        if (appUrl) await message.channel.send({ content: appUrl });
    } catch (err) {
        log('onenote', `Error occurred while posting note from message: ${err.message}`);
        const msg = await handleNoteError(err, message.author.id);
        await message.reply({ content: msg }).catch(() => {});
    }
}

module.exports = { parseNote, createNote, buildStatus, buildAppendStatus, handleNoteError, postNoteFromMessage, appendNoteByTitle, appendFromMessage };
