const Pterodactyl = require('pterodactyl.js');

class PteroManager {
    constructor(apiKey, host) {
        this.client = new Pterodactyl.Builder()
            .setURL(host)
            .setAPIKey(apiKey)
            .asAdmin();
        
        this.consoleConnections = new Map();
    }

    async getServers() {
        try {
            return await this.client.getServers();
        } catch (error) {
            console.error('Error fetching servers:', error);
            throw error;
        }
    }

    async getServer(serverId) {
        try {
            return await this.client.getServer(serverId);
        } catch (error) {
            console.error(`Error fetching server ${serverId}:`, error);
            throw error;
        }
    }

    async getServerUsage(serverId) {
        try {
            const server = await this.getServer(serverId);
            return server.getUsage();
        } catch (error) {
            console.error(`Error fetching usage for server ${serverId}:`, error);
            throw error;
        }
    }

    async startServer(serverId) {
        try {
            const server = await this.getServer(serverId);
            return await server.start();
        } catch (error) {
            console.error(`Error starting server ${serverId}:`, error);
            throw error;
        }
    }

    async stopServer(serverId) {
        try {
            const server = await this.getServer(serverId);
            return await server.stop();
        } catch (error) {
            console.error(`Error stopping server ${serverId}:`, error);
            throw error;
        }
    }

    async restartServer(serverId) {
        try {
            const server = await this.getServer(serverId);
            return await server.restart();
        } catch (error) {
            console.error(`Error restarting server ${serverId}:`, error);
            throw error;
        }
    }

    async sendConsoleCommand(serverId, command) {
        try {
            const server = await this.getServer(serverId);
            return await server.sendCommand(command);
        } catch (error) {
            console.error(`Error sending command to server ${serverId}:`, error);
            throw error;
        }
    }

    async getConsoleHistory(serverId) {
        try {
            const server = await this.getServer(serverId);
            return await server.getConsole();
        } catch (error) {
            console.error(`Error fetching console for server ${serverId}:`, error);
            throw error;
        }
    }

    connectToConsole(serverId, callback) {
        try {
            if (this.consoleConnections.has(serverId)) {
                this.disconnectFromConsole(serverId);
            }

            const server = this.client.getServer(serverId);
            const ws = server.connectWebSocket();
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.event === 'console output' && callback) {
                        callback(message.args[0]);
                    }
                } catch (error) {
                    console.error('Error parsing websocket message:', error);
                }
            });

            ws.on('error', (error) => {
                console.error(`WebSocket error for server ${serverId}:`, error);
            });

            ws.on('close', () => {
                console.log(`WebSocket connection closed for server ${serverId}`);
                this.consoleConnections.delete(serverId);
            });

            this.consoleConnections.set(serverId, ws);
            return ws;
        } catch (error) {
            console.error(`Error connecting to console for server ${serverId}:`, error);
            throw error;
        }
    }

    disconnectFromConsole(serverId) {
        const connection = this.consoleConnections.get(serverId);
        if (connection) {
            connection.close();
            this.consoleConnections.delete(serverId);
        }
    }

    async getServerDetails(serverId) {
        try {
            const server = await this.getServer(serverId);
            const usage = await this.getServerUsage(serverId);
            
            return {
                id: server.id,
                name: server.name,
                status: server.status,
                node: server.node,
                limits: server.limits,
                feature_limits: server.feature_limits,
                allocation: server.allocation,
                docker_image: server.docker_image,
                startup: server.startup,
                usage: usage
            };
        } catch (error) {
            console.error(`Error fetching server details for ${serverId}:`, error);
            throw error;
        }
    }

    async getUserServers(userId) {
        try {
            const user = await this.client.getUser(userId);
            return await user.getServers();
        } catch (error) {
            console.error(`Error fetching servers for user ${userId}:`, error);
            throw error;
        }
    }

    formatStatus(status) {
        const statusMap = {
            'running': '🟢 Online',
            'starting': '🟡 Starting',
            'stopping': '🟡 Stopping',
            'offline': '🔴 Offline'
        };
        return statusMap[status] || '⚪ Unknown';
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = PteroManager;