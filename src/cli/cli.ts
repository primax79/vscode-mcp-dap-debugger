import { Command, InvalidArgumentError } from 'commander'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpClient } from './mcp-client'
import { ConfigFinder } from '../config/config-finder'
import { listToolsAndResources, callTool, readResource, type ConnectionInfo } from './cli-action'
import packageJson from '../../package.json'

function logInfo(message: string): void {
    process.stderr.write(`[vscode-mcp-dap-debugger CLI] ${message}\n`)
}

function parsePort(value: string): number {
    const port = parseInt(value, 10)
    if (isNaN(port) || port < 1 || port > 65535 || String(port) !== value.trim()) {
        throw new InvalidArgumentError('Port must be a number between 1 and 65535.')
    }
    return port
}

/**
 * Resolves port + token as a single connection identity - never combines a
 * port from one instance with a token from another. An earlier version
 * treated them independently: with --port given but not --token, it filled
 * the token in from whatever auto-discovery happened to find, which could be
 * a *different* instance's token when more than one was active.
 */
async function resolveConnection(options: any): Promise<ConnectionInfo> {
    const domain: string = options.domain || 'http://127.0.0.1'
    const explicitPort: number | undefined = options.port !== undefined
        ? (typeof options.port === 'number' ? options.port : parseInt(options.port, 10))
        : undefined
    const explicitToken: string | undefined = options.token

    if (explicitPort !== undefined && (isNaN(explicitPort) || explicitPort < 1 || explicitPort > 65535)) {
        console.error('Invalid port number')
        process.exit(2)
    }

    // Both given explicitly: trust the caller, no discovery needed.
    if (explicitPort !== undefined && explicitToken) {
        return { url: `${domain}:${explicitPort}/mcp`, token: explicitToken }
    }

    // Port given without a token: the token MUST come from the same
    // registered instance as that port, never from a separately
    // auto-discovered one.
    if (explicitPort !== undefined) {
        logInfo(`Looking up the registered token for port ${explicitPort}...`)
        const entry = await ConfigFinder.findInstanceByPort(explicitPort)
        if (!entry) {
            console.error(
                `No registered instance found for port ${explicitPort}. Pass --token explicitly, ` +
                `or omit --port to let auto-discovery pick an instance.`
            )
            process.exit(1)
        }
        return { url: `${domain}:${explicitPort}/mcp`, token: entry.token }
    }

    // No port given: full auto-discovery, ambiguity surfaced explicitly.
    logInfo('Auto-discovering VS Code instance...')
    const discovery = await ConfigFinder.discoverInstance()

    if (discovery.status === 'ambiguous') {
        console.error('Multiple VS Code Debug MCP instances are active; specify --port to pick one:')
        for (const candidate of discovery.candidates) {
            console.error(`  --port=${candidate.port}  (${candidate.workspace})`)
        }
        process.exit(1)
    }

    if (discovery.status === 'not-found') {
        if (!explicitToken) {
            console.error(
                'No active VS Code Debug MCP instance found. Pass --port and --token explicitly, ' +
                'or run this from a workspace with an active instance.'
            )
            process.exit(1)
        }
        return { url: `${domain}:8891/mcp`, token: explicitToken }
    }

    logInfo(`Found instance on port ${discovery.port}${discovery.workspace ? ` (${discovery.workspace})` : ''}`)
    return { url: `${domain}:${discovery.port}/mcp`, token: explicitToken ?? discovery.token }
}

async function startProxy(connection: ConnectionInfo): Promise<void> {
    logInfo(`Starting stdio proxy against ${connection.url}`)

    let proxy
    let attempts = 0
    while (attempts < 3) {
        try {
            proxy = await createMcpClient(connection.url, connection.token)
            break
        } catch (error) {
            attempts++
            if (attempts >= 3) {
                console.error('Failed to connect to the VS Code extension:', error)
                process.exit(1)
            }
            logInfo(`Connection failed, retrying (${attempts}/3)...`)
            await new Promise((resolve) => setTimeout(resolve, 2000))
        }
    }

    const transport = new StdioServerTransport()
    await proxy!.connect(transport)
    logInfo('Ready')
}

const program = new Command()

program.exitOverride((err) => {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.help' || err.code === 'commander.version') {
        process.exit(0)
    }
    process.exit(2)
})

program
    .name('vscode-mcp-dap-debugger')
    .description('CLI and MCP proxy for VS Code debugging via DAP')
    .version(packageJson.version)
    .option('--port <number>', 'Server port (disables auto-discovery)', parsePort)
    .option('--domain <url>', 'Server domain', 'http://127.0.0.1')
    .option('--token <token>', 'Auth token (auto-discovered by default)')
    .addHelpText(
        'after',
        `
Output formatting:
  --raw                       In "call" and "read", unwrap the response: pretty-prints JSON text,
                              prints plain text directly, or outputs {"error": "<text>"} on failure.`
    )
    .addHelpText(
        'afterAll',
        `
Exit codes:
  0  Success
  1  Tool error (isError), discovery, auth, connection or timeout error
  2  Usage error (invalid JSON arguments, unknown command/option, missing argument, invalid --port)`
    )

program
    .command('proxy', { isDefault: true })
    .description('Start the stdio MCP proxy (default)')
    .action(async () => startProxy(await resolveConnection(program.opts())))

program
    .command('list')
    .description('List all available tools and resources')
    .action(async () => {
        const connection = await resolveConnection(program.opts())
        const outcome = await listToolsAndResources(connection)
        process.exitCode = outcome.exitCode
    })

program
    .command('call <toolName> [argsJson]')
    .description('Call a tool directly and print the JSON result')
    .option('--raw', 'Print unwrapped content directly (JSON parsed or raw text)')
    .action(async (toolName, argsJson, cmdOptions) => {
        if (argsJson) {
            try {
                JSON.parse(argsJson)
            } catch {
                process.stderr.write(`[vscode-mcp-dap-debugger CLI] Invalid JSON arguments: ${argsJson}\n`)
                process.exitCode = 2
                return
            }
        }
        const connection = await resolveConnection(program.opts())
        const outcome = await callTool(connection, toolName, argsJson, { raw: cmdOptions.raw })
        process.exitCode = outcome.exitCode
    })

program
    .command('read <resourceUri>')
    .description('Read a resource directly and print the JSON result')
    .option('--raw', 'Print unwrapped content directly (JSON parsed or raw text)')
    .action(async (resourceUri, cmdOptions) => {
        const connection = await resolveConnection(program.opts())
        const outcome = await readResource(connection, resourceUri, { raw: cmdOptions.raw })
        process.exitCode = outcome.exitCode
    })

export { formatRawToolResult, formatRawResourceResult } from './cli-action'

if (require.main === module) {
    program.parseAsync(process.argv).catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
}
