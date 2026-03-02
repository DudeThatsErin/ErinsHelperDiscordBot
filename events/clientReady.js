
const { ActivityType } = require('discord.js');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log('|-----------------------------------|')
        console.log('          Logging In...             ')
        console.log('|-----------------------------------|')
        console.log(`   ${client.user.tag} is\n   logged in and ready!`);


        // Array of random custom statuses with emojis
        const randomStatuses = [
            { state: '💻 Coding the future', status: 'online' },
            { state: '🐛 Debugging life.exe', status: 'dnd' },
            { state: '☕ Coffee → Code → Repeat', status: 'idle' },
            { state: '🚀 Building r/CodingHelp', status: 'online' },
            { state: '🔥 Breaking away from master...', status: 'dnd' },
            { state: '📚 Teaching the world to code', status: 'online' },
            { state: '🎯 Helping coders level up', status: 'idle' },
            { state: '⚡ Turning caffeine into code', status: 'dnd' },
            { state: '🌟 Making coding accessible', status: 'online' },
            { state: '🎮 Playing with APIs', status: 'idle' },
            { state: '🔍 Watching Stack Overflow', status: 'online' },
            { state: '🏆 Competing in hackathons', status: 'idle' },
            { state: '📖 Reading the CodingHelp Wiki', status: 'online' },
            { state: '🌐 Exploring coding-help.vercel.app', status: 'idle' },
            { state: '🧠 Compiling dreams into reality', status: 'dnd' },
            { state: '🔧 Fixing bugs one at a time', status: 'online' },
            // Advertisement statuses for r/CodingHelp and wiki
            { state: '🎉 Join r/CodingHelp - 21k+ members!', status: 'online' },
            { state: '📚 Check out coding-help.vercel.app', status: 'idle' },
            { state: '🌟 Visit our subreddit r/CodingHelp', status: 'online' },
            { state: '💡 Learn at coding-help.vercel.app', status: 'dnd' },
            { state: '🚀 r/CodingHelp - Your coding journey starts here', status: 'online' },
            { state: '📖 Free resources at coding-help.vercel.app', status: 'idle' },
            // Additional coding statuses
            { state: '🎨 Crafting pixel-perfect designs', status: 'dnd' },
            { state: '🔒 Implementing secure authentication', status: 'online' },
            { state: '📊 Optimizing database queries', status: 'idle' },
            { state: '🌊 Riding the wave of new frameworks', status: 'dnd' },
            { state: '🎪 Juggling multiple projects', status: 'online' },
            { state: '🔮 Predicting the next tech trend', status: 'idle' },
            { state: '🎭 Mastering the art of clean code', status: 'dnd' },
            { state: '🏗️ Architecting scalable solutions', status: 'online' },
            { state: '🎯 Targeting zero-bug deployments', status: 'idle' },
            { state: '🌈 Bringing ideas to colorful life', status: 'dnd' },
            { state: '⚙️ Fine-tuning performance metrics', status: 'online' },
            { state: '🎪 Performing code magic tricks', status: 'idle' },
            { state: '🔬 Experimenting with new libraries', status: 'dnd' },
            { state: '🎨 Painting with CSS gradients', status: 'online' },
            { state: '🚁 Hovering over complex algorithms', status: 'idle' },
            { state: '🎵 Composing beautiful code symphonies', status: 'dnd' },
            { state: '🏆 Achieving 100% test coverage', status: 'online' }
        ];
        // Randomly select a status
        const randomStatus = randomStatuses[Math.floor(Math.random() * randomStatuses.length)];
        
        // Set the bot's custom presence
        client.user.setActivity({
            type: ActivityType.Custom,
            name: "custom",
            state: randomStatus.state
        });

        // Also set the status color
        client.user.setStatus(randomStatus.status);

        console.log(`🎲 Custom status set: ${randomStatus.state} (${randomStatus.status})`);

        console.log('|-----------------------------------|')
        console.log('             Error Logs...           ')
        console.log('|-----------------------------------|')

    }
}