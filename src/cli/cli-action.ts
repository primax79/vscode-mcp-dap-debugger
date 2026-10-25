import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { inputSchemas } from '../tools/schemas'

export interface ConnectionInfo {
    url: string
    token: string
}

export interface ActionOutcome {
    exitCode: number
}

function logStderr(message: string): void {
    process.stderr.write(`[vscode-mcp-dap-debugger CLI] ${message}\n`)
}

export function formatRawToolResult(result: any): { text: string; isError: boolean } {
    if (result?.isError) {
        let msg = ''
        if (Array.isArray(result.content)) {
            const textBlocks = result.content
                .filter((c: any) => c && c.type === 'text' && typeof c.text === 'string')
                .map((c: any) => c.text)
            if (textBlocks.length > 0) {
                msg = textBlocks.join('\n')
            }
        }
        if (!msg && typeof result.message === 'string') {
            msg = result.message
        }
        if (msg.startsWith('Error: ')) {
            msg = msg.slice(7)
        }
        return {
            text: JSON.stringify({ error: msg }, null, 2) + '\n',
            isError: true,
        }
    }

    const content = result?.content
    if (
        Array.isArray(content) &&
        content.length === 1 &&
        content[0]?.type === 'text' &&
        typeof content[0]?.text === 'string'
    ) {
        const rawText = content[0].text
        try {
            const parsed = JSON.parse(rawText)
            return {
                text: JSON.stringify(parsed, null, 2) + '\n',
                isError: false,
            }
        } catch {
            return {
                text: rawText.endsWith('\n') ? rawText : rawText + '\n',
                isError: false,
            }
        }
    }

    return {
        text: JSON.stringify({ content: content ?? [] }, null, 2) + '\n',
        isError: false,
    }
}

export function formatRawResourceResult(result: any): { text: string; isError: boolean } {
    if (result?.isError) {
        let msg = ''
        if (Array.isArray(result.contents)) {
            const textBlocks = result.contents
                .filter((c: any) => c && typeof c.text === 'string')
                .map((c: any) => c.text)
            if (textBlocks.length > 0) {
                msg = textBlocks.join('\n')
            }
        }
        if (!msg && typeof result.message === 'string') {
            msg = result.message
        }
        if (msg.startsWith('Error: ')) {
            msg = msg.slice(7)
        }
        return {
            text: JSON.stringify({ error: msg }, null, 2) + '\n',
            isError: true,
        }
    }

    const contents = result?.contents
    if (
        Array.isArray(contents) &&
        contents.length === 1 &&
        typeof contents[0]?.text === 'string'
    ) {
        const rawText = contents[0].text
        try {
            const parsed = JSON.parse(rawText)
            return {
                text: JSON.stringify(parsed, null, 2) + '\n',
                isError: false,
            }
        } catch {
            return {
                text: rawText.endsWith('\n') ? rawText : rawText + '\n',
                isError: false,
            }
        }
    }

    return {
        text: JSON.stringify({ contents: contents ?? [] }, null, 2) + '\n',
        isError: false,
    }
}

async function createClient(connection: ConnectionInfo) {
    const client = new Client({ name: 'vscode-mcp-dap-debugger-action-client', version: '0.1.0' }, { capabilities: {} })
    const transport = new StreamableHTTPClientTransport(new URL(connection.url), {
        requestInit: { headers: { 'x-mcp-debug-token': connection.token } },
    })
    await client.connect(transport)
    return { client, transport }
}

export async function listToolsAndResources(connection: ConnectionInfo): Promise<ActionOutcome> {
    let clientObj: { client: Client; transport: StreamableHTTPClientTransport } | undefined
    let exitCode = 0
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
        exitCode = 1
    } finally {
        await clientObj?.transport.close().catch(() => {})
    }
    return { exitCode }
}

export async function callTool(
    connection: ConnectionInfo,
    toolName: string,
    argsStr?: string,
    options?: { raw?: boolean }
): Promise<ActionOutcome> {
    let args = {}
    if (argsStr) {
        try {
            args = JSON.parse(argsStr)
        } catch {
            logStderr(`Invalid JSON arguments: ${argsStr}`)
            return { exitCode: 2 }
        }
    }

    let clientObj: { client: Client; transport: StreamableHTTPClientTransport } | undefined
    let timer: NodeJS.Timeout | undefined
    let exitCode = 0

    try {
        clientObj = await createClient(connection)
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Tool ${toolName} timed out after 30s`)), 30_000)
        })
        const result = await Promise.race([
            clientObj.client.callTool({ name: toolName, arguments: args }),
            timeout,
        ])

        if (options?.raw) {
            const formatted = formatRawToolResult(result)
            process.stdout.write(formatted.text)
            if (formatted.isError) {
                exitCode = 1
            }
        } else {
            process.stdout.write(JSON.stringify(result, null, 2) + '\n')
            if (result.isError) {
                exitCode = 1
            }
        }
    } catch (error: any) {
        logStderr(`Error: ${error.message}`)
        const msg = error.message?.startsWith('Error: ') ? error.message.slice(7) : (error.message ?? String(error))
        process.stdout.write(JSON.stringify({ error: msg }, null, 2) + '\n')
        exitCode = 1
    } finally {
        if (timer) {
            clearTimeout(timer)
        }
        await clientObj?.transport.close().catch(() => {})
    }

    return { exitCode }
}

export async function readResource(
    connection: ConnectionInfo,
    resourceUri: string,
    options?: { raw?: boolean }
): Promise<ActionOutcome> {
    let clientObj: { client: Client; transport: StreamableHTTPClientTransport } | undefined
    let exitCode = 0

    try {
        clientObj = await createClient(connection)
        const result = await clientObj.client.readResource({ uri: resourceUri })

        if (options?.raw) {
            const formatted = formatRawResourceResult(result)
            process.stdout.write(formatted.text)
            if (formatted.isError) {
                exitCode = 1
            }
        } else {
            process.stdout.write(JSON.stringify(result, null, 2) + '\n')
            if ((result as any).isError) {
                exitCode = 1
            }
        }
    } catch (error: any) {
        logStderr(`Error: ${error.message}`)
        const msg = error.message?.startsWith('Error: ') ? error.message.slice(7) : (error.message ?? String(error))
        process.stdout.write(JSON.stringify({ error: msg }, null, 2) + '\n')
        exitCode = 1
    } finally {
        await clientObj?.transport.close().catch(() => {})
    }

    return { exitCode }
}
