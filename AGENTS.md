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
