const Discord = require('discord.js');
const o = require('../config/owner.json');
const { log } = require('../utils/logger');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (interaction.isMessageComponent()) return;

        // Handle modal submits
        if (interaction.isModalSubmit()) {
            const commandName = interaction.customId.split(':')[0];
            const command = client.slashCommands.get(commandName) || client.erinCommands.get(commandName);
            if (!command || typeof command.handleModal !== 'function') {
                log('interactionCreate', `Modal submit for non-existent command: ${commandName}`);
                return interaction.reply({ content: 'This form no longer exists.', flags: 64 });
            }
            if (command.ownerOnly === 1 && interaction.user.id != o.id && interaction.user.id != o.altID) {
                log('interactionCreate', `Non-owner attempted to use owner-only command: ${commandName}`);
                return interaction.reply({ content: `This is only a command Erin can use.`, flags: 64 });
            }
            try {
                return await command.handleModal(interaction);
            } catch (error) {
                log('interactionCreate', `Error occurred while handling modal submit for command: ${commandName}`);
                console.error('Modal handler error:', error);
                if (!interaction.replied && !interaction.deferred) {
                    return interaction.reply({ content: '❌ Something went wrong handling that form.', flags: 64 });
                }
            }
        }

        const command = client.slashCommands.get(interaction.commandName) || client.erinCommands.get(interaction.commandName);
        if (!command) {
            log('interactionCreate', `Interaction created for non-existent command: ${interaction.commandName}`);
            return interaction.reply({ content: 'This command no longer exists.', flags: 64 });
        }

        // owner only
        if (command.ownerOnly === 1) {
            if (interaction.user.id != o.id && interaction.user.id != o.altID) {
                log('interactionCreate', `Non-owner attempted to use owner-only command: ${command.name}`);
                return interaction.reply({ content: `This is only a command Erin can use. If you are seeing this in error use the \`/report\` command.`, flags: 64 });
            }
        }

        //mod only
        const modRoles = ['780941276602302523', '822500305353703434', '718253309101867008', '751526654781685912'];
        let value = 0;
        if (command.modOnly === 1 && interaction.member) {
            for (const ID of modRoles) {
                if (!interaction.member.roles.cache.has(ID)) {
                    value++
                }

                if (value == modRoles.length) {
                    log('interactionCreate', `Non-moderator attempted to use mod-only command: ${command.name}`);
                    return interaction.reply({ content: `This is a command only moderators can use. You do not have the required permissions. Moderators have the \`@Moderator\` role or \`@&Junior Mod\` roles. Please run \`/report [issue]\` if you are seeing this in error.`, flags: 64 });
                }
            }
        }

        // botspam channel only
        const botspam = `433962402292432896`;
        if (command.botSpamOnly === 1 && interaction.guild) {
            if (interaction.channel.id != botspam) {
                log('interactionCreate', `Command used in wrong channel: ${command.name}`);
                return interaction.reply({ content: `Please only use this command in the <#${botspam}> channel. This command cannot be used elsewhere. Thank you.`, flags: 64 })
            }
        }

        // command cooldowns
        if (!client.slashCooldowns.has(interaction.commandName)) {
            client.slashCooldowns.set(interaction.commandName, new Discord.Collection());
        }

        const now = Date.now();
        const timestamps = client.slashCooldowns.get(interaction.commandName);
        const cooldownAmount = (command.cooldown || 1) * 1000;
        if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                log('interactionCreate', `User ${interaction.user.id} is on cooldown for command: ${command.name}`);
                return interaction.reply({ content: `Please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.name}\` command.`, flags: 64 });
            }
        }

        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

        // actually running the commands.
        try {
            //await interaction.deferReply();
            const guildId = interaction.guild?.id;
            const isDM = !interaction.guild;
            if (isDM || guildId === `718253204147798047` || guildId === `359760149683896320`) {
                await command.execute(interaction, client);
            }
        } catch (error) {
            console.error(error);
            
            // Only try to reply if the interaction hasn't been replied to or deferred
            if (!interaction.replied && !interaction.deferred) {
                try {
                    // Truncate error messages to fit Discord's limits
                    const errorName = error.name ? error.name.substring(0, 1000) : 'Unknown Error';
                    const errorMessage = error.message ? error.message.substring(0, 1000) : 'No message available';
                    const errorStack = error.stack ? error.stack.substring(0, 1000) + '...' : 'No stack trace available';
                    
                    const embed = new Discord.EmbedBuilder()
                        .setColor(0x000000)
                        .setTitle('Oh no! An _error_ has appeared!')
                        .addFields({
                            name: '**Error Name:**',
                            value: `\`${errorName}\``
                        }, {
                            name: '**Error Message:**',
                            value: `\`${errorMessage}\``
                        }, {
                            name: '**Error Location:**',
                            value: `\`${errorStack}\``
                        }, {
                            name: '**This has been reported!**',
                            value: `I have pinged Erin so this has already been reported to her. You do not need to do anything else.`
                        })
                        .setTimestamp()
                        .setFooter({ text: `Thanks for using ${client.user.tag}! I'm sorry you encountered this error!`, icon_url: `${client.user.displayAvatarURL()}` });
                    
                    await interaction.reply({ content: `Hey, <@${o.id}>! You have an error!`, embeds: [embed] });
                    log('interactionCreate', `Error occurred while executing command: ${command.name}. Error: ${errorName} - ${errorMessage}`);
                } catch (replyError) {
                    console.error('Failed to send error message to user:', replyError);
                    log('interactionCreate', `Failed to send error message to user for command: ${command.name}`);
                }
            }
        }

    }
};