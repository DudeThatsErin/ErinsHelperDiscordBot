const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addWatcher } = require('../../utils/watcherStore');

module.exports = {
    name: 'watch-add',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('watch-add')
        .setDescription('Add a URL/RSS/API watcher that pings you when something changes')
        .addStringOption(opt =>
            opt.setName('name').setDescription('Friendly name for this watcher').setRequired(true))
        .addStringOption(opt =>
            opt.setName('type').setDescription('What kind of watch').setRequired(true)
                .addChoices(
                    { name: 'text — notify when a word/phrase appears (restock, "in stock")', value: 'text' },
                    { name: 'json — read a field from a JSON API (price drop, release tag)', value: 'json' },
                    { name: 'rss — notify on new feed items (GitHub releases, blogs)', value: 'rss' },
                    { name: 'hash — notify when a page\'s content changes at all', value: 'hash' },
                ))
        .addStringOption(opt =>
            opt.setName('url').setDescription('URL to fetch (page, JSON API, or feed)').setRequired(true))
        .addStringOption(opt =>
            opt.setName('match').setDescription('[text] substring or /regex/ to look for'))
        .addStringOption(opt =>
            opt.setName('match_mode').setDescription('[text] notify when it appears (default) or disappears')
                .addChoices({ name: 'present (appears)', value: 'present' }, { name: 'absent (disappears)', value: 'absent' }))
        .addStringOption(opt =>
            opt.setName('json_path').setDescription('[json] field path, e.g. tag_name or assets[0].name'))
        .addStringOption(opt =>
            opt.setName('compare').setDescription('[json] how to compare (default: changed)')
                .addChoices(
                    { name: 'changed (any change)', value: 'changed' },
                    { name: 'lt (less than value)', value: 'lt' },
                    { name: 'lte (≤ value)', value: 'lte' },
                    { name: 'gt (greater than value)', value: 'gt' },
                    { name: 'gte (≥ value)', value: 'gte' },
                    { name: 'eq (equals value)', value: 'eq' },
                    { name: 'ne (not equal to value)', value: 'ne' },
                ))
        .addNumberOption(opt =>
            opt.setName('value').setDescription('[json] threshold for lt/gt/eq etc. (e.g. price 100)'))
        .addStringOption(opt =>
            opt.setName('selector').setDescription('[hash] optional /regex/ to hash only part of the page'))
        .addIntegerOption(opt =>
            opt.setName('interval').setDescription('Seconds between checks (min 30, default 300)').setMinValue(30))
        .addChannelOption(opt =>
            opt.setName('channel').setDescription('Channel to post notifications in (default: configured watchers channel)'))
        .addBooleanOption(opt =>
            opt.setName('ping').setDescription('Ping you (@owner) when it triggers')),
    async execute(interaction) {
        const input = {
            name: interaction.options.getString('name'),
            type: interaction.options.getString('type'),
            url: interaction.options.getString('url'),
            match: interaction.options.getString('match'),
            matchMode: interaction.options.getString('match_mode'),
            jsonPath: interaction.options.getString('json_path'),
            compare: interaction.options.getString('compare'),
            value: interaction.options.getNumber('value'),
            selector: interaction.options.getString('selector'),
            intervalSec: interaction.options.getInteger('interval'),
            notifyChannelId: interaction.options.getChannel('channel')?.id,
            ping: interaction.options.getBoolean('ping') || false,
        };

        const result = addWatcher(input);
        if (!result.ok) {
            return interaction.reply({ content: `❌ Couldn't add watcher: ${result.reason}`, flags: 64 });
        }

        const w = result.watcher;
        const lines = [
            `**Type:** ${w.type}`,
            `**URL:** ${w.url}`,
            `**Every:** ${w.intervalSec}s`,
        ];
        if (w.match) lines.push(`**Match:** \`${w.match}\` (${w.matchMode})`);
        if (w.jsonPath) lines.push(`**Path:** \`${w.jsonPath}\` — compare \`${w.compare}\`${w.value != null ? ` ${w.value}` : ''}`);
        if (w.selector) lines.push(`**Selector:** \`${w.selector}\``);
        if (w.notifyChannelId) lines.push(`**Channel:** <#${w.notifyChannelId}>`);
        lines.push(`**Ping:** ${w.ping ? 'yes' : 'no'}`);

        const embed = new EmbedBuilder()
            .setColor(0x3ebc38)
            .setTitle(`✅ Now watching: ${w.name}`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: `id: ${w.id} · first check establishes a baseline (no alert)` });

        return interaction.reply({ embeds: [embed], flags: 64 });
    },
};
