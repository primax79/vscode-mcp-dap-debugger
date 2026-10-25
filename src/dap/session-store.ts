import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { RingBuffer } from '../utils/ring-buffer'
import { resolveWorkspacePath, getRelativePath } from '../utils/path'

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

export type ThreadRunState = 'stopped' | 'running' | 'unknown'
export type SessionRunState = 'stopped' | 'running' | 'terminated' | 'unknown'

export interface ThreadExecutionState {
    threadId: number
    name?: string
    state: ThreadRunState
    reason?: string
    description?: string
    hitBreakpointIds?: number[]
    stoppedAt?: number
}

export interface ExecutionStateSnapshot {
    sessionId: string
    state: SessionRunState
    reason?: string
    description?: string
    hitBreakpointIds?: number[]
    stoppedAt?: number
    lastStoppedThreadId?: number
    threads: ThreadExecutionState[]
}

interface InternalExecutionState {
    state: SessionRunState
    defaultThreadState: ThreadRunState
    reason?: string
    description?: string
    hitBreakpointIds?: number[]
    stoppedAt?: number
    lastStoppedThreadId?: number
    threads: Map<number, ThreadExecutionState>
}

export type BreakpointPolicyMode = 'ide' | 'none' | 'list'
export type BreakpointMechanism = 'rewrite' | 'reapply'

export interface PolicyBreakpointInput {
    file: string
    line: number
    condition?: string
    hitCondition?: string
    logMessage?: string
}

export interface ResolvedPolicyBreakpoint extends PolicyBreakpointInput {
    resolvedPath: string
    normalizedPath: string
}

export interface RequestedBreakpointRecord {
    file: string
    line: number
    condition?: string
    hitCondition?: string
    logMessage?: string
}

export interface VerifiedBreakpointRecord {
    id?: number
    file: string
    requestedLine?: number
    line?: number
    verified: boolean
    message?: string
}

export interface BreakpointPolicyState {
    id: string
    configName: string
    usedStringConfigName: boolean
    mode: BreakpointPolicyMode
    mechanism: BreakpointMechanism
    breakpoints: ResolvedPolicyBreakpoint[]
    rootSession?: vscode.DebugSession
    requestedBySource: Map<string, RequestedBreakpointRecord[]>
    verifiedBySource: Map<string, VerifiedBreakpointRecord[]>
    sentSourcesBySession: Map<string, Set<string>>
    configurationDoneBySession: Set<string>
    inFlightSetBreakpoints: number
    rootSessionWaiters: Array<(session: vscode.DebugSession) => void>
    settleListeners: Array<() => void>
}

export function normalizePathForComparison(filePath: string): string {
    const resolved = path.resolve(filePath)
    let canonical = resolved
    try {
        canonical = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved)
    } catch {
        canonical = resolved
    }
    return process.platform === 'win32' || process.platform === 'darwin'
        ? canonical.toLowerCase()
        : canonical
}

interface SessionRecord {
    session: vscode.DebugSession
    startedAt: number
    terminatedAt?: number
    dapLog: RingBuffer<DapMessageEntry>
    consoleOutput: RingBuffer<ConsoleOutputEntry>
    exceptions: RingBuffer<ExceptionEntry>
    execution: InternalExecutionState
    breakpointsBySource: Map<string, Map<number, { file: string; line: number }>>
}

export interface TrackedSession {
    session: vscode.DebugSession
    status: 'live' | 'terminated'
}

function config() {
    return vscode.workspace.getConfiguration('vscodeMcpDapDebugger')
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
    private readonly policies = new Map<string, BreakpointPolicyState>()
    private readonly sessionPolicyMap = new Map<string, BreakpointPolicyState>()
    private readonly consoleSubscribers = new Map<string, Set<(entry: ConsoleOutputEntry) => void>>()
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
                execution: {
                    state: 'running',
                    defaultThreadState: 'running',
                    threads: new Map(),
                },
                breakpointsBySource: new Map(),
            })
        }
        this.activeSessionId = session.id
        this.bindSessionToPolicy(session)
    }

    /**
     * Marks a session as terminated but keeps its logs around for
     * terminatedSessionRetentionMs() instead of deleting them immediately.
     */
    unregisterSession(sessionId: string): void {
        const record = this.sessions.get(sessionId)
        if (record) {
            record.terminatedAt = Date.now()
            record.execution.state = 'terminated'
            record.execution.defaultThreadState = 'unknown'
            record.execution.lastStoppedThreadId = undefined
        }

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
                this.sessionPolicyMap.delete(sessionId)
            }
        }
    }

    // --- Breakpoint Policy & Session Correlation ---

    createBreakpointPolicy(options: {
        configName: string
        usedStringConfigName: boolean
        mode: BreakpointPolicyMode
        mechanism: BreakpointMechanism
        breakpoints?: PolicyBreakpointInput[]
    }): BreakpointPolicyState {
        const id = crypto.randomUUID()
        const resolvedBreakpoints: ResolvedPolicyBreakpoint[] = (options.breakpoints ?? []).map((bp) => {
            const resolvedPath = resolveWorkspacePath(bp.file)
            return {
                ...bp,
                resolvedPath,
                normalizedPath: normalizePathForComparison(resolvedPath),
            }
        })

        const policy: BreakpointPolicyState = {
            id,
            configName: options.configName,
            usedStringConfigName: options.usedStringConfigName,
            mode: options.mode,
            mechanism: options.mechanism,
            breakpoints: resolvedBreakpoints,
            requestedBySource: new Map(),
            verifiedBySource: new Map(),
            sentSourcesBySession: new Map(),
            configurationDoneBySession: new Set(),
            inFlightSetBreakpoints: 0,
            rootSessionWaiters: [],
            settleListeners: [],
        }

        this.policies.set(id, policy)
        return policy
    }

    removeBreakpointPolicy(policyId: string): void {
        this.policies.delete(policyId)
    }

    bindSessionToPolicy(session: vscode.DebugSession): BreakpointPolicyState | undefined {
        const existing = this.sessionPolicyMap.get(session.id)
        if (existing) {
            if (!session.parentSession && !existing.rootSession) {
                this.setPolicyRootSession(existing, session)
            }
            return existing
        }

        const explicitPolicyId = session.configuration?.__mcpDapPolicyId
        if (typeof explicitPolicyId === 'string') {
            const policy = this.policies.get(explicitPolicyId)
            if (policy) {
                this.sessionPolicyMap.set(session.id, policy)
                if (!session.parentSession && !policy.rootSession) {
                    this.setPolicyRootSession(policy, session)
                }
                return policy
            }
        }

        // Child sessions (e.g. pwa-node workers) inherit the policy from their ancestor chain.
        let parent = session.parentSession
        while (parent) {
            const parentPolicy =
                this.sessionPolicyMap.get(parent.id) ??
                (typeof parent.configuration?.__mcpDapPolicyId === 'string'
                    ? this.policies.get(parent.configuration.__mcpDapPolicyId)
                    : undefined)
            if (parentPolicy) {
                this.sessionPolicyMap.set(session.id, parentPolicy)
                return parentPolicy
            }
            parent = parent.parentSession
        }

        // Root session started by name (no overrides / default "ide" breakpoints).
        if (!session.parentSession) {
            let fallbackCandidate: BreakpointPolicyState | undefined
            for (const policy of this.policies.values()) {
                if (!policy.usedStringConfigName || policy.rootSession) continue
                if (
                    policy.configName === session.name ||
                    policy.configName === session.configuration?.name
                ) {
                    this.sessionPolicyMap.set(session.id, policy)
                    this.setPolicyRootSession(policy, session)
                    return policy
                }
                if (!fallbackCandidate) {
                    fallbackCandidate = policy
                }
            }
            if (fallbackCandidate) {
                this.sessionPolicyMap.set(session.id, fallbackCandidate)
                this.setPolicyRootSession(fallbackCandidate, session)
                return fallbackCandidate
            }
        }

        return undefined
    }

    getSessionPolicy(sessionId: string): BreakpointPolicyState | undefined {
        return this.sessionPolicyMap.get(sessionId)
    }

    private setPolicyRootSession(policy: BreakpointPolicyState, session: vscode.DebugSession): void {
        policy.rootSession = session
        const waiters = policy.rootSessionWaiters.splice(0, policy.rootSessionWaiters.length)
        for (const resolve of waiters) {
            resolve(session)
        }
    }

    waitForPolicyRootSession(policyId: string, timeoutMs = 15_000): Promise<vscode.DebugSession | undefined> {
        const policy = this.policies.get(policyId)
        if (!policy) return Promise.resolve(undefined)
        if (policy.rootSession) return Promise.resolve(policy.rootSession)

        return new Promise<vscode.DebugSession | undefined>((resolve) => {
            let settled = false
            const onSession = (session: vscode.DebugSession) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                resolve(session)
            }
            const timer = setTimeout(() => {
                if (settled) return
                settled = true
                const idx = policy.rootSessionWaiters.indexOf(onSession)
                if (idx !== -1) policy.rootSessionWaiters.splice(idx, 1)
                resolve(undefined)
            }, timeoutMs)

            policy.rootSessionWaiters.push(onSession)
        })
    }

    notifyPolicyActivity(policy: BreakpointPolicyState): void {
        for (const listener of [...policy.settleListeners]) {
            listener()
        }
    }

    waitForPolicyBreakpointsSettled(policyId: string, maxWaitMs = 1200, quietWindowMs = 150): Promise<void> {
        const policy = this.policies.get(policyId)
        if (!policy) return Promise.resolve()

        return new Promise<void>((resolve) => {
            let done = false
            let quietTimer: ReturnType<typeof setTimeout> | undefined

            const finish = () => {
                if (done) return
                done = true
                if (quietTimer) clearTimeout(quietTimer)
                clearTimeout(maxTimer)
                const idx = policy.settleListeners.indexOf(check)
                if (idx !== -1) policy.settleListeners.splice(idx, 1)
                resolve()
            }

            const check = () => {
                if (done) return
                if (quietTimer) {
                    clearTimeout(quietTimer)
                    quietTimer = undefined
                }
                if (policy.configurationDoneBySession.size > 0 && policy.inFlightSetBreakpoints <= 0) {
                    quietTimer = setTimeout(finish, quietWindowMs)
                }
            }

            const maxTimer = setTimeout(finish, maxWaitMs)
            policy.settleListeners.push(check)
            check()
        })
    }

    getPolicyRequestedBreakpoints(policyId: string): RequestedBreakpointRecord[] {
        const policy = this.policies.get(policyId)
        if (!policy) return []
        const result: RequestedBreakpointRecord[] = []
        for (const list of policy.requestedBySource.values()) {
            result.push(...list)
        }
        return result
    }

    getPolicyVerifiedBreakpoints(policyId: string): VerifiedBreakpointRecord[] {
        const policy = this.policies.get(policyId)
        if (!policy) return []
        const result: VerifiedBreakpointRecord[] = []
        for (const list of policy.verifiedBySource.values()) {
            result.push(...list)
        }
        return result
    }

    // --- Per-session, per-source Breakpoint ID Map ---

    setSourceBreakpointsMap(
        sessionId: string,
        sourcePath: string,
        entries: Array<{ id: number; file: string; line: number }>
    ): void {
        const record = this.sessions.get(sessionId)
        if (!record) return
        const key = normalizePathForComparison(sourcePath)
        const map = new Map<number, { file: string; line: number }>()
        for (const entry of entries) {
            map.set(entry.id, { file: entry.file, line: entry.line })
        }
        record.breakpointsBySource.set(key, map)
    }

    updateBreakpointIdEntry(
        sessionId: string,
        sourcePath: string | undefined,
        entry: { id: number; file?: string; line?: number }
    ): void {
        const record = this.sessions.get(sessionId)
        if (!record) return

        for (const sourceMap of record.breakpointsBySource.values()) {
            const existing = sourceMap.get(entry.id)
            if (existing) {
                sourceMap.set(entry.id, {
                    file: entry.file ?? existing.file,
                    line: entry.line ?? existing.line,
                })
                return
            }
        }

        if (sourcePath && entry.line !== undefined) {
            const key = normalizePathForComparison(sourcePath)
            let sourceMap = record.breakpointsBySource.get(key)
            if (!sourceMap) {
                sourceMap = new Map()
                record.breakpointsBySource.set(key, sourceMap)
            }
            sourceMap.set(entry.id, {
                file: entry.file ?? getRelativePath(sourcePath),
                line: entry.line,
            })
        }
    }

    lookupBreakpointById(sessionId: string, breakpointId: number): { file: string; line: number } | undefined {
        const visited = new Set<string>()
        let currentId: string | undefined = sessionId

        while (currentId && !visited.has(currentId)) {
            visited.add(currentId)
            const record = this.sessions.get(currentId)
            if (!record) break

            for (const sourceMap of record.breakpointsBySource.values()) {
                const found = sourceMap.get(breakpointId)
                if (found) return found
            }

            currentId = record.session.parentSession?.id
        }

        return undefined
    }

    // --- Execution State Tracking ---

    private recomputeSessionExecutionState(exec: InternalExecutionState): void {
        if (exec.state === 'terminated') return

        let latestStopped: ThreadExecutionState | undefined
        for (const thread of exec.threads.values()) {
            if (thread.state === 'stopped') {
                if (!latestStopped || (thread.stoppedAt ?? 0) >= (latestStopped.stoppedAt ?? 0)) {
                    latestStopped = thread
                }
            }
        }

        if (latestStopped) {
            exec.state = 'stopped'
            if (
                exec.lastStoppedThreadId === undefined ||
                exec.threads.get(exec.lastStoppedThreadId)?.state !== 'stopped'
            ) {
                exec.lastStoppedThreadId = latestStopped.threadId
            }
        } else if (exec.defaultThreadState === 'stopped') {
            exec.state = 'stopped'
        } else {
            exec.state = 'running'
            exec.lastStoppedThreadId = undefined
            exec.reason = undefined
            exec.description = undefined
            exec.hitBreakpointIds = undefined
            exec.stoppedAt = undefined
        }
    }

    onStoppedEvent(sessionId: string, body: any): void {
        const record = this.sessions.get(sessionId)
        if (!record) return

        const exec = record.execution
        const now = Date.now()
        const threadId: number | undefined = typeof body?.threadId === 'number' ? body.threadId : undefined
        const allThreadsStopped = Boolean(body?.allThreadsStopped)
        const reason: string | undefined = typeof body?.reason === 'string' ? body.reason : undefined
        const description: string | undefined =
            typeof body?.description === 'string'
                ? body.description
                : typeof body?.text === 'string'
                  ? body.text
                  : undefined
        const hitBreakpointIds: number[] | undefined = Array.isArray(body?.hitBreakpointIds)
            ? body.hitBreakpointIds.filter((id: unknown): id is number => typeof id === 'number')
            : undefined

        exec.state = 'stopped'
        exec.reason = reason
        exec.description = description
        exec.hitBreakpointIds = hitBreakpointIds
        exec.stoppedAt = now

        if (allThreadsStopped || threadId === undefined) {
            exec.defaultThreadState = 'stopped'
            for (const thread of exec.threads.values()) {
                thread.state = 'stopped'
                thread.reason = reason
                thread.description = description
                thread.stoppedAt = now
                thread.hitBreakpointIds = undefined
            }
        }

        if (threadId !== undefined) {
            const existing = exec.threads.get(threadId)
            exec.threads.set(threadId, {
                threadId,
                name: existing?.name,
                state: 'stopped',
                reason,
                description,
                hitBreakpointIds,
                stoppedAt: now,
            })
            exec.lastStoppedThreadId = threadId
        }
    }

    onContinuedEvent(sessionId: string, body: any): void {
        const record = this.sessions.get(sessionId)
        if (!record) return

        const exec = record.execution
        const threadId: number | undefined = typeof body?.threadId === 'number' ? body.threadId : undefined
        const allThreadsContinued =
            body?.allThreadsContinued !== undefined ? Boolean(body.allThreadsContinued) : true

        if (allThreadsContinued || threadId === undefined) {
            this.markAllThreadsRunning(exec)
        } else {
            this.markSingleThreadRunning(exec, threadId)
        }
    }

    onContinueResponse(sessionId: string, body: any): void {
        const record = this.sessions.get(sessionId)
        if (!record) return

        const exec = record.execution
        // Per DAP specification, if allThreadsContinued is omitted or true on a
        // continue response, all threads have resumed.
        if (body?.allThreadsContinued !== false) {
            this.markAllThreadsRunning(exec)
        }
    }

    onExecutionRequest(sessionId: string, command: string, args: any): void {
        const record = this.sessions.get(sessionId)
        if (!record) return

        const exec = record.execution
        const threadId: number | undefined = typeof args?.threadId === 'number' ? args.threadId : undefined

        if (threadId !== undefined) {
            this.markSingleThreadRunning(exec, threadId)
        } else if (command === 'continue') {
            this.markAllThreadsRunning(exec)
        }
    }

    onThreadEvent(sessionId: string, body: any): void {
        const record = this.sessions.get(sessionId)
        if (!record) return

        const exec = record.execution
        const threadId: number | undefined = typeof body?.threadId === 'number' ? body.threadId : undefined
        const reason: string | undefined = body?.reason
        if (threadId === undefined) return

        if (reason === 'exited') {
            exec.threads.delete(threadId)
            this.recomputeSessionExecutionState(exec)
        } else if (reason === 'started') {
            if (!exec.threads.has(threadId)) {
                exec.threads.set(threadId, {
                    threadId,
                    state: exec.defaultThreadState,
                    ...(exec.defaultThreadState === 'stopped'
                        ? {
                              reason: exec.reason,
                              description: exec.description,
                              stoppedAt: exec.stoppedAt,
                          }
                        : {}),
                })
            }
        }
    }

    onThreadsResponse(sessionId: string, body: any): void {
        const record = this.sessions.get(sessionId)
        if (!record || !Array.isArray(body?.threads)) return

        const exec = record.execution
        for (const t of body.threads) {
            if (typeof t?.id !== 'number') continue
            const existing = exec.threads.get(t.id)
            if (existing) {
                if (typeof t.name === 'string') existing.name = t.name
            } else {
                exec.threads.set(t.id, {
                    threadId: t.id,
                    name: typeof t.name === 'string' ? t.name : undefined,
                    state: exec.defaultThreadState,
                    ...(exec.defaultThreadState === 'stopped'
                        ? {
                              reason: exec.reason,
                              description: exec.description,
                              stoppedAt: exec.stoppedAt,
                          }
                        : {}),
                })
            }
        }
    }

    onTerminatedOrExitedEvent(sessionId: string): void {
        const record = this.sessions.get(sessionId)
        if (!record) return

        record.execution.state = 'terminated'
        record.execution.defaultThreadState = 'unknown'
        record.execution.lastStoppedThreadId = undefined
        for (const thread of record.execution.threads.values()) {
            thread.state = 'unknown'
        }
    }

    private markAllThreadsRunning(exec: InternalExecutionState): void {
        exec.state = 'running'
        exec.defaultThreadState = 'running'
        exec.reason = undefined
        exec.description = undefined
        exec.hitBreakpointIds = undefined
        exec.stoppedAt = undefined
        exec.lastStoppedThreadId = undefined
        for (const thread of exec.threads.values()) {
            thread.state = 'running'
            thread.reason = undefined
            thread.description = undefined
            thread.hitBreakpointIds = undefined
            thread.stoppedAt = undefined
        }
    }

    private markSingleThreadRunning(exec: InternalExecutionState, threadId: number): void {
        const existing = exec.threads.get(threadId)
        if (existing) {
            existing.state = 'running'
            existing.reason = undefined
            existing.description = undefined
            existing.hitBreakpointIds = undefined
            existing.stoppedAt = undefined
        } else {
            exec.threads.set(threadId, {
                threadId,
                state: 'running',
            })
        }
        this.recomputeSessionExecutionState(exec)
    }

    getExecutionState(sessionId: string): ExecutionStateSnapshot | undefined {
        const record = this.sessions.get(sessionId)
        if (!record) return undefined

        const exec = record.execution
        return {
            sessionId,
            state: exec.state,
            reason: exec.reason,
            description: exec.description,
            hitBreakpointIds: exec.hitBreakpointIds ? [...exec.hitBreakpointIds] : undefined,
            stoppedAt: exec.stoppedAt,
            lastStoppedThreadId: exec.lastStoppedThreadId,
            threads: [...exec.threads.values()].map((t) => ({
                ...t,
                hitBreakpointIds: t.hitBreakpointIds ? [...t.hitBreakpointIds] : undefined,
            })),
        }
    }

    getThreadExecutionState(sessionId: string, threadId: number): ThreadExecutionState | undefined {
        const record = this.sessions.get(sessionId)
        if (!record) return undefined

        const exec = record.execution
        const override = exec.threads.get(threadId)
        if (override) {
            return {
                ...override,
                hitBreakpointIds: override.hitBreakpointIds ? [...override.hitBreakpointIds] : undefined,
            }
        }

        return {
            threadId,
            state: exec.defaultThreadState,
            ...(exec.defaultThreadState === 'stopped'
                ? {
                      reason: exec.reason,
                      description: exec.description,
                      hitBreakpointIds:
                          exec.lastStoppedThreadId === undefined && exec.hitBreakpointIds
                              ? [...exec.hitBreakpointIds]
                              : undefined,
                      stoppedAt: exec.stoppedAt,
                  }
                : {}),
        }
    }

    getMostRecentlyStoppedThread(sessionId: string): ThreadExecutionState | undefined {
        const record = this.sessions.get(sessionId)
        if (!record) return undefined

        const exec = record.execution
        if (exec.lastStoppedThreadId !== undefined) {
            const candidate = exec.threads.get(exec.lastStoppedThreadId)
            if (candidate && candidate.state === 'stopped') {
                return {
                    ...candidate,
                    hitBreakpointIds: candidate.hitBreakpointIds ? [...candidate.hitBreakpointIds] : undefined,
                }
            }
        }

        let best: ThreadExecutionState | undefined
        for (const thread of exec.threads.values()) {
            if (thread.state === 'stopped') {
                if (!best || (thread.stoppedAt ?? 0) >= (best.stoppedAt ?? 0)) {
                    best = thread
                }
            }
        }

        return best
            ? {
                  ...best,
                  hitBreakpointIds: best.hitBreakpointIds ? [...best.hitBreakpointIds] : undefined,
              }
            : undefined
    }

    appendDapMessage(sessionId: string, entry: DapMessageEntry): void {
        this.sessions.get(sessionId)?.dapLog.push(entry)
    }

    appendConsoleOutput(sessionId: string, entry: ConsoleOutputEntry): void {
        this.sessions.get(sessionId)?.consoleOutput.push(entry)
        const listeners = this.consoleSubscribers.get(sessionId)
        if (listeners) {
            for (const cb of [...listeners]) {
                try {
                    cb(entry)
                } catch {
                    // Ignore subscriber errors so console tracking is never disrupted.
                }
            }
        }
    }

    subscribeConsoleOutput(sessionId: string, cb: (entry: ConsoleOutputEntry) => void): () => void {
        let listeners = this.consoleSubscribers.get(sessionId)
        if (!listeners) {
            listeners = new Set()
            this.consoleSubscribers.set(sessionId, listeners)
        }
        listeners.add(cb)
        return () => {
            const set = this.consoleSubscribers.get(sessionId)
            if (!set) return
            set.delete(cb)
            if (set.size === 0) {
                this.consoleSubscribers.delete(sessionId)
            }
        }
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
        this.policies.clear()
        this.sessionPolicyMap.clear()
        this.activeSessionId = undefined
    }
}

export const sessionStore = new SessionStore()

export function getExecutionState(sessionId: string): ExecutionStateSnapshot | undefined {
    return sessionStore.getExecutionState(sessionId)
}

export function getMostRecentlyStoppedThread(sessionId: string): ThreadExecutionState | undefined {
    return sessionStore.getMostRecentlyStoppedThread(sessionId)
}

export function subscribeConsoleOutput(
    sessionId: string,
    cb: (entry: ConsoleOutputEntry) => void
): () => void {
    return sessionStore.subscribeConsoleOutput(sessionId, cb)
}
