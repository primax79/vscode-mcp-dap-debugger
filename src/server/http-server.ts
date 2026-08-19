import * as vscode from 'vscode'
import express from 'express'
import { randomUUID } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { state } from '../state'
import { findAvailablePort } from '../utils/port'
import { createMcpServer } from './mcp-server-factory'
import { createAuthMiddleware } from './auth'

// Fallback default, distinct from the original mcp-debug-tools (8890) so both
// can coexist on the same machine during migration. Overridable via the
// vscodeMcpDapDebugger.server.port setting.
const DEFAULT_MCP_SERVER_PORT = 8891
const SESSION_IDLE_TTL_MS = 30 * 60 * 1000
const SESSION_SWEEP_INTERVAL_MS = 5 * 60 * 1000

function preferredPort(): number {
    return vscode.workspace.getConfiguration('vscodeMcpDapDebugger').get<number>('server.port', DEFAULT_MCP_SERVER_PORT)
}

interface Session {
    server: McpServer
    transport: StreamableHTTPServerTransport
    lastSeenAt: number
}

// One McpServer + transport pair per client session - see mcp-server-factory.ts.
const sessions = new Map<string, Session>()
let sweepTimer: NodeJS.Timeout | undefined

function touchSession(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (session) session.lastSeenAt = Date.now()
}

async function closeSession(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId)
    if (!session) return
    sessions.delete(sessionId)

    try {
        await session.server.close()
    } catch (error) {
        console.error(`[vscode-mcp-dap-debugger] Error closing MCP server for session ${sessionId}:`, error)
    }
    try {
        await session.transport.close()
    } catch (error) {
        console.error(`[vscode-mcp-dap-debugger] Error closing transport for session ${sessionId}:`, error)
    }
}

function startSessionSweeper(): void {
    stopSessionSweeper()
    sweepTimer = setInterval(() => {
        const now = Date.now()
        for (const [sessionId, session] of sessions) {
            if (now - session.lastSeenAt > SESSION_IDLE_TTL_MS) {
                console.info(`[vscode-mcp-dap-debugger] Closing idle MCP session ${sessionId}`)
                void closeSession(sessionId)
            }
        }
    }, SESSION_SWEEP_INTERVAL_MS)
}

function stopSessionSweeper(): void {
    if (sweepTimer) {
        clearInterval(sweepTimer)
        sweepTimer = undefined
    }
}

function buildAllowedHosts(): string[] {
    const port = state.currentPort
    const hosts = ['127.0.0.1', 'localhost']
    if (port) {
        hosts.push(`127.0.0.1:${port}`, `localhost:${port}`)
    }
    return hosts
}

export function createHttpApp(getAuthToken: () => string | undefined): express.Application {
    const app = express()
    app.use(express.json())
    app.use(createAuthMiddleware(getAuthToken))

    app.post('/mcp', async (req, res) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined

        try {
            if (sessionId && sessions.has(sessionId)) {
                touchSession(sessionId)
                await sessions.get(sessionId)!.transport.handleRequest(req, res, req.body)
                return
            }

            if (isInitializeRequest(req.body)) {
                // Fresh server + transport per session - never share one McpServer
                // across sessions (that's what caused the original hang bug).
                const server = createMcpServer()
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    enableDnsRebindingProtection: true,
                    allowedHosts: buildAllowedHosts(),
                    onsessioninitialized: (id) => {
                        sessions.set(id, { server, transport, lastSeenAt: Date.now() })
                        console.info(`[vscode-mcp-dap-debugger] Session initialized: ${id}`)
                    },
                })

                transport.onclose = () => {
                    if (transport.sessionId) {
                        console.info(`[vscode-mcp-dap-debugger] Session closed: ${transport.sessionId}`)
                        void closeSession(transport.sessionId)
                    }
                }
                transport.onerror = (error) => {
                    console.error('[vscode-mcp-dap-debugger] Transport error:', error)
                    if (transport.sessionId) void closeSession(transport.sessionId)
                }

                await server.connect(transport)
                await transport.handleRequest(req, res, req.body)
                return
            }

            res.status(400).json({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Bad Request: no valid session ID provided' },
                id: null,
            })
        } catch (error: any) {
            console.error('[vscode-mcp-dap-debugger] Error handling /mcp request:', error)
            if (sessionId) void closeSession(sessionId)
            if (!res.headersSent) {
                res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
            }
        }
    })

    const handleSessionRequest = async (req: express.Request, res: express.Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined
        const session = sessionId ? sessions.get(sessionId) : undefined

        if (!session) {
            res.status(400).send('Invalid or missing session ID')
            return
        }

        touchSession(sessionId!)
        try {
            await session.transport.handleRequest(req, res)
        } catch (error) {
            console.error(`[vscode-mcp-dap-debugger] Error handling session request (${sessionId}):`, error)
            await closeSession(sessionId!)
            if (!res.headersSent) res.status(500).send('Internal server error')
        }
    }

    app.get('/mcp', handleSessionRequest)
    app.delete('/mcp', handleSessionRequest)

    return app
}

/**
 * Resolves only once the server is actually listening (or rejects on a
 * listen error), and awaits onServerStarted before resolving - so a caller
 * doing `await startServer()` can rely on port/token/config/registry all
 * being ready. An earlier version resolved right after calling app.listen(),
 * before the 'listening' event fired and before onServerStarted (which
 * writes the workspace config and registers the instance) had even started,
 * so state.currentPort/isServerRunning() could briefly be wrong and any
 * error from onServerStarted was silently swallowed.
 */
export async function startHttpServer(app: express.Application, onServerStarted?: () => void | Promise<void>): Promise<void> {
    const wantedPort = preferredPort()
    const availablePort = await findAvailablePort(wantedPort)
    const httpServer = app.listen(availablePort, '127.0.0.1')

    await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject)
        httpServer.once('listening', () => resolve())
    })

    state.currentPort = availablePort
    state.httpServer = httpServer
    state.serverStartTime = new Date()

    console.info(`[vscode-mcp-dap-debugger] MCP server listening on http://127.0.0.1:${availablePort}/mcp`)
    if (availablePort !== wantedPort) {
        console.info(`[vscode-mcp-dap-debugger] Port ${wantedPort} was busy, using ${availablePort} instead`)
    }

    startSessionSweeper()
    await onServerStarted?.()
}

export async function stopHttpServer(): Promise<void> {
    stopSessionSweeper()
    await Promise.all([...sessions.keys()].map(closeSession))

    return new Promise((resolve) => {
        if (state.httpServer) {
            state.httpServer.close(() => {
                console.info('[vscode-mcp-dap-debugger] HTTP server closed')
                state.httpServer = undefined
                state.currentPort = undefined
                state.serverStartTime = undefined
                resolve()
            })
        } else {
            resolve()
        }
    })
}
