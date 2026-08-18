# AGENTS.md

Guidance for AI coding agents working **on this repository** (a VS Code extension + CLI). If
you're looking for the guide this tool *writes into other projects* so an agent can drive the
debugger, that's `resources/skills/dap-cli-debugging.md` - a different document for a different
audience.

## What this is

A VS Code extension that exposes VS Code's Debug Adapter Protocol as MCP tools (breakpoints,
stepping, call stack, variables, real DAP/console/exception logs), plus a CLI (`out/cli.js`) that
lets an external MCP client (an AI agent) talk to it via one-off `list`/`call`/`read` commands or a
persistent stdio proxy. See `README.md` for the "why" and user-facing behavior, `DEVELOPMENT.md`
for build/install commands, `CHANGELOG.md` for what shipped, `DEVELOPMENT_TASK.md` for the
still-open hardening backlog (P1/P2 items: automated tests, atomic multi-process registry writes,
Roo Code/Cursor/Copilot support).

## Module map

```
src/
  extension.ts            activate()/deactivate(), thin
  server-lifecycle.ts      SINGLE start/stop path shared by activation and commands - see below
  commands.ts              VS Code command handlers, delegate to server-lifecycle.ts
  monitor-panel.ts         webview status panel
  state.ts                 extension-wide state (HTTP server, port, auth token, panels)

  server/
    http-server.ts          Express app; one McpServer per client session (see below)
    mcp-server-factory.ts    registers tools/resources on a fresh McpServer
    auth.ts                  per-instance token generation/verification

  dap/
    tracker.ts               real DebugAdapterTracker (captures every DAP message)
    session-store.ts         per-session ring buffers (DAP log/console/exceptions) + session registry

  tools/                     one file per tool group (breakpoints, execution-control, inspection,
                             sessions, dap-log, workspace); schemas.ts is the single source of
                             truth for input schemas, shared.ts has the ok()/err()/requireSession()
                             helpers every tool handler uses

  resources.ts               thin MCP resources, deliberately not 1:1 with every tool

  config/
    workspace-config.ts       per-workspace config.json + skill/AGENTS.md injection orchestration
    agent-environments.ts     the injection mechanics (which folders, which scopes, don't clobber)
    registry.ts                cross-workspace instance registry (~/.vscode-mcp-dap-debugger/)
    config-finder.ts           CLI-side discovery (walk up for config.json, else the registry)

  cli/                        commander-based CLI; bundled standalone by esbuild (out/cli.js)
```

## Invariants - don't reintroduce these bugs

These were deliberate fixes over the original tool this was rewritten from. Read `README.md`'s
"Why a rewrite" section for the full context before changing any of the following:

1. **One `McpServer` per client session**, never a shared instance connected to multiple
   transports (`server/http-server.ts`). A shared server hung on a second concurrent connection in
   the original tool.
2. **Every `/mcp` request goes through the SDK's transport**, no bypass that skips zod validation.
3. **`startHttpServer()` resolves only after the `listening` event** (and rejects on `error`);
   `startServer()`/`stopServer()` in `server-lifecycle.ts` share a single in-flight-start promise so
   concurrent calls can't produce two listeners, and a failed start rolls back completely (stops
   the socket it just opened) rather than leaving an unreachable listener running.
4. **JSONC (launch.json) parsing goes through `jsonc-parser`** (`utils/json.ts`), never regex - a
   regex comment-stripper corrupts any string containing `//` or `/* */` (e.g. a URL).
5. **CLI port and token are resolved as one identity** (`cli/cli.ts`): never combine `--port` from
   one instance with an auto-discovered token from another.
6. **`agent-environments.ts` never overwrites a file that already exists** at the target path,
   regardless of settings - a customized `SKILL.md` or `AGENTS.md` section is left alone. AGENTS.md
   specifically is updated via a marked section (`<!-- BEGIN/END vscode-mcp-dap-debugger:... -->`),
   never a full-file overwrite, since it commonly holds hand-written project instructions.
7. **The registry (`config/registry.ts`) never evicts a different, still-live instance** that
   happens to share a `workspacePath` - only a stale registration for the *same* instance id is
   replaced. Silently evicting the other one is what caused port/token confusion when two VS Code
   windows were open on the same folder.

## Settings namespace

All configuration lives under `vscodeDebugMcp.*` in `package.json`'s `contributes.configuration`
(the settings prefix was kept even after the package/display name became "VSCode MCP DAP
Debugger" - renaming it would invalidate anything a user already configured, for no real benefit).
Notably: `vscodeDebugMcp.agentSkills.<claude|gemini|kilo|agentsMd>.*` (per-environment injection
settings) and `vscodeDebugMcp.server.*` (port, autoStart, buffer capacities, session retention).

## Verifying a change

There is no automated test suite yet (`DEVELOPMENT_TASK.md` P1). Verification today is:

```bash
npm run typecheck && npm run lint && npm run build
```

...followed by manual end-to-end testing: F5 in VS Code (Extension Development Host) or
`npx @vscode/vsce package` + `code --install-extension *.vsix`, then drive it with the CLI
(`node out/cli.js call <tool> '<json>'`) against a real debug session. When touching
session/lifecycle code specifically, test with **two concurrent debug sessions** and **two
concurrent CLI/MCP clients** - that's exactly the scenario the original tool got wrong.

<!-- BEGIN vscode-mcp-dap-debugger:dap-cli-debugging -->
## VS Code MCP DAP Debugger

# AI Agent Skill: VS Code DAP Debugger Control via CLI

## Objective

You (the AI agent) can control the VS Code debugger via one-off CLI commands - no persistent
stdio connection needed.

## CLI Interface

```bash
npx vscode-mcp-dap-debugger <command> [args]
```

Auto-discovery finds the right VS Code instance (port + auth token) by walking up from the
current directory for a `.vscode/mcp-dap-debugger.json`, then falling back to
`~/.vscode-mcp-dap-debugger/active-configs.json` if there's exactly one active instance. If there are
multiple active instances and discovery picks the wrong one, use `list-vscode-instances` and
`select-vscode-instance`, or pass `--port`/`--token` explicitly.

**Key rules:**

- `stdout` = pure JSON result. Always parse stdout only.
- `stderr` = connection logs. Ignore stderr.
- On error, read the JSON error message, correct arguments, and retry.

### Commands

| Command | Usage |
| --------- | ------- |
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
| ------ | -------- | ------------- |
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
| ------ | -------- | ------------- |
| `add-breakpoint` | `file`, `line`, `condition?`, `hitCondition?`, `logMessage?` | Add a breakpoint or logpoint |
| `add-breakpoints` | `breakpoints[]` | Add multiple at once |
| `remove-breakpoint` | `file`, `line` | Remove a breakpoint |
| `clear-breakpoints` | `files?[]` | Remove all (or from specific files) |
| `list-breakpoints` | - | List all breakpoints, with conditions/logMessage |

### Execution Control (session/thread-scoped)

| Tool | Params | Description |
| ------ | -------- | ------------- |
| `continue` | `sessionId?`, `threadId?` | Resume execution |
| `step-over` | `sessionId?`, `threadId?` | Step over current line |
| `step-into` | `sessionId?`, `threadId?` | Step into function call |
| `step-out` | `sessionId?`, `threadId?` | Step out of current function |
| `pause` | `sessionId?`, `threadId?` | Pause running execution |

### State Inspection

| Tool | Params | Description |
| ------ | -------- | ------------- |
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
<!-- END vscode-mcp-dap-debugger:dap-cli-debugging -->
