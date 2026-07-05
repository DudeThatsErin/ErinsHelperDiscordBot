const { execFile } = require('child_process');
const { promisify } = require('util');
const { log } = require('../utils/logger');
const execFileAsync = promisify(execFile);

module.exports = {
  name: 'statusexport',
  aliases: ['status-export', 'status', 'se', 'exportstatus', 'export-status'],
  ownerOnly: true,
  async execute(message) {
    try {
      await message.reply({ content: '🔄 Refreshing the Obsidian status dashboard note…' });
      const { stdout, stderr } = await execFileAsync('/home/ubuntu/update_obsidian_status.py', [], {
        timeout: 30000,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });
      const output = [stdout?.trim(), stderr?.trim()].filter(Boolean).join('\n') || 'Export completed.';
      await message.reply({ content: `✅ Status export completed.\n\n${output}` });
    } catch (error) {
      log('statusexport', `Error occurred while executing status export: ${error.message}`);
      console.error('Error executing status export:', error);
      await message.reply({ content: `❌ Status export failed: ${error.message}` });
    }
  },
};
