import * as vscode from 'vscode'
import { listBreakpointsData } from './tools/breakpoints'
import { sessionStore } from './dap/session-store'

// Deliberately trimmed vs. the original (which had a 1:1 resource for every
// tool): resources are a secondary surface here, agents call tools. Keeping
// only the ones with distinct read-only value avoids duplicating all the
// session-scoped tool logic a second time.

export const breakpointsResource = {
    name: 'breakpoints',
    uri: 'debug://breakpoints',
    config: { title: 'Current Breakpoints', description: 'List of all breakpoints', mimeType: 'application/json' },
    handler: async (uri: URL) => ({
        contents: [{ uri: uri.href, text: JSON.stringify(listBreakpointsData(), null, 2) }],
    }),
}

export const debugSessionsResource = {
    name: 'debug-sessions',
    uri: 'debug://sessions',
    config: { title: 'Debug Sessions', description: 'All currently tracked debug sessions', mimeType: 'application/json' },
    handler: async (uri: URL) => {
        const sessions = sessionStore.listSessions().map((tracked) => ({
            id: tracked.session.id,
            name: tracked.session.name,
            type: tracked.session.type,
            status: tracked.status,
            isFocused: vscode.debug.activeDebugSession?.id === tracked.session.id,
        }))
        return { contents: [{ uri: uri.href, text: JSON.stringify(sessions, null, 2) }] }
    },
}

export const dapLogResource = {
    name: 'dap-log',
    uri: 'dap-log://active',
    config: {
        title: 'DAP Log (focused session)',
        description: 'Raw DAP messages for the debug session focused in the UI',
        mimeType: 'application/json',
    },
    handler: async (uri: URL) => {
        const activeId = vscode.debug.activeDebugSession?.id
        const messages = activeId ? sessionStore.getDapLog(activeId) : []
        return { contents: [{ uri: uri.href, text: JSON.stringify(messages, null, 2) }] }
    },
}

export const allResources = [breakpointsResource, debugSessionsResource, dapLogResource]
