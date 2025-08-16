const { EmbedBuilder } = require('discord.js');
const { searchGoogleImages } = require('../../utils/imageSearch');

module.exports = {
    name: 'meme',
    description: 'Get a random programming meme or funny text!',
    usage: `/meme`,
    botSpamOnly: 1,
    async execute(interaction) {
        const memes = [
            "```\n// This code works, don't touch it\n// I have no idea why this works\n// But it does, so leave it alone\n```",
            "```\n99 little bugs in the code,\n99 little bugs,\nTake one down, patch it around,\n117 little bugs in the code.\n```",
            "**Programmer's Excuse Generator:**\n• It works on my machine\n• It's not a bug, it's a feature\n• The code is self-documenting\n• I'll fix it in the next sprint",
            "```\nif (code.works()) {\n    dont.touch();\n} else {\n    panic();\n}\n```",
            "**Types of Programmers:**\n🔥 Those who backup\n💀 Those who will backup\n👻 Those who should have backed up",
            "```\n// TODO: Fix this later\n// Written 3 years ago\n```",
            "**Programming Languages as Girlfriends:**\n• C: Your first love, but too demanding\n• Java: Reliable but talks too much\n• Python: Easy to get along with\n• JavaScript: Unpredictable but exciting",
            "```\nwhile (!succeed) {\n    try();\n}\n```",
            "**Debugging Process:**\n1. That can't happen\n2. That doesn't happen on my machine\n3. That shouldn't happen\n4. Why does that happen?\n5. Oh, I see\n6. How did that ever work?",
            "```\n// I'm not sure why this works\n// But it does, so I'm not touching it\n// Last modified: 2019\n// Still working: 2024\n```"
        ];
        
        const randomMeme = memes[Math.floor(Math.random() * memes.length)];
        
        // Search for a programming meme image
        const memeImage = await searchGoogleImages('programming meme funny coding');
        
        const embed = new EmbedBuilder()
            .setColor(0xFF6B35)
            .setTitle('😂 Programming Meme')
            .setDescription(randomMeme)
            .setTimestamp()
            .setFooter({ text: `Meme for ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });
        
        // Only set thumbnail if we found an image from Google search
        if (memeImage) {
            embed.setThumbnail(memeImage);
        }
        
        interaction.reply({ embeds: [embed], flags: 64 });
    }
};
