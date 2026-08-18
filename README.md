# VSCode MCP DAP Debugger

A VS Code extension and CLI that expose VS Code's Debug Adapter Protocol (DAP) as Model Context Protocol (MCP) tools. This allows AI coding agents (like Claude, Kilo, Roo Code, etc.) to set breakpoints, step through code, inspect variables, and read exceptions in a real, live debug session directly within VS Code.

## 🚀 Features

Empower your AI agents with real debugging capabilities:
- **Set Breakpoints:** Agents can dynamically add, remove, and manage breakpoints (and logpoints) in your code.
- **Step Through Execution:** Support for stepping over, stepping into, stepping out, and continuing execution.
- **Inspect Variables:** Agents can explore local/global variables, closures, and complex object states.
- **Evaluate Expressions:** Run expressions in the context of the current debug session.
- **Exception Inspection:** Read the exact stack traces and error messages when the debugger pauses on an exception.

## 💡 How to Use

1. **Start the MCP Server:** Open the Command Palette in VS Code (`Cmd+Shift+P` / `Ctrl+Shift+P`), type `VSCode Debug MCP: Start MCP Server`, and execute it.
2. **AI Agent Discovery:** Once the server is running, your AI agent can interact with it via the CLI tool `vscode-mcp-dap-debugger`. 
   - *Note:* The extension automatically injects usage instructions (Skills) into `.claude/skills` and `.gemini/skills` in your workspace so that agents know exactly how to use the debugger tools.
3. **Debug:** Ask your AI agent to debug a specific problem, and watch it set breakpoints and step through your code!

For manual installation and development instructions, please refer to the [DEVELOPMENT.md](./DEVELOPMENT.md) guide.

## 🛠️ Implementation Details (Security Model)

The HTTP server binds to `127.0.0.1` only, keeps DNS rebinding protection enabled, and requires a per-instance auth token on every request. 
- The token is generated at startup and written to the workspace's `.vscode-mcp-dap-debugger/config.json` and to `~/.vscode-mcp-dap-debugger/active-configs.json`. 
- The CLI discovers the token the same way it discovers the port. 
- This is not meant as strong auth, but rather as a guard against another local process or user stumbling onto the port and driving the debugger (including running arbitrary expressions via `evaluate-expression`) without having had filesystem access to this workspace in the first place.

## 🏆 Credits

This project is a from-scratch rewrite, started as an analysis of and inspired by [mcp-debug-tools](https://github.com/hwanyong/mcp-debug-tools) by Hwanyong Yoo. No source code was copied verbatim (aside from a few small, functionally trivial utility files); the VS Code integration points (activation, commands, contributes) and CLI/discovery approach were used as a reference while redesigning the DAP tracking, session handling, and server security from the ground up. Licensed GPL-3.0, same as the original.

## 🔄 Why a rewrite

An analysis of the original tool found several issues not worth patching in place:
- DAP message tracking was a stub that always returned canned placeholders for `get-dap-log`, `get-debug-console` and `get-exception-info` - never real data.
- A single shared `McpServer` instance handled every client session, causing a second concurrent connection to hang indefinitely.
- The HTTP server had no authentication and disabled DNS rebinding protection.
- `logMessage` (logpoints) was accepted but never actually applied.
- Stopping/restarting the server via command left the on-disk config file pointing at a stale port.
- Two `package.json` files were swapped in and out before each build, which is how a required runtime dependency ended up undeclared in every published version.

All of these are fixed here; see `CHANGELOG.md` for the full list.