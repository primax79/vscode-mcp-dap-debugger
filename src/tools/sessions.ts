import * as vscode from 'vscode'
import { inputSchemas } from './schemas'
import { ok, err, withErrorHandling, requireSession } from './shared'
import { sessionStore, type TrackedSession } from '../dap/session-store'
import { parseJsonWithComments } from '../utils/json'
import { listBreakpointsData } from './breakpoints'

function serializeSession(session: vscode.DebugSession) {
    return {
        id: session.id,
        name: session.name,
        type: session.type,
        workspaceFolder: session.workspaceFolder?.name,
        isFocused: vscode.debug.activeDebugSession?.id === session.id,
    }
}

function serializeTrackedSession(tracked: TrackedSession) {
    return { ...serializeSession(tracked.session), status: tracked.status }
}

export const listDebugSessionsTool = {
    name: 'list-debug-sessions',
    config: {
        title: 'List Debug Sessions',
        description:
            'List every currently tracked debug session, not just the one focused in the UI. Recently-terminated ' +
            'sessions are kept for a few minutes (status: "terminated") so their logs/console/exceptions remain readable.',
        inputSchema: inputSchemas['list-debug-sessions'],
    },
    handler: async () => withErrorHandling(async () => {
        const sessions = sessionStore.listSessions().map(serializeTrackedSession)
        return ok({ total: sessions.length, sessions })
    }),
}

export const getActiveSessionTool = {
    name: 'get-active-session',
    config: {
        title: 'Get Active Session',
        description: 'Get the debug session currently focused in the VS Code UI',
        inputSchema: inputSchemas['get-active-session'],
    },
    handler: async () => withErrorHandling(async () => {
        const session = vscode.debug.activeDebugSession
        if (!session) return ok({ message: 'No active debug session' })
        return ok({ ...serializeSession(session), configuration: session.configuration })
    }),
}

export const getDebugStateTool = {
    name: 'get-debug-state',
    config: {
        title: 'Get Debug State',
        description: 'Get an overview of a debug session plus current breakpoints',
        inputSchema: inputSchemas['get-debug-state'],
    },
    handler: async (args: { sessionId?: string }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        const breakpoints = listBreakpointsData()

        if ('errorResult' in resolved) {
            return ok({ hasActiveSession: false, breakpointCount: breakpoints.length, breakpoints })
        }

        return ok({
            hasActiveSession: true,
            session: serializeSession(resolved.session),
            breakpointCount: breakpoints.length,
            breakpoints,
        })
    }),
}

export const startDebugTool = {
    name: 'start-debug',
    config: {
        title: 'Start Debug Session',
        description: 'Start a debug session using a named configuration from launch.json',
        inputSchema: inputSchemas['start-debug'],
    },
    handler: async (args: { config: string }) => withErrorHandling(async () => {
        const folder = vscode.workspace.workspaceFolders?.[0]
        if (!folder) return err('No workspace folder open')

        const success = await vscode.debug.startDebugging(folder, args.config)
        return success
            ? ok({ message: `Debug session "${args.config}" started` })
            : err(`Failed to start debug session "${args.config}"`)
    }),
}

async function readLaunchConfigurations(): Promise<
    { workspaceName: string; configurations: any[] } | { errorResult: ReturnType<typeof err> }
> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) return { errorResult: err('No workspace folder open') }

    const launchJsonUri = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'launch.json')
    try {
        const content = await vscode.workspace.fs.readFile(launchJsonUri)
        const launchJson = parseJsonWithComments(Buffer.from(content).toString('utf8'))
        return { workspaceName: workspaceFolder.name, configurations: launchJson.configurations ?? [] }
    } catch (error: any) {
        return { errorResult: err(`Could not read launch.json: ${error.message}`) }
    }
}

export const listDebugConfigsTool = {
    name: 'list-debug-configs',
    config: {
        title: 'List Debug Configurations',
        description: 'List all debug configurations declared in launch.json',
        inputSchema: inputSchemas['list-debug-configs'],
    },
    handler: async () => withErrorHandling(async () => {
        const result = await readLaunchConfigurations()
        if ('errorResult' in result) return result.errorResult

        return ok({
            workspace: result.workspaceName,
            total: result.configurations.length,
            configurations: result.configurations.map((c: any) => ({
                name: c.name ?? 'unnamed',
                type: c.type ?? 'unknown',
                request: c.request ?? 'unknown',
                program: c.program ?? c.args?.[0] ?? 'not specified',
            })),
        })
    }),
}

export const selectDebugConfigTool = {
    name: 'select-debug-config',
    config: {
        title: 'Select Debug Configuration',
        description: 'Look up a debug configuration by name',
        inputSchema: inputSchemas['select-debug-config'],
    },
    handler: async (args: { configName: string }) => withErrorHandling(async () => {
        const result = await readLaunchConfigurations()
        if ('errorResult' in result) return result.errorResult

        const found = result.configurations.find((c: any) => c.name === args.configName)
        if (!found) {
            const available = result.configurations.map((c: any) => c.name).join(', ') || 'none'
            return err(`Debug configuration "${args.configName}" not found. Available: ${available}`)
        }

        return ok({ message: `Debug configuration "${args.configName}" found`, configuration: found })
    }),
}
