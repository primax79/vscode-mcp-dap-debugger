import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { allTools } from '../tools'
import { allResources } from '../resources'
import packageJson from '../../package.json'

/**
 * Creates a fresh McpServer with all tools/resources registered. Called once
 * per client session (see server/http-server.ts) - never shared across
 * sessions, which is the fix for the confirmed hang bug where a single
 * shared McpServer instance got connect()-ed to more than one transport.
 */
export function createMcpServer(): McpServer {
    const server = new McpServer({ name: 'vscode-mcp-dap-debugger', version: packageJson.version })

    for (const tool of allTools) {
        server.registerTool(tool.name, tool.config, tool.handler)
    }

    for (const resource of allResources) {
        server.registerResource(resource.name, resource.uri, resource.config, resource.handler)
    }

    return server
}
