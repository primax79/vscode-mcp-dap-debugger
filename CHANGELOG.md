# Changelog

## 0.2.0

- Fixed an issue where extension commands resulted in a "command not found" error by adding explicit `onCommand` triggers to `activationEvents`.
- Fixed VSIX bundle bloat by correctly ignoring the `mcp-debug-tools/` directory, drastically reducing the packaged extension size.
- Refactored `RingBuffer` implementation to use a circular pointer for O(1) performance instead of array shifting.
- Improved documentation and JSDoc comments for utility functions.
- Updated README for the marketplace and extracted developer documentation into `DEVELOPMENT.md`.

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
