const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const PteroManager = require('../pteroManager');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('console')
        .setDescription('Set up console streaming for a Pterodactyl server')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to stream console output to')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText))
        .addStringOption(option =>
            option.setName('server_id')
                .setDescription('Server ID to monitor')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('api_key')
                .setDescription('Your personal API key (optional)')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const channel = interaction.options.getChannel('channel');
        const serverId = interaction.options.getString('server_id');
        const apiKey = interaction.options.getString('api_key');
        
        try {
            // Use provided API key or default from config
            const pteroManager = new PteroManager(
                apiKey || interaction.client.config.pterodactyl.apiKey,
                interaction.client.config.pterodactyl.host
            );

            // Test if server exists and user has access
            const server = await pteroManager.getServer(serverId);
            
            if (!server) {
                return await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor(interaction.client.config.settings.errorColor)
                        .setTitle('❌ Error')
                        .setDescription('Server not found or you don\'t have access to it.')]
                });
            }

            // Update console channels in config
            interaction.client.config.consoleChannels[channel.id] = {
                serverId: serverId,
                apiKey: apiKey,
                guildId: interaction.guild.id,
                setupBy: interaction.user.id,
                setupAt: Date.now()
            };

            // Save config
            fs.writeFileSync('./config.json', JSON.stringify(interaction.client.config, null, 2));

            // Set up console streaming
            const consoleCallback = (output) => {
                if (output && output.trim()) {
                    // Format console output
                    let formattedOutput = output.trim();
                    
                    // Split long messages
                    if (formattedOutput.length > 1900) {
                        const chunks = formattedOutput.match(/.{1,1900}/g);
                        chunks.forEach(chunk => {
                            channel.send(`\`\`\`\n${chunk}\n\`\`\``);
                        });
                    } else {
                        channel.send(`\`\`\`\n${formattedOutput}\n\`\`\``);
                    }
                }
            };

            // Connect to console WebSocket
            pteroManager.connectToConsole(serverId, consoleCallback);

            const embed = new EmbedBuilder()
                .setColor(interaction.client.config.settings.successColor)
                .setTitle('✅ Console Setup Complete')
                .setDescription(`Console for server **${server.name}** is now streaming to ${channel}`)
                .addFields(
                    { name: 'Server ID', value: serverId, inline: true },
                    { name: 'Status', value: pteroManager.formatStatus(server.status), inline: true },
                    { name: 'Channel', value: `${channel}`, inline: true }
                )
                .setFooter({ text: 'Messages sent in this channel will be executed as console commands' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Send initial message to console channel
            await channel.send({
                embeds: [new EmbedBuilder()
                    .setColor(interaction.client.config.settings.embedColor)
                    .setTitle('🖥️ Console Connected')
                    .setDescription(`Console for **${server.name}** is now active!\n\nType commands here to execute them on the server.`)
                    .addFields(
                        { name: 'Server', value: server.name, inline: true },
                        { name: 'Status', value: pteroManager.formatStatus(server.status), inline: true },
                        { name: 'Setup by', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setTimestamp()]
            });

        } catch (error) {
            console.error('Console command error:', error);
            
            const embed = new EmbedBuilder()
                .setColor(interaction.client.config.settings.errorColor)
                .setTitle('❌ Error')
                .setDescription('Failed to set up console streaming. Please check your server ID and API key.')
                .addFields(
                    { name: 'Error Details', value: `\`\`\`${error.message}\`\`\`` }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};