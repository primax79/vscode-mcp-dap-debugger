import * as net from 'net'

/**
 * Checks if a given port is free to use on the local loopback interface (127.0.0.1).
 * 
 * @param targetPort The port number to verify.
 * @returns A promise resolving to true if the port is available, false otherwise.
 */
export function isPortAvailable(targetPort: number): Promise<boolean> {
    return new Promise((resolve) => {
        const testServer = net.createServer()

        testServer.on('error', () => {
            // If the port is already in use or access is denied, we resolve to false
            resolve(false)
        })

        testServer.on('listening', () => {
            // Port is free, close the test server and return true
            testServer.close(() => {
                resolve(true)
            })
        })

        // Only test local loopback binding
        testServer.listen(targetPort, '127.0.0.1')
    })
}

/**
 * Scans sequentially for an open port starting from a specified number.
 * 
 * @param initialPort The first port to check.
 * @param scanLimit Maximum number of ports to test before giving up.
 * @returns A promise resolving to the first available port.
 * @throws Error if no ports are available within the scan limit.
 */
export async function findAvailablePort(initialPort: number, scanLimit: number = 100): Promise<number> {
    const endPort = initialPort + scanLimit

    for (let currentPort = initialPort; currentPort < endPort; currentPort++) {
        const free = await isPortAvailable(currentPort)
        if (free) {
            return currentPort
        }
    }

    throw new Error(`Failed to find an open port between ${initialPort} and ${endPort - 1}.`)
}
