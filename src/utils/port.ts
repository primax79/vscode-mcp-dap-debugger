import * as net from 'net'

/**
 * Check if a port is available on the loopback interface by attempting to bind to it.
 */
export function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer()

        server.once('error', () => resolve(false))
        server.once('listening', () => {
            server.close(() => resolve(true))
        })

        server.listen(port, '127.0.0.1')
    })
}

/**
 * Find the next available port on 127.0.0.1 starting from the given port.
 */
export async function findAvailablePort(startPort: number, maxAttempts = 100): Promise<number> {
    for (let port = startPort; port < startPort + maxAttempts; port++) {
        if (await isPortAvailable(port)) {
            return port
        }
    }
    throw new Error(`No available port found after ${maxAttempts} attempts starting from port ${startPort}`)
}
