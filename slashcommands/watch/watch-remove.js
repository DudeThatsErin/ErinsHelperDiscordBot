const { SlashCommandBuilder } = require('discord.js');
const { removeWatcher, getWatchers } = require('../../utils/watcherStore');

module.exports = {
    name: 'watch-remove',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('watch-remove')
        .setDescription('Remove a watcher by its id or name')
        .addStringOption(opt =>
            opt.setName('watcher').setDescription('The watcher id or exact name to remove').setRequired(true)),
    async execute(interaction) {
        const input = interaction.options.getString('watcher');
        const result = removeWatcher(input);

        if (!result.ok) {
            const current = getWatchers();
            const list = current.length
                ? current.map(w => `• ${w.name} — \`${w.id}\``).join('\n')
                : '_No watchers are configured._';
            return interaction.reply({
                content: `❌ Couldn't find a watcher matching \`${input}\`.\n\n**Current watchers:**\n${list}`,
                flags: 64,
            });
        }

        const { id, name } = result.watcher;
        return interaction.reply({ content: `🗑️ Removed watcher **${name}** (\`${id}\`) and cleared its saved state.` });
    },
};
