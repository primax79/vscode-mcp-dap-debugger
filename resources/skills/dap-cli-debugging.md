---
name: dap-cli-debugging
description: Control the VS Code Debugger (DAP) via CLI commands using vscode-mcp-dap-debugger. Use when debugging, setting breakpoints, stepping through code, or inspecting variables.
---

# AI Agent Skill: VS Code DAP Debugger Control via CLI

## Objective
You (the AI agent) can control the VS Code debugger via one-off CLI commands - no persistent
stdio connection needed.

## CLI Interface

```bash
npx vscode-mcp-dap-debugger <command> [args]
```

Auto-discovery finds the right VS Code instance (port + auth token) by walking up from the
current directory for a `.vscode-mcp-dap-debugger/config.json`, then falling back to
`~/.vscode-mcp-dap-debugger/active-configs.json` if there's exactly one active instance. If there are
multiple active instances and discovery picks the wrong one, use `list-vscode-instances` and
`select-vscode-instance`, or pass `--port`/`--token` explicitly.

**Key rules:**
- `stdout` = pure JSON result. Always parse stdout only.
- `stderr` = connection logs. Ignore stderr.
- On error, read the JSON error message, correct arguments, and retry.

### Commands

| Command | Usage |
|---------|-------|
| **list** | `npx vscode-mcp-dap-debugger list` - discover all available tools and their input schemas |
| **call** | `npx vscode-mcp-dap-debugger call <toolName> [jsonArgs]` - execute a specific tool |
| **read** | `npx vscode-mcp-dap-debugger read <resourceUri>` - read a debugger state resource |

## Multiple debug sessions

Unlike single-session debuggers, this tool tracks **every** active debug session, not just the
one focused in the VS Code UI. Most tools accept an optional `sessionId`:

- Omit it to target the UI-focused session, or the only active one.
- If more than one session is active and none is focused, tools return an error listing the
  ambiguity - call `list-debug-sessions` first and pass the `sessionId` you want.

## Available Tools - Quick Reference

### Session & Config Management
| Tool | Params | Description |
|------|--------|-------------|
| `list-debug-sessions` | - | List every tracked debug session |
| `get-active-session` | - | Get the session focused in the VS Code UI |
| `get-debug-state` | `sessionId?` | Session overview + all breakpoints |
| `list-debug-configs` | - | List configurations from launch.json |
| `select-debug-config` | `configName` | Look up a debug configuration by name |
| `start-debug` | `config` | Start a debug session |
| `stop-debug` | `sessionId?` | Stop a specific (or the only/focused) debug session |
| `get-workspace-info` | - | Current workspace + server info |
| `list-vscode-instances` | - | List all active VS Code instances |
| `select-vscode-instance` | `port?`, `workspace?` | Find connection details for another instance |

### Breakpoint Management
| Tool | Params | Description |
|------|--------|-------------|
| `add-breakpoint` | `file`, `line`, `condition?`, `hitCondition?`, `logMessage?` | Add a breakpoint or logpoint |
| `add-breakpoints` | `breakpoints[]` | Add multiple at once |
| `remove-breakpoint` | `file`, `line` | Remove a breakpoint |
| `clear-breakpoints` | `files?[]` | Remove all (or from specific files) |
| `list-breakpoints` | - | List all breakpoints, with conditions/logMessage |

### Execution Control (session/thread-scoped)
| Tool | Params | Description |
|------|--------|-------------|
| `continue` | `sessionId?`, `threadId?` | Resume execution |
| `step-over` | `sessionId?`, `threadId?` | Step over current line |
| `step-into` | `sessionId?`, `threadId?` | Step into function call |
| `step-out` | `sessionId?`, `threadId?` | Step out of current function |
| `pause` | `sessionId?`, `threadId?` | Pause running execution |

### State Inspection
| Tool | Params | Description |
|------|--------|-------------|
| `get-call-stack` | `sessionId?`, `threadId?`, `startFrame?`, `levels?` | Call stack frames |
| `get-active-stack-item` | - | Currently focused thread/stack frame |
| `get-variables-scope` | `sessionId?`, `frameId?`, `scopeName?` | All variables in scope |
| `inspect-variable` | `variableName`, `sessionId?`, `frameId?` | Details for a variable, supports nested paths like `user.address[0].city` |
| `evaluate-expression` | `expression`, `sessionId?`, `frameId?` | Evaluate an expression |
| `get-thread-list` | `sessionId?` | List all threads |
| `get-dap-log` | `sessionId?`, `limit?` | Raw DAP protocol messages for a session |
| `get-debug-console` | `sessionId?`, `limit?`, `filter?` | Debug console/stdout/stderr output |
| `get-exception-info` | `sessionId?`, `limit?` | Recent exception details |

## CLI Examples

```bash
# Check what's running
npx vscode-mcp-dap-debugger call list-debug-sessions

# Set a conditional breakpoint / a logpoint
npx vscode-mcp-dap-debugger call add-breakpoint '{"file": "src/app.ts", "line": 15, "condition": "x > 10"}'
npx vscode-mcp-dap-debugger call add-breakpoint '{"file": "src/app.ts", "line": 15, "logMessage": "x = {x}"}'

# Start debugging with a named config
npx vscode-mcp-dap-debugger call start-debug '{"config": "Launch Program"}'

# Step and inspect (targeting a specific session once more than one is active)
npx vscode-mcp-dap-debugger call step-over '{"sessionId": "abc123"}'
npx vscode-mcp-dap-debugger call get-variables-scope '{"sessionId": "abc123"}'
npx vscode-mcp-dap-debugger call inspect-variable '{"variableName": "user.address[0].city"}'

# Evaluate an expression at the current breakpoint
npx vscode-mcp-dap-debugger call evaluate-expression '{"expression": "arr.length"}'
```

## 🛠️ Step 0: Debug Configuration Setup (`.vscode/launch.json`)

Before starting a debug session, check available configurations:
```bash
npx vscode-mcp-dap-debugger call list-debug-configs
```

If `.vscode/launch.json` is missing or has no matching configuration for the project, **inspect the project root** (`package.json`, `tsconfig.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc.) and create or append the appropriate configuration into `.vscode/launch.json`:

### Standard Configuration Templates

#### Node.js (JavaScript)
```json
{
  "type": "node",
  "request": "launch",
  "name": "Launch Program",
  "skipFiles": ["<node_internals>/**"],
  "program": "${workspaceFolder}/<entry-point.js>"
}
```

#### TypeScript (with ts-node / tsx / esbuild)
```json
{
  "type": "node",
  "request": "launch",
  "name": "Launch TypeScript",
  "runtimeArgs": ["-r", "ts-node/register"],
  "args": ["${workspaceFolder}/src/index.ts"],
  "sourceMaps": true,
  "skipFiles": ["<node_internals>/**"]
}
```

#### Python (debugpy)
```json
{
  "name": "Python: Current File",
  "type": "debugpy",
  "request": "launch",
  "program": "${file}",
  "console": "integratedTerminal"
}
```

#### Go (delve)
```json
{
  "name": "Launch Package",
  "type": "go",
  "request": "launch",
  "mode": "auto",
  "program": "${workspaceFolder}"
}
```

#### Rust / C++ (CodeLLDB)
```json
{
  "name": "Debug Executable",
  "type": "lldb",
  "request": "launch",
  "program": "${workspaceFolder}/target/debug/<binary-name>",
  "cwd": "${workspaceFolder}"
}
```

---

## Standard Debugging Workflow

0. **Check/Create Launch Config** -> `list-debug-configs`, create `.vscode/launch.json` if missing
1. **Check status** -> `list-debug-sessions` / `get-active-session`
2. **Set breakpoints** -> `add-breakpoint` / `add-breakpoints`
3. **Start debug** -> `start-debug` with the chosen config name
4. **Analyze state** -> `get-call-stack` + `get-variables-scope`
5. **Inspect details** -> `inspect-variable` or `evaluate-expression`
6. **Step through** -> `step-over` / `step-into` / `step-out`, repeat 4-5
7. **Fix code** -> edit source, restart the debugger to verify
