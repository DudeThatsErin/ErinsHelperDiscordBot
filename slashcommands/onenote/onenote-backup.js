const { SlashCommandBuilder } = require('discord.js');
const { runBackupAndReport, ONENOTE_LOG_CHANNEL } = require('../../utils/onenoteBackupRun.js');
const { log } = require('../../utils/logger');

module.exports = {
    name: 'onenote-backup',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('onenote-backup')
        .setDescription('Back up all OneNote pages to the Obsidian OneNoteBackup vault')
        .addBooleanOption(opt =>
            opt.setName('force')
                .setDescription('Re-download every page instead of only changed ones')
                .setRequired(false)
        ),
    async execute(interaction) {
        const force = interaction.options.getBoolean('force') || false;
        await interaction.deferReply({ flags: 64 });
        await interaction.editReply({
            content: `🔄 Backup started${force ? ' (full re-download)' : ''}. `
                + `Results will post in <#${ONENOTE_LOG_CHANNEL}>.`,
        });

        try {
            const msg = await runBackupAndReport(interaction.client, { force, requestedBy: interaction.user.id });
            await interaction.editReply({ content: msg });
        } catch (err) {
            console.error('Backup command error:', err);
            log('onenote-backup', `Error occurred while executing onenote-backup command: ${err.message}`);
            await interaction.editReply({ content: `❌ Backup crashed: ${err.message}` });
        }
    },
};
