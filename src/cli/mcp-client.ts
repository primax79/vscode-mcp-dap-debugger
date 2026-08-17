import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { inputSchemas } from '../tools/schemas'

function logInfo(message: string): void {
    process.stderr.write(`[vscode-debug-mcp CLI] ${message}\n`)
}

/**
 * Connects to the VS Code extension's HTTP MCP server and re-exposes its
 * tools/resources as a stdio MCP server for clients like Claude Code/Cursor.
 */
export async function createMcpClient(serverUrl: string, token: string): Promise<McpServer> {
    logInfo(`Connecting to ${serverUrl}`)

    const client = new Client({ name: 'vscode-debug-mcp-client', version: '0.1.0' }, { capabilities: {} })
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
        requestInit: { headers: { 'x-mcp-debug-token': token } },
    })
    await client.connect(transport)
    logInfo('Connected')

    const proxy = new McpServer({ name: 'vscode-debug-mcp-client', version: '0.1.0' })

    const { tools } = await client.listTools()
    for (const tool of tools) {
        proxy.registerTool(
            tool.name,
            {
                title: tool.title,
                description: tool.description,
                inputSchema: inputSchemas[tool.name as keyof typeof inputSchemas],
                outputSchema: tool.outputSchema as any,
                annotations: tool.annotations as any,
            },
            async (args: any) => {
                const timeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Tool ${tool.name} timed out after 30s`)), 30_000)
                )
                return (await Promise.race([client.callTool({ name: tool.name, arguments: args }), timeout])) as any
            }
        )
    }

    const { resources } = await client.listResources()
    for (const resource of resources) {
        proxy.registerResource(
            resource.name,
            resource.uri,
            {
                title: resource.name,
                description: resource.description ?? `${resource.name} resource`,
                mimeType: resource.mimeType ?? 'application/json',
            },
            async (uri) => client.readResource({ uri: uri.href })
        )
    }

    logInfo(`Ready: ${tools.length} tools, ${resources.length} resources`)
    return proxy
}
