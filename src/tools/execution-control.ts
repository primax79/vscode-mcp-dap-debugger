import * as vscode from 'vscode'
import { inputSchemas } from './schemas'
import { ok, withErrorHandling, requireSession } from './shared'

async function resolveThreadId(session: vscode.DebugSession, threadId?: number): Promise<number> {
    if (threadId !== undefined) return threadId

    const activeStackItem = vscode.debug.activeStackItem
    if (activeStackItem && activeStackItem.session.id === session.id) {
        return activeStackItem.threadId
    }

    const response = await session.customRequest('threads')
    const firstThread = response?.threads?.[0]
    if (!firstThread) {
        throw new Error(`Session "${session.name}" reported no threads`)
    }
    return firstThread.id
}

/**
 * Execution control is sent as a direct DAP request against the resolved
 * session/thread (session.customRequest), not via the
 * `workbench.action.debug.*` commands the original tool used - those only
 * ever affect whichever session happens to have UI focus, which makes
 * controlling more than one concurrent debug session impossible.
 */
function executionTool(name: keyof typeof inputSchemas, title: string, dapCommand: string, verb: string) {
    return {
        name,
        config: {
            title,
            description: `${title} in a specific debug session/thread`,
            inputSchema: inputSchemas[name],
        },
        handler: async (args: { sessionId?: string; threadId?: number }) => withErrorHandling(async () => {
            const resolved = requireSession(args.sessionId)
            if ('errorResult' in resolved) return resolved.errorResult

            const threadId = await resolveThreadId(resolved.session, args.threadId)
            await resolved.session.customRequest(dapCommand, { threadId })
            return ok({ message: `${verb} (session: ${resolved.session.name}, thread: ${threadId})` })
        }),
    }
}

export const continueTool = executionTool('continue', 'Continue Execution', 'continue', 'Execution continued')
export const stepOverTool = executionTool('step-over', 'Step Over', 'next', 'Stepped over')
export const stepIntoTool = executionTool('step-into', 'Step Into', 'stepIn', 'Stepped into')
export const stepOutTool = executionTool('step-out', 'Step Out', 'stepOut', 'Stepped out')
export const pauseTool = executionTool('pause', 'Pause Execution', 'pause', 'Execution paused')

export const stopDebugTool = {
    name: 'stop-debug',
    config: {
        title: 'Stop Debug Session',
        description: 'Stop a specific debug session (or the focused/only one if sessionId is omitted)',
        inputSchema: inputSchemas['stop-debug'],
    },
    handler: async (args: { sessionId?: string }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        if ('errorResult' in resolved) return resolved.errorResult

        await vscode.debug.stopDebugging(resolved.session)
        return ok({ message: `Debug session "${resolved.session.name}" stopped` })
    }),
}
