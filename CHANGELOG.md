# Changelog

## Unreleased

- **Paused frame by default:** `evaluate-expression`, `get-variables-scope` and `inspect-variable` without `frameId` resolve the focused frame, then the top frame of the focused or last stopped thread of that session, and return `frameUsed`; with nothing paused `evaluate-expression` returns `frameUsed: null` and an adapter-specific `warning`.
- **Call stack hints:** `get-call-stack` returns frame/source presentation hints and `source.origin`, `includeDeemphasized: false` drops internal frames (`returnedFrames`, `filteredOut`), and reports the effective `justMyCode` with a hint for debugpy.
- **Fixes:** `get-call-stack` without `threadId` no longer picks the focused thread of a different session; `get-debug-state` reports the session-resolution error (e.g. several sessions active) instead of looking like no session.
- **Per-session breakpoint policy:** `start-debug` accepts `breakpoints: "ide" | "none" | [list]` (default `"ide"`, unchanged), applied to that session and its child sessions only, also to IDE breakpoints added during the session (`breakpointMechanism`: `rewrite` by default, `reapply` as fallback). The result reports requested and verified breakpoints and warns when an attach installs breakpoints into a live process.
- **`start-debug` overrides:** `overrides` is shallow-merged onto the launch.json configuration (e.g. `{"justMyCode": false}`); rejected for compound configurations.
- **Thread execution state:** `get-debug-state` returns per-thread `state`, stop `reason`/`description` and `hitBreakpoints` resolved to file:line.
- **`list-debug-sessions`:** lists live sessions only by default, with `terminatedCount`; `includeTerminated: true` restores the full list. Terminated sessions stay addressable by id.
- **Sample 03:** `--loop` mode and an `Attach to Worker Pool` configuration on port 9229.
- **CLI `--raw` output:** `call` and `read` accept `--raw` and print the tool's own JSON object (or plain text) instead of the MCP envelope; tool errors print `{"error": "..."}`.
- **CLI exit codes (behaviour change):** `0` success, `1` tool error (`isError`), discovery, auth, connection or timeout error, `2` usage error. A tool error now exits 1 also without `--raw` (it used to exit 0). The CLI no longer calls `process.exit()` before closing the transport, and the 30 s timeout timer is cleared.
- **Zsh-Safe CLI Invocation:** Replaced the `$DAP_CLI` variable pattern in the AI agent skill and documentation with a portable `dap()` shell function that works identically across Bash and Zsh, handles Zsh's strict globbing rules, automatically selects the newest installed extension version, and fails with a clear message and exit code 127 if no installation is found. Added an equivalent PowerShell function and subshell execution guidance.
- **Live Services & Pausing Warnings:** Added documentation and tool description warnings about the side effects of pausing live or shared services (requests stall until continued). Recommended logpoints on shared environments, detaching with `stop-debug` when done, and cleaning up stopped processes before disconnecting.
- **Pause Tool Description:** Updated the `pause` execution control tool description to explicitly warn that requests stall on live services until continued.

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
- **Skill renamed to `ai-debugger`:** The injected AI-agent skill was previously named `dap-cli-debugging`, colliding with the skill name used by the original `mcp-debug-tools` project this was rewritten from - a workspace with both tools installed would have their skill guides overwrite or block each other.
- **Fixed broken CLI invocation in the injected skill:** The guide told agents to run `npx vscode-mcp-dap-debugger`, which 404s for anyone who only installed the `.vsix` (no npm package to resolve). It now defines `$DAP_CLI` once, pointing at the exact `cli.js` bundled inside the installed extension, with `npx` documented only as an optional alternative.
- **Skill injection asks for consent:** Before writing or updating any AI-agent skill guide for the first time in a workspace, a native VS Code prompt now asks the user to confirm - remembered per workspace so it only asks once.
- **Skill guides auto-update safely:** Every guide this extension writes now carries a content-hash marker, so a future version can refresh an untouched copy in place while leaving any hand-edited guide alone permanently.
- **Monitor Panel: AI Agent Skills management:** New table showing install status per environment (Claude Code, Gemini CLI, Kilo Code, AGENTS.md) with manual Install/Reinstall buttons for project and global scope.
- **Docker Compose debugging guidance:** The skill's launch-configuration guide now covers attaching to a service running inside Docker Compose (locating its exposed debug port and container source root) alongside the existing Node/TypeScript/Python/Go/Rust templates.
- **Fixed stale MCP server version:** The server reported a hardcoded `0.1.0` regardless of the actual package version; it now reads `package.json` at build time, same as the CLI's `--version`.
- **Settings namespace renamed to `vscodeMcpDapDebugger.*`:** Previously `vscodeDebugMcp.*`, a name left over from before this project's own rename to VSCode MCP DAP Debugger.

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
- Per-environment AI-agent skill settings (`vscodeMcpDapDebugger.agentSkills.<claude|gemini|kilo|agentsMd>.*`):
  enable/disable, scope (project/global/both), and "only if the base folder already exists" vs.
  force-create, independently per environment. Adds Kilo Code and a marked, non-destructive
  section in `AGENTS.md` (for Codex CLI and similar tools) alongside Claude Code/Gemini CLI.
- Server behavior settings (`vscodeMcpDapDebugger.server.*`): port, auto-start on activation, and the
  DAP log/console/exception buffer capacities and terminated-session retention window.
