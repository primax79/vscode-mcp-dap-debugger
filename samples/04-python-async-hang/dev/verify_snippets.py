"""Developer verification harness for the dump-threads and dump-asyncio-tasks Python snippets.

Runs the sample scenario (`samples/04-python-async-hang/app.py`) on a background event-loop thread,
executes the exact `exec`-mode snippets used by `src/tools/runtime-dump.ts` in an isolated globals
dict (`exec(snippet, {})`), extracts the `<<MCPDAP:<nonce>:BEGIN>>...<<MCPDAP:<nonce>:END>>` block,
base64-decodes and JSON-parses it, prints the decoded payloads, and asserts the expected threads
and tasks are present.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import io
import json
from pathlib import Path
import re
import sys
import threading
from typing import Any

SAMPLE_DIR = Path(__file__).resolve().parent.parent
if str(SAMPLE_DIR) not in sys.path:
    sys.path.insert(0, str(SAMPLE_DIR))

from app import AsyncHangScenario  # noqa: E402


def build_dump_threads_snippet(
    nonce: str,
    max_threads: int = 100,
    max_frames: int = 50,
    include_debugger_threads: bool = False,
) -> str:
    inc_dbg = "True" if include_debugger_threads else "False"
    return f"""
import sys as _sys, threading as _threading, traceback as _traceback, json as _json, base64 as _base64
_nonce = {json.dumps(nonce)}
_max_threads = {int(max_threads)}
_max_frames = {int(max_frames)}
_include_dbg = {inc_dbg}
_frames_by_id = _sys._current_frames()
_threads_by_id = {{}}
for _t in _threading.enumerate():
    if _t.ident is not None:
        _threads_by_id[_t.ident] = _t
_all_ids = list(_frames_by_id.keys())
for _tid in _threads_by_id:
    if _tid not in _frames_by_id:
        _all_ids.append(_tid)
_entries = []
_dbg_skipped = 0
for _tid in _all_ids:
    _t = _threads_by_id.get(_tid)
    _name = _t.name if _t is not None else None
    _daemon = bool(_t.daemon) if _t is not None else None
    _cls_mod = getattr(_t.__class__, '__module__', '') if _t is not None else ''
    _f = _frames_by_id.get(_tid)
    _is_dbg = bool(
        (_name and _name.startswith('pydevd'))
        or ('pydevd' in _cls_mod)
        or ('debugpy' in _cls_mod)
    )
    if not _is_dbg and _t is None and _f is not None:
        _cur = _f
        _steps = 0
        while _cur is not None and _steps < 60:
            _fn = _cur.f_code.co_filename or ''
            if 'pydevd' in _fn or 'debugpy' in _fn:
                _is_dbg = True
                break
            _cur = _cur.f_back
            _steps += 1
    if _is_dbg and not _include_dbg:
        _dbg_skipped += 1
        continue
    _raw_frames = []
    _trunc_frames = 0
    if _f is not None:
        _full_stack = _traceback.extract_stack(_f)
        if len(_full_stack) > _max_frames:
            _trunc_frames = len(_full_stack) - _max_frames
            _full_stack = _full_stack[-_max_frames:]
        for _fs in _full_stack:
            _raw_frames.append({{
                'file': _fs.filename,
                'line': _fs.lineno,
                'function': _fs.name,
                'code': _fs.line,
            }})
    _entries.append({{
        'ident': _tid,
        'name': _name,
        'daemon': _daemon,
        'isDebuggerThread': _is_dbg,
        'frames': _raw_frames,
        'truncatedFrames': _trunc_frames,
    }})
_trunc_threads = 0
if len(_entries) > _max_threads:
    _trunc_threads = len(_entries) - _max_threads
    _entries = _entries[:_max_threads]
_payload = {{
    'pythonVersion': _sys.version,
    'totalThreads': len(_entries) + _trunc_threads,
    'debuggerThreadsExcluded': _dbg_skipped,
    'truncatedThreads': _trunc_threads,
    'threads': _entries,
}}
_encoded = _base64.b64encode(_json.dumps(_payload).encode('utf-8')).decode('ascii')
_sys.stdout.write('<<MCPDAP:' + _nonce + ':BEGIN>>' + _encoded + '<<MCPDAP:' + _nonce + ':END>>\\n')
_sys.stdout.flush()
"""


def build_dump_asyncio_tasks_snippet(
    nonce: str,
    max_tasks: int = 200,
    max_frames: int = 20,
) -> str:
    return f"""
import sys as _sys, asyncio as _asyncio, json as _json, base64 as _base64
_nonce = {json.dumps(nonce)}
_max_tasks = {int(max_tasks)}
_max_frames = {int(max_frames)}
_at = getattr(_asyncio, 'tasks', None)
if _at is None:
    import asyncio.tasks as _at
_vi = _sys.version_info[:2]
_has_312 = hasattr(_at, '_scheduled_tasks') or hasattr(_at, '_eager_tasks')
_has_legacy = hasattr(_at, '_all_tasks')
if not _has_312 and not _has_legacy:
    _payload = {{
        'supported': False,
        'pythonVersion': _sys.version,
        'error': 'Unsupported CPython asyncio task registry on Python ' + _sys.version,
    }}
else:
    _raw_tasks = []
    _snap_ok = False
    for _attempt in range(5):
        try:
            if _vi >= (3, 12) and _has_312:
                _sched = list(getattr(_at, '_scheduled_tasks', ()))
                _eager = list(getattr(_at, '_eager_tasks', ()))
                _seen = set()
                _raw_tasks = []
                for _tsk in _sched + _eager:
                    if id(_tsk) not in _seen:
                        _seen.add(id(_tsk))
                        _raw_tasks.append(_tsk)
            elif _has_legacy:
                _raw_tasks = list(getattr(_at, '_all_tasks', ()))
            else:
                _sched = list(getattr(_at, '_scheduled_tasks', ()))
                _eager = list(getattr(_at, '_eager_tasks', ()))
                _raw_tasks = _sched + _eager
            _snap_ok = True
            break
        except RuntimeError:
            continue
    if not _snap_ok:
        _payload = {{
            'supported': False,
            'pythonVersion': _sys.version,
            'error': 'Failed to snapshot asyncio tasks after 5 retries (set changed size during iteration)',
        }}
    else:
        def _type_qualname(_obj):
            if _obj is None:
                return None
            _cls = type(_obj)
            _mod = getattr(_cls, '__module__', None)
            _qn = getattr(_cls, '__qualname__', getattr(_cls, '__name__', 'object'))
            if _mod and _mod not in ('builtins', '__main__'):
                return _mod + '.' + _qn
            return _qn

        def _frame_loc(_fr):
            if _fr is None:
                return None
            _code = getattr(_fr, 'f_code', None)
            if _code is None:
                return None
            return {{
                'file': getattr(_code, 'co_filename', None),
                'line': getattr(_fr, 'f_lineno', None),
                'function': getattr(_code, 'co_name', None),
            }}

        def _coro_frame(_obj):
            for _attr in ('cr_frame', 'gi_frame', 'ag_frame'):
                _fr = getattr(_obj, _attr, None)
                if _fr is not None:
                    return _fr
            return None

        def _next_awaited(_obj):
            for _attr in ('cr_await', 'gi_yieldfrom', 'ag_await'):
                _nxt = getattr(_obj, _attr, None)
                if _nxt is not None:
                    return _nxt
            return None

        _total_tasks = len(_raw_tasks)
        _trunc_tasks = 0
        if len(_raw_tasks) > _max_tasks:
            _trunc_tasks = len(_raw_tasks) - _max_tasks
            _raw_tasks = _raw_tasks[:_max_tasks]

        _loops = {{}}
        _trunc_frames_total = 0
        for _t in _raw_tasks:
            try:
                _loop = _t.get_loop()
            except Exception:
                _loop = None
            _lid = id(_loop) if _loop is not None else 0
            if _lid not in _loops:
                _loops[_lid] = {{
                    'loopId': _lid if _loop is not None else None,
                    'isRunning': bool(_loop.is_running()) if _loop is not None else False,
                    'isClosed': bool(_loop.is_closed()) if _loop is not None else False,
                    'tasks': [],
                }}
            try:
                _tname = _t.get_name()
            except Exception:
                _tname = None
            try:
                _coro = _t.get_coro()
            except Exception:
                _coro = getattr(_t, '_coro', None)
            _coro_qn = getattr(_coro, '__qualname__', None) or _type_qualname(_coro)
            try:
                _is_done = bool(_t.done())
            except Exception:
                _is_done = None
            try:
                _is_cancelled = bool(_t.cancelled())
            except Exception:
                _is_cancelled = None
            _top_frame = _frame_loc(_coro_frame(_coro)) if _coro is not None else None
            _chain = []
            _cur = _next_awaited(_coro) if _coro is not None else None
            _seen_chain = set()
            _depth = 0
            _task_trunc_frames = 0
            while _cur is not None and id(_cur) not in _seen_chain:
                _seen_chain.add(id(_cur))
                if _depth >= _max_frames:
                    _task_trunc_frames += 1
                else:
                    _c_fr = _frame_loc(_coro_frame(_cur))
                    _chain.append({{
                        'type': _type_qualname(_cur),
                        'qualname': getattr(_cur, '__qualname__', None),
                        'frame': _c_fr,
                    }})
                _cur = _next_awaited(_cur)
                _depth += 1
            _trunc_frames_total += _task_trunc_frames
            _fw = getattr(_t, '_fut_waiter', None)
            _fw_info = None
            if _fw is not None:
                _fw_state = getattr(_fw, '_state', None)
                _fw_info = {{
                    'type': _type_qualname(_fw),
                    'state': _fw_state if isinstance(_fw_state, str) else None,
                    'id': id(_fw),
                }}
            _loops[_lid]['tasks'].append({{
                'id': id(_t),
                'name': _tname if isinstance(_tname, str) else None,
                'coroQualname': _coro_qn if isinstance(_coro_qn, str) else None,
                'done': _is_done,
                'cancelled': _is_cancelled,
                'frame': _top_frame,
                'awaitChain': _chain,
                'truncatedAwaitChain': _task_trunc_frames,
                'futWaiter': _fw_info,
            }})
        _payload = {{
            'supported': True,
            'pythonVersion': _sys.version,
            'totalTasks': _total_tasks,
            'truncatedTasks': _trunc_tasks,
            'truncatedFrames': _trunc_frames_total,
            'loops': list(_loops.values()),
        }}
_encoded = _base64.b64encode(_json.dumps(_payload).encode('utf-8')).decode('ascii')
_sys.stdout.write('<<MCPDAP:' + _nonce + ':BEGIN>>' + _encoded + '<<MCPDAP:' + _nonce + ':END>>\\n')
_sys.stdout.flush()
"""


def run_snippet_and_extract(snippet: str, nonce: str) -> dict[str, Any]:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(compile(snippet, "<mcpdap_snippet>", "exec"), {})
    output = buf.getvalue()
    pattern = re.compile(
        re.escape(f"<<MCPDAP:{nonce}:BEGIN>>") + r"([A-Za-z0-9+/=]+)" + re.escape(f"<<MCPDAP:{nonce}:END>>")
    )
    match = pattern.search(output)
    if not match:
        raise AssertionError(f"Sentinel block not found for nonce={nonce} in output: {output!r}")
    decoded_bytes = base64.b64decode(match.group(1))
    return json.loads(decoded_bytes.decode("utf-8"))


def main() -> int:
    scenario = AsyncHangScenario()
    scenario.start_background_threads()

    loop_thread_done = threading.Event()

    def _run_loop() -> None:
        async def _runner() -> None:
            tasks = await scenario.start_tasks(enable_heartbeat_print=False)
            try:
                await asyncio.gather(*tasks)
            except asyncio.CancelledError:
                pass

        try:
            asyncio.run(_runner())
        finally:
            loop_thread_done.set()

    loop_thread = threading.Thread(target=_run_loop, name="AsyncLoopThread", daemon=True)
    loop_thread.start()

    if not scenario.tasks_ready.wait(timeout=5.0):
        scenario.shutdown()
        raise RuntimeError("Timed out waiting for sample asyncio tasks to become ready")

    try:
        threads_payload = run_snippet_and_extract(
            build_dump_threads_snippet("test-threads-nonce"),
            "test-threads-nonce",
        )
        tasks_payload = run_snippet_and_extract(
            build_dump_asyncio_tasks_snippet("test-tasks-nonce"),
            "test-tasks-nonce",
        )

        # Assertions on threads dump
        threads = threads_payload.get("threads", [])
        thread_names = {t.get("name") for t in threads}
        assert "idle-worker-1" in thread_names, f"Missing idle-worker-1 in {thread_names}"
        assert "idle-worker-2" in thread_names, f"Missing idle-worker-2 in {thread_names}"

        blocked_threads = [
            t
            for t in threads
            if any(
                fr.get("function") == "blocked_lock_worker"
                or "held_lock" in (fr.get("code") or "")
                or "acquire" in (fr.get("code") or "")
                for fr in t.get("frames", [])
            )
        ]
        assert blocked_threads, f"Expected a thread blocked in blocked_lock_worker, got: {json.dumps(threads, indent=2)}"

        # Assertions on asyncio tasks dump
        assert tasks_payload.get("supported") is True, f"Expected supported=True, got: {tasks_payload}"
        loops = tasks_payload.get("loops", [])
        assert len(loops) >= 1, f"Expected at least 1 event loop, got: {loops}"
        all_tasks = [t for lp in loops for t in lp.get("tasks", [])]
        by_name = {t.get("name"): t for t in all_tasks}

        assert "event-waiter-task" in by_name, f"Missing event-waiter-task in {list(by_name.keys())}"
        assert "executor-waiter-task" in by_name, f"Missing executor-waiter-task in {list(by_name.keys())}"
        assert "heartbeat-task" in by_name, f"Missing heartbeat-task in {list(by_name.keys())}"

        ev_task = by_name["event-waiter-task"]
        assert ev_task.get("done") is False
        assert ev_task.get("futWaiter") is not None and ev_task["futWaiter"].get("state") == "PENDING"
        assert any("wait" in (link.get("qualname") or "") for link in ev_task.get("awaitChain", []))

        ex_task = by_name["executor-waiter-task"]
        assert ex_task.get("done") is False
        assert ex_task.get("futWaiter") is not None and ex_task["futWaiter"].get("state") == "PENDING"

        summary = {
            "verification": "ok",
            "pythonVersion": threads_payload.get("pythonVersion"),
            "threadsDump": threads_payload,
            "asyncioTasksDump": tasks_payload,
        }
        print(json.dumps(summary, indent=2))
        return 0
    finally:
        scenario.shutdown()
        loop_thread_done.wait(timeout=5.0)


if __name__ == "__main__":
    raise SystemExit(main())
