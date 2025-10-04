const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use separate database for Discord bot
const dbPath = process.env.DB_PATH || path.join(__dirname, 'bot.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database at:', dbPath);
        // Initialize reaction roles table
        db.run(`
            CREATE TABLE IF NOT EXISTS reaction_roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                emoji TEXT NOT NULL,
                role_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(message_id, emoji)
            )
        `, (err) => {
            if (err) {
                console.error('Error creating reaction_roles table:', err.message);
            } else {
                console.log('Reaction roles table ready');
            }
        });
    }
});

// Promisify database methods for easier async/await usage
const dbAsync = {
    get: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },
    all: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    run: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }
};

// Reaction role specific functions
const reactionRoles = {
    add: async (guildId, channelId, messageId, emoji, roleId) => {
        try {
            const result = await dbAsync.run(
                'INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id) VALUES (?, ?, ?, ?, ?)',
                [guildId, channelId, messageId, emoji, roleId]
            );
            return { success: true, id: result.id };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: 'Reaction role already exists for this message and emoji' };
            }
            return { success: false, error: error.message };
        }
    },
    
    remove: async (messageId, emoji = null) => {
        try {
            let sql = 'DELETE FROM reaction_roles WHERE message_id = ?';
            let params = [messageId];
            
            if (emoji) {
                sql += ' AND emoji = ?';
                params.push(emoji);
            }
            
            const result = await dbAsync.run(sql, params);
            return { success: true, changes: result.changes };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    
    get: async (messageId, emoji) => {
        try {
            const row = await dbAsync.get(
                'SELECT * FROM reaction_roles WHERE message_id = ? AND emoji = ?',
                [messageId, emoji]
            );
            return row;
        } catch (error) {
            console.error('Error getting reaction role:', error);
            return null;
        }
    },
    
    getAll: async (guildId = null) => {
        try {
            let sql = 'SELECT * FROM reaction_roles';
            let params = [];
            
            if (guildId) {
                sql += ' WHERE guild_id = ?';
                params.push(guildId);
            }
            
            const rows = await dbAsync.all(sql, params);
            return rows;
        } catch (error) {
            console.error('Error getting all reaction roles:', error);
            return [];
        }
    }
};

module.exports = { ...dbAsync, reactionRoles };