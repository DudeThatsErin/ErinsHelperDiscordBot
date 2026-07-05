const { SlashCommandBuilder } = require('discord.js');
const { getWatcher, getWatchers } = require('../../utils/watcherStore');
const { runWatcherOnce } = require('../../utils/watcher');

module.exports = {
    name: 'watch-check',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('watch-check')
        .setDescription('Run a watcher right now (ignores its interval) and report the result')
        .addStringOption(opt =>
            opt.setName('watcher').setDescription('The watcher id or exact name to check').setRequired(true)),
    async execute(interaction) {
        const input = interaction.options.getString('watcher');
        const watcher = getWatcher(input);
        if (!watcher) {
            const current = getWatchers();
            const list = current.length
                ? current.map(w => `• ${w.name} — \`${w.id}\``).join('\n')
                : '_No watchers are configured._';
            return interaction.reply({
                content: `❌ No watcher matching \`${input}\`.\n\n**Current watchers:**\n${list}`,
                flags: 64,
            });
        }

        await interaction.deferReply({ flags: 64 });
        const result = await runWatcherOnce(interaction.client, watcher);

        const lines = [
            `**${watcher.name}** (\`${watcher.id}\`) checked.`,
            `Status: ${result.status}`,
        ];
        if (result.notified) lines.push('🔔 This check **triggered a notification**.');
        if (result.error) lines.push(`⚠️ Error: ${result.error}`);

        return interaction.editReply({ content: lines.join('\n') });
    },
};
