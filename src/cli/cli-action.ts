import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { inputSchemas } from '../tools/schemas'

export interface ConnectionInfo {
    url: string
    token: string
}

function logStderr(message: string): void {
    process.stderr.write(`[vscode-mcp-dap-debugger CLI] ${message}\n`)
}

async function createClient(connection: ConnectionInfo) {
    const client = new Client({ name: 'vscode-mcp-dap-debugger-action-client', version: '0.1.0' }, { capabilities: {} })
    const transport = new StreamableHTTPClientTransport(new URL(connection.url), {
        requestInit: { headers: { 'x-mcp-debug-token': connection.token } },
    })
    await client.connect(transport)
    return { client, transport }
}

export async function listToolsAndResources(connection: ConnectionInfo): Promise<void> {
    let clientObj
    try {
        clientObj = await createClient(connection)
        const [toolsResult, resourcesResult] = await Promise.all([
            clientObj.client.listTools(),
            clientObj.client.listResources(),
        ])

        const tools = toolsResult.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: inputSchemas[t.name as keyof typeof inputSchemas] ?? t.inputSchema,
        }))
        const resources = resourcesResult.resources.map((r) => ({ name: r.name, uri: r.uri, description: r.description }))

        process.stdout.write(JSON.stringify({ tools, resources }, null, 2) + '\n')
    } catch (error: any) {
        logStderr(`Error: ${error.message}`)
        process.exit(1)
    } finally {
        await clientObj?.transport.close()
        process.exit(0)
    }
}

export async function callTool(connection: ConnectionInfo, toolName: string, argsStr?: string): Promise<void> {
    let clientObj
    try {
        let args = {}
        if (argsStr) {
            try {
                args = JSON.parse(argsStr)
            } catch {
                logStderr(`Invalid JSON arguments: ${argsStr}`)
                process.exit(1)
            }
        }

        clientObj = await createClient(connection)
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool ${toolName} timed out after 30s`)), 30_000))
        const result = await Promise.race([clientObj.client.callTool({ name: toolName, arguments: args }), timeout])

        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    } catch (error: any) {
        logStderr(`Error: ${error.message}`)
        process.stdout.write(JSON.stringify({ error: error.message }, null, 2) + '\n')
        process.exit(1)
    } finally {
        await clientObj?.transport.close()
        process.exit(0)
    }
}

export async function readResource(connection: ConnectionInfo, resourceUri: string): Promise<void> {
    let clientObj
    try {
        clientObj = await createClient(connection)
        const result = await clientObj.client.readResource({ uri: resourceUri })
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    } catch (error: any) {
        logStderr(`Error: ${error.message}`)
        process.stdout.write(JSON.stringify({ error: error.message }, null, 2) + '\n')
        process.exit(1)
    } finally {
        await clientObj?.transport.close()
        process.exit(0)
    }
}
