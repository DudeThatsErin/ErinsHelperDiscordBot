const Discord = require('discord.js');
const bot = require('../../config/bot.json');

module.exports = {
    name: 'all-projects',
    description: 'Displays all of Erin\'s projects in one message',
    usage: '/all-projects',
    ownerOnly: 1,
    data: {
        name: 'all-projects',
        description: 'Displays all of Erin\'s projects in one message'
    },
    
    async execute(interaction) {
        const projectsEmbed = new Discord.EmbedBuilder()
            .setColor(0x30d0e8)
            .setTitle('These are my projects!')
            .setDescription('These are all of the projects I am currently working on.');

        const noteHostEmbed = new Discord.EmbedBuilder()
            .setColor(0xFFA550)
            .setTitle('What is NoteHost?')
            .setDescription('NoteHost is a free way to host your notion sites on a `.com` or `.net` domain name that you own. An alternative to Notion\'s paid site service. The docs are located on my [Notion Site](https://dudethatserin.notion.site/NoteHost-982d31fcc8dd4799a18efcb074b0e63c?pvs=74).');

        const sashaAiEmbed = new Discord.EmbedBuilder()
            .setColor(0x2eea80)
            .setTitle('What is Sasha AI?')
            .setDescription('Sasha AI is my open-source [AI Chatbot](https://github.com/DudeThatsErin/Sasha-AI) that I am coding from scratch. It is currently on hiatus while I learn more higher level maths (Discrete Algebra, Calculus, Linear Algebra, etc.) and learn more about AI and how it functions.');

        const fetchedChannel = interaction.guild.channels.cache.get('1406089652854591559'); // announcements channel
        
        try {
            await fetchedChannel.send({ embeds: [projectsEmbed, noteHostEmbed, sashaAiEmbed] });
            interaction.reply({content: `All projects info posted to announcements!`, flags: Discord.MessageFlags.Ephemeral});
        } catch (error) {
            console.error('Error sending message to channel:', error);
            interaction.reply({content: `Error: Could not send message to <#1406089652854591559>. Check bot permissions.`, flags: Discord.MessageFlags.Ephemeral});
        }
    }
};
