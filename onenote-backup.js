#!/usr/bin/env node
/*
  OneNote -> Obsidian backup runner.

  Usage:
    node onenote-backup.js            # incremental sync + git commit/push
    node onenote-backup.js --force    # re-download every page
    node onenote-backup.js --no-git   # sync only, skip git
    node onenote-backup.js --user ID  # sync a specific Discord user's OneNote

  Defaults to the bot owner (config/owner.json -> id).
  Pushes only if a git remote named "origin" exists (otherwise just commits).
*/
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { syncAll, VAULT_ROOT } = require('./utils/onenoteSync.js');
const { id: ownerId } = require('./config/owner.json');

const args = process.argv.slice(2);
const force = args.includes('--force');
const noGit = args.includes('--no-git');
const userFlagIdx = args.indexOf('--user');
const userId = userFlagIdx !== -1 ? args[userFlagIdx + 1] : ownerId;

// ── Cross-process lock ──────────────────────────────────────────────────────
// Prevents two backups running at once (e.g. the 03:00 cron job overlapping a
// manual Discord-triggered run). Exit code 2 signals "already running".
const LOCK_FILE = path.join(__dirname, '.onenote-backup.lock');
const LOCK_MAX_AGE_MS = 30 * 60 * 1000; // treat locks older than 30 min as stale
if (fs.existsSync(LOCK_FILE)) {
    const ageMs = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
    if (ageMs < LOCK_MAX_AGE_MS) {
        console.error('⛔ Another backup is already running (lock present). Exiting.');
        process.exit(2);
    }
    // Stale lock — a previous run crashed. Remove and continue.
    try { fs.unlinkSync(LOCK_FILE); } catch {}
}
try { fs.writeFileSync(LOCK_FILE, String(process.pid)); } catch {}
const releaseLock = () => { try { fs.unlinkSync(LOCK_FILE); } catch {} };
process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(130); });
process.on('SIGTERM', () => { releaseLock(); process.exit(143); });

function git(cmdArgs) {
    return execFileSync('git', cmdArgs, { cwd: VAULT_ROOT, encoding: 'utf8' }).trim();
}

function hasRemote() {
    try {
        git(['remote', 'get-url', 'origin']);
        return true;
    } catch {
        return false;
    }
}

function commitAndPush(summary) {
    // Anything to commit?
    const status = git(['status', '--porcelain']);
    if (!status) {
        console.log('🟰 No file changes to commit.');
        return;
    }
    git(['add', '-A']);
    const stamp = new Date().toISOString();
    const msg = `OneNote backup ${stamp} — +${summary.created} ~${summary.updated}`;
    git(['commit', '-m', msg]);
    console.log(`📝 Committed: ${msg}`);

    if (hasRemote()) {
        try {
            const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
            git(['push', 'origin', branch]);
            console.log(`⬆️  Pushed to origin/${branch}.`);
        } catch (err) {
            console.warn(`⚠️  Push failed (commit is saved locally): ${err.message}`);
        }
    } else {
        console.log('ℹ️  No "origin" remote configured — commit saved locally only.');
        console.log('    Add one with:  git -C ' + VAULT_ROOT + ' remote add origin <url>');
    }
}

async function runBackup({ force = false, noGit = false, userId }) {
    if (!userId) {
        throw new Error('No user id provided');
    }

    console.log(`🗂 Backing up OneNote for user ${userId} -> ${VAULT_ROOT}`);

    const summary = await syncAll(userId, { force });

    if (!noGit) {
        commitAndPush(summary);
    }

    return summary;
}

if (require.main === module) {
    (async () => {
        try {
            const summary = await runBackup({
                force,
                noGit,
                userId
            });

            console.log('DONE:', summary);
            process.exit(0);
        } catch (err) {
            console.error('Backup failed:', err.message);
            process.exit(1);
        }
    })();
}

module.exports = { runBackup };
