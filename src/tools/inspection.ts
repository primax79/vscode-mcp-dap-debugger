import * as vscode from 'vscode'
import { inputSchemas } from './schemas'
import { ok, err, withErrorHandling, requireSession } from './shared'

async function resolveFrameId(session: vscode.DebugSession, frameId?: number): Promise<number | undefined> {
    if (frameId !== undefined) return frameId

    const activeStackItem = vscode.debug.activeStackItem
    if (activeStackItem && activeStackItem.session.id === session.id && 'frameId' in activeStackItem) {
        return (activeStackItem as any).frameId
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
    handler: async (args: { sessionId?: string; threadId?: number; startFrame?: number; levels?: number }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        if ('errorResult' in resolved) return resolved.errorResult

        const threadId = args.threadId ?? vscode.debug.activeStackItem?.threadId
        if (threadId === undefined) {
            return err('threadId not provided and no thread is focused; call get-thread-list first')
        }

        const response = await resolved.session.customRequest('stackTrace', {
            threadId,
            startFrame: args.startFrame ?? 0,
            levels: args.levels ?? 100,
        })

        return ok({
            sessionId: resolved.session.id,
            threadId,
            totalFrames: response.totalFrames,
            stackFrames: (response.stackFrames ?? []).map((frame: any) => ({
                id: frame.id,
                name: frame.name,
                source: frame.source ? { name: frame.source.name, path: frame.source.path } : null,
                line: frame.line,
                column: frame.column,
            })),
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

        const frameId = await resolveFrameId(resolved.session, args.frameId)
        if (frameId === undefined) {
            return err('frameId not provided and no stack frame is focused; call get-call-stack first')
        }

        const scopesResponse = await resolved.session.customRequest('scopes', { frameId })
        const scopes = []

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

        return ok({ sessionId: resolved.session.id, frameId, scopes })
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

        const frameId = await resolveFrameId(resolved.session, args.frameId)
        const response = await resolved.session.customRequest('evaluate', {
            expression: args.expression,
            context: 'repl',
            frameId,
        })

        return ok({ expression: args.expression, result: response.result, type: response.type })
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

        const frameId = await resolveFrameId(resolved.session, args.frameId)
        if (frameId === undefined) {
            return err('frameId not provided and no stack frame is focused; call get-call-stack first')
        }

        const segments = parseVariablePath(args.variableName)
        const variable = await findVariableByPath(resolved.session, frameId, segments)

        if (!variable) {
            return err(`Variable "${args.variableName}" not found in current scope`)
        }

        return ok({
            name: args.variableName,
            value: variable.value,
            type: variable.type,
            variablesReference: variable.variablesReference,
        })
    }),
}
