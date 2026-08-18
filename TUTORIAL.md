# AI-Driven Debugging with VSCode MCP DAP Debugger

This guide explains how AI coding assistants (**Claude Code, Kilo Code, Gemini CLI, Cursor, Roo Code, Codex**, etc.) interact with VS Code's active debug sessions using the **VSCode MCP DAP Debugger** extension.

---

## Table of Contents

1. [Architecture & Workflow](#architecture--workflow)
2. [Prerequisites & Setup](#prerequisites--setup)
3. [Level 1 (Basic): Breakpoints & Variable Inspection](#level-1-basic-breakpoints--variable-inspection)
4. [Level 2 (Intermediate): Async Streams & Exception Trapping](#level-2-intermediate-async-streams--exception-trapping)
5. [Level 3 (Advanced): Multi-Threading & Live Expression Evaluation](#level-3-advanced-multi-threading--live-expression-evaluation)
6. [Prompt Templates & Best Practices](#prompt-templates--best-practices)

---

## Architecture & Workflow

Without debugger integration, AI assistants rely on static code analysis or manual log insertions (`console.log`, `print`). 

With **VSCode MCP DAP Debugger**, the assistant drives VS Code's Debug Adapter Protocol (DAP):
1. **Config Validation:** Reads `.vscode/launch.json` or generates a matching debug launch configuration.
2. **Breakpoint Setup:** Adds breakpoints or conditional breakpoints at target locations.
3. **Execution Control:** Starts the debug session and controls execution flow (`step-over`, `step-into`, `continue`).
4. **State Inspection:** Reads call stack frames, variable scopes, and evaluates expressions against the paused thread.
5. **Remediation:** Modifies source code to fix the root cause and restarts the session to verify the fix.

---

## Prerequisites & Setup

1. **Install the Extension:** Install `VSCode MCP DAP Debugger` in VS Code.
2. **Open a Project:** Ensure a workspace folder is open.
3. **Server Status:** Confirm the status bar indicates `● Debug MCP:8891`.
4. **Agent Skill Injection:** The extension automatically places skill definitions in `.claude/skills`, `.gemini/skills`, `.kilo/skills`, or `AGENTS.md` if the respective directories exist.

---

## Level 1 (Basic): Breakpoints & Variable Inspection

### Sample: `samples/01-basic-calculation-bug`

A shopping cart discount calculation in `app.js` returns an unexpected output due to conditional logic errors.

### Agent Workflow:
- Sets a breakpoint on `calculateCartTotal`.
- Launches the debug session via `launch.json`.
- Inspects `subtotal`, `totalItemCount`, and `discount` across loop iterations.
- Identifies the boundary check error (`> 5` instead of `>= 5`) and variable overwrite.

### Execution:

1. Open the sample in VS Code:
   ```bash
   code samples/01-basic-calculation-bug
   ```
2. Prompt the AI assistant:

> ```text
> There is a calculation bug in `app.js`. 
> Use the VS Code DAP debugger to set a breakpoint inside `calculateCartTotal`, start the debug session, step through the calculation while inspecting local variables, identify the cause of the discrepancy, and apply the fix.
> ```

---

## Level 2 (Intermediate): Async Streams & Exception Trapping

### Sample: `samples/02-async-data-pipeline`

An asynchronous batch processing pipeline crashes with an unhandled exception when parsing records.

### Agent Workflow:
- Places a conditional breakpoint or traps the exception event.
- Steps across asynchronous Promise boundaries (`enrichEvent`).
- Reads the call stack (`get-call-stack`) and exception payload (`get-exception-info`).
- Detects that a record contains a `null` metadata object.

### Execution:

1. Open the sample in VS Code:
   ```bash
   code samples/02-async-data-pipeline
   ```
2. Prompt the AI assistant:

> ```text
> When executing `app.js`, the async pipeline crashes with an unhandled exception during event processing.
> Attach the VS Code debugger, set a breakpoint inside `enrichEvent`, step through the async batch processing to inspect `event` and `event.meta`, and identify which record causes the crash. Then update `app.js` with proper error handling.
> ```

---

## Level 3 (Advanced): Multi-Threading & Live Expression Evaluation

### Sample: `samples/03-multi-threaded-worker`

A main process distributes computation tasks across Node.js `worker_threads` (`worker.js`). One thread encounters an invalid payload.

### Agent Workflow:
- Launches the session with child process auto-attach enabled (`autoAttachChildProcesses: true`).
- Lists all active threads using `get-thread-list`.
- Sets breakpoints in `worker.js` across worker threads.
- Evaluates test expressions in the context of the paused worker thread using `evaluate-expression`.

### Execution:

1. Open the sample in VS Code:
   ```bash
   code samples/03-multi-threaded-worker
   ```
2. Prompt the AI assistant:

> ```text
> `main.js` launches several worker threads using `worker.js`, but one task fails.
> Start a debug session, list all threads, set a breakpoint in `worker.js:executeTask`, inspect the incoming `task` payload for each thread, and evaluate test expressions to pinpoint the failure.
> ```

---

## Prompt Templates & Best Practices

### 1. General Investigation
```text
"The function [function_name] in [file_path] is returning unexpected output. Set a breakpoint at the start of the function, run the debugger, step through line by line, inspect variable values, and fix the issue."
```

### 2. High-Volume Loop / Conditional Breakpoint
```text
"In [file_path], an error occurs when processing item index 50. Set a conditional breakpoint with condition `i === 50`, start the debugger, and inspect the state when paused."
```

### 3. Exception Post-Mortem
```text
"The application crashes with an unhandled exception. Start the debug session, catch the exception, retrieve the full stack trace and variable scope at the crash point, and explain the root cause."
```

### 4. Expression Evaluation
```text
"Pause execution inside [file_path] at line [line_number], then evaluate the expression `[expression]` against the paused scope to verify runtime data format."
