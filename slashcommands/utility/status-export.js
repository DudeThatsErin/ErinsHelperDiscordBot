const { SlashCommandBuilder } = require('discord.js');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

module.exports = {
  name: 'status-export',
  ownerOnly: 1,
  data: new SlashCommandBuilder()
    .setName('status-export')
    .setDescription('Refresh the Obsidian status dashboard note from the live dashboard data'),
  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    try {
      const { stdout, stderr } = await execFileAsync('/home/ubuntu/update_obsidian_status.py', [], {
        timeout: 30000,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      const output = [stdout?.trim(), stderr?.trim()].filter(Boolean).join('\n') || 'Export completed.';
      await interaction.editReply({ content: `✅ Status export completed.\n\n${output}` });
    } catch (error) {
      await interaction.editReply({ content: `❌ Status export failed: ${error.message}` });
    }
  },
};
