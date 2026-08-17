import { z } from 'zod'

const sessionId = z.string().optional().describe(
    'Target debug session ID (see list-debug-sessions). Defaults to the session focused in the UI, or the only active one.'
)
const threadId = z.number().int().optional().describe(
    'Target thread ID. Defaults to the focused thread, or the first thread reported by the debug adapter.'
)

const breakpointShape = {
    file: z.string().describe('Relative path from workspace root, or an absolute path'),
    line: z.number().int().min(1).describe('Line number (1-based)'),
    condition: z.string().optional().describe('Condition expression'),
    hitCondition: z.string().optional().describe('Hit count condition'),
    logMessage: z.string().optional().describe('Log message to output instead of pausing (logpoint)'),
}

export const inputSchemas = {
    'add-breakpoint': breakpointShape,
    'add-breakpoints': {
        breakpoints: z.array(z.object(breakpointShape)).describe('Array of breakpoint configurations'),
    },
    'remove-breakpoint': {
        file: z.string().describe('Relative path from workspace root, or an absolute path'),
        line: z.number().int().min(1).describe('Line number (1-based)'),
    },
    'clear-breakpoints': {
        files: z.array(z.string()).optional().describe('Relative or absolute paths; omit to clear all breakpoints'),
    },
    'list-breakpoints': {},

    'list-debug-sessions': {},
    'get-active-session': {},
    'get-debug-state': { sessionId },
    'list-debug-configs': {},
    'select-debug-config': { configName: z.string().describe('Debug configuration name to select') },
    'start-debug': { config: z.string().describe('Configuration name from launch.json') },
    'stop-debug': { sessionId },

    continue: { sessionId, threadId },
    'step-over': { sessionId, threadId },
    'step-into': { sessionId, threadId },
    'step-out': { sessionId, threadId },
    pause: { sessionId, threadId },

    'evaluate-expression': {
        expression: z.string().describe('Expression to evaluate in the debug context'),
        sessionId,
        frameId: z.number().int().optional().describe('Stack frame ID; defaults to the focused frame'),
    },
    'inspect-variable': {
        variableName: z.string().describe('Variable name, optionally with a nested path, e.g. "user.address[0].city"'),
        sessionId,
        frameId: z.number().int().optional(),
    },
    'get-active-stack-item': {},
    'get-call-stack': {
        sessionId,
        threadId,
        startFrame: z.number().int().optional(),
        levels: z.number().int().optional(),
    },
    'get-variables-scope': {
        sessionId,
        frameId: z.number().int().optional(),
        scopeName: z.string().optional().describe('Filter by scope name (e.g. "Local", "Global")'),
    },
    'get-thread-list': { sessionId },

    'get-dap-log': { sessionId, limit: z.number().int().optional().describe('Max number of most recent messages to return') },
    'get-debug-console': {
        sessionId,
        limit: z.number().int().optional(),
        filter: z.string().optional().describe('Only include output whose category or text matches this substring'),
    },
    'get-exception-info': { sessionId, limit: z.number().int().optional() },

    'select-vscode-instance': {
        port: z.number().int().optional(),
        workspace: z.string().optional(),
    },
    'get-workspace-info': {},
    'list-vscode-instances': {},
}
