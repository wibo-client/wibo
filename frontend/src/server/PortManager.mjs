import net from 'net';

class PortManager {
    constructor() {
        this.MIN_PORT = 50000;
        this.MAX_PORT = 65535;
    }

    getRandomPort() {
        return Math.floor(
            Math.random() * (this.MAX_PORT - this.MIN_PORT + 1) + this.MIN_PORT
        );
    }

    async isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            server.once('error', () => {
                resolve(false);
            });

            server.once('listening', () => {
                server.close();
                resolve(true);
            });

            server.listen(port);
        });
    }

    async findAvailablePort() {
        let attempts = 0;
        const maxAttempts = 50;

        while (attempts < maxAttempts) {
            const port = this.getRandomPort();
            const isAvailable = await this.isPortAvailable(port);
            
            if (isAvailable) {
                return port;
            }
            
            attempts++;
        }
        
        throw new Error('无法找到可用端口');
    }
}

export default PortManager;
