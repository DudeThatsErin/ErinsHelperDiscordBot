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
  }]
};
