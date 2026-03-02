const { SlashCommandBuilder } = require('discord.js');
const { tasks } = require('../../database.js');

module.exports = {
    name: 'task-image-delete',
    ownerOnly: 1,
    data: new SlashCommandBuilder()
        .setName('task-image-delete')
        .setDescription('Remove an image from a task by its image ID')
        .addIntegerOption(opt =>
            opt.setName('image')
                .setDescription('Image ID (visible in /task-details)')
                .setRequired(true)
        ),
    async execute(interaction) {
        const imageId = interaction.options.getInteger('image');

        const image = await require('../../database.js').get('SELECT * FROM task_images WHERE id = ?', [imageId]);
        if (!image) return interaction.reply({ content: `❌ No image found with ID \`#${imageId}\`.`, ephemeral: true });

        const result = await tasks.deleteImage(imageId);
        if (!result.success) return interaction.reply({ content: `❌ Failed to delete image: ${result.error}`, ephemeral: true });

        return interaction.reply({ content: `🗑️ Image \`#${imageId}\` removed from task \`#${image.task_id}\`.` });
    }
};
