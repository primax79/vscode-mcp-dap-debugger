import * as vscode from 'vscode'
import * as path from 'path'
import {
    sessionStore,
    normalizePathForComparison,
    type BreakpointPolicyState,
    type VerifiedBreakpointRecord,
} from './session-store'
import { getRelativePath } from '../utils/path'

interface DapSourceBreakpoint {
    line: number
    condition?: string
    hitCondition?: string
    logMessage?: string
}

interface PendingSetBreakpointsRequest {
    source: any
    sourcePath?: string
    normalizedSourcePath?: string
    requestedBreakpoints: DapSourceBreakpoint[]
    isOwnCustomRequest: boolean
    countsTowardPolicyInFlight: boolean
}

const EXECUTION_REQUEST_COMMANDS = new Set([
    'continue',
    'next',
    'stepIn',
    'stepOut',
    'stepBack',
    'reverseContinue',
])

function getPolicyDapBreakpointsForSource(
    policy: BreakpointPolicyState,
    normalizedSourcePath: string | undefined
): DapSourceBreakpoint[] {
    if (policy.mode === 'none') {
        return []
    }
    if (policy.mode === 'list') {
        if (!normalizedSourcePath) return []
        return policy.breakpoints
            .filter((bp) => bp.normalizedPath === normalizedSourcePath)
            .map((bp) => {
                const item: DapSourceBreakpoint = { line: bp.line }
                if (bp.condition !== undefined) item.condition = bp.condition
                if (bp.hitCondition !== undefined) item.hitCondition = bp.hitCondition
                if (bp.logMessage !== undefined) item.logMessage = bp.logMessage
                return item
            })
    }
    return []
}

/**
 * Real DebugAdapterTracker: captures every DAP message exchanged for a
 * session into the session store, enforces per-session breakpoint policies
 * ("rewrite" or "reapply"), maintains the per-session/per-source breakpoint ID
 * map, and tracks thread execution state.
 */
function createTracker(session: vscode.DebugSession): vscode.DebugAdapterTracker {
    sessionStore.registerSession(session)
    sessionStore.bindSessionToPolicy(session)

    const pendingSetBreakpointsBySeq = new Map<number, PendingSetBreakpointsRequest>()
    const pendingOwnCustomSources: Array<string | undefined> = []

    async function sendCustomSetBreakpoints(
        policy: BreakpointPolicyState,
        source: any,
        normalizedSourcePath: string | undefined,
        breakpoints: DapSourceBreakpoint[]
    ): Promise<void> {
        policy.inFlightSetBreakpoints++
        pendingOwnCustomSources.push(normalizedSourcePath)
        try {
            await session.customRequest('setBreakpoints', {
                source,
                breakpoints,
                lines: breakpoints.map((b) => b.line),
                __mcpDapOwn: true,
            })
        } catch (error) {
            console.warn(
                `[vscode-mcp-dap-debugger] customRequest('setBreakpoints') failed for session ${session.id}:`,
                error
            )
        } finally {
            policy.inFlightSetBreakpoints = Math.max(0, policy.inFlightSetBreakpoints - 1)
            sessionStore.notifyPolicyActivity(policy)
        }
    }

    return {
        onWillReceiveMessage(message: any) {
            if (message.type === 'request') {
                if (message.command === 'setBreakpoints') {
                    const policy = sessionStore.bindSessionToPolicy(session)
                    const source = message.arguments?.source
                    const sourcePath: string | undefined =
                        typeof source?.path === 'string' ? source.path : undefined
                    const normalizedSourcePath = sourcePath
                        ? normalizePathForComparison(sourcePath)
                        : undefined

                    let isOwnCustomRequest = false
                    if (message.arguments && message.arguments.__mcpDapOwn) {
                        isOwnCustomRequest = true
                        delete message.arguments.__mcpDapOwn
                    } else {
                        const ownIdx = pendingOwnCustomSources.indexOf(normalizedSourcePath)
                        if (ownIdx !== -1) {
                            isOwnCustomRequest = true
                            pendingOwnCustomSources.splice(ownIdx, 1)
                        }
                    }

                    if (policy) {
                        let sentSources = policy.sentSourcesBySession.get(session.id)
                        if (!sentSources) {
                            sentSources = new Set<string>()
                            policy.sentSourcesBySession.set(session.id, sentSources)
                        }
                        if (normalizedSourcePath) {
                            sentSources.add(normalizedSourcePath)
                        }

                        if (
                            policy.mode !== 'ide' &&
                            policy.mechanism === 'rewrite' &&
                            !isOwnCustomRequest
                        ) {
                            const replacement = getPolicyDapBreakpointsForSource(
                                policy,
                                normalizedSourcePath
                            )
                            if (!message.arguments) {
                                message.arguments = {}
                            }
                            if (Array.isArray(message.arguments.breakpoints)) {
                                message.arguments.breakpoints.splice(
                                    0,
                                    message.arguments.breakpoints.length,
                                    ...replacement
                                )
                            } else {
                                message.arguments.breakpoints = [...replacement]
                            }
                            if (Array.isArray(message.arguments.lines)) {
                                message.arguments.lines.splice(
                                    0,
                                    message.arguments.lines.length,
                                    ...replacement.map((b) => b.line)
                                )
                            }
                        }

                        const isEffectivePolicyRequest =
                            policy.mode === 'ide' ||
                            policy.mechanism === 'rewrite' ||
                            isOwnCustomRequest
                        if (isEffectivePolicyRequest && sourcePath) {
                            const currentBps: any[] = Array.isArray(message.arguments?.breakpoints)
                                ? message.arguments.breakpoints
                                : []
                            const relFile = getRelativePath(sourcePath)
                            const sourceKey = normalizedSourcePath ?? sourcePath
                            policy.requestedBySource.set(
                                sourceKey,
                                currentBps
                                    .filter((b) => typeof b?.line === 'number')
                                    .map((b) => ({
                                        file: relFile,
                                        line: b.line,
                                        ...(b.condition !== undefined ? { condition: b.condition } : {}),
                                        ...(b.hitCondition !== undefined ? { hitCondition: b.hitCondition } : {}),
                                        ...(b.logMessage !== undefined ? { logMessage: b.logMessage } : {}),
                                    }))
                            )
                        }
                    }

                    const effectiveBps: DapSourceBreakpoint[] = Array.isArray(
                        message.arguments?.breakpoints
                    )
                        ? message.arguments.breakpoints
                              .filter((b: any) => typeof b?.line === 'number')
                              .map((b: any) => ({
                                  line: b.line,
                                  ...(b.condition !== undefined ? { condition: b.condition } : {}),
                                  ...(b.hitCondition !== undefined ? { hitCondition: b.hitCondition } : {}),
                                  ...(b.logMessage !== undefined ? { logMessage: b.logMessage } : {}),
                              }))
                        : []

                    if (typeof message.seq === 'number') {
                        let countsTowardPolicyInFlight = false
                        if (policy && !isOwnCustomRequest) {
                            policy.inFlightSetBreakpoints++
                            countsTowardPolicyInFlight = true
                        }
                        pendingSetBreakpointsBySeq.set(message.seq, {
                            source,
                            sourcePath,
                            normalizedSourcePath,
                            requestedBreakpoints: effectiveBps,
                            isOwnCustomRequest,
                            countsTowardPolicyInFlight,
                        })
                    }
                } else if (EXECUTION_REQUEST_COMMANDS.has(message.command)) {
                    sessionStore.onExecutionRequest(session.id, message.command, message.arguments)
                }
            }

            sessionStore.appendDapMessage(session.id, {
                direction: 'client-to-adapter',
                timestamp: Date.now(),
                message,
            })
        },
        onDidSendMessage(message: any) {
            sessionStore.appendDapMessage(session.id, {
                direction: 'adapter-to-client',
                timestamp: Date.now(),
                message,
            })

            const policy = sessionStore.bindSessionToPolicy(session)

            if (message.type === 'response') {
                if (message.command === 'setBreakpoints') {
                    const pending =
                        typeof message.request_seq === 'number'
                            ? pendingSetBreakpointsBySeq.get(message.request_seq)
                            : undefined
                    if (pending && typeof message.request_seq === 'number') {
                        pendingSetBreakpointsBySeq.delete(message.request_seq)
                    }

                    const respBps: any[] = Array.isArray(message.body?.breakpoints)
                        ? message.body.breakpoints
                        : []

                    if (pending?.sourcePath) {
                        const relFile = getRelativePath(pending.sourcePath)
                        const idEntries: Array<{ id: number; file: string; line: number }> = []
                        for (let i = 0; i < respBps.length; i++) {
                            const rb = respBps[i]
                            const reqBp = pending.requestedBreakpoints[i]
                            const line = typeof rb?.line === 'number' ? rb.line : reqBp?.line
                            if (typeof rb?.id === 'number' && typeof line === 'number') {
                                idEntries.push({ id: rb.id, file: relFile, line })
                            }
                        }
                        sessionStore.setSourceBreakpointsMap(session.id, pending.sourcePath, idEntries)
                    }

                    if (policy && pending?.sourcePath) {
                        const isEffectivePolicyResponse =
                            policy.mode === 'ide' ||
                            policy.mechanism === 'rewrite' ||
                            pending.isOwnCustomRequest
                        if (isEffectivePolicyResponse) {
                            const relFile = getRelativePath(pending.sourcePath)
                            const sourceKey = pending.normalizedSourcePath ?? pending.sourcePath
                            const verifiedList: VerifiedBreakpointRecord[] = respBps.map(
                                (rb: any, idx: number) => {
                                    const reqBp = pending.requestedBreakpoints[idx]
                                    const requestedLine =
                                        typeof reqBp?.line === 'number' ? reqBp.line : undefined
                                    const actualLine =
                                        typeof rb?.line === 'number' ? rb.line : requestedLine
                                    return {
                                        ...(typeof rb?.id === 'number' ? { id: rb.id } : {}),
                                        file: relFile,
                                        ...(requestedLine !== undefined ? { requestedLine } : {}),
                                        ...(actualLine !== undefined ? { line: actualLine } : {}),
                                        verified: Boolean(rb?.verified),
                                        ...(typeof rb?.message === 'string' ? { message: rb.message } : {}),
                                    }
                                }
                            )
                            const prevVerified = policy.verifiedBySource.get(sourceKey)
                            const prevHasVerified = prevVerified?.some((v) => v.verified) ?? false
                            const newHasVerified = verifiedList.some((v) => v.verified)
                            if (!prevVerified || newHasVerified || !prevHasVerified) {
                                policy.verifiedBySource.set(sourceKey, verifiedList)
                            }
                        }
                    }

                    if (
                        policy &&
                        policy.mode !== 'ide' &&
                        policy.mechanism === 'reapply' &&
                        pending &&
                        !pending.isOwnCustomRequest
                    ) {
                        const replacement = getPolicyDapBreakpointsForSource(
                            policy,
                            pending.normalizedSourcePath
                        )
                        const targetSource =
                            pending.source ??
                            (pending.sourcePath
                                ? {
                                      name: path.basename(pending.sourcePath),
                                      path: pending.sourcePath,
                                  }
                                : undefined)
                        if (targetSource) {
                            void sendCustomSetBreakpoints(
                                policy,
                                targetSource,
                                pending.normalizedSourcePath,
                                replacement
                            )
                        }
                    }

                    if (pending?.countsTowardPolicyInFlight && policy) {
                        policy.inFlightSetBreakpoints = Math.max(0, policy.inFlightSetBreakpoints - 1)
                        sessionStore.notifyPolicyActivity(policy)
                    }
                } else if (message.command === 'configurationDone') {
                    if (policy) {
                        const alreadyDoneForSession = policy.configurationDoneBySession.has(session.id)
                        policy.configurationDoneBySession.add(session.id)

                        if (!alreadyDoneForSession && policy.mode === 'list') {
                            let sentSources = policy.sentSourcesBySession.get(session.id)
                            if (!sentSources) {
                                sentSources = new Set<string>()
                                policy.sentSourcesBySession.set(session.id, sentSources)
                            }

                            const bySource = new Map<
                                string,
                                { resolvedPath: string; bps: DapSourceBreakpoint[] }
                            >()
                            for (const bp of policy.breakpoints) {
                                if (!bySource.has(bp.normalizedPath)) {
                                    bySource.set(bp.normalizedPath, {
                                        resolvedPath: bp.resolvedPath,
                                        bps: getPolicyDapBreakpointsForSource(
                                            policy,
                                            bp.normalizedPath
                                        ),
                                    })
                                }
                            }

                            for (const [normPath, info] of bySource) {
                                if (!sentSources.has(normPath)) {
                                    sentSources.add(normPath)
                                    const source = {
                                        name: path.basename(info.resolvedPath),
                                        path: info.resolvedPath,
                                    }
                                    void sendCustomSetBreakpoints(
                                        policy,
                                        source,
                                        normPath,
                                        info.bps
                                    )
                                }
                            }
                        }

                        sessionStore.notifyPolicyActivity(policy)
                    }
                } else if (message.command === 'continue' && message.success !== false) {
                    sessionStore.onContinueResponse(session.id, message.body)
                } else if (message.command === 'threads' && message.success !== false) {
                    sessionStore.onThreadsResponse(session.id, message.body)
                }
            } else if (message.type === 'event') {
                if (message.event === 'output') {
                    sessionStore.appendConsoleOutput(session.id, {
                        timestamp: Date.now(),
                        category: message.body?.category ?? 'console',
                        output: message.body?.output ?? '',
                    })
                } else if (message.event === 'stopped') {
                    sessionStore.onStoppedEvent(session.id, message.body)
                    if (message.body?.reason === 'exception') {
                        void captureExceptionInfo(session, message.body?.threadId)
                    }
                } else if (message.event === 'continued') {
                    sessionStore.onContinuedEvent(session.id, message.body)
                } else if (message.event === 'thread') {
                    sessionStore.onThreadEvent(session.id, message.body)
                } else if (message.event === 'terminated' || message.event === 'exited') {
                    sessionStore.onTerminatedOrExitedEvent(session.id)
                } else if (message.event === 'breakpoint') {
                    const bp = message.body?.breakpoint
                    if (bp && typeof bp.id === 'number') {
                        const bpSourcePath: string | undefined =
                            typeof bp.source?.path === 'string' ? bp.source.path : undefined
                        const bpLine: number | undefined =
                            typeof bp.line === 'number' ? bp.line : undefined
                        sessionStore.updateBreakpointIdEntry(session.id, bpSourcePath, {
                            id: bp.id,
                            file: bpSourcePath ? getRelativePath(bpSourcePath) : undefined,
                            line: bpLine,
                        })
                        if (policy) {
                            for (const list of policy.verifiedBySource.values()) {
                                const match = list.find((item) => item.id === bp.id)
                                if (match) {
                                    if (typeof bp.verified === 'boolean') match.verified = bp.verified
                                    if (typeof bp.line === 'number') match.line = bp.line
                                    if (typeof bp.message === 'string') match.message = bp.message
                                }
                            }
                            sessionStore.notifyPolicyActivity(policy)
                        }
                    }
                }
            }
        },
        onError(error: Error) {
            console.error(`[vscode-mcp-dap-debugger] DAP tracker error for session ${session.id}:`, error)
        },
        onExit() {
            // Session bookkeeping is handled by onDidTerminateDebugSession, not here.
        },
    }
}

async function captureExceptionInfo(session: vscode.DebugSession, threadId: number | undefined): Promise<void> {
    if (threadId === undefined) return

    try {
        const details = await session.customRequest('exceptionInfo', { threadId })
        sessionStore.appendException(session.id, {
            timestamp: Date.now(),
            threadId,
            description: details?.description,
            details,
        })
    } catch (error) {
        // Not every debug adapter implements the exceptionInfo request; that's fine.
        console.warn(`[vscode-mcp-dap-debugger] exceptionInfo request failed for session ${session.id}:`, error)
    }
}

export function registerDapTracker(): vscode.Disposable {
    const disposables: vscode.Disposable[] = []

    disposables.push(
        vscode.debug.registerDebugAdapterTrackerFactory('*', {
            createDebugAdapterTracker: (session) => createTracker(session),
        })
    )

    disposables.push(vscode.debug.onDidStartDebugSession((session) => sessionStore.registerSession(session)))
    disposables.push(vscode.debug.onDidTerminateDebugSession((session) => sessionStore.unregisterSession(session.id)))
    disposables.push(vscode.debug.onDidChangeActiveDebugSession((session) => sessionStore.setActiveSession(session?.id)))

    return vscode.Disposable.from(...disposables)
}
