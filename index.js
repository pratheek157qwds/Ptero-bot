const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const UptimeTracker = require('./uptimeTracker');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
client.config = config;

// Initialize uptime tracker
const uptimeTracker = new UptimeTracker(client);

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const commands = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Register slash commands
const rest = new REST().setToken(config.token);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationCommands(client.user?.id || 'CLIENT_ID'),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();

client.once('ready', async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    await uptimeTracker.start();
    
    // Register commands after bot is ready
    try {
        const data = await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log(`Successfully registered ${data.length} application commands.`);
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        
        const errorMessage = { 
            content: 'There was an error while executing this command!', 
            ephemeral: true 
        };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Add this to your index.js file after the command interaction handler

client.on('interactionCreate', async interaction => {
    // Handle button interactions for server controls
    if (interaction.isButton()) {
        const [action, serverId] = interaction.customId.split('_');
        
        if (['start', 'stop', 'restart'].includes(action)) {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const PteroManager = require('./pteroManager');
                const pteroManager = new PteroManager(
                    client.config.pterodactyl.apiKey,
                    client.config.pterodactyl.host
                );

                let result;
                let actionText;
                let emoji;

                switch (action) {
                    case 'start':
                        result = await pteroManager.startServer(serverId);
                        actionText = 'started';
                        emoji = '▶️';
                        break;
                    case 'stop':
                        result = await pteroManager.stopServer(serverId);
                        actionText = 'stopped';
                        emoji = '⏹️';
                        break;
                    case 'restart':
                        result = await pteroManager.restartServer(serverId);
                        actionText = 'restarted';
                        emoji = '🔄';
                        break;
                }

                const server = await pteroManager.getServer(serverId);

                const embed = new EmbedBuilder()
                    .setColor(client.config.settings.successColor)
                    .setTitle(`${emoji} Server ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}`)
                    .setDescription(`Server **${server.name}** has been ${actionText} successfully.`)
                    .addFields(
                        { name: 'Server ID', value: serverId, inline: true },
                        { name: 'Action', value: actionText.charAt(0).toUpperCase() + actionText.slice(1), inline: true },
                        { name: 'Status', value: pteroManager.formatStatus(server.status), inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                console.error(`Error ${action}ing server ${serverId}:`, error);
                
                const embed = new EmbedBuilder()
                    .setColor(client.config.settings.errorColor)
                    .setTitle('❌ Action Failed')
                    .setDescription(`Failed to ${action} the server.`)
                    .addFields(
                        { name: 'Error', value: `\`\`\`${error.message}\`\`\`` }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }
        }
    }
});
// Handle console channel messages
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    const consoleChannels = client.config.consoleChannels;
    
    if (consoleChannels[message.channel.id]) {
        const { serverId, apiKey } = consoleChannels[message.channel.id];
        const PteroManager = require('./pteroManager');
        
        try {
            const pteroManager = new PteroManager(apiKey || client.config.pterodactyl.apiKey, client.config.pterodactyl.host);
            await pteroManager.sendConsoleCommand(serverId, message.content);
            
            // Add reaction to show command was sent
            await message.react('✅');
        } catch (error) {
            console.error('Error sending console command:', error);
            await message.react('❌');
        }
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Received SIGINT. Graceful shutdown...');
    uptimeTracker.stop();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Graceful shutdown...');
    uptimeTracker.stop();
    client.destroy();
    process.exit(0);
});

client.login(config.token);