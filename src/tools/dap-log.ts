import { inputSchemas } from './schemas'
import { ok, withErrorHandling, requireSession } from './shared'
import { sessionStore } from '../dap/session-store'

export const getDapLogTool = {
    name: 'get-dap-log',
    config: {
        title: 'Get DAP Log',
        description: 'Get the raw Debug Adapter Protocol messages exchanged for a session',
        inputSchema: inputSchemas['get-dap-log'],
    },
    handler: async (args: { sessionId?: string; limit?: number }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        if ('errorResult' in resolved) return resolved.errorResult

        let messages = sessionStore.getDapLog(resolved.session.id)
        if (args.limit) messages = messages.slice(-args.limit)

        return ok({ sessionId: resolved.session.id, total: messages.length, messages })
    }),
}

export const getDebugConsoleTool = {
    name: 'get-debug-console',
    config: {
        title: 'Get Debug Console',
        description: 'Get recent debug console/stdout/stderr output for a session',
        inputSchema: inputSchemas['get-debug-console'],
    },
    handler: async (args: { sessionId?: string; limit?: number; filter?: string }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        if ('errorResult' in resolved) return resolved.errorResult

        let entries = sessionStore.getConsoleOutput(resolved.session.id)
        if (args.filter) {
            const needle = args.filter.toLowerCase()
            entries = entries.filter((e) => e.category.toLowerCase().includes(needle) || e.output.toLowerCase().includes(needle))
        }
        if (args.limit) entries = entries.slice(-args.limit)

        return ok({ sessionId: resolved.session.id, total: entries.length, entries })
    }),
}

export const getExceptionInfoTool = {
    name: 'get-exception-info',
    config: {
        title: 'Get Exception Information',
        description: 'Get recent exception details captured for a session',
        inputSchema: inputSchemas['get-exception-info'],
    },
    handler: async (args: { sessionId?: string; limit?: number }) => withErrorHandling(async () => {
        const resolved = requireSession(args.sessionId)
        if ('errorResult' in resolved) return resolved.errorResult

        let exceptions = sessionStore.getExceptions(resolved.session.id)
        if (args.limit) exceptions = exceptions.slice(-args.limit)

        return ok({ sessionId: resolved.session.id, total: exceptions.length, exceptions })
    }),
}
