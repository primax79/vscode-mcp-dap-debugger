import * as vscode from 'vscode'
import { RingBuffer } from '../utils/ring-buffer'

export interface DapMessageEntry {
    direction: 'client-to-adapter' | 'adapter-to-client'
    timestamp: number
    message: any
}

export interface ConsoleOutputEntry {
    timestamp: number
    category: string
    output: string
}

export interface ExceptionEntry {
    timestamp: number
    threadId: number
    description?: string
    details?: any
}

interface SessionRecord {
    session: vscode.DebugSession
    startedAt: number
    terminatedAt?: number
    dapLog: RingBuffer<DapMessageEntry>
    consoleOutput: RingBuffer<ConsoleOutputEntry>
    exceptions: RingBuffer<ExceptionEntry>
}

export interface TrackedSession {
    session: vscode.DebugSession
    status: 'live' | 'terminated'
}

function config() {
    return vscode.workspace.getConfiguration('vscodeDebugMcp')
}

function dapLogCapacity(): number {
    return config().get<number>('server.dapLogCapacity', 500)
}

function consoleOutputCapacity(): number {
    return config().get<number>('server.consoleOutputCapacity', 500)
}

function exceptionCapacity(): number {
    return config().get<number>('server.exceptionCapacity', 50)
}

/**
 * How long a terminated session's logs/console/exceptions stay queryable
 * after the session ends. Fast scripts (in particular ones only hit by
 * logpoints, which don't pause execution) can finish before an agent gets a
 * chance to call get-debug-console/get-dap-log - without this grace period
 * their output would already be gone by the time it's requested. Read live
 * (not cached) so a settings change applies without an extension reload.
 */
function terminatedSessionRetentionMs(): number {
    const minutes = config().get<number>('server.terminatedSessionRetentionMinutes', 5)
    return Math.max(0, minutes) * 60 * 1000
}

/**
 * Tracks every debug session VS Code reports (not just the one focused in the
 * UI), plus a bounded log of DAP traffic/console output/exceptions per
 * session, so tools can serve real data instead of the "not tracked"
 * placeholders the original DAP tracker stub always returned.
 */
class SessionStore {
    private readonly sessions = new Map<string, SessionRecord>()
    private activeSessionId: string | undefined

    registerSession(session: vscode.DebugSession): void {
        this.evictStaleTerminatedSessions()

        if (!this.sessions.has(session.id)) {
            this.sessions.set(session.id, {
                session,
                startedAt: Date.now(),
                dapLog: new RingBuffer(dapLogCapacity()),
                consoleOutput: new RingBuffer(consoleOutputCapacity()),
                exceptions: new RingBuffer(exceptionCapacity()),
            })
        }
        this.activeSessionId = session.id
    }

    /**
     * Marks a session as terminated but keeps its logs around for
     * terminatedSessionRetentionMs() instead of deleting them immediately.
     */
    unregisterSession(sessionId: string): void {
        const record = this.sessions.get(sessionId)
        if (record) record.terminatedAt = Date.now()

        if (this.activeSessionId === sessionId) {
            this.activeSessionId = undefined
        }
        this.evictStaleTerminatedSessions()
    }

    setActiveSession(sessionId: string | undefined): void {
        if (sessionId === undefined || this.sessions.has(sessionId)) {
            this.activeSessionId = sessionId
        }
    }

    listSessions(): TrackedSession[] {
        this.evictStaleTerminatedSessions()
        return [...this.sessions.values()].map((record) => ({
            session: record.session,
            status: record.terminatedAt ? 'terminated' : 'live',
        }))
    }

    /**
     * Resolves which session a tool call should target: an explicit sessionId
     * wins (including a recently-terminated one, so get-dap-log/
     * get-debug-console/get-exception-info can still read its trailing data),
     * otherwise the session currently focused in the UI, otherwise the only
     * *live* session if there is exactly one. Ambiguous/empty cases return a
     * descriptive error instead of guessing.
     */
    resolveSession(sessionId?: string): { session: vscode.DebugSession } | { error: string } {
        this.evictStaleTerminatedSessions()

        if (sessionId) {
            const record = this.sessions.get(sessionId)
            if (!record) {
                return { error: `No debug session found with id "${sessionId}". Use list-debug-sessions to see active sessions.` }
            }
            return { session: record.session }
        }

        if (this.activeSessionId) {
            const record = this.sessions.get(this.activeSessionId)
            if (record && !record.terminatedAt) return { session: record.session }
        }

        const liveRecords = [...this.sessions.values()].filter((r) => !r.terminatedAt)

        if (liveRecords.length === 1) {
            return { session: liveRecords[0].session }
        }

        if (liveRecords.length === 0) {
            return { error: 'No active debug session' }
        }

        return {
            error: `Multiple debug sessions are active (${liveRecords.length}); specify sessionId. Use list-debug-sessions to see them.`,
        }
    }

    private evictStaleTerminatedSessions(): void {
        const now = Date.now()
        const retentionMs = terminatedSessionRetentionMs()
        for (const [sessionId, record] of this.sessions) {
            if (record.terminatedAt && now - record.terminatedAt > retentionMs) {
                this.sessions.delete(sessionId)
            }
        }
    }

    appendDapMessage(sessionId: string, entry: DapMessageEntry): void {
        this.sessions.get(sessionId)?.dapLog.push(entry)
    }

    appendConsoleOutput(sessionId: string, entry: ConsoleOutputEntry): void {
        this.sessions.get(sessionId)?.consoleOutput.push(entry)
    }

    appendException(sessionId: string, entry: ExceptionEntry): void {
        this.sessions.get(sessionId)?.exceptions.push(entry)
    }

    getDapLog(sessionId: string): DapMessageEntry[] {
        return this.sessions.get(sessionId)?.dapLog.toArray() ?? []
    }

    getConsoleOutput(sessionId: string): ConsoleOutputEntry[] {
        return this.sessions.get(sessionId)?.consoleOutput.toArray() ?? []
    }

    getExceptions(sessionId: string): ExceptionEntry[] {
        return this.sessions.get(sessionId)?.exceptions.toArray() ?? []
    }

    reset(): void {
        this.sessions.clear()
        this.activeSessionId = undefined
    }
}

export const sessionStore = new SessionStore()
