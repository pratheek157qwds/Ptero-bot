const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restartbot')
        .setDescription('Restart the bot to clear cache and refresh connections'),

    async execute(interaction) {
        // Check if user is authorized (developer or admin)
        const authorizedUsers = [
            interaction.client.config.developerId,
            ...interaction.client.config.adminIds
        ];

        if (!authorizedUsers.includes(interaction.user.id)) {
            return await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(interaction.client.config.settings.errorColor)
                    .setTitle('❌ Access Denied')
                    .setDescription('You don\'t have permission to restart the bot.')],
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(interaction.client.config.settings.embedColor)
            .setTitle('🔄 Bot Restart')
            .setDescription('Bot is restarting to clear cache and refresh connections...')
            .addFields(
                { name: 'Initiated by', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Restart Type', value: 'Manual', inline: true },
                { name: 'Expected Downtime', value: '~10 seconds', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'The bot should be back online shortly' });

        await interaction.reply({ embeds: [embed] });

        // Log restart
        console.log(`Bot restart initiated by ${interaction.user.tag} (${interaction.user.id})`);

        // Get uptime tracker and perform restart
        setTimeout(() => {
            // Try to get the uptime tracker from the client
            if (interaction.client.uptimeTracker) {
                interaction.client.uptimeTracker.forceRestart();
            } else {
                // Fallback direct restart
                console.log('Manual restart - no uptime tracker found');
                process.exit(0);
            }
        }, 2000); // Give time for the response to be sent
    },
};