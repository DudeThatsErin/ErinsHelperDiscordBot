require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const clientId = '791803587432677427';
const guildIds = ['718253204147798047', '359760149683896320'];

function readFilesFromPath(pathString) {
    if (!fs.existsSync(pathString)) return [];
    const directoryEntries = fs.readdirSync(pathString, { withFileTypes: true });
    return directoryEntries.reduce((filteredEntries, dirEnt) => {
        if (dirEnt.isDirectory() && !dirEnt.name.startsWith('_')) {
            filteredEntries.push(...readFilesFromPath(`${pathString}/${dirEnt.name}`));
        } else if (dirEnt.isFile() && dirEnt.name.endsWith('.js')) {
            filteredEntries.push(`${pathString}/${dirEnt.name}`);
        }
        return filteredEntries;
    }, []);
}

const commands = [];
const slashCommandFiles = readFilesFromPath('./slashcommands');

for (const filePath of slashCommandFiles) {
    const command = require(path.resolve(filePath));
    if (command.data && command.data.toJSON) {
        commands.push(command.data.toJSON());
        console.log(`✅ Loaded: ${command.data.name}`);
    } else {
        console.warn(`⚠️  Skipped (no .data): ${filePath}`);
    }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`\n📡 Registering ${commands.length} slash command(s) to ${guildIds.length} guild(s)...`);

        for (const guildId of guildIds) {
            try {
                const data = await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: commands }
                );
                console.log(`✅ Registered ${data.length} command(s) to guild ${guildId}`);
            } catch (err) {
                if (err.code === 50001) {
                    console.warn(`⚠️  Skipped guild ${guildId} — bot is not in this server (Missing Access)`);
                } else {
                    throw err;
                }
            }
        }

        console.log('\n🎉 All slash commands deployed successfully!');
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();
