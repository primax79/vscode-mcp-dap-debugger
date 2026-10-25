# Sample 3: Multi-Threaded Workers & Thread Inspection

This sample demonstrates how an AI agent inspects multiple threads, evaluates expressions across worker threads, and traces errors across process/thread boundaries.

## The Problem

In `main.js`, multiple concurrent tasks are dispatched to Node.js `worker_threads` (`worker.js`):
- Task 1, 2, and 4 calculate math tasks successfully on separate threads.
- Task 3 fails inside `worker.js` with an invalid matrix payload.

## How to Test with AI

1. Open this folder in VS Code:
   ```bash
   code samples/03-multi-threaded-worker
   ```
2. Make sure the VSCode MCP DAP Debugger extension is active.
3. Ask your AI Assistant:

> **Sample Prompt:**
> *"Run `main.js` with the debugger attached. Use `get-thread-list` to check all worker threads, set a breakpoint in `worker.js` inside `executeTask`, inspect the `task` variable for each thread, and identify why worker 3 throws an error."*

## Long-Running Attach Mode (`--loop`)

To test attaching to an already-running process (and per-session breakpoint policies such as `breakpoints: "none"` or `breakpoints: [...]`), start the worker pool in loop mode with the Node inspector listening on port 9229:

```bash
node --inspect=9229 main.js --loop
```

In `--loop` mode, `main.js` stays alive and dispatches a worker task every second (`1000ms`). Without `--loop`, `main.js` runs a single batch and exits as before.

Then attach using the `"Attach to Worker Pool"` configuration in `.vscode/launch.json`:

```bash
$DAP_CLI call start-debug '{"config": "Attach to Worker Pool", "breakpoints": "none"}'
```
