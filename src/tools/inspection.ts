import * as vscode from 'vscode'
import { inputSchemas } from './schemas'
import { ok, err, withErrorHandling, requireSession } from './shared'
import { sessionStore } from '../dap/session-store'

export type ResolveFrameHow =
    | 'explicit'
    | 'focused-frame'
    | 'focused-thread-top'
    | 'last-stopped-thread-top'

export interface ResolvedFrame {
    frameId: number
    threadId?: number | null
    frameName?: string | null
    source?: {
        name?: string
        path?: string
        presentationHint?: string
        origin?: string
    } | null
    line?: number | null
    how: ResolveFrameHow
}

class ThreadResumedError extends Error {
    constructor(public readonly threadId: number) {
        super(`thread ${threadId} resumed while resolving the frame; retry`)
        this.name = 'ThreadResumedError'
    }
}

function isThreadResumedError(
    session: vscode.DebugSession,
    threadId: number | null | undefined,
    error: any
): boolean {
    if (threadId !== null && threadId !== undefined) {
        const threadState = sessionStore.getThreadExecutionState(session.id, threadId)
        if (threadState?.state === 'running') {
            return true
        }
    }
    const msg = (error?.message ?? String(error)).toLowerCase()
    return (
        msg.includes('resumed') ||
        msg.includes('running') ||
        msg.includes('not paused') ||
        msg.includes('not stopped') ||
        msg.includes('is not stopped') ||
        (msg.includes('frame') &&
            (msg.includes('not found') || msg.includes('unknown') || msg.includes('invalid') || msg.includes('no such')))
    )
}

function getStoppedThreadIds(sessionId: string): number[] {
    const ids: number[] = []
    const seen = new Set<number>()

    const mostRecent = sessionStore.getMostRecentlyStoppedThread(sessionId)
    if (mostRecent && mostRecent.state === 'stopped') {
        ids.push(mostRecent.threadId)
        seen.add(mostRecent.threadId)
    }

    const execState = sessionStore.getExecutionState(sessionId)
    if (execState) {
        for (const t of execState.threads) {
            if (t.state === 'stopped' && !seen.has(t.threadId)) {
                ids.push(t.threadId)
                seen.add(t.threadId)
            }
        }
    }

    return ids
}

async function resolveFrameId(
    session: vscode.DebugSession,
    frameId?: number
): Promise<ResolvedFrame | undefined> {
    // 1. Explicit frameId
    if (frameId !== undefined) {
        const stoppedThreadIds = getStoppedThreadIds(session.id)
        let meta: {
            threadId: number
            frameName: string | null
            source: { name?: string; path?: string } | null
            line: number | null
        } | null = null

        for (const tid of stoppedThreadIds) {
            try {
                const resp = await session.customRequest('stackTrace', {
                    threadId: tid,
                    startFrame: 0,
                    levels: 20,
                })
                const match = (resp?.stackFrames ?? []).find((f: any) => f?.id === frameId)
                if (match) {
                    meta = {
                        threadId: tid,
                        frameName: match.name ?? null,
                        source: match.source ? { name: match.source.name, path: match.source.path } : null,
                        line: match.line ?? null,
                    }
                    break
                }
            } catch {
                // If stackTrace fails on a thread, continue searching other stopped threads
            }
        }

        return {
            frameId,
            threadId: meta ? meta.threadId : null,
            frameName: meta ? meta.frameName : null,
            source: meta ? meta.source : null,
            line: meta ? meta.line : null,
            how: 'explicit',
        }
    }

    // 2. Focused stack frame (vscode.debug.activeStackItem with frameId)
    const activeItem = vscode.debug.activeStackItem
    if (activeItem && activeItem.session.id === session.id && 'frameId' in activeItem) {
        const focusedFrameId = (activeItem as any).frameId as number
        const focusedThreadId = activeItem.threadId

        let frameName: string | null = null
        let source: { name?: string; path?: string } | null = null
        let line: number | null = null

        try {
            const resp = await session.customRequest('stackTrace', {
                threadId: focusedThreadId,
                startFrame: 0,
                levels: 20,
            })
            const match = (resp?.stackFrames ?? []).find((f: any) => f?.id === focusedFrameId)
            if (match) {
                frameName = match.name ?? null
                source = match.source ? { name: match.source.name, path: match.source.path } : null
                line = match.line ?? null
            }
        } catch {
            // Ignore failure to fetch extra metadata
        }

        return {
            frameId: focusedFrameId,
            threadId: focusedThreadId,
            frameName,
            source,
            line,
            how: 'focused-frame',
        }
    }

    // 3. Focused thread of this session (top frame)
    if (activeItem && activeItem.session.id === session.id && typeof (activeItem as any).threadId === 'number') {
        const threadId = activeItem.threadId
        try {
            const resp = await session.customRequest('stackTrace', {
                threadId,
                startFrame: 0,
                levels: 1,
            })
            const topFrame = resp?.stackFrames?.[0]
            if (topFrame && typeof topFrame.id === 'number') {
                return {
                    frameId: topFrame.id,
                    threadId,
                    frameName: topFrame.name ?? null,
                    source: topFrame.source ? { name: topFrame.source.name, path: topFrame.source.path } : null,
                    line: topFrame.line ?? null,
                    how: 'focused-thread-top',
                }
            }
        } catch (err: any) {
            if (isThreadResumedError(session, threadId, err)) {
                const lastStopped = sessionStore.getMostRecentlyStoppedThread(session.id)
                if (!lastStopped || lastStopped.threadId === threadId) {
                    throw new ThreadResumedError(threadId)
                }
            }
        }
    }

    // 4. Most recently stopped thread
    const lastStopped = sessionStore.getMostRecentlyStoppedThread(session.id)
    if (lastStopped && typeof lastStopped.threadId === 'number') {
        const threadId = lastStopped.threadId
        try {
            const resp = await session.customRequest('stackTrace', {
                threadId,
                startFrame: 0,
                levels: 1,
            })
            const topFrame = resp?.stackFrames?.[0]
            if (topFrame && typeof topFrame.id === 'number') {
                return {
                    frameId: topFrame.id,
                    threadId,
                    frameName: topFrame.name ?? null,
                    source: topFrame.source ? { name: topFrame.source.name, path: topFrame.source.path } : null,
                    line: topFrame.line ?? null,
                    how: 'last-stopped-thread-top',
                }
            }
        } catch (err: any) {
            if (isThreadResumedError(session, threadId, err)) {
                throw new ThreadResumedError(threadId)
            }
        }
    }

    return undefined
}

export const getActiveStackItemTool = {
    name: 'get-active-stack-item',
    config: {
        title: 'Get Active Stack Item',
        description: 'Get the thread or stack frame currently focused in the VS Code UI',
        inputSchema: inputSchemas['get-active-stack-item'],
    },
    handler: async () => withErrorHandling(async () => {
        const item = vscode.debug.activeStackItem
        if (!item) return ok({ message: 'No focused thread or stack frame' })

        const isFrame = 'frameId' in item
        return ok({
            type: isFrame ? 'stackFrame' : 'thread',
            sessionId: item.session.id,
            sessionName: item.session.name,
            threadId: item.threadId,
            frameId: isFrame ? (item as any).frameId : undefined,
        })
    }),
}

export const getCallStackTool = {
    name: 'get-call-stack',
    config: {
        title: 'Get Call Stack',
        description: 'Get the call stack for a thread in a debug session',
        inputSchema: inputSchemas['get-call-stack'],
    },
    handler: async (args: {
        sessionId?: string
        threadId?: number
        startFrame?: number
        levels?: number
        includeDeemphasized?: boolean
    }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        if ('errorResult' in resolved) return resolved.errorResult

        let threadId = args.threadId
        if (threadId === undefined) {
            const activeItem = vscode.debug.activeStackItem
            if (activeItem && activeItem.session.id === resolved.session.id && typeof activeItem.threadId === 'number') {
                threadId = activeItem.threadId
            } else {
                const lastStopped = sessionStore.getMostRecentlyStoppedThread(resolved.session.id)
                if (lastStopped && typeof lastStopped.threadId === 'number') {
                    threadId = lastStopped.threadId
                }
            }
        }

        if (threadId === undefined) {
            return err('threadId not provided, no focused thread in this session, and no stopped thread found; call get-thread-list first')
        }

        const response = await resolved.session.customRequest('stackTrace', {
            threadId,
            startFrame: args.startFrame ?? 0,
            levels: args.levels ?? 100,
        })

        const rawFrames: any[] = response.stackFrames ?? []
        const mappedFrames = rawFrames.map((frame: any) => {
            let source: {
                name?: string
                path?: string
                presentationHint?: string
                origin?: string
            } | null = null

            if (frame.source) {
                source = {
                    name: frame.source.name,
                    path: frame.source.path,
                    ...(frame.source.presentationHint !== undefined
                        ? { presentationHint: frame.source.presentationHint }
                        : {}),
                    ...(frame.source.origin !== undefined ? { origin: frame.source.origin } : {}),
                }
            }

            return {
                id: frame.id,
                name: frame.name,
                source,
                line: frame.line,
                column: frame.column,
                ...(frame.presentationHint !== undefined ? { presentationHint: frame.presentationHint } : {}),
            }
        })

        const includeDeemphasized = args.includeDeemphasized ?? true
        let finalFrames = mappedFrames
        let filteredOut = 0

        if (!includeDeemphasized) {
            finalFrames = mappedFrames.filter((frame) => {
                const isFrameSubtle = frame.presentationHint === 'subtle'
                const isSourceDeemphasize = frame.source?.presentationHint === 'deemphasize'
                return !(isFrameSubtle || isSourceDeemphasize)
            })
            filteredOut = mappedFrames.length - finalFrames.length
        }
        const returnedFrames = finalFrames.length

        let effectiveJustMyCode: boolean | undefined
        const configJmc = resolved.session.configuration?.justMyCode
        if (configJmc !== undefined) {
            effectiveJustMyCode = Boolean(configJmc)
        } else if (resolved.session.type === 'debugpy' || resolved.session.type === 'python') {
            effectiveJustMyCode = true
        }

        const justMyCodeHint =
            effectiveJustMyCode === true
                ? 'library frames are not reported by the adapter; restart with start-debug overrides {justMyCode: false} to see them'
                : undefined

        return ok({
            sessionId: resolved.session.id,
            threadId,
            totalFrames: response.totalFrames,
            returnedFrames,
            filteredOut,
            stackFrames: finalFrames,
            ...(effectiveJustMyCode !== undefined ? { justMyCode: effectiveJustMyCode } : {}),
            ...(justMyCodeHint ? { hint: justMyCodeHint } : {}),
        })
    }),
}

export const getVariablesScopeTool = {
    name: 'get-variables-scope',
    config: {
        title: 'Get Variables and Scopes',
        description: "Get all variables in a stack frame's scopes",
        inputSchema: inputSchemas['get-variables-scope'],
    },
    handler: async (args: { sessionId?: string; frameId?: number; scopeName?: string }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        if ('errorResult' in resolved) return resolved.errorResult

        let frameUsed: ResolvedFrame | undefined
        try {
            frameUsed = await resolveFrameId(resolved.session, args.frameId)
        } catch (error: any) {
            if (error instanceof ThreadResumedError) {
                return err(`thread ${error.threadId} resumed while resolving the frame; retry`)
            }
            throw error
        }

        if (!frameUsed) {
            return err('frameId not provided and no paused frame found (no breakpoint hit or thread paused); call get-debug-state or get-call-stack first')
        }

        const scopes = []
        try {
            const scopesResponse = await resolved.session.customRequest('scopes', { frameId: frameUsed.frameId })

            for (const scope of scopesResponse.scopes ?? []) {
                if (args.scopeName && scope.name !== args.scopeName) continue

                const variablesResponse = await resolved.session.customRequest('variables', {
                    variablesReference: scope.variablesReference,
                })

                scopes.push({
                    name: scope.name,
                    expensive: scope.expensive,
                    variables: (variablesResponse.variables ?? []).map((v: any) => ({
                        name: v.name,
                        value: v.value,
                        type: v.type,
                        variablesReference: v.variablesReference,
                    })),
                })
            }
        } catch (error: any) {
            if (isThreadResumedError(resolved.session, frameUsed.threadId, error)) {
                const tid = frameUsed.threadId ?? sessionStore.getMostRecentlyStoppedThread(resolved.session.id)?.threadId ?? 'unknown'
                return err(`thread ${tid} resumed while resolving the frame; retry`)
            }
            throw error
        }

        return ok({ sessionId: resolved.session.id, frameId: frameUsed.frameId, frameUsed, scopes })
    }),
}

export const getThreadListTool = {
    name: 'get-thread-list',
    config: {
        title: 'Get Thread List',
        description: 'List all threads in a debug session',
        inputSchema: inputSchemas['get-thread-list'],
    },
    handler: async (args: { sessionId?: string }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        if ('errorResult' in resolved) return resolved.errorResult

        const response = await resolved.session.customRequest('threads')
        return ok({ sessionId: resolved.session.id, threads: response.threads ?? [] })
    }),
}

export const evaluateExpressionTool = {
    name: 'evaluate-expression',
    config: {
        title: 'Evaluate Expression',
        description: "Evaluate an expression in a debug session's current context",
        inputSchema: inputSchemas['evaluate-expression'],
    },
    handler: async (args: { expression: string; sessionId?: string; frameId?: number }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        if ('errorResult' in resolved) return resolved.errorResult

        let frameUsed: ResolvedFrame | undefined
        try {
            frameUsed = await resolveFrameId(resolved.session, args.frameId)
        } catch (error: any) {
            if (error instanceof ThreadResumedError) {
                return err(`thread ${error.threadId} resumed while resolving the frame; retry`)
            }
            throw error
        }

        let response: any
        try {
            response = await resolved.session.customRequest('evaluate', {
                expression: args.expression,
                context: 'repl',
                frameId: frameUsed?.frameId,
            })
        } catch (error: any) {
            if (frameUsed && isThreadResumedError(resolved.session, frameUsed.threadId, error)) {
                const tid = frameUsed.threadId ?? sessionStore.getMostRecentlyStoppedThread(resolved.session.id)?.threadId ?? 'unknown'
                return err(`thread ${tid} resumed while resolving the frame; retry`)
            }
            throw error
        }

        const warning = !frameUsed
            ? (resolved.session.type === 'debugpy' || resolved.session.type === 'python'
                ? 'no frame: debugpy executes the expression as a statement in a debugger-owned frame and returns an empty result; output, if any, goes to the debug console (get-debug-console)'
                : "no paused frame: evaluated in the adapter's default context, not in your code's frame")
            : undefined

        return ok({
            expression: args.expression,
            result: response?.result,
            type: response?.type,
            frameUsed: frameUsed ?? null,
            ...(warning ? { warning } : {}),
        })
    }),
}

async function findVariableByPath(session: vscode.DebugSession, frameId: number, pathSegments: string[]): Promise<any | undefined> {
    const scopesResponse = await session.customRequest('scopes', { frameId })

    const candidates: any[] = []
    for (const scope of scopesResponse.scopes ?? []) {
        const variablesResponse = await session.customRequest('variables', { variablesReference: scope.variablesReference })
        candidates.push(...(variablesResponse.variables ?? []))
    }

    let current = candidates.find((v) => v.name === pathSegments[0])
    if (!current) return undefined

    for (const segment of pathSegments.slice(1)) {
        if (!current.variablesReference) return undefined
        const childrenResponse = await session.customRequest('variables', { variablesReference: current.variablesReference })
        current = (childrenResponse.variables ?? []).find((v: any) => v.name === segment)
        if (!current) return undefined
    }

    return current
}

function parseVariablePath(variableName: string): string[] {
    return variableName.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
}

export const inspectVariableTool = {
    name: 'inspect-variable',
    config: {
        title: 'Inspect Variable',
        description: 'Get detailed information about a variable, optionally navigating a nested path (e.g. "user.address[0].city")',
        inputSchema: inputSchemas['inspect-variable'],
    },
    handler: async (args: { variableName: string; sessionId?: string; frameId?: number }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        if ('errorResult' in resolved) return resolved.errorResult

        let frameUsed: ResolvedFrame | undefined
        try {
            frameUsed = await resolveFrameId(resolved.session, args.frameId)
        } catch (error: any) {
            if (error instanceof ThreadResumedError) {
                return err(`thread ${error.threadId} resumed while resolving the frame; retry`)
            }
            throw error
        }

        if (!frameUsed) {
            return err('frameId not provided and no paused frame found (no breakpoint hit or thread paused); call get-debug-state or get-call-stack first')
        }

        const segments = parseVariablePath(args.variableName)
        let variable: any
        try {
            variable = await findVariableByPath(resolved.session, frameUsed.frameId, segments)
        } catch (error: any) {
            if (isThreadResumedError(resolved.session, frameUsed.threadId, error)) {
                const tid = frameUsed.threadId ?? sessionStore.getMostRecentlyStoppedThread(resolved.session.id)?.threadId ?? 'unknown'
                return err(`thread ${tid} resumed while resolving the frame; retry`)
            }
            throw error
        }

        if (!variable) {
            return err(`Variable "${args.variableName}" not found in current scope`)
        }

        return ok({
            name: args.variableName,
            value: variable.value,
            type: variable.type,
            variablesReference: variable.variablesReference,
            frameUsed,
        })
    }),
}
