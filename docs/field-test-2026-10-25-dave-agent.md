# Field test 2026-10-25: debugging a stuck worker in dave_agent

First real use of the extension (v0.2.0) through its CLI, by Claude Code, on a live Python service:
`dave_agent` (FastAPI + Google ADK) started by `scripts/dev_server.sh` under
`python -m debugpy --listen localhost:5678`. Problem: 23 RAG ingestion operations stuck in `processing`.

## Outcome

The extension found the root cause, which logs and guesses had missed:

1. `start-debug` with the `Python: Attach to Local Dev Server` config attached to the running process.
2. `pause` + `get-call-stack` on `MainThread` pointed at `_check_kb_write_permission`.
3. `evaluate-expression` showed the arguments (`target='kb_vre'`, a profile without roles).
4. After detaching, `sys._current_frames()` and `threading.enumerate()` via `evaluate-expression` showed the
   event loop idle in `select` and every executor thread idle: no pending work. So the operations had
   finished without updating their state. That led to a `PermissionError` swallowed by an early `return`.

Commands used: `list-vscode-instances`, `list-debug-configs`, `start-debug`, `list-debug-sessions`, `pause`,
`continue`, `get-thread-list`, `get-call-stack`, `evaluate-expression`, `list-breakpoints`,
`remove-breakpoint`, `get-debug-state`, `stop-debug`.

## Problems found (proposed evolutions)

| # | Problem | Impact | Proposal |
| --- | --- | --- | --- |
| 1 | **Attaching installs every IDE breakpoint into the target**, including stale ones from old sessions (here `rag_manager/tools.py:179`, exactly on the path under investigation). The worker kept stopping there and the first stack I read was the breakpoint, not the bug. | Misleading diagnosis; on a shared or production-like process it freezes request handling. | `start-debug` option `breakpoints: "none" \| "ide" \| [list]` (default for attach: `none`, or at least `ide` with a warning listing the breakpoints being installed); `get-debug-state` should flag "stopped on breakpoint X" vs "paused". |
| 2 | **`evaluate-expression` without `frameId` runs in a debugpy internal thread**, not in the paused frame of the focused thread. | `sys._getframe()` and local names refer to the debugger's own thread; confusing results. | Default `frameId` to the top frame of the paused/focused thread; return which thread/frame was used. |
| 3 | **`get-call-stack` hides library frames** (`justMyCode`), so a frame looks "stuck" on a call line. | Hard to tell "inside a library call" from "on this line". | `includeAllFrames: true` option (or `justMyCode` override in attach) and a marker for hidden frames. |
| 4 | **No high-level view of Python concurrency.** I had to write a long one-line lambda to dump all thread stacks and asyncio tasks. | Most hangs in async services need exactly this. | Tools `dump-threads` (all threads, full stacks) and, for debugpy, `dump-asyncio-tasks` (pending tasks with coroutine stacks and what they await). |
| 5 | **Pausing a live service has side effects** (requests time out while paused). | Risky on shared environments. | Mention it in the tool descriptions; offer non-pausing snapshots (4) where the runtime allows (`sys._current_frames()` works without pausing all threads in debugpy? to verify). |
| 6 | **CLI quoting in the docs.** `export DAP_CLI='node .../cli.js'` then `$DAP_CLI call ...` fails in zsh ("no such file or directory: node …"), because zsh does not split unquoted variables. | Every first call from zsh fails. | Document a shell function (`dap() { node ~/.vscode/extensions/alfredooliviero.vscode-mcp-dap-debugger-*/out/cli.js "$@"; }`) or an installed `dap-cli` bin. |
| 7 | **Results are JSON inside JSON** (`content[0].text` holds a JSON string). | Every call needs a decoding wrapper. | A `--raw`/`--json` CLI flag that prints the inner JSON object directly. |
| 8 | `list-debug-sessions` keeps terminated sessions (`status: terminated`). | Minor noise. | Filter by default, `--all` to include them. |

## Not tested yet

Breakpoint-driven workflows (set, hit, step), logpoints, conditional breakpoints, Node targets, multiple
concurrent sessions, Docker attach.
