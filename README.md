# VSCode MCP DAP Debugger

**VSCode MCP DAP Debugger** exposes VS Code's Debug Adapter Protocol (DAP) through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) and an integrated CLI. 

This enables AI coding agents (such as **Claude Code, Kilo Code, Gemini CLI, Cursor, Roo Code, Codex**, and others) to interact programmatically with the active VS Code debugger: setting breakpoints, stepping through execution, inspecting runtime variables, and evaluating expressions against running processes.

---

## Features

- **Launcher Auto-Configuration:** Analyzes the workspace (Node.js, TypeScript, Python, Go, Rust, etc.) and generates or updates `.vscode/launch.json` configurations prior to starting a debug session.
- **Breakpoint Management:** Programmatically adds, removes, and lists breakpoints, conditional breakpoints, and logpoints.
- **Execution Control:** Controls step-over, step-into, step-out, pause, continue, and stop operations.
- **Variable Inspection:** Reads local, global, closure, and nested variable states across active stack frames.
- **Expression Evaluation:** Evaluates expressions directly in the context of the paused frame.
- **Multi-Session & Multi-Thread Support:** Tracks all active debug sessions and worker threads with explicit `sessionId` and `threadId` routing.
- **Exception & Log Capture:** Retrieves raw DAP protocol messages, debug console output, and exception traces.

---

## Getting Started

1. **Install the Extension:** 
   - Open VS Code.
   - Open the **Extensions** view (`Cmd+Shift+X` on macOS / `Ctrl+Shift+X` on Windows/Linux).
   - Search for **VSCode MCP DAP Debugger** and click **Install**.

2. **Open a Project:** 
   - Open your project folder in VS Code.

3. **Start the MCP Server:** 
   - Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
   - Run `Debug MCP: Start MCP Server`.
   - *(The server also starts automatically upon workspace activation if `vscodeDebugMcp.server.autoStart` is enabled).*

4. **Agent Integration:**
   - The extension automatically injects skill instructions into `.claude/skills`, `.gemini/skills`, `.kilo/skills`, or `AGENTS.md` (if the base directories exist in the workspace).
   - The agent can then use the debugger tools directly via MCP or the standalone CLI (`vscode-mcp-dap-debugger`).

---

## Tutorial & Sample Projects

Ready-to-run sample projects demonstrating debugging workflows from simple to advanced:

- **[AI Debugging Tutorial](TUTORIAL.md)**: Step-by-step walkthrough covering breakpoint inspection, asynchronous exceptions, and multi-threaded debugging.
- **[Sample 1: Basic Calculation Bug](samples/01-basic-calculation-bug)**: Setting breakpoints and inspecting variables in synchronous code.
- **[Sample 2: Async Data Pipeline](samples/02-async-data-pipeline)**: Trapping unhandled exceptions and stepping through asynchronous streams.
- **[Sample 3: Multi-Threaded Workers](samples/03-multi-threaded-worker)**: Inspecting worker threads and evaluating expressions across threads.

---

## Extension Settings

All configuration options are available under the `vscodeDebugMcp.*` namespace in `settings.json`:

| Setting | Default | Description |
|---|---|---|
| `vscodeDebugMcp.server.autoStart` | `true` | Automatically start the MCP server when opening a workspace. |
| `vscodeDebugMcp.server.port` | `8891` | Preferred port for the local MCP server. If busy, the next available port is bound. |
| `vscodeDebugMcp.agentSkills.*` | `true` | Configure auto-injection of skills per environment (Claude, Gemini, Kilo, AGENTS.md). |
| `vscodeDebugMcp.server.dapLogCapacity` | `500` | Maximum number of DAP protocol messages retained per session. |
| `vscodeDebugMcp.server.consoleOutputCapacity` | `500` | Maximum number of console output lines retained per session. |
| `vscodeDebugMcp.server.exceptionCapacity` | `50` | Maximum number of exception records retained per session. |
| `vscodeDebugMcp.server.terminatedSessionRetentionMinutes` | `5` | Retention window (in minutes) for terminated session data before eviction. |

---

## Security & Architecture

- **Local Loopback Only:** The HTTP server binds exclusively to `127.0.0.1`.
- **DNS Rebinding Protection:** Enforced on all incoming requests.
- **Per-Instance Token Authentication:** A cryptographic token is generated at startup and written to `.vscode/mcp-dap-debugger.json` with restricted file permissions (`0o600`).
- **Discovery Isolation:** The CLI discovers active instances by reading the workspace configuration (`.vscode/mcp-dap-debugger.json`) or querying the per-user active registry (`~/.vscode-mcp-dap-debugger/active-configs.json`).

---

## Development & Contributing

For instructions on building from source, testing the CLI standalone, or running the extension in development mode, refer to [DEVELOPMENT.md](DEVELOPMENT.md).

---

## Credits & License

This project is a from-scratch rewrite inspired by [mcp-debug-tools](https://github.com/hwanyong/mcp-debug-tools) by Hwanyong Yoo. The VS Code integration points and CLI discovery approach were used as a reference, while the DAP tracking, session lifecycle, atomic server startup, and security models were redesigned.

Licensed under the **GPL-3.0** License.
