# Sample 4: Python Asyncio & Threading Hang (`dump-threads` / `dump-asyncio-tasks`)

This sample reproduces a typical hang in an async Python service that mixes `asyncio` coroutines and OS threads (`ThreadPoolExecutor` / `threading.Thread`), without stopping the event loop:

- **`event-waiter-task`**: awaits an `asyncio.Event` (`wait_for_never_set_event`) that is never set.
- **`executor-waiter-task`**: awaits `loop.run_in_executor(...)` (`wait_on_blocked_executor`) while the executor worker thread (`blocked-executor_0`) is blocked on a held `threading.Lock` inside `blocked_lock_worker`.
- **`idle-worker-1` & `idle-worker-2`**: two background daemon threads waiting on `threading.Event().wait()`.
- **`heartbeat-task`**: prints `[heartbeat] tick=...` every second to prove the process is live and not paused while inspecting it.

## Running under `debugpy` (Attach Mode)

Start the sample with `debugpy` listening on `localhost:5678`:

```bash
python3 -m debugpy --listen localhost:5678 samples/04-python-async-hang/app.py
```

Or open `samples/04-python-async-hang` in VS Code and use either configuration in `.vscode/launch.json`:

- **`Launch Async Hang Sample`** (`request: "launch"`)
- **`Attach to Async Hang (5678)`** (`request: "attach"`, `localhost:5678`)

## Inspecting Without a DAP Pause

Attach without installing stale IDE breakpoints, then run `dump-threads` and `dump-asyncio-tasks`:

```bash
dap call start-debug '{"config": "Attach to Async Hang (5678)", "breakpoints": "none"}'
dap call dump-threads '{}' --raw
dap call dump-asyncio-tasks '{}' --raw
dap call stop-debug '{}'
```

What to look for:

1. **`dump-threads`** (mode `python`, no DAP pause):
   - `blocked-executor_0` has a stack ending at `blocked_lock_worker` in `app.py` (`with self.held_lock:`).
   - `idle-worker-1` and `idle-worker-2` are waiting inside `_idle_worker` (`self.stop_event.wait()`).
   - `MainThread` is running the asyncio event loop (`selector.select`).
   - The `[heartbeat]` output keeps printing every second because no DAP `pause` was issued.
2. **`dump-asyncio-tasks`** (no DAP pause):
   - `event-waiter-task` (`AsyncHangScenario.wait_for_never_set_event`) has an `awaitChain` pointing into `Event.wait` and a pending `_fut_waiter`.
   - `executor-waiter-task` (`AsyncHangScenario.wait_on_blocked_executor`) has a pending `_fut_waiter` bridging the executor future.
   - `heartbeat-task` (`AsyncHangScenario.heartbeat_task`) is sleeping in `asyncio.sleep`.

## Developer Verification Harness (`dev/verify_snippets.py`)

Before or without launching VS Code, you can verify the exact `exec`-mode Python snippets against the live sample scenario in a single process:

```bash
python3 samples/04-python-async-hang/dev/verify_snippets.py
```

The harness starts `AsyncHangScenario` on an asyncio event loop thread, executes both the `dump-threads` and `dump-asyncio-tasks` snippets via `exec(..., {})` (matching `debugpy`'s frameless `evaluate` execution path), parses the `<<MCPDAP:<nonce>:BEGIN>>...<<MCPDAP:<nonce>:END>>` base64 JSON payload from captured `stdout`, and asserts that all expected threads and tasks are reported.
