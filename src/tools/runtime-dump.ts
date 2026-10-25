import * as vscode from 'vscode'
import * as crypto from 'crypto'
import { inputSchemas } from './schemas'
import { ok, err, withErrorHandling, requireSession } from './shared'
import { sessionStore } from '../dap/session-store'

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_CHARS = 25_000
const HARD_MAX_CHARS = 29_000

const DEFAULT_MAX_THREADS = 100
const DEFAULT_MAX_THREAD_FRAMES = 50

const DEFAULT_MAX_TASKS = 200
const DEFAULT_MAX_TASK_FRAMES = 20

const PYTHON_SESSION_TYPES = new Set(['debugpy', 'python'])

function isPythonSession(session: vscode.DebugSession): boolean {
    return PYTHON_SESSION_TYPES.has((session.type ?? '').toLowerCase())
}

function clampInt(value: number | undefined, defaultValue: number, minValue: number, maxValue: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return defaultValue
    return Math.max(minValue, Math.min(maxValue, Math.trunc(value)))
}

export function buildPythonDumpThreadsSnippet(options: {
    nonce: string
    maxThreads: number
    maxFrames: number
    includeDebuggerThreads: boolean
}): string {
    const nonceLiteral = JSON.stringify(options.nonce)
    const maxThreadsLiteral = Math.max(1, Math.trunc(options.maxThreads))
    const maxFramesLiteral = Math.max(1, Math.trunc(options.maxFrames))
    const includeDebuggerLiteral = options.includeDebuggerThreads ? 'True' : 'False'

    return [
        'import sys as _sys, threading as _threading, traceback as _traceback, json as _json, base64 as _base64',
        `_nonce = ${nonceLiteral}`,
        `_max_threads = ${maxThreadsLiteral}`,
        `_max_frames = ${maxFramesLiteral}`,
        `_include_dbg = ${includeDebuggerLiteral}`,
        '_frames_by_id = _sys._current_frames()',
        '_threads_by_id = {}',
        'for _t in _threading.enumerate():',
        '    if _t.ident is not None:',
        '        _threads_by_id[_t.ident] = _t',
        '_all_ids = list(_frames_by_id.keys())',
        'for _tid in _threads_by_id:',
        '    if _tid not in _frames_by_id:',
        '        _all_ids.append(_tid)',
        '_entries = []',
        '_dbg_skipped = 0',
        'for _tid in _all_ids:',
        '    _t = _threads_by_id.get(_tid)',
        '    _name = _t.name if _t is not None else None',
        '    _daemon = bool(_t.daemon) if _t is not None else None',
        "    _cls_mod = getattr(_t.__class__, '__module__', '') if _t is not None else ''",
        '    _f = _frames_by_id.get(_tid)',
        '    _is_dbg = bool(',
        "        (_name and _name.startswith('pydevd'))",
        "        or ('pydevd' in _cls_mod)",
        "        or ('debugpy' in _cls_mod)",
        '    )',
        '    if not _is_dbg and _t is None and _f is not None:',
        '        _cur = _f',
        '        _steps = 0',
        '        while _cur is not None and _steps < 60:',
        "            _fn = _cur.f_code.co_filename or ''",
        "            if 'pydevd' in _fn or 'debugpy' in _fn:",
        '                _is_dbg = True',
        '                break',
        '            _cur = _cur.f_back',
        '            _steps += 1',
        '    if _is_dbg and not _include_dbg:',
        '        _dbg_skipped += 1',
        '        continue',
        '    _raw_frames = []',
        '    _trunc_frames = 0',
        '    if _f is not None:',
        '        _full_stack = _traceback.extract_stack(_f)',
        '        if len(_full_stack) > _max_frames:',
        '            _trunc_frames = len(_full_stack) - _max_frames',
        '            _full_stack = _full_stack[-_max_frames:]',
        '        for _fs in _full_stack:',
        '            _raw_frames.append({',
        "                'file': _fs.filename,",
        "                'line': _fs.lineno,",
        "                'function': _fs.name,",
        "                'code': _fs.line,",
        '            })',
        '    _entries.append({',
        "        'ident': _tid,",
        "        'name': _name,",
        "        'daemon': _daemon,",
        "        'isDebuggerThread': _is_dbg,",
        "        'frames': _raw_frames,",
        "        'truncatedFrames': _trunc_frames,",
        '    })',
        '_trunc_threads = 0',
        'if len(_entries) > _max_threads:',
        '    _trunc_threads = len(_entries) - _max_threads',
        '    _entries = _entries[:_max_threads]',
        '_payload = {',
        "    'pythonVersion': _sys.version,",
        "    'totalThreads': len(_entries) + _trunc_threads,",
        "    'debuggerThreadsExcluded': _dbg_skipped,",
        "    'truncatedThreads': _trunc_threads,",
        "    'threads': _entries,",
        '}',
        "_encoded = _base64.b64encode(_json.dumps(_payload).encode('utf-8')).decode('ascii')",
        "_sys.stdout.write('<<MCPDAP:' + _nonce + ':BEGIN>>' + _encoded + '<<MCPDAP:' + _nonce + ':END>>\\n')",
        '_sys.stdout.flush()',
    ].join('\n')
}

export function buildPythonDumpAsyncioTasksSnippet(options: {
    nonce: string
    maxTasks: number
    maxFrames: number
}): string {
    const nonceLiteral = JSON.stringify(options.nonce)
    const maxTasksLiteral = Math.max(1, Math.trunc(options.maxTasks))
    const maxFramesLiteral = Math.max(1, Math.trunc(options.maxFrames))

    return [
        'import sys as _sys, asyncio as _asyncio, json as _json, base64 as _base64',
        `_nonce = ${nonceLiteral}`,
        `_max_tasks = ${maxTasksLiteral}`,
        `_max_frames = ${maxFramesLiteral}`,
        "_at = getattr(_asyncio, 'tasks', None)",
        'if _at is None:',
        '    import asyncio.tasks as _at',
        '_vi = _sys.version_info[:2]',
        "_has_312 = hasattr(_at, '_scheduled_tasks') or hasattr(_at, '_eager_tasks')",
        "_has_legacy = hasattr(_at, '_all_tasks')",
        'if not _has_312 and not _has_legacy:',
        '    _payload = {',
        "        'supported': False,",
        "        'pythonVersion': _sys.version,",
        "        'error': 'Unsupported CPython asyncio task registry on Python ' + _sys.version,",
        '    }',
        'else:',
        '    _raw_tasks = []',
        '    _snap_ok = False',
        '    for _attempt in range(5):',
        '        try:',
        '            if _vi >= (3, 12) and _has_312:',
        "                _sched = list(getattr(_at, '_scheduled_tasks', ()))",
        "                _eager = list(getattr(_at, '_eager_tasks', ()))",
        '                _seen = set()',
        '                _raw_tasks = []',
        '                for _tsk in _sched + _eager:',
        '                    if id(_tsk) not in _seen:',
        '                        _seen.add(id(_tsk))',
        '                        _raw_tasks.append(_tsk)',
        '            elif _has_legacy:',
        "                _raw_tasks = list(getattr(_at, '_all_tasks', ()))",
        '            else:',
        "                _sched = list(getattr(_at, '_scheduled_tasks', ()))",
        "                _eager = list(getattr(_at, '_eager_tasks', ()))",
        '                _raw_tasks = _sched + _eager',
        '            _snap_ok = True',
        '            break',
        '        except RuntimeError:',
        '            continue',
        '    if not _snap_ok:',
        '        _payload = {',
        "            'supported': False,",
        "            'pythonVersion': _sys.version,",
        "            'error': 'Failed to snapshot asyncio tasks after 5 retries (set changed size during iteration)',",
        '        }',
        '    else:',
        '        def _type_qualname(_obj):',
        '            if _obj is None:',
        '                return None',
        '            _cls = type(_obj)',
        "            _mod = getattr(_cls, '__module__', None)",
        "            _qn = getattr(_cls, '__qualname__', getattr(_cls, '__name__', 'object'))",
        "            if _mod and _mod not in ('builtins', '__main__'):",
        "                return _mod + '.' + _qn",
        '            return _qn',
        '',
        '        def _frame_loc(_fr):',
        '            if _fr is None:',
        '                return None',
        "            _code = getattr(_fr, 'f_code', None)",
        '            if _code is None:',
        '                return None',
        '            return {',
        "                'file': getattr(_code, 'co_filename', None),",
        "                'line': getattr(_fr, 'f_lineno', None),",
        "                'function': getattr(_code, 'co_name', None),",
        '            }',
        '',
        '        def _coro_frame(_obj):',
        "            for _attr in ('cr_frame', 'gi_frame', 'ag_frame'):",
        '                _fr = getattr(_obj, _attr, None)',
        '                if _fr is not None:',
        '                    return _fr',
        '            return None',
        '',
        '        def _next_awaited(_obj):',
        "            for _attr in ('cr_await', 'gi_yieldfrom', 'ag_await'):",
        '                _nxt = getattr(_obj, _attr, None)',
        '                if _nxt is not None:',
        '                    return _nxt',
        '            return None',
        '',
        '        _total_tasks = len(_raw_tasks)',
        '        _trunc_tasks = 0',
        '        if len(_raw_tasks) > _max_tasks:',
        '            _trunc_tasks = len(_raw_tasks) - _max_tasks',
        '            _raw_tasks = _raw_tasks[:_max_tasks]',
        '',
        '        _loops = {}',
        '        _trunc_frames_total = 0',
        '        for _t in _raw_tasks:',
        '            try:',
        '                _loop = _t.get_loop()',
        '            except Exception:',
        '                _loop = None',
        '            _lid = id(_loop) if _loop is not None else 0',
        '            if _lid not in _loops:',
        '                _loops[_lid] = {',
        "                    'loopId': _lid if _loop is not None else None,",
        "                    'isRunning': bool(_loop.is_running()) if _loop is not None else False,",
        "                    'isClosed': bool(_loop.is_closed()) if _loop is not None else False,",
        "                    'tasks': [],",
        '                }',
        '            try:',
        '                _tname = _t.get_name()',
        '            except Exception:',
        '                _tname = None',
        '            try:',
        '                _coro = _t.get_coro()',
        '            except Exception:',
        "                _coro = getattr(_t, '_coro', None)",
        "            _coro_qn = getattr(_coro, '__qualname__', None) or _type_qualname(_coro)",
        '            try:',
        '                _is_done = bool(_t.done())',
        '            except Exception:',
        '                _is_done = None',
        '            try:',
        '                _is_cancelled = bool(_t.cancelled())',
        '            except Exception:',
        '                _is_cancelled = None',
        '            _top_frame = _frame_loc(_coro_frame(_coro)) if _coro is not None else None',
        '            _chain = []',
        '            _cur = _next_awaited(_coro) if _coro is not None else None',
        '            _seen_chain = set()',
        '            _depth = 0',
        '            _task_trunc_frames = 0',
        '            while _cur is not None and id(_cur) not in _seen_chain:',
        '                _seen_chain.add(id(_cur))',
        '                if _depth >= _max_frames:',
        '                    _task_trunc_frames += 1',
        '                else:',
        '                    _c_fr = _frame_loc(_coro_frame(_cur))',
        '                    _chain.append({',
        "                        'type': _type_qualname(_cur),",
        "                        'qualname': getattr(_cur, '__qualname__', None),",
        "                        'frame': _c_fr,",
        '                    })',
        '                _cur = _next_awaited(_cur)',
        '                _depth += 1',
        '            _trunc_frames_total += _task_trunc_frames',
        "            _fw = getattr(_t, '_fut_waiter', None)",
        '            _fw_info = None',
        '            if _fw is not None:',
        "                _fw_state = getattr(_fw, '_state', None)",
        '                _fw_info = {',
        "                    'type': _type_qualname(_fw),",
        "                    'state': _fw_state if isinstance(_fw_state, str) else None,",
        "                    'id': id(_fw),",
        '                }',
        "            _loops[_lid]['tasks'].append({",
        "                'id': id(_t),",
        "                'name': _tname if isinstance(_tname, str) else None,",
        "                'coroQualname': _coro_qn if isinstance(_coro_qn, str) else None,",
        "                'done': _is_done,",
        "                'cancelled': _is_cancelled,",
        "                'frame': _top_frame,",
        "                'awaitChain': _chain,",
        "                'truncatedAwaitChain': _task_trunc_frames,",
        "                'futWaiter': _fw_info,",
        '            })',
        '        _payload = {',
        "            'supported': True,",
        "            'pythonVersion': _sys.version,",
        "            'totalTasks': _total_tasks,",
        "            'truncatedTasks': _trunc_tasks,",
        "            'truncatedFrames': _trunc_frames_total,",
        "            'loops': list(_loops.values()),",
        '        }',
        "_encoded = _base64.b64encode(_json.dumps(_payload).encode('utf-8')).decode('ascii')",
        "_sys.stdout.write('<<MCPDAP:' + _nonce + ':BEGIN>>' + _encoded + '<<MCPDAP:' + _nonce + ':END>>\\n')",
        '_sys.stdout.flush()',
    ].join('\n')
}

async function runPythonSnippetViaEvaluate<T>(
    session: vscode.DebugSession,
    nonce: string,
    snippet: string,
    timeoutMs: number
): Promise<{ data: T } | { error: string }> {
    const beginMarker = `<<MCPDAP:${nonce}:BEGIN>>`
    const endMarker = `<<MCPDAP:${nonce}:END>>`
    let buffer = ''

    return new Promise<{ data: T } | { error: string }>((resolve) => {
        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined

        const finish = (outcome: { data: T } | { error: string }) => {
            if (settled) return
            settled = true
            if (timer) clearTimeout(timer)
            unsubscribe()
            resolve(outcome)
        }

        const tryExtract = () => {
            const startIdx = buffer.indexOf(beginMarker)
            if (startIdx === -1) return
            const payloadStart = startIdx + beginMarker.length
            const endIdx = buffer.indexOf(endMarker, payloadStart)
            if (endIdx === -1) return

            const base64Block = buffer.slice(payloadStart, endIdx).replace(/\s+/g, '')
            try {
                const decoded = Buffer.from(base64Block, 'base64').toString('utf8')
                const parsed = JSON.parse(decoded) as T
                finish({ data: parsed })
            } catch (parseErr: any) {
                finish({
                    error: `Failed to decode runtime dump payload from debugpy stdout: ${parseErr?.message ?? String(parseErr)}`,
                })
            }
        }

        const unsubscribe = sessionStore.subscribeConsoleOutput(session.id, (entry) => {
            if (typeof entry.output !== 'string' || entry.output.length === 0) return
            buffer += entry.output
            tryExtract()
        })

        timer = setTimeout(() => {
            finish({
                error:
                    `Timed out after ${timeoutMs}ms waiting for runtime dump output from session "${session.id}". ` +
                    'debugpy schedules frameless evaluate requests on a traced application thread, which can be delayed if all Python threads are blocked in native/C calls without acquiring the GIL; pass a larger timeoutMs or pause the session first.',
            })
        }, timeoutMs)

        // Note: frameId is intentionally omitted so debugpy executes the snippet with exec()
        // semantics in a debugger-owned frame without requiring a DAP pause.
        Promise.resolve(
            session.customRequest('evaluate', {
                expression: snippet,
                context: 'repl',
            })
        ).then(
            () => {
                // Output event may already have arrived or may arrive right after evaluate resolves.
                tryExtract()
            },
            (evalErr: any) => {
                finish({
                    error: `DAP evaluate request failed: ${evalErr?.message ?? String(evalErr)}`,
                })
            }
        )
    })
}

interface PythonThreadFrame {
    file: string
    line: number
    function: string
    code: string | null
}

interface PythonThreadEntry {
    ident: number
    name: string | null
    daemon: boolean | null
    isDebuggerThread: boolean
    frames: PythonThreadFrame[]
    truncatedFrames?: number
}

interface RawPythonThreadsPayload {
    pythonVersion: string
    totalThreads: number
    debuggerThreadsExcluded: number
    truncatedThreads: number
    threads: PythonThreadEntry[]
}

function fitThreadsPayloadToMaxChars<
    TThread extends { frames?: unknown[] }
>(
    buildEnvelope: (threads: TThread[], truncated: { threads: number; frames: number }) => Record<string, unknown>,
    initialThreads: TThread[],
    initialTruncatedThreads: number,
    initialTruncatedFrames: number,
    maxChars: number
): Record<string, unknown> {
    const threads = initialThreads.map((t) => ({
        ...t,
        ...(Array.isArray(t.frames) ? { frames: [...t.frames] } : {}),
    }))
    let truncatedThreads = initialTruncatedThreads
    let truncatedFrames = initialTruncatedFrames

    let result = buildEnvelope(threads, { threads: truncatedThreads, frames: truncatedFrames })
    if (JSON.stringify(result, null, 2).length <= maxChars) {
        return result
    }

    // First drop outermost frames from the longest thread stacks (keeping innermost frames at the end
    // for python mode or top frames for dap mode).
    while (JSON.stringify(result, null, 2).length > maxChars) {
        let longestIdx = -1
        let longestLen = 1
        for (let i = 0; i < threads.length; i++) {
            const fLen = Array.isArray(threads[i].frames) ? threads[i].frames!.length : 0
            if (fLen > longestLen) {
                longestLen = fLen
                longestIdx = i
            }
        }
        if (longestIdx === -1) break
        const framesArr = threads[longestIdx].frames as unknown[]
        const dropCount = Math.max(1, Math.ceil(framesArr.length / 4))
        framesArr.splice(0, dropCount)
        truncatedFrames += dropCount
        result = buildEnvelope(threads, { threads: truncatedThreads, frames: truncatedFrames })
    }

    // Then drop whole threads from the end until within budget.
    while (threads.length > 0 && JSON.stringify(result, null, 2).length > maxChars) {
        const removed = threads.pop()
        truncatedThreads += 1
        if (removed && Array.isArray(removed.frames)) {
            truncatedFrames += removed.frames.length
        }
        result = buildEnvelope(threads, { threads: truncatedThreads, frames: truncatedFrames })
    }

    return result
}

async function dumpThreadsPythonMode(
    session: vscode.DebugSession,
    options: {
        maxThreads: number
        maxFrames: number
        maxChars: number
        includeDebuggerThreads: boolean
        timeoutMs: number
    }
) {
    const nonce = crypto.randomBytes(8).toString('hex')
    const snippet = buildPythonDumpThreadsSnippet({
        nonce,
        maxThreads: options.maxThreads,
        maxFrames: options.maxFrames,
        includeDebuggerThreads: options.includeDebuggerThreads,
    })

    const outcome = await runPythonSnippetViaEvaluate<RawPythonThreadsPayload>(
        session,
        nonce,
        snippet,
        options.timeoutMs
    )
    if ('error' in outcome) {
        return err(outcome.error)
    }

    const raw = outcome.data
    const initialTruncFrames = (raw.threads ?? []).reduce(
        (sum, t) => sum + (typeof t.truncatedFrames === 'number' ? t.truncatedFrames : 0),
        0
    )
    const cleanedThreads = (raw.threads ?? []).map((t) => ({
        ident: t.ident,
        name: t.name,
        daemon: t.daemon,
        isDebuggerThread: t.isDebuggerThread,
        frames: t.frames ?? [],
    }))

    const payload = fitThreadsPayloadToMaxChars(
        (threads, truncated) => ({
            sessionId: session.id,
            mode: 'python',
            frameOrder: 'innermost-last',
            pythonVersion: raw.pythonVersion,
            totalThreads: raw.totalThreads,
            debuggerThreadsExcluded: raw.debuggerThreadsExcluded,
            truncated,
            threads,
        }),
        cleanedThreads,
        raw.truncatedThreads ?? 0,
        initialTruncFrames,
        options.maxChars
    )

    return ok(payload)
}

async function dumpThreadsDapMode(
    session: vscode.DebugSession,
    options: {
        maxThreads: number
        maxFrames: number
        maxChars: number
    }
) {
    const threadsResponse = await session.customRequest('threads')
    const allAdapterThreads: Array<{ id: number; name?: string }> = Array.isArray(threadsResponse?.threads)
        ? threadsResponse.threads.filter((t: any) => typeof t?.id === 'number')
        : []

    let truncatedThreads = 0
    let selectedThreads = allAdapterThreads
    if (selectedThreads.length > options.maxThreads) {
        truncatedThreads = selectedThreads.length - options.maxThreads
        selectedThreads = selectedThreads.slice(0, options.maxThreads)
    }

    let truncatedFrames = 0
    const threadEntries: Array<{
        id: number
        name: string | null
        state: 'stopped' | 'running'
        frames: Array<{
            id: number
            function: string
            file: string | null
            line: number
            column: number
        }>
    }> = []

    for (const t of selectedThreads) {
        try {
            const stResp = await session.customRequest('stackTrace', {
                threadId: t.id,
                startFrame: 0,
                levels: options.maxFrames,
            })
            const rawFrames: any[] = Array.isArray(stResp?.stackFrames) ? stResp.stackFrames : []
            const totalFrames: number =
                typeof stResp?.totalFrames === 'number' ? stResp.totalFrames : rawFrames.length
            if (totalFrames > rawFrames.length) {
                truncatedFrames += totalFrames - rawFrames.length
            }
            threadEntries.push({
                id: t.id,
                name: typeof t.name === 'string' ? t.name : null,
                state: 'stopped',
                frames: rawFrames.map((f: any) => ({
                    id: f.id,
                    function: f.name,
                    file: f.source?.path ?? f.source?.name ?? null,
                    line: f.line,
                    column: f.column,
                })),
            })
        } catch {
            threadEntries.push({
                id: t.id,
                name: typeof t.name === 'string' ? t.name : null,
                state: 'running',
                frames: [],
            })
        }
    }

    const note =
        'A full stack dump of running threads via DAP requires pausing the target (pause tool), which stalls request handling on a live service.'

    const payload = fitThreadsPayloadToMaxChars(
        (threads, truncated) => ({
            sessionId: session.id,
            mode: 'dap',
            totalThreads: allAdapterThreads.length,
            truncated,
            note,
            threads,
        }),
        threadEntries,
        truncatedThreads,
        truncatedFrames,
        options.maxChars
    )

    return ok(payload)
}

interface RawAsyncioTaskLink {
    type: string | null
    qualname: string | null
    frame: { file: string | null; line: number | null; function: string | null } | null
}

interface RawAsyncioTaskEntry {
    id: number
    name: string | null
    coroQualname: string | null
    done: boolean | null
    cancelled: boolean | null
    frame: { file: string | null; line: number | null; function: string | null } | null
    awaitChain: RawAsyncioTaskLink[]
    truncatedAwaitChain?: number
    futWaiter: { type: string | null; state: string | null; id: number } | null
}

interface RawAsyncioLoopEntry {
    loopId: number | null
    isRunning: boolean
    isClosed: boolean
    tasks: RawAsyncioTaskEntry[]
}

interface RawAsyncioTasksPayload {
    supported: boolean
    pythonVersion: string
    error?: string
    totalTasks?: number
    truncatedTasks?: number
    truncatedFrames?: number
    loops?: RawAsyncioLoopEntry[]
}

function fitAsyncioPayloadToMaxChars(
    sessionId: string,
    raw: RawAsyncioTasksPayload,
    maxChars: number
): Record<string, unknown> {
    const loops = (raw.loops ?? []).map((lp) => ({
        loopId: lp.loopId,
        isRunning: lp.isRunning,
        isClosed: lp.isClosed,
        tasks: (lp.tasks ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            coroQualname: t.coroQualname,
            done: t.done,
            cancelled: t.cancelled,
            frame: t.frame,
            awaitChain: [...(t.awaitChain ?? [])],
            futWaiter: t.futWaiter,
        })),
    }))

    let truncatedTasks = raw.truncatedTasks ?? 0
    let truncatedFrames = raw.truncatedFrames ?? 0

    const buildEnvelope = () => ({
        sessionId,
        pythonVersion: raw.pythonVersion,
        totalTasks: raw.totalTasks ?? 0,
        truncated: {
            tasks: truncatedTasks,
            frames: truncatedFrames,
        },
        loops,
    })

    let result = buildEnvelope()
    if (JSON.stringify(result, null, 2).length <= maxChars) {
        return result
    }

    // Trim long awaitChain entries first.
    while (JSON.stringify(result, null, 2).length > maxChars) {
        let bestTask: { awaitChain: RawAsyncioTaskLink[] } | undefined
        for (const lp of loops) {
            for (const t of lp.tasks) {
                if (t.awaitChain.length > (bestTask?.awaitChain.length ?? 1)) {
                    bestTask = t
                }
            }
        }
        if (!bestTask) break
        bestTask.awaitChain.pop()
        truncatedFrames += 1
        result = buildEnvelope()
    }

    // Then drop whole tasks from the end of the largest loop until within maxChars.
    while (JSON.stringify(result, null, 2).length > maxChars) {
        let targetLoop: (typeof loops)[number] | undefined
        for (const lp of loops) {
            if (lp.tasks.length > (targetLoop?.tasks.length ?? 0)) {
                targetLoop = lp
            }
        }
        if (!targetLoop || targetLoop.tasks.length === 0) break
        const removed = targetLoop.tasks.pop()
        truncatedTasks += 1
        if (removed) {
            truncatedFrames += removed.awaitChain.length
        }
        result = buildEnvelope()
    }

    return result
}

export const dumpThreadsTool = {
    name: 'dump-threads',
    config: {
        title: 'Dump All Thread Stacks',
        description:
            'Dump stacks of all threads in a debug session (no DAP pause; the snippet runs briefly on one application thread and holds the GIL while it walks the frames). ' +
            'In "python" mode (auto for debugpy/python), combines sys._current_frames() and threading.enumerate() and orders frames innermost last, as Python traceback.extract_stack prints them. ' +
            'In "dap" mode (auto for other adapters), queries DAP threads + stackTrace per thread.',
        inputSchema: inputSchemas['dump-threads'],
    },
    handler: async (args: {
        sessionId?: string
        mode?: 'auto' | 'python' | 'dap'
        maxThreads?: number
        maxFrames?: number
        maxChars?: number
        includeDebuggerThreads?: boolean
        timeoutMs?: number
    }) =>
        withErrorHandling(async () => {
            const resolved = requireSession(args.sessionId)
            if ('errorResult' in resolved) return resolved.errorResult

            const session = resolved.session
            const requestedMode = args.mode ?? 'auto'
            const effectiveMode: 'python' | 'dap' =
                requestedMode === 'auto'
                    ? isPythonSession(session)
                        ? 'python'
                        : 'dap'
                    : requestedMode

            const maxThreads = clampInt(args.maxThreads, DEFAULT_MAX_THREADS, 1, 10_000)
            const maxFrames = clampInt(args.maxFrames, DEFAULT_MAX_THREAD_FRAMES, 1, 1_000)
            const maxChars = clampInt(args.maxChars, DEFAULT_MAX_CHARS, 1_000, HARD_MAX_CHARS)
            const includeDebuggerThreads = Boolean(args.includeDebuggerThreads)
            const timeoutMs = clampInt(args.timeoutMs, DEFAULT_TIMEOUT_MS, 100, 120_000)

            if (effectiveMode === 'python') {
                return dumpThreadsPythonMode(session, {
                    maxThreads,
                    maxFrames,
                    maxChars,
                    includeDebuggerThreads,
                    timeoutMs,
                })
            }

            return dumpThreadsDapMode(session, {
                maxThreads,
                maxFrames,
                maxChars,
            })
        }),
}

export const dumpAsyncioTasksTool = {
    name: 'dump-asyncio-tasks',
    config: {
        title: 'Dump Python Asyncio Tasks',
        description:
            'Inspect pending and running asyncio tasks in a Python (debugpy) debug session grouped by event loop, including each coroutine frame, bounded await chain (cr_await/gi_yieldfrom), and _fut_waiter (no DAP pause; the snippet runs briefly on one application thread and holds the GIL while it walks the frames).',
        inputSchema: inputSchemas['dump-asyncio-tasks'],
    },
    handler: async (args: {
        sessionId?: string
        maxTasks?: number
        maxFrames?: number
        maxChars?: number
        timeoutMs?: number
    }) =>
        withErrorHandling(async () => {
            const resolved = requireSession(args.sessionId)
            if ('errorResult' in resolved) return resolved.errorResult

            const session = resolved.session
            if (!isPythonSession(session)) {
                return err(
                    `dump-asyncio-tasks is only supported for Python debug sessions (debugpy/python); current session "${session.name}" has type "${session.type}".`
                )
            }

            const maxTasks = clampInt(args.maxTasks, DEFAULT_MAX_TASKS, 1, 10_000)
            const maxFrames = clampInt(args.maxFrames, DEFAULT_MAX_TASK_FRAMES, 1, 500)
            const maxChars = clampInt(args.maxChars, DEFAULT_MAX_CHARS, 1_000, HARD_MAX_CHARS)
            const timeoutMs = clampInt(args.timeoutMs, DEFAULT_TIMEOUT_MS, 100, 120_000)

            const nonce = crypto.randomBytes(8).toString('hex')
            const snippet = buildPythonDumpAsyncioTasksSnippet({
                nonce,
                maxTasks,
                maxFrames,
            })

            const outcome = await runPythonSnippetViaEvaluate<RawAsyncioTasksPayload>(
                session,
                nonce,
                snippet,
                timeoutMs
            )
            if ('error' in outcome) {
                return err(outcome.error)
            }

            const raw = outcome.data
            if (!raw.supported) {
                return err(
                    raw.error ??
                        `Unsupported Python runtime for dump-asyncio-tasks (sys.version: ${raw.pythonVersion ?? 'unknown'})`
                )
            }

            const payload = fitAsyncioPayloadToMaxChars(session.id, raw, maxChars)
            return ok(payload)
        }),
}
