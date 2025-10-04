const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'reactionrole',
    description: 'Set up or remove reaction roles',
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Set up or remove reaction roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Enable or disable reaction roles')
                .setRequired(true)
                .addChoices(
                    { name: 'Enable', value: 'enable' },
                    { name: 'Disable', value: 'disable' },
                    { name: 'Disable All', value: 'disable_all' }
                ))
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('ID of the message to apply reaction roles to (not required for disable all)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('emoji')
                .setDescription('Emoji to react with (required for enable)')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to assign (required for enable)')
                .setRequired(false)),
    
    async execute(interaction, client) {
        const action = interaction.options.getString('action');
        const messageId = interaction.options.getString('message_id');
        const emoji = interaction.options.getString('emoji');
        const role = interaction.options.getRole('role');

        // Check permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return await interaction.reply({
                content: '❌ You need "Manage Roles" permission to use this command.',
                ephemeral: true
            });
        }

        const db = require('../../database.js');

        if (action === 'disable_all') {
            // Confirm action with user
            await interaction.reply({
                content: '⚠️ This will remove ALL reaction roles in this server and clear all bot reactions. Are you sure? Reply with "CONFIRM" to proceed.',
                ephemeral: true
            });

            // Wait for confirmation
            const filter = (m) => m.author.id === interaction.user.id && m.content === 'CONFIRM';
            try {
                await interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
            } catch {
                return await interaction.followUp({
                    content: '❌ Confirmation timeout. Action cancelled.',
                    ephemeral: true
                });
            }

            // Get all reaction roles for this guild
            const allReactionRoles = await db.reactionRoles.getAll(interaction.guild.id);
            
            if (allReactionRoles.length === 0) {
                return await interaction.followUp({
                    content: '❌ No reaction roles found in this server.',
                    ephemeral: true
                });
            }

            // Remove all bot reactions
            let removedReactions = 0;
            for (const reactionRole of allReactionRoles) {
                try {
                    const channel = interaction.guild.channels.cache.get(reactionRole.channel_id);
                    if (channel) {
                        const message = await channel.messages.fetch(reactionRole.message_id);
                        const reaction = message.reactions.cache.get(reactionRole.emoji);
                        if (reaction) {
                            await reaction.users.remove(client.user.id);
                            removedReactions++;
                        }
                    }
                } catch (error) {
                    console.log(`Could not remove reaction from message ${reactionRole.message_id}:`, error.message);
                }
            }

            // Clear all from database
            const result = await db.reactionRoles.getAll(interaction.guild.id);
            for (const rr of result) {
                await db.reactionRoles.remove(rr.message_id, rr.emoji);
            }

            await interaction.followUp({
                content: `✅ Removed ${allReactionRoles.length} reaction role(s) and ${removedReactions} bot reaction(s) from this server.`,
                ephemeral: true
            });

        } else if (action === 'enable') {
            if (!emoji || !role) {
                return await interaction.reply({
                    content: '❌ Both emoji and role are required for enabling reaction roles.',
                    ephemeral: true
                });
            }

            // Verify the message exists
            let message;
            try {
                message = await interaction.channel.messages.fetch(messageId);
            } catch (error) {
                return await interaction.reply({
                    content: '❌ Message not found in this channel.',
                    ephemeral: true
                });
            }

            // Check if bot can manage the role
            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                return await interaction.reply({
                    content: '❌ I cannot assign roles higher than or equal to my highest role.',
                    ephemeral: true
                });
            }

            // Add to database
            const result = await db.reactionRoles.add(
                interaction.guild.id,
                interaction.channel.id,
                messageId,
                emoji,
                role.id
            );

            if (!result.success) {
                return await interaction.reply({
                    content: `❌ ${result.error}`,
                    ephemeral: true
                });
            }

            // Add bot reaction to the message
            try {
                await message.react(emoji);
            } catch (error) {
                // Cleanup database entry if reaction fails
                await db.reactionRoles.remove(messageId, emoji);
                return await interaction.reply({
                    content: `❌ Failed to add reaction: ${error.message}`,
                    ephemeral: true
                });
            }

            await interaction.reply({
                content: `✅ Reaction role enabled!\n**Message:** ${messageId}\n**Emoji:** ${emoji}\n**Role:** ${role}`,
                ephemeral: true
            });

        } else if (action === 'disable') {
            if (!messageId) {
                return await interaction.reply({
                    content: '❌ Message ID is required for disabling individual reaction roles.',
                    ephemeral: true
                });
            }

            const result = await db.reactionRoles.remove(messageId, emoji);

            if (!result.success) {
                return await interaction.reply({
                    content: `❌ Error: ${result.error}`,
                    ephemeral: true
                });
            }

            if (result.changes === 0) {
                return await interaction.reply({
                    content: '❌ No reaction roles found for the specified message/emoji.',
                    ephemeral: true
                });
            }

            // Remove bot reactions if specified
            if (emoji) {
                try {
                    const message = await interaction.channel.messages.fetch(messageId);
                    const reaction = message.reactions.cache.get(emoji);
                    if (reaction) {
                        await reaction.users.remove(client.user.id);
                    }
                } catch (error) {
                    // Ignore errors when removing reactions
                    console.log('Could not remove bot reaction:', error.message);
                }
            }

            await interaction.reply({
                content: `✅ Removed ${result.changes} reaction role(s) for message ${messageId}.`,
                ephemeral: true
            });
        }
    },
};
