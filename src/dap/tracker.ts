import * as vscode from 'vscode'
import { sessionStore } from './session-store'

/**
 * Real DebugAdapterTracker: captures every DAP message exchanged for a
 * session into the session store. The original tool shipped this as an empty
 * stub ("Currently not tracking DAP messages"), which is why get-dap-log,
 * get-debug-console and get-exception-info always returned canned
 * placeholders instead of real data.
 */
function createTracker(session: vscode.DebugSession): vscode.DebugAdapterTracker {
    return {
        onWillReceiveMessage(message: any) {
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

            if (message.type === 'event' && message.event === 'output') {
                sessionStore.appendConsoleOutput(session.id, {
                    timestamp: Date.now(),
                    category: message.body?.category ?? 'console',
                    output: message.body?.output ?? '',
                })
            }

            if (message.type === 'event' && message.event === 'stopped' && message.body?.reason === 'exception') {
                void captureExceptionInfo(session, message.body?.threadId)
            }
        },
        onError(error: Error) {
            console.error(`[vscode-debug-mcp] DAP tracker error for session ${session.id}:`, error)
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
        console.warn(`[vscode-debug-mcp] exceptionInfo request failed for session ${session.id}:`, error)
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
