const { REST } = require('discord.js');
const config = require('../config/config.json');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        
        console.log('|-----------------------------------|')
        console.log('          Logging In...             ')
        console.log('|-----------------------------------|')
        console.log(`   ${client.user.tag} is\n   logged in and ready!`);
        console.log('|-----------------------------------|')
        
        // Verify REST instance exists (should already be created in index.js)
        console.log('Verifying REST instance...');
        console.log('REST instance attached to client:', !!client.rest);
        if (client.rest) {
            console.log('✅ REST instance ready for use');
        } else {
            console.error('❌ No REST instance found! Check index.js initialization');
        }
        
        console.log('             Error Logs...           ')
        console.log('|-----------------------------------|')

        client.user.setPresence({ activities: [{ name: `Use ${config.PREFIX} or / prefix` }] });
    }
}