const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../config/settings.json');

function readSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    } catch (err) {
        console.error(`[TestFlightStore] Failed to read settings: ${err.message}`);
        return {};
    }
}

function writeSettings(settings) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

// Accepts a raw join code or a full TestFlight URL and returns just the code.
function parseProgramId(input) {
    if (!input) return null;
    const trimmed = input.trim();
    const match = trimmed.match(/testflight\.apple\.com\/join\/([A-Za-z0-9]+)/i);
    if (match) return match[1];
    return trimmed;
}

function getPrograms() {
    const settings = readSettings();
    return Array.isArray(settings.testflight?.programs) ? settings.testflight.programs : [];
}

function addProgram(rawId, name) {
    const id = parseProgramId(rawId);
    if (!id) return { ok: false, reason: 'invalid' };

    const settings = readSettings();
    if (!settings.testflight) settings.testflight = {};
    if (!Array.isArray(settings.testflight.programs)) settings.testflight.programs = [];

    if (settings.testflight.programs.some(p => p.id.toLowerCase() === id.toLowerCase())) {
        return { ok: false, reason: 'exists' };
    }

    const program = { id, name: (name && name.trim()) || id };
    settings.testflight.programs.push(program);
    writeSettings(settings);
    return { ok: true, program };
}

function removeProgram(identifier) {
    if (!identifier) return { ok: false, reason: 'invalid' };
    const target = parseProgramId(identifier).toLowerCase();

    const settings = readSettings();
    const programs = Array.isArray(settings.testflight?.programs) ? settings.testflight.programs : [];

    const idx = programs.findIndex(p =>
        p.id.toLowerCase() === target || (p.name && p.name.toLowerCase() === identifier.trim().toLowerCase())
    );
    if (idx === -1) return { ok: false, reason: 'notfound' };

    const [removed] = programs.splice(idx, 1);
    settings.testflight.programs = programs;
    writeSettings(settings);
    return { ok: true, program: removed };
}

module.exports = { getPrograms, addProgram, removeProgram, parseProgramId };
