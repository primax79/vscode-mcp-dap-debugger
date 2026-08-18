# 🎓 Complete Guide: AI-Driven Debugging with VSCode MCP DAP Debugger

Welcome! This tutorial guides you step-by-step on how to empower your AI coding assistants (**Claude Code, Kilocode, Gemini CLI, Cursor, Roo Code, Codex**, etc.) to debug real, running code directly inside VS Code using the **VSCode MCP DAP Debugger** extension.

---

## 📑 Table of Contents

1. [🧠 The Mental Model: Static Code vs Live Debugging](#-the-mental-model-static-code-vs-live-debugging)
2. [⚙️ Prerequisites & Setup](#️-prerequisites--setup)
3. [🟢 Level 1 (Beginner): Breakpoints & Variable Inspection](#-level-1-beginner-breakpoints--variable-inspection)
4. [🟡 Level 2 (Intermediate): Async Streams & Exception Trapping](#-level-2-intermediate-async-streams--exception-trapping)
5. [🔴 Level 3 (Advanced): Multi-Threading & Live Expression Evaluation](#-level-3-advanced-multi-threading--live-expression-evaluation)
6. [💡 Prompt Cheat Sheet & Best Practices](#-prompt-cheat-sheet--best-practices)

---

## 🧠 The Mental Model: Static Code vs Live Debugging

Without this extension, AI assistants analyze your code **statically**:
- They read text files and try to mentally simulate runtime state.
- When they get stuck, they ask you to add `console.log` statements and run the script again.

With **VSCode MCP DAP Debugger**, your AI acts as an **interactive debugger**:
1. It looks at your `.vscode/launch.json` and chooses the right configuration.
2. It places breakpoints or logpoints in suspect lines.
3. It launches or attaches the VS Code debugger.
4. When paused, it inspects variables, steps through lines (`step-over`, `step-into`), and evaluates custom expressions.
5. It discovers the root cause with certainty and proposes a fix.

---

## ⚙️ Prerequisites & Setup

1. **Install the Extension:** Search for `VSCode MCP DAP Debugger` in the VS Code Marketplace and click **Install**.
2. **Open a Project:** Ensure you have a workspace folder open in VS Code.
3. **Verify the Server:** Look at the status bar at the bottom right. You should see a green indicator like `● Debug MCP:8891`.
4. **Auto-Discovery:** The extension automatically creates the required skill file (e.g. `.claude/skills/dap-cli-debugging/SKILL.md` or `.kilo/skills/dap-cli-debugging/SKILL.md`) so your agent already knows what tools are available.

---

## 🟢 Level 1 (Beginner): Breakpoints & Variable Inspection

### Sample: `samples/01-basic-calculation-bug`

In this scenario, a shopping cart discount calculation in `app.js` is producing an unexpected result.

### What the AI Does:
- Sets a breakpoint on `calculateCartTotal`.
- Starts the debug session using the launch config.
- Inspects `subtotal`, `totalItemCount`, and `discount` at runtime.
- Steps over lines to observe how the variables change.
- Identifies the off-by-one check (`> 5` instead of `>= 5`) and the overwritten coupon variable.

### 📋 Try it yourself:

1. Open the sample in VS Code:
   ```bash
   code samples/01-basic-calculation-bug
   ```
2. In your terminal or AI assistant chat window, send this prompt:

> **💬 Prompt to AI:**
> ```text
> There is a calculation bug in `app.js`. 
> Please use the VS Code DAP debugger to set a breakpoint inside `calculateCartTotal`, run the debugger, step through the calculation while inspecting the local variables, find the bug, and fix it.
> ```

---

## 🟡 Level 2 (Intermediate): Async Streams & Exception Trapping

### Sample: `samples/02-async-data-pipeline`

In this scenario, an asynchronous data ingestion pipeline crashes midway when processing a batch of records.

### What the AI Does:
- Sets a conditional breakpoint or catches unhandled exceptions.
- Steps into asynchronous functions (`enrichEvent`) across Promise boundaries.
- Inspects the call stack (`get-call-stack`) and reads the exception message (`get-exception-info`).
- Discovers that a record has `meta: null`, causing `TypeError: Cannot read properties of null`.
- Implements safe optional chaining or fallback defaults.

### 📋 Try it yourself:

1. Open the sample in VS Code:
   ```bash
   code samples/02-async-data-pipeline
   ```
2. Send this prompt to your AI assistant:

> **💬 Prompt to AI:**
> ```text
> When running `app.js`, the async pipeline crashes with an unhandled exception during event processing.
> Attach the VS Code debugger, set a breakpoint inside `enrichEvent`, step through the async batch processing to inspect `event` and `event.meta`, and identify which record causes the crash. Then update `app.js` with proper error handling.
> ```

---

## 🔴 Level 3 (Advanced): Multi-Threading & Live Expression Evaluation

### Sample: `samples/03-multi-threaded-worker`

In this scenario, a master process spawns multiple Node.js `worker_threads` to compute math algorithms concurrently. One of the worker threads fails.

### What the AI Does:
- Starts the multi-process debug session with `autoAttachChildProcesses: true`.
- Lists all active threads using `get-thread-list`.
- Sets breakpoints in `worker.js` across child threads.
- Evaluates live expressions using `evaluate-expression` (e.g. testing `task.size * task.size` or checking input validity).
- Identifies the malformed task payload passed to Worker 3.

### 📋 Try it yourself:

1. Open the sample in VS Code:
   ```bash
   code samples/03-multi-threaded-worker
   ```
2. Send this prompt to your AI assistant:

> **💬 Prompt to AI:**
> ```text
> `main.js` launches several worker threads using `worker.js`, but one task fails.
> Start a debug session, list all threads, set a breakpoint in `worker.js:executeTask`, inspect the incoming `task` payload for each thread, and evaluate test expressions to pinpoint the failure.
> ```

---

## 💡 Prompt Cheat Sheet & Best Practices

Here are proven prompt templates you can use for everyday debugging:

### 1. The "Find and Fix" Prompt (Most Common)
```text
"The function [function_name] in [file_path] is returning unexpected output. Set a breakpoint at the start of the function, run the debugger, step through line by line, inspect variable values, and fix the bug."
```

### 2. The "Conditional Breakpoint" Prompt (For Loops & High Volume)
```text
"In [file_path], we are experiencing an error only when the loop reaches item index 50. Please set a conditional breakpoint with `i === 50`, start the debugger, and inspect the state when it pauses."
```

### 3. The "Exception Post-Mortem" Prompt
```text
"My application crashes with an unhandled exception. Start the debug session, catch the exception, retrieve the full stack trace and variable scope at the crash point, and explain what caused it."
```

### 4. The "Expression Testing" Prompt
```text
"Pause execution inside [file_path] at line [line_number], then evaluate the expression `[expression]` against the paused scope to verify if the object format matches expectations."
```

---

## 🚀 Summary

With **VSCode MCP DAP Debugger**, debugging transitions from a tedious manual trial-and-error process to an automated, deterministic investigation performed by your AI assistant.

Check out the included `samples/` directory to experiment!
