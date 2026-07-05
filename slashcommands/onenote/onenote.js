const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } = require('discord.js');
const { createNote, buildStatus, handleNoteError } = require('../../utils/onenotePost.js');

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

        modal.addLabelComponents(
            new LabelBuilder()
                .setLabel('Page Title')
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId('title')
                        .setStyle(TextInputStyle.Short)
                        .setMaxLength(255)
                        .setPlaceholder('My note title')
                        .setRequired(true)
                ),
            new LabelBuilder()
                .setLabel('Content')
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId('content')
                        .setStyle(TextInputStyle.Paragraph)
                        .setMaxLength(3000)
                        .setPlaceholder('Write text, paste links, or leave blank if only attaching an image')
                        .setRequired(false)
                ),
            new LabelBuilder()
                .setLabel('Extra URLs (one per line)')
                .setTextInputComponent(
                    new TextInputBuilder()
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
        await interaction.deferReply({ flags: 64 });

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
            const { webUrl, appUrl } = await createNote(interaction.user.id, { title, content, urls });
            await interaction.editReply({ content: buildStatus(title, webUrl) });

            // Send the app deep link as its own message (raw, no formatting) so
            // it can be selected and copied cleanly on mobile.
            if (appUrl) {
                await interaction.followUp({ content: appUrl, flags: 64 });
            }
            return;
        } catch (err) {
            return interaction.editReply({ content: await handleNoteError(err, interaction.user.id) });
        }
    }
};
