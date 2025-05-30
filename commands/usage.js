const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const PteroManager = require('../pteroManager');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('usage')
        .setDescription('Show server resource usage and console snapshot')
        .addStringOption(option =>
            option.setName('server_id')
                .setDescription('Server ID to check usage for')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('api_key')
                .setDescription('Your personal API key (optional)')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const serverId = interaction.options.getString('server_id');
        const apiKey = interaction.options.getString('api_key');

        try {
            const pteroManager = new PteroManager(
                apiKey || interaction.client.config.pterodactyl.apiKey,
                interaction.client.config.pterodactyl.host
            );

            // Get server details and usage
            const server = await pteroManager.getServer(serverId);
            const usage = await pteroManager.getServerUsage(serverId);
            const consoleHistory = await pteroManager.getConsoleHistory(serverId);

            if (!server) {
                return await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor(interaction.client.config.settings.errorColor)
                        .setTitle('❌ Error')
                        .setDescription('Server not found or you don\'t have access to it.')]
                });
            }

            // Generate usage graphs
            const charts = await this.generateUsageCharts(usage, server.limits);
            
            // Create console snapshot
            const consoleSnapshot = consoleHistory
                .slice(-10)
                .map(line => line.replace(/\x1b\[[0-9;]*m/g, '')) // Remove ANSI codes
                .join('\n')
                .substring(0, 1000) || 'No recent console output';

            // Calculate uptime
            const uptimeMs = usage.uptime * 1000;
            const uptime = moment.duration(uptimeMs).humanize();

            const embed = new EmbedBuilder()
                .setColor(interaction.client.config.settings.embedColor)
                .setTitle(`📊 ${server.name} - Usage Statistics`)
                .setDescription(`**Status:** ${pteroManager.formatStatus(server.status)}`)
                .addFields(
                    {
                        name: '💾 Memory Usage',
                        value: `${pteroManager.formatBytes(usage.memory_bytes)} / ${pteroManager.formatBytes(server.limits.memory * 1024 * 1024)}\n(${((usage.memory_bytes / (server.limits.memory * 1024 * 1024)) * 100).toFixed(1)}%)`,
                        inline: true
                    },
                    {
                        name: '⚡ CPU Usage',
                        value: `${usage.cpu_absolute.toFixed(1)}%`,
                        inline: true
                    },
                    {
                        name: '💽 Disk Usage',
                        value: `${pteroManager.formatBytes(usage.disk_bytes)} / ${pteroManager.formatBytes(server.limits.disk * 1024 * 1024)}`,
                        inline: true
                    },
                    {
                        name: '🌐 Network I/O',
                        value: `⬇️ ${pteroManager.formatBytes(usage.network_rx_bytes)}\n⬆️ ${pteroManager.formatBytes(usage.network_tx_bytes)}`,
                        inline: true
                    },
                    {
                        name: '⏱️ Uptime',
                        value: uptime,
                        inline: true
                    },
                    {
                        name: '🆔 Server ID',
                        value: serverId,
                        inline: true
                    },
                    {
                        name: '🖥️ Console Snapshot',
                        value: `\`\`\`\n${consoleSnapshot}\n\`\`\``,
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'Last updated' });

            // Create action buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`start_${serverId}`)
                        .setLabel('Start')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('▶️')
                        .setDisabled(server.status === 'running'),
                    new ButtonBuilder()
                        .setCustomId(`stop_${serverId}`)
                        .setLabel('Stop')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('⏹️')
                        .setDisabled(server.status === 'offline'),
                    new ButtonBuilder()
                        .setCustomId(`restart_${serverId}`)
                        .setLabel('Restart')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄')
                        .setDisabled(server.status === 'offline')
                );

            const files = [];
            
            // Add chart images if available
            if (charts.ramChart) {
                files.push(new AttachmentBuilder(charts.ramChart, { name: 'ram-usage.png' }));
                embed.setImage('attachment://ram-usage.png');
            }
            
            if (charts.networkChart) {
                files.push(new AttachmentBuilder(charts.networkChart, { name: 'network-usage.png' }));
                embed.setThumbnail('attachment://network-usage.png');
            }

            await interaction.editReply({ 
                embeds: [embed], 
                components: [row],
                files: files
            });

        } catch (error) {
            console.error('Usage command error:', error);
            
            const embed = new EmbedBuilder()
                .setColor(interaction.client.config.settings.errorColor)
                .setTitle('❌ Error')
                .setDescription('Failed to fetch server usage data.')
                .addFields(
                    { name: 'Error Details', value: `\`\`\`${error.message}\`\`\`` }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },

    async generateUsageCharts(usage, limits) {
        const width = 400;
        const height = 200;
        const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
            width, 
            height,
            backgroundColour: 'white'
        });

        const charts = {};

        try {
            // RAM Usage Chart
            const ramUsedMB = usage.memory_bytes / (1024 * 1024);
            const ramLimitMB = limits.memory;
            const ramUsagePercent = (ramUsedMB / ramLimitMB) * 100;

            const ramConfig = {
                type: 'doughnut',
                data: {
                    labels: ['Used', 'Available'],
                    datasets: [{
                        data: [ramUsagePercent, 100 - ramUsagePercent],
                        backgroundColor: ['#ff6384', '#36a2eb'],
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: false,
                    plugins: {
                        title: {
                            display: true,
                            text: `RAM Usage: ${ramUsedMB.toFixed(0)}MB / ${ramLimitMB}MB`,
                            font: { size: 14 }
                        },
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            };

            charts.ramChart = await chartJSNodeCanvas.renderToBuffer(ramConfig);

            // Network Usage Chart  
            const networkConfig = {
                type: 'bar',
                data: {
                    labels: ['Download', 'Upload'],
                    datasets: [{
                        label: 'Network I/O (MB)',
                        data: [
                            usage.network_rx_bytes / (1024 * 1024),
                            usage.network_tx_bytes / (1024 * 1024)
                        ],
                        backgroundColor: ['#4bc0c0', '#ff9f40'],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Network Usage',
                            font: { size: 14 }
                        },
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'MB'
                            }
                        }
                    }
                }
            };

            charts.networkChart = await chartJSNodeCanvas.renderToBuffer(networkConfig);

        } catch (error) {
            console.error('Error generating charts:', error);
        }

        return charts;
    }
};