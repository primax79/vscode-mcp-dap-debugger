# Sample 2: Async Pipeline & Exception Inspection

This sample demonstrates how an AI agent uses conditional breakpoints, step-into, and exception inspection on an asynchronous data stream.

## The Problem

In `app.js`, `processPipeline` crashes midway when processing a batch of analytics events:
- Events 1 and 2 process normally.
- Event 3 (`evt_3`) contains `meta: null`, crashing with `TypeError: Cannot read properties of null (reading 'country')`.
- The entire batch fails and processing stops.

## How to Test with AI

1. Open this folder in VS Code:
   ```bash
   code samples/02-async-data-pipeline
   ```
2. Make sure the VSCode MCP DAP Debugger extension is active.
3. Ask your AI Assistant:

> **Sample Prompt:**
> *"The async pipeline in `app.js` crashes during execution. Please set a conditional breakpoint inside `enrichEvent` or catch the exception, inspect `event` and `event.meta`, diagnose the crash, and add safe fallbacks for missing metadata."*
