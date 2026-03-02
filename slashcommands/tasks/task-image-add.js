const { SlashCommandBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

module.exports = {
    name: 'task-image-add',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('task-image-add')
        .setDescription('Add an image to a task — upload a file or paste a URL')
        .addIntegerOption(opt =>
            opt.setName('task')
                .setDescription('Task number (ID)')
                .setRequired(true)
        )
        .addAttachmentOption(opt =>
            opt.setName('file')
                .setDescription('Upload an image file')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('url')
                .setDescription('Or paste an image URL')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('label')
                .setDescription('Optional label for the image')
                .setRequired(false)
        ),
    async execute(interaction) {
        const taskId = interaction.options.getInteger('task');
        const attachment = interaction.options.getAttachment('file');
        const urlInput = interaction.options.getString('url');
        const label = interaction.options.getString('label');

        if (!attachment && !urlInput) {
            return interaction.reply({ content: '❌ Provide either an uploaded file or a URL.', ephemeral: true });
        }

        const task = await tasks.getTask(taskId);
        if (!task) return interaction.reply({ content: `❌ No task found with ID \`#${taskId}\`.`, ephemeral: true });

        const url = attachment ? attachment.url : urlInput;
        const result = await tasks.addImage(taskId, url, label);
        if (!result.success) return interaction.reply({ content: `❌ Failed to add image: ${result.error}`, ephemeral: true });

        const display = label ? `**${label}** — ${url}` : url;
        return interaction.reply({ content: `✅ Image added to task \`#${taskId}\` — **${task.title}**:\n> ${display}` });
    }
};
