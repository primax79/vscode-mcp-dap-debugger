# Development & Installation Guide

## Development

```bash
npm install
npm run build       # esbuild -> out/extension.js, out/cli.js
npm run typecheck   # tsc --noEmit -p .
npm run lint
```

Run the extension: open this folder in VS Code and press F5 (Extension Development Host).

Run the CLI standalone for testing:
```bash
node out/cli.js <command> [args]
```
*(For a complete reference of all available CLI commands and tools, see the `resources/skills/dap-cli-debugging.md` file, which is also used as the AI usage manual).*

## Packaging & Manual Installation

While the extension is available on the VS Code Marketplace, you can also install it manually (e.g., to test preview versions or if you've built it yourself).

### 1. Get the `.vsix` package
You have two options to get the extension package:
- **Download it:** Grab the latest `.vsix` file from the [Releases](https://github.com/primax79/vscode-mcp-dap-debugger/releases) page.
- **Build it yourself:** Run `npx @vscode/vsce package` in the repository root to generate the file locally.

### 2. Install the extension
**Option A: Via the VS Code UI**
1. Open the **Extensions** view (`Cmd+Shift+X` on Mac / `Ctrl+Shift+X` on Windows).
2. Click the three dots `...` in the top right corner of the Extensions view.
3. Select **Install from VSIX...** and choose the downloaded or built `.vsix` file.

**Option B: Via the command line**
```bash
code --install-extension vscode-mcp-dap-debugger-*.vsix
```