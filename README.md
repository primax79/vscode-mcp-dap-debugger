# VSCode Debug MCP

A VS Code extension and CLI that expose VS Code's Debug Adapter Protocol (DAP) as MCP tools, so
an AI coding agent can set breakpoints, step through code, inspect variables and read exceptions
in a real debug session.

## Credits

This project is a from-scratch rewrite, started as an analysis of and inspired by
[mcp-debug-tools](https://github.com/hwanyong/mcp-debug-tools) by Hwanyong Yoo. No source code was
copied verbatim (aside from a few small, functionally trivial utility files); the VS Code
integration points (activation, commands, contributes) and CLI/discovery approach were used as a
reference while redesigning the DAP tracking, session handling, and server security from the
ground up. Licensed GPL-3.0, same as the original.

## Why a rewrite

An analysis of the original tool found several issues not worth patching in place:

- DAP message tracking was a stub that always returned canned placeholders for `get-dap-log`,
  `get-debug-console` and `get-exception-info` - never real data.
- A single shared `McpServer` instance handled every client session, causing a second concurrent
  connection to hang indefinitely.
- The HTTP server had no authentication and disabled DNS rebinding protection.
- `logMessage` (logpoints) was accepted but never actually applied.
- Stopping/restarting the server via command left the on-disk config file pointing at a stale port.
- Two `package.json` files were swapped in and out before each build, which is how a required
  runtime dependency ended up undeclared in every published version.

All of these are fixed here; see CHANGELOG.md for the list.

## Development

```bash
npm install
npm run build       # esbuild -> out/extension.js, out/cli.js
npm run typecheck    # tsc --noEmit
npm run lint
```

Run the extension: open this folder in VS Code and press F5 (Extension Development Host).

Run the CLI standalone: `node out/cli.js <command> [args]` - see `resources/skills/dap-cli-debugging.md`
for the full command/tool reference.

## Packaging & Installation

To create an installable `.vsix` package for VS Code:

```bash
npx @vscode/vsce package
```

This will generate a `vscode-mcp-dap-debugger-X.Y.Z.vsix` file in the repository root. You can install it in VS Code via the UI (Extensions -> `...` -> **Install from VSIX...**) or from the command line:

```bash
code --install-extension vscode-mcp-dap-debugger-*.vsix
```

## Security model

The HTTP server binds to `127.0.0.1` only, keeps DNS rebinding protection enabled, and requires
a per-instance auth token (generated at startup, written to the workspace's
`.vscode-mcp-dap-debugger/config.json` and to `~/.vscode-mcp-dap-debugger/active-configs.json`) on every
request. The CLI discovers the token the same way it discovers the port. This is not meant as
strong auth - it's a guard against another local process or user stumbling onto the port and
driving the debugger (including running arbitrary expressions via `evaluate-expression`) without
having had filesystem access to this workspace in the first place.
