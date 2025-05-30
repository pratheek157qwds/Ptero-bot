const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const PteroManager = require('../pteroManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverlist')
        .setDescription('View all servers (Admin only)')
        .addStringOption(option =>
            option.setName('api_key')
                .setDescription('Your personal API key (optional)')
                .setRequired(false)),

    async execute(interaction) {
        // Check if user is authorized (admin only)
        if (!interaction.client.config.adminIds.includes(interaction.user.id)) {
            return await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(interaction.client.config.settings.errorColor)
                    .setTitle('❌ Access Denied')
                    .setDescription('This command is restricted to administrators only.')],
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const apiKey = interaction.options.getString('api_key');

        try {
            const pteroManager = new PteroManager(
                apiKey || interaction.client.config.pterodactyl.apiKey,
                interaction.client.config.pterodactyl.host
            );

            const servers = await pteroManager.getServers();
            
            if (!servers || servers.length === 0) {
                return await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor(interaction.client.config.settings.errorColor)
                        .setTitle('📋 No Servers Found')
                        .setDescription('No servers found or you don\'t have access to any servers.')]
                });
            }

            // Start with the first server
            let currentIndex = 0;
            const serverData = await this.getServerDetails(pteroManager, servers);

            const response = await this.buildServerEmbed(serverData, currentIndex, interaction.client.config);

            const message = await interaction.editReply(response);

            // Create collector for button interactions
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (btnInteraction) => {
                if (btnInteraction.user.id !== interaction.user.id) {
                    return await btnInteraction.reply({
                        content: 'You cannot interact with this menu.',
                        ephemeral: true
                    });
                }

                await btnInteraction.deferUpdate();

                if (btnInteraction.customId === 'prev_server') {
                    currentIndex = currentIndex > 0 ? currentIndex - 1 : serverData.length - 1;
                } else if (btnInteraction.customId === 'next_server') {
                    currentIndex = currentIndex < serverData.length - 1 ? currentIndex + 1 : 0;
                }

                const newResponse = await this.buildServerEmbed(serverData, currentIndex, interaction.client.config);
                await btnInteraction.editReply(newResponse);
            });

            // Create collector for select menu interactions
            const selectCollector = message.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 300000 // 5 minutes
            });

            selectCollector.on('collect', async (selectInteraction) => {
                if (selectInteraction.user.id !== interaction.user.id) {
                    return await selectInteraction.reply({
                        content: 'You cannot interact with this menu.',
                        ephemeral: true
                    });
                }

                await selectInteraction.deferUpdate();

                currentIndex = parseInt(selectInteraction.values[0]);
                const newResponse = await this.buildServerEmbed(serverData, currentIndex, interaction.client.config);
                await selectInteraction.editReply(newResponse);
            });

            collector.on('end', () => {
                // Disable components when collector ends
                const disabledResponse = this.buildServerEmbed(serverData, currentIndex, interaction.client.config, true);
                message.edit(disabledResponse).catch(console.error);
            });

        } catch (error) {
            console.error('Server list command error:', error);
            
            const embed = new EmbedBuilder()
                .setColor(interaction.client.config.settings.errorColor)
                .setTitle('❌ Error')
                .setDescription('Failed to fetch server list.')
                .addFields(
                    { name: 'Error Details', value: `\`\`\`${error.message}\`\`\`` }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },

    async getServerDetails(pteroManager, servers) {
        const serverDetails = [];
        
        for (const server of servers) {
            try {
                const details = await pteroManager.getServerDetails(server.id);
                serverDetails.push(details);
            } catch (error) {
                console.error(`Failed to get details for server ${server.id}:`, error);
                // Add basic info even if detailed fetch fails
                serverDetails.push({
                    id: server.id,
                    name: server.name || 'Unknown',
                    status: server.status || 'unknown',
                    error: true
                });
            }
        }
        
        return serverDetails;
    },

    async buildServerEmbed(serverData, currentIndex, config, disabled = false) {
        const server = serverData[currentIndex];
        const pteroManager = new PteroManager(config.pterodactyl.apiKey, config.pterodactyl.host);

        const embed = new EmbedBuilder()
            .setColor(config.settings.embedColor)
            .setTitle(`🖥️ Server: ${server.name}`)
            .setDescription(`**Status:** ${pteroManager.formatStatus(server.status)}`)
            .addFields(
                { 
                    name: '🆔 Server Information', 
                    value: `**ID:** ${server.id}\n**Node:** ${server.node || 'Unknown'}\n**Docker Image:** \`${server.docker_image || 'Unknown'}\``, 
                    inline: false 
                },
                { 
                    name: '🌐 Network & Access', 
                    value: server.allocation ? `**IP:** \`${server.allocation.ip}:${server.allocation.port}\`\n**Alias:** ${server.allocation.alias || 'None'}` : 'No allocation data', 
                    inline: true 
                },
                { 
                    name: '💾 Resource Limits', 
                    value: server.limits ? 
                        `**Memory:** ${server.limits.memory}MB\n**CPU:** ${server.limits.cpu}%\n**Disk:** ${server.limits.disk}MB` : 
                        'No limit data', 
                    inline: true 
                },
                { 
                    name: '🔧 Feature Limits', 
                    value: server.feature_limits ? 
                        `**Databases:** ${server.feature_limits.databases}\n**Backups:** ${server.feature_limits.backups}\n**Allocations:** ${server.feature_limits.allocations}` : 
                        'No feature limit data', 
                    inline: true 
                }
            )
            .setFooter({ 
                text: `Server ${currentIndex + 1} of ${serverData.length} | Last updated` 
            })
            .setTimestamp();

        // Add startup command if available
        if (server.startup) {
            embed.addFields({ 
                name: '🚀 Startup Command', 
                value: `\`\`\`${server.startup}\`\`\``, 
                inline: false 
            });
        }

        // Add usage data if available
        if (server.usage && !server.error) {
            embed.addFields({
                name: '📊 Current Usage',
                value: `**Memory:** ${pteroManager.formatBytes(server.usage.memory_bytes)}\n**CPU:** ${server.usage.cpu_absolute.toFixed(1)}%\n**Network:** ⬇️${pteroManager.formatBytes(server.usage.network_rx_bytes)} ⬆️${pteroManager.formatBytes(server.usage.network_tx_bytes)}`,
                inline: false
            });
        }

        // Navigation buttons
        const navRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev_server')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('next_server')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('➡️')
                    .setDisabled(disabled)
            );

        // Server selection dropdown
        const selectOptions = serverData.map((srv, index) => ({
            label: srv.name.substring(0, 25),
            description: `${pteroManager.formatStatus(srv.status)} | ID: ${srv.id}`.substring(0, 50),
            value: index.toString(),
            default: index === currentIndex
        }));

        const selectRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('server_select')
                    .setPlaceholder('Jump to server...')
                    .addOptions(selectOptions.slice(0, 25)) // Discord limit of 25 options
                    .setDisabled(disabled)
            );

        return { 
            embeds: [embed], 
            components: [navRow, selectRow] 
        };
    }
};