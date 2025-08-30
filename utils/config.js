require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Load configuration from both .env and config.json
const configPath = path.join(__dirname, '../config.json');
let jsonConfig = {};

try {
    if (fs.existsSync(configPath)) {
        jsonConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (error) {
    console.error('Error loading config.json:', error.message);
}

// Merge environment variables with JSON config
const config = {
    // Sensitive data from .env
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    prefix: process.env.PREFIX,
    googleApiKey: process.env.GOOGLE_API_KEY,
    
    // Non-sensitive data from config.json
    database: jsonConfig.database || {},
    google: jsonConfig.google || {},
    features: jsonConfig.features || {},
    channels: jsonConfig.channels || {},
    roles: jsonConfig.roles || {},
    
    // Helper methods
    getDatabasePath: () => jsonConfig.database?.path || '/var/www/quartznotes/quartznote.db',
    getGoogleSearchEngineId: () => jsonConfig.google?.searchEngineId || '',
    getChannelId: (type) => jsonConfig.channels?.[type] || '',
    getChannelIds: (type) => {
        const channel = jsonConfig.channels?.[type];
        return Array.isArray(channel) ? channel : [channel].filter(Boolean);
    },
    getRoleIds: (type) => {
        const role = jsonConfig.roles?.[type];
        return Array.isArray(role) ? role : [role].filter(Boolean);
    },
    getColor: (type = 'primary') => jsonConfig.features?.embedColors?.[type] || '0x1ea0e1',
    getCooldown: () => jsonConfig.features?.cooldownDefault || 5
};

module.exports = config;
