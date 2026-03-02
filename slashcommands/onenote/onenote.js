const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { createPage, buildHtmlContent } = require('../../utils/onenote.js');

module.exports = {
    name: 'onenote',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('onenote')
        .setDescription('Send a note, links, or images to OneNote')
        .addAttachmentOption(opt =>
            opt.setName('image')
                .setDescription('Attach an image to include in the note')
                .setRequired(false)
        ),
    async execute(interaction) {
        const attachment = interaction.options.getAttachment('image');

        const modal = new ModalBuilder()
            .setCustomId(`onenote:${attachment ? encodeURIComponent(attachment.url) : ''}`)
            .setTitle('Send to OneNote');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder({ label: 'Page Title' })
                    .setCustomId('title')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(255)
                    .setPlaceholder('My note title')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder({ label: 'Content' })
                    .setCustomId('content')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(3000)
                    .setPlaceholder('Write text, paste links, or leave blank if only attaching an image')
                    .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder({ label: 'Extra URLs (one per line)' })
                    .setCustomId('urls')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(2000)
                    .setPlaceholder('https://...\nhttps://... (optional)')
                    .setRequired(false)
            )
        );

        return interaction.showModal(modal);
    },
    async handleModal(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const [, encodedAttachmentUrl] = interaction.customId.split(':');
        const attachmentUrl = encodedAttachmentUrl ? decodeURIComponent(encodedAttachmentUrl) : null;

        const title   = interaction.fields.getTextInputValue('title').trim();
        const content = interaction.fields.getTextInputValue('content').trim() || null;
        const urlsRaw = interaction.fields.getTextInputValue('urls').trim();

        const urls = [
            ...urlsRaw.split('\n').map(u => u.trim()).filter(Boolean),
        ];
        if (attachmentUrl) urls.push(attachmentUrl);

        try {
            const html = buildHtmlContent(content, urls);
            const page = await createPage(interaction.user.id, title, html);
            const webUrl = page.links?.oneNoteWebUrl?.href;
            const appUrl = page.links?.oneNoteClientUrl?.href;
            const lines = [`✅ Note **"${title}"** sent to OneNote!`];
            if (appUrl) lines.push(`� [Open in OneNote app](${appUrl})`);
            if (webUrl) lines.push(`🌐 [Open in browser](${webUrl})`);
            return interaction.editReply({ content: lines.join('\n') });
        } catch (err) {
            console.error('onenote handleModal error:', err.response?.data || err.message);
            return interaction.editReply({ content: `❌ ${err.message}` });
        }
    }
};
