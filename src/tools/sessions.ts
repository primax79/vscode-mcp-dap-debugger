import * as vscode from 'vscode'
import { inputSchemas } from './schemas'
import { ok, err, withErrorHandling, requireSession } from './shared'
import {
    sessionStore,
    type TrackedSession,
    type BreakpointPolicyMode,
    type BreakpointMechanism,
    type PolicyBreakpointInput,
} from '../dap/session-store'
import { parseJsonWithComments } from '../utils/json'
import { getRelativePath } from '../utils/path'
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

async function buildIdeBreakpointIdMap(
    session: vscode.DebugSession
): Promise<Map<number, { file: string; line: number }>> {
    const map = new Map<number, { file: string; line: number }>()
    for (const bp of vscode.debug.breakpoints) {
        if (!(bp instanceof vscode.SourceBreakpoint)) continue
        try {
            const dapBp = (await session.getDebugProtocolBreakpoint(bp)) as any
            if (dapBp && typeof dapBp.id === 'number') {
                const line =
                    typeof dapBp.line === 'number'
                        ? dapBp.line
                        : bp.location.range.start.line + 1
                map.set(dapBp.id, {
                    file: getRelativePath(bp.location.uri.fsPath),
                    line,
                })
            }
        } catch {
            // Ignore adapters that do not implement getDebugProtocolBreakpoint.
        }
    }
    return map
}

async function buildDebugStateThreads(session: vscode.DebugSession) {
    const execState = sessionStore.getExecutionState(session.id)
    let adapterThreads: Array<{ id: number; name?: string }> = []
    let adapterThreadsSucceeded = false

    try {
        const response = await session.customRequest('threads')
        if (Array.isArray(response?.threads)) {
            adapterThreads = response.threads.filter((t: any) => typeof t?.id === 'number')
            adapterThreadsSucceeded = true
        }
    } catch {
        // Session may be terminated or not ready to answer threads; fall back to tracked state.
    }

    const threadIds = new Set<number>()
    const nameById = new Map<number, string>()

    for (const t of adapterThreads) {
        threadIds.add(t.id)
        if (typeof t.name === 'string') {
            nameById.set(t.id, t.name)
        }
    }
    for (const t of execState?.threads ?? []) {
        threadIds.add(t.threadId)
        if (!nameById.has(t.threadId) && typeof t.name === 'string') {
            nameById.set(t.threadId, t.name)
        }
    }

    const policy = sessionStore.getSessionPolicy(session.id)
    const preferPolicyMap = policy !== undefined && policy.mode !== 'ide'
    let ideBpMap: Map<number, { file: string; line: number }> | undefined

    const threads: Array<{
        threadId: number
        name?: string
        state: 'stopped' | 'running' | 'unknown'
        reason?: string
        description?: string
        hitBreakpoints?: Array<{ file: string; line: number } | { id: number; unresolved: true }>
    }> = []

    for (const tid of threadIds) {
        const tracked = sessionStore.getThreadExecutionState(session.id, tid)
        let state: 'stopped' | 'running' | 'unknown' = tracked?.state ?? 'unknown'
        if (!adapterThreadsSucceeded && state === 'running') {
            state = 'unknown'
        }

        const name = nameById.get(tid) ?? tracked?.name
        const entry: {
            threadId: number
            name?: string
            state: 'stopped' | 'running' | 'unknown'
            reason?: string
            description?: string
            hitBreakpoints?: Array<{ file: string; line: number } | { id: number; unresolved: true }>
        } = {
            threadId: tid,
            ...(name !== undefined ? { name } : {}),
            state,
        }

        if (state === 'stopped') {
            if (tracked?.reason !== undefined) entry.reason = tracked.reason
            if (tracked?.description !== undefined) entry.description = tracked.description

            const hitIds = tracked?.hitBreakpointIds
            if (hitIds && hitIds.length > 0) {
                if (!ideBpMap) {
                    ideBpMap = await buildIdeBreakpointIdMap(session)
                }
                entry.hitBreakpoints = hitIds.map((id) => {
                    const primary = preferPolicyMap
                        ? sessionStore.lookupBreakpointById(session.id, id)
                        : ideBpMap!.get(id)
                    if (primary) return primary
                    const secondary = preferPolicyMap
                        ? ideBpMap!.get(id)
                        : sessionStore.lookupBreakpointById(session.id, id)
                    if (secondary) return secondary
                    return { id, unresolved: true as const }
                })
            }
        }

        threads.push(entry)
    }

    return threads
}

export const listDebugSessionsTool = {
    name: 'list-debug-sessions',
    config: {
        title: 'List Debug Sessions',
        description:
            'List currently tracked debug sessions, not just the one focused in the UI. Recently-terminated ' +
            'sessions are filtered out by default; pass includeTerminated: true to include them.',
        inputSchema: inputSchemas['list-debug-sessions'],
    },
    handler: async (args: { includeTerminated?: boolean } = {}) => withErrorHandling(async () => {
        const allSessions = sessionStore.listSessions().map(serializeTrackedSession)
        const terminatedCount = allSessions.filter((s) => s.status === 'terminated').length
        const sessions = args.includeTerminated
            ? allSessions
            : allSessions.filter((s) => s.status !== 'terminated')
        return ok({ total: sessions.length, terminatedCount, sessions })
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
        description: 'Get an overview of a debug session, per-thread execution state, and current breakpoints',
        inputSchema: inputSchemas['get-debug-state'],
    },
    handler: async (args: { sessionId?: string }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        const breakpoints = listBreakpointsData()

        if ('errorResult' in resolved) {
            return ok({ hasActiveSession: false, breakpointCount: breakpoints.length, breakpoints })
        }

        const threads = await buildDebugStateThreads(resolved.session)

        return ok({
            hasActiveSession: true,
            session: serializeSession(resolved.session),
            threads,
            breakpointCount: breakpoints.length,
            breakpoints,
        })
    }),
}

interface StartDebugArgs {
    config: string
    overrides?: Record<string, unknown>
    breakpoints?: 'ide' | 'none' | PolicyBreakpointInput[]
    breakpointMechanism?: BreakpointMechanism
}

export const startDebugTool = {
    name: 'start-debug',
    config: {
        title: 'Start Debug Session',
        description:
            'Start a debug session using a named configuration from launch.json, with optional config overrides and per-session breakpoint policy',
        inputSchema: inputSchemas['start-debug'],
    },
    handler: async (args: StartDebugArgs) => withErrorHandling(async () => {
        const folder = vscode.workspace.workspaceFolders?.[0]
        if (!folder) return err('No workspace folder open')

        const mode: BreakpointPolicyMode =
            args.breakpoints === undefined || args.breakpoints === 'ide'
                ? 'ide'
                : args.breakpoints === 'none'
                  ? 'none'
                  : 'list'
        const mechanism: BreakpointMechanism = args.breakpointMechanism ?? 'rewrite'
        const hasBreakpointsArg = args.breakpoints !== undefined
        const hasOverridesArg = args.overrides !== undefined
        const useCustomConfigObject = mode !== 'ide' || hasOverridesArg

        let baseConfig: any | undefined
        if (hasBreakpointsArg || hasOverridesArg) {
            const launchResult = await readLaunchConfigurations()
            if ('errorResult' in launchResult) return launchResult.errorResult

            const isCompound = launchResult.compounds.some((c: any) => c?.name === args.config)
            if (isCompound) {
                return err(
                    `Debug configuration "${args.config}" is a compound configuration; "breakpoints" and "overrides" are not supported for compound configurations.`
                )
            }

            baseConfig = launchResult.configurations.find((c: any) => c?.name === args.config)
            if (!baseConfig && useCustomConfigObject) {
                const available =
                    launchResult.configurations.map((c: any) => c.name).join(', ') || 'none'
                return err(
                    `Debug configuration "${args.config}" not found. Available: ${available}`
                )
            }
        } else {
            const launchResult = await readLaunchConfigurations()
            if (!('errorResult' in launchResult)) {
                baseConfig = launchResult.configurations.find((c: any) => c?.name === args.config)
            }
        }

        const policy = sessionStore.createBreakpointPolicy({
            configName: args.config,
            usedStringConfigName: !useCustomConfigObject,
            mode,
            mechanism,
            breakpoints: Array.isArray(args.breakpoints) ? args.breakpoints : undefined,
        })

        const rootSessionPromise = sessionStore.waitForPolicyRootSession(policy.id, 15_000)

        let configToPass: string | vscode.DebugConfiguration = args.config
        if (useCustomConfigObject && baseConfig) {
            configToPass = {
                ...baseConfig,
                ...(args.overrides ?? {}),
                __mcpDapPolicyId: policy.id,
            }
        }

        const startPromise = Promise.resolve(
            vscode.debug.startDebugging(folder, configToPass)
        ).then(
            (okStart) => ({ kind: 'startResult' as const, okStart }),
            (error: any) => ({
                kind: 'startError' as const,
                message: error?.message ?? String(error),
            })
        )

        const outcome = await Promise.race([
            rootSessionPromise.then((session) => ({ kind: 'session' as const, session })),
            startPromise.then(async (res) => {
                if (res.kind === 'startError' || !res.okStart) {
                    return res
                }
                const session = await rootSessionPromise
                return { kind: 'session' as const, session }
            }),
        ])

        if (outcome.kind === 'startError') {
            sessionStore.removeBreakpointPolicy(policy.id)
            return err(`Failed to start debug session "${args.config}": ${outcome.message}`)
        }

        if (outcome.kind === 'startResult' && !outcome.okStart) {
            sessionStore.removeBreakpointPolicy(policy.id)
            return err(`Failed to start debug session "${args.config}"`)
        }

        const rootSession = outcome.kind === 'session' ? outcome.session : undefined
        if (!rootSession) {
            sessionStore.removeBreakpointPolicy(policy.id)
            return err(
                `Timed out after 15s waiting for debug session "${args.config}" to start`
            )
        }

        await sessionStore.waitForPolicyBreakpointsSettled(policy.id, 1200, 150)

        const requestedBreakpoints = sessionStore.getPolicyRequestedBreakpoints(policy.id)
        const verifiedBreakpoints = sessionStore.getPolicyVerifiedBreakpoints(policy.id)

        const effectiveRequest =
            (typeof configToPass === 'object' ? configToPass.request : baseConfig?.request) ??
            rootSession.configuration?.request
        const warning =
            effectiveRequest === 'attach' && requestedBreakpoints.length > 0
                ? `Attached with ${requestedBreakpoints.length} active breakpoint(s) (${requestedBreakpoints.map((bp) => `${bp.file}:${bp.line}`).join(', ')}); hitting them will pause the live process.`
                : undefined

        return ok({
            message: `Debug session "${args.config}" started`,
            sessionId: rootSession.id,
            breakpointMechanism: mechanism,
            requestedBreakpoints,
            verifiedBreakpoints,
            ...(warning ? { warning } : {}),
        })
    }),
}

async function readLaunchConfigurations(): Promise<
    | { workspaceName: string; configurations: any[]; compounds: any[] }
    | { errorResult: ReturnType<typeof err> }
> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) return { errorResult: err('No workspace folder open') }

    const launchJsonUri = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'launch.json')
    try {
        const content = await vscode.workspace.fs.readFile(launchJsonUri)
        const launchJson = parseJsonWithComments(Buffer.from(content).toString('utf8'))
        return {
            workspaceName: workspaceFolder.name,
            configurations: launchJson.configurations ?? [],
            compounds: launchJson.compounds ?? [],
        }
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
