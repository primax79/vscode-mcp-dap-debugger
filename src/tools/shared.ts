import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type * as vscode from 'vscode'
import { sessionStore } from '../dap/session-store'

const MAX_RESULT_CHARS = 30_000

export function ok(data: unknown): CallToolResult {
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    return { content: [{ type: 'text', text: truncate(text) }] }
}

export function err(message: string): CallToolResult {
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
}

function truncate(text: string): string {
    if (text.length <= MAX_RESULT_CHARS) return text
    const omitted = text.length - MAX_RESULT_CHARS
    return `${text.slice(0, MAX_RESULT_CHARS)}\n\n... [truncated ${omitted} characters; narrow your request, e.g. with scopeName/limit/levels]`
}

/**
 * Wraps a tool handler body so every tool doesn't need to repeat the same
 * try/catch-and-format-an-error boilerplate.
 */
export async function withErrorHandling(handler: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await handler()
    } catch (error: any) {
        return err(error?.message ?? String(error))
    }
}

/**
 * Resolves the debug session a tool call should target. Returns either the
 * session or a ready-to-return error CallToolResult - callers do:
 *
 *   const resolved = requireSession(args.sessionId)
 *   if ('errorResult' in resolved) return resolved.errorResult
 */
export function requireSession(sessionId?: string): { session: vscode.DebugSession } | { errorResult: CallToolResult } {
    const resolved = sessionStore.resolveSession(sessionId)
    if ('error' in resolved) {
        return { errorResult: err(resolved.error) }
    }
    return { session: resolved.session }
}
