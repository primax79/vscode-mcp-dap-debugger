<div align="center">
  <h1>🐞 VSCode MCP DAP Debugger</h1>
  <p><strong>Give your AI Coding Assistants the power to run a real, live debugger.</strong></p>
</div>

---

**VSCode MCP DAP Debugger** is a VS Code extension and CLI tool that exposes VS Code's Debug Adapter Protocol (DAP) as [Model Context Protocol (MCP)](https://modelcontextprotocol.io) tools. 

Instead of guessing what went wrong from static code, AI agents (like **Claude Code, Copilot, Codex, Kilocode, Roo Code**, and more) can now set breakpoints, step through code, inspect variables, and evaluate expressions in a *real, live debug session* directly within VS Code.

## 🤖 Supercharge your AI Coding Assistants

When your code fails, AI agents usually have to add `console.log` statements or make educated guesses by reading the source. **No more.**

With this extension, your AI can:
- **Set Breakpoints:** Dynamically add, remove, and manage breakpoints (and logpoints) in your code.
- **Step Through Execution:** Support for stepping over, stepping into, stepping out, and continuing execution to trace the exact flow of data.
- **Inspect Variables:** Explore local and global variables, closures, and complex object states at any paused frame.
- **Evaluate Expressions:** Run custom expressions in the context of the current paused debug session to test hypotheses immediately.
- **Exception Inspection:** Read the exact stack traces and error messages when the debugger pauses on an exception.

## 🚀 Getting Started

1. **Install the Extension:** 
   - Open VS Code.
   - Go to the **Extensions** view (`Cmd+Shift+X` on Mac / `Ctrl+Shift+X` on Windows).
   - Search for **VSCode MCP DAP Debugger** and click **Install**.
2. **Open a Project & Debug:** Open your project in VS Code and start a debug session (e.g., press `F5`).
3. **Start the MCP Server:** 
   - Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
   - Type `Debug MCP: Start MCP Server` and execute it. 
   - *(Note: By default, the server starts automatically when you open a workspace).*
4. **Let your AI take over:** 
   Ask your AI agent to debug a specific problem. It will automatically discover the MCP tools and begin debugging!

### 🪄 Auto-Discovery for AI Agents

To ensure your AI agents know exactly how to use the debugger, the extension automatically injects usage instructions ("Skills") into your workspace. 
It supports automatic injection for:
- `.claude/skills` (for Claude Code)
- `.gemini/skills` (for Gemini CLI)
- `.kilo/skills` (for Kilocode)
- `AGENTS.md` (for Codex CLI and other agents)

*These are safely injected only if the base directories already exist, ensuring your workspace stays clean.*

## ⚙️ Extension Settings

You can customize the behavior of the extension via VS Code settings (`settings.json`):

| Setting | Default | Description |
|---|---|---|
| `vscodeDebugMcp.server.autoStart` | `true` | Automatically start the MCP server when opening a workspace. |
| `vscodeDebugMcp.server.port` | `8891` | Preferred port for the local MCP server. If busy, the next free port is used. |
| `vscodeDebugMcp.agentSkills.*` | `true` | Independently toggle and scope (project vs global) the auto-injection of skills for Claude, Gemini, Kilo, and `AGENTS.md`. |
| `vscodeDebugMcp.server.*Capacity` | `500` / `50` | Buffer limits for DAP logs, console output, and exceptions to prevent memory bloat during long sessions. |

## 🔒 Security & Architecture

Security is a primary focus when exposing internal IDE APIs.
- **Local Only:** The HTTP server binds strictly to `127.0.0.1`.
- **DNS Rebinding Protection:** Prevents malicious websites from hijacking the local server.
- **Per-instance Auth Tokens:** A unique token is generated at startup and required for every request. The CLI auto-discovers this token via a local config file (`.vscode-mcp-dap-debugger/config.json`). This ensures only processes with local filesystem access to your workspace can drive the debugger.

## 👨‍💻 Development & Contributing

Want to contribute, build from source, or check out the technical implementation details? 
Please refer to the [DEVELOPMENT.md](DEVELOPMENT.md) guide.

## 🏆 Credits & License

This project is a from-scratch rewrite, inspired by [mcp-debug-tools](https://github.com/hwanyong/mcp-debug-tools) by Hwanyong Yoo. The VS Code integration points and CLI discovery approach were used as a reference, while the DAP tracking, session handling, atomic server startup, and security models were redesigned from the ground up to be robust, secure, and multi-session capable. 

Licensed under the **GPL-3.0** License.
