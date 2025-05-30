const fs = require('fs');
const path = require('path');

class UptimeTracker {
    constructor(client) {
        this.client = client;
        this.startTime = null;
        this.restartInterval = null;
        this.dataPath = path.join(__dirname, 'data', 'uptime.json');
        
        // Ensure data directory exists
        const dataDir = path.dirname(this.dataPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        this.loadData();
    }

    loadData() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
                this.totalUptime = data.totalUptime || 0;
                this.lastShutdown = data.lastShutdown || null;
            } else {
                this.totalUptime = 0;
                this.lastShutdown = null;
            }
        } catch (error) {
            console.error('Error loading uptime data:', error);
            this.totalUptime = 0;
            this.lastShutdown = null;
        }
    }

    saveData() {
        try {
            const data = {
                totalUptime: this.totalUptime,
                lastShutdown: Date.now(),
                currentSessionStart: this.startTime
            };
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving uptime data:', error);
        }
    }

    start() {
        this.startTime = Date.now();
        console.log(`Bot started at: ${new Date(this.startTime).toISOString()}`);
        
        // Schedule restart based on config
        const restartInterval = this.parseInterval(this.client.config.botRestartInterval);
        
        if (restartInterval > 0) {
            this.restartInterval = setTimeout(() => {
                this.scheduleRestart();
            }, restartInterval);
            
            console.log(`Next restart scheduled in: ${this.client.config.botRestartInterval}`);
        }
    }

    parseInterval(interval) {
        const match = interval.match(/^(\d+)([smhd])$/);
        if (!match) return 0;
        
        const [, value, unit] = match;
        const multipliers = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };
        
        return parseInt(value) * multipliers[unit];
    }

    getCurrentUptime() {
        if (!this.startTime) return 0;
        return Date.now() - this.startTime;
    }

    getTotalUptime() {
        return this.totalUptime + this.getCurrentUptime();
    }

    getUptimeString() {
        const uptime = this.getCurrentUptime();
        const days = Math.floor(uptime / (24 * 60 * 60 * 1000));
        const hours = Math.floor((uptime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((uptime % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((uptime % (60 * 1000)) / 1000);
        
        let result = '';
        if (days > 0) result += `${days}d `;
        if (hours > 0) result += `${hours}h `;
        if (minutes > 0) result += `${minutes}m `;
        result += `${seconds}s`;
        
        return result.trim();
    }

    getTotalUptimeString() {
        const totalUptime = this.getTotalUptime();
        const days = Math.floor(totalUptime / (24 * 60 * 60 * 1000));
        const hours = Math.floor((totalUptime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((totalUptime % (60 * 60 * 1000)) / (60 * 1000));
        
        let result = '';
        if (days > 0) result += `${days}d `;
        if (hours > 0) result += `${hours}h `;
        if (minutes > 0) result += `${minutes}m`;
        
        return result.trim() || '0m';
    }

    async scheduleRestart() {
        console.log('Scheduled restart initiated...');
        
        // Notify developer about restart
        try {
            const developer = await this.client.users.fetch(this.client.config.developerId);
            if (developer) {
                await developer.send('🔄 **Bot Restart**\nScheduled restart is happening now to clear cache and refresh connections.');
            }
        } catch (error) {
            console.error('Could not notify developer about restart:', error);
        }
        
        // Save uptime data before restart
        this.stop();
        
        // Exit process (pm2 or similar should restart it)
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    }

    stop() {
        if (this.startTime) {
            this.totalUptime += this.getCurrentUptime();
            this.saveData();
        }
        
        if (this.restartInterval) {
            clearTimeout(this.restartInterval);
            this.restartInterval = null;
        }
        
        console.log(`Bot stopping. Session uptime: ${this.getUptimeString()}`);
    }

    forceRestart() {
        console.log('Manual restart initiated...');
        this.stop();
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    }
}

module.exports = UptimeTracker;