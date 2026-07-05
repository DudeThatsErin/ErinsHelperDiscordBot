module.exports = {
  apps: [{
    name: 'discord-bot',
    script: 'index.js',
    cwd: '/var/www/ErinHelperDiscordBot',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }, {
    name: 'onenote-callback',
    script: 'onenote-callback.js',
    cwd: '/var/www/ErinHelperDiscordBot',
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/onenote-err.log',
    out_file: './logs/onenote-out.log',
    time: true
  }, {
    name: 'watchdog',
    script: 'watchdog.js',
    cwd: '/var/www/ErinHelperDiscordBot',
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/watchdog-err.log',
    out_file: './logs/watchdog-out.log',
    time: true
  }, {
    name: 'onenote-backup',
    script: 'onenote-backup.js',
    cwd: '/var/www/ErinHelperDiscordBot',
    instances: 1,
    exec_mode: 'fork',
    // One-shot job: run, exit, and stay stopped until the next cron tick.
    autorestart: false,
    cron_restart: '0 3 * * *', // every day at 03:00 server time
    watch: false,
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/onenote-backup-err.log',
    out_file: './logs/onenote-backup-out.log',
    time: true
  }]
};
