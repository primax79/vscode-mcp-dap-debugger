# Changelog

## 0.1.0

Initial rewrite. See README.md for context on why this exists.

- Real DAP message/console/exception tracking (previously a stub that always returned placeholders).
- Per-session MCP server instances, fixing a hang when more than one client connected concurrently.
- Local auth token required on every request to the HTTP server.
- Multi-session debug support: execution control and inspection tools accept an explicit `sessionId`/`threadId`.
- Logpoints (`logMessage`) actually take effect.
- Single `package.json`, bundled with esbuild - no more dependency drift between build targets.
