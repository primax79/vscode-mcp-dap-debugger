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
