const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getWatchers, getState } = require('../../utils/watcherStore');

function ago(ts) {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
}

module.exports = {
    name: 'watch-list',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('watch-list')
        .setDescription('List all configured watchers and their current status'),
    async execute(interaction) {
        const watchers = getWatchers();
        if (!watchers.length) {
            return interaction.reply({ content: '📭 No watchers configured. Use `/watch-add` to create one.', flags: 64 });
        }

        const embed = new EmbedBuilder()
            .setColor(0x1ea0e1)
            .setTitle('Configured Watchers')
            .setFooter({ text: `${watchers.length} watcher(s)` });

        for (const w of watchers) {
            const st = getState(w.id);
            const lines = [
                `${w.enabled === false ? '⏸️ disabled' : '▶️ active'} · **${w.type}** · every ${w.intervalSec}s`,
                `${w.url}`,
                `Status: ${st.lastStatus || '_not checked yet_'}`,
                `Last check: ${ago(st.lastChecked)}${st.lastError ? ` · ⚠️ ${st.lastError}` : ''}`,
            ];
            embed.addFields({ name: `${w.name}  (\`${w.id}\`)`, value: lines.join('\n') });
        }

        return interaction.reply({ embeds: [embed], flags: 64 });
    },
};
