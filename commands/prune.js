const { PermissionsBitField } = require('discord.js');
const o = require('../config/owner.json');

module.exports = {
    name: 'prune',
    aliases: ['purge', 'clear'],
    ownerOnly: true,
    async execute(message, args) {
        if (message.author.id !== o.id) {
            return message.reply({ content: '❌ Only Erin can use this command.' });
        }

        const amount = parseInt(args[0]);

        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply({ content: '❌ Please provide a number between 1 and 100. Usage: `!prune <amount>`' });
        }

        try {
            await message.delete();
            const deleted = await message.channel.bulkDelete(amount, true);
            const reply = await message.channel.send(`✅ Deleted **${deleted.size}** message(s).`);
            setTimeout(() => reply.delete().catch(() => {}), 5000);
        } catch (error) {
            console.error('Prune command error:', error);
            message.channel.send('❌ Failed to delete messages. Messages older than 14 days cannot be bulk deleted.');
        }
    }
};
