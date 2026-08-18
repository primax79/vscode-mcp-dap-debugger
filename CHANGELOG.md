# Changelog

## 0.2.0

- **Workspace Configuration Relocation:** Workspace configuration and session auth tokens are now stored cleanly in `.vscode/mcp-dap-debugger.json` instead of creating a separate root folder, with backward-compatible auto-discovery fallback.
- **Launcher Auto-Configuration in Skill:** The AI agent skill guide now includes instructions and preconfigured templates (Node.js, TypeScript, Python, Go, Rust) for automatically generating or updating `.vscode/launch.json` before starting a debug session.
- **Tutorial & Sample Projects:** Added `TUTORIAL.md` and 3 standalone sample projects (`samples/`) demonstrating synchronous logic debugging, asynchronous exception trapping, and multi-threaded worker pool inspection.
- **Fixed Extension Activation & Bundling:** 
  - Fixed runtime module loading issue by configuring esbuild to resolve ESM modules for `jsonc-parser`.
  - Added explicit `onCommand` triggers to `activationEvents` to prevent "command not found" errors when executing commands prior to full workspace startup.
- **VSIX Package Optimization:** Correctly excluded development-only reference assets from the `.vsix` bundle, reducing extension package size from >100MB to ~690KB.
- **Performance:** Refactored `RingBuffer` implementation with a circular pointer for O(1) insertions instead of array shifting.
- **Documentation:** Restructured `README.md` for the VS Code Marketplace with a clean, technical tone, and separated local build instructions into `DEVELOPMENT.md`.

## 0.1.0

Initial rewrite. See README.md for context on why this exists.

- Real DAP message/console/exception tracking (previously a stub that always returned placeholders).
- Per-session MCP server instances, fixing a hang when more than one client connected concurrently.
- Local auth token required on every request to the HTTP server.
- Multi-session debug support: execution control and inspection tools accept an explicit `sessionId`/`threadId`.
- Logpoints (`logMessage`) actually take effect.
- Single `package.json`, bundled with esbuild - no more dependency drift between build targets.
- JSONC (`launch.json`) parsing uses `jsonc-parser` instead of a regex comment-stripper, which
  corrupted any string containing `//` or `/* */` (e.g. a URL).
- Server startup is atomic: `startServer()` resolves only once listening/config/registry are all
  ready, concurrent calls share one in-flight attempt, and a failed start rolls back completely.
- CLI resolves port + token as a single connection identity - `--port` without `--token` never
  picks up a different instance's token; ambiguous auto-discovery is reported explicitly instead of
  silently picking the first registry entry.
- The registry no longer evicts a different, still-live instance sharing a `workspacePath`; only a
  stale registration for the same instance id is replaced.
- Terminated debug sessions keep their DAP log/console/exceptions readable for a few minutes
  instead of disappearing the instant the session ends.
- Per-environment AI-agent skill settings (`vscodeDebugMcp.agentSkills.<claude|gemini|kilo|agentsMd>.*`):
  enable/disable, scope (project/global/both), and "only if the base folder already exists" vs.
  force-create, independently per environment. Adds Kilo Code and a marked, non-destructive
  section in `AGENTS.md` (for Codex CLI and similar tools) alongside Claude Code/Gemini CLI.
- Server behavior settings (`vscodeDebugMcp.server.*`): port, auto-start on activation, and the
  DAP log/console/exception buffer capacities and terminated-session retention window.
