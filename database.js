const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use separate database for Discord bot
const dbPath = process.env.DB_PATH || path.join(__dirname, 'bot.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database at:', dbPath);
        db.run('PRAGMA foreign_keys = ON');
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

        // Initialize projects table
        db.run(`
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('Error creating projects table:', err.message);
            else console.log('Projects table ready');
        });

        // Initialize tasks table
        db.run(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'todo',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('Error creating tasks table:', err.message);
            else console.log('Tasks table ready');
        });

        // Initialize subtasks table
        db.run(`
            CREATE TABLE IF NOT EXISTS subtasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                done INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('Error creating subtasks table:', err.message);
            else console.log('Subtasks table ready');
        });

        // Initialize task_images table
        db.run(`
            CREATE TABLE IF NOT EXISTS task_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                label TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('Error creating task_images table:', err.message);
            else console.log('Task images table ready');
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

// Task management functions
const tasks = {
    // Projects
    addProject: async (name) => {
        try {
            const result = await dbAsync.run('INSERT INTO projects (name) VALUES (?)', [name]);
            return { success: true, id: result.id };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return { success: false, error: 'A project with that name already exists.' };
            return { success: false, error: error.message };
        }
    },
    getProject: async (identifier) => {
        const byId = await dbAsync.get('SELECT * FROM projects WHERE id = ?', [identifier]);
        if (byId) return byId;
        return dbAsync.get('SELECT * FROM projects WHERE LOWER(name) = LOWER(?)', [identifier]);
    },
    getAllProjects: async () => dbAsync.all('SELECT * FROM projects ORDER BY id ASC'),
    renameProject: async (id, newName) => {
        try {
            const result = await dbAsync.run('UPDATE projects SET name = ? WHERE id = ?', [newName, id]);
            return { success: true, changes: result.changes };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return { success: false, error: 'A project with that name already exists.' };
            return { success: false, error: error.message };
        }
    },
    deleteProject: async (id) => {
        try {
            const result = await dbAsync.run('DELETE FROM projects WHERE id = ?', [id]);
            return { success: true, changes: result.changes };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Tasks
    addTask: async (projectId, title, description = null) => {
        try {
            const result = await dbAsync.run(
                'INSERT INTO tasks (project_id, title, description) VALUES (?, ?, ?)',
                [projectId, title, description]
            );
            return { success: true, id: result.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    getTask: async (taskId) => dbAsync.get('SELECT tasks.*, projects.name as project_name FROM tasks JOIN projects ON tasks.project_id = projects.id WHERE tasks.id = ?', [taskId]),
    getTasksByProject: async (projectId) => dbAsync.all('SELECT * FROM tasks WHERE project_id = ? ORDER BY id ASC', [projectId]),
    getAllTasks: async () => dbAsync.all('SELECT tasks.*, projects.name as project_name FROM tasks JOIN projects ON tasks.project_id = projects.id ORDER BY projects.id ASC, tasks.id ASC'),
    updateTask: async (taskId, fields) => {
        const allowed = ['title', 'description', 'status'];
        const keys = Object.keys(fields).filter(k => allowed.includes(k));
        if (!keys.length) return { success: false, error: 'No valid fields to update.' };
        const sql = `UPDATE tasks SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
        const params = [...keys.map(k => fields[k]), taskId];
        try {
            const result = await dbAsync.run(sql, params);
            return { success: true, changes: result.changes };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    deleteTask: async (taskId) => {
        try {
            const result = await dbAsync.run('DELETE FROM tasks WHERE id = ?', [taskId]);
            return { success: true, changes: result.changes };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Subtasks
    addSubtask: async (taskId, title) => {
        try {
            const result = await dbAsync.run('INSERT INTO subtasks (task_id, title) VALUES (?, ?)', [taskId, title]);
            return { success: true, id: result.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    getSubtasks: async (taskId) => dbAsync.all('SELECT * FROM subtasks WHERE task_id = ? ORDER BY id ASC', [taskId]),
    toggleSubtask: async (subtaskId) => {
        try {
            const result = await dbAsync.run('UPDATE subtasks SET done = CASE WHEN done = 0 THEN 1 ELSE 0 END WHERE id = ?', [subtaskId]);
            return { success: true, changes: result.changes };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    deleteSubtask: async (subtaskId) => {
        try {
            const result = await dbAsync.run('DELETE FROM subtasks WHERE id = ?', [subtaskId]);
            return { success: true, changes: result.changes };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // Images
    addImage: async (taskId, url, label = null) => {
        try {
            const result = await dbAsync.run('INSERT INTO task_images (task_id, url, label) VALUES (?, ?, ?)', [taskId, url, label]);
            return { success: true, id: result.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    getImages: async (taskId) => dbAsync.all('SELECT * FROM task_images WHERE task_id = ? ORDER BY id ASC', [taskId]),
    deleteImage: async (imageId) => {
        try {
            const result = await dbAsync.run('DELETE FROM task_images WHERE id = ?', [imageId]);
            return { success: true, changes: result.changes };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
};

module.exports = { ...dbAsync, reactionRoles, tasks };