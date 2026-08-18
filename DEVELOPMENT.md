# Development & Installation Guide

## Development

```bash
npm install
npm run build       # esbuild -> out/extension.js, out/cli.js
npm run typecheck   # tsc --noEmit -p .
npm run lint
```

Run the extension: open this folder in VS Code and press F5 (Extension Development Host).

Run the CLI standalone: `node out/cli.js <command> [args]` - see `resources/skills/dap-cli-debugging.md` for the full command/tool reference.

## Packaging & Manual Installation

While the extension is available on the VS Code Marketplace, you can also install it manually (e.g., to test preview versions or if you've built it yourself).

### Option 1: Install from Releases
1. Download the latest `.vsix` file from the [Releases](https://github.com/primax79/vscode-mcp-dap-debugger/releases) page.
2. Install it in VS Code via the UI:
   - Open the **Extensions** view (`Cmd+Shift+X` on Mac / `Ctrl+Shift+X` on Windows).
   - Click the three dots `...` in the top right corner.
   - Select **Install from VSIX...** and choose the downloaded file.
   
   *Alternatively, install via the command line:*
   ```bash
   code --install-extension vscode-mcp-dap-debugger-*.vsix
   ```

### Option 2: Build and Install

To build your own installable `.vsix` package, run:

```bash
npx @vscode/vsce package
```

This will generate a `vscode-mcp-dap-debugger-X.Y.Z.vsix` file in the repository root. You can install it in VS Code via the UI:

1. Open the **Extensions** view (`Cmd+Shift+X` on Mac / `Ctrl+Shift+X` on Windows).
2. Click the three dots `...` in the top right corner.
3. Select **Install from VSIX...**.
4. Choose the generated `.vsix` file.

Alternatively, install it from the command line:

```bash
code --install-extension vscode-mcp-dap-debugger-*.vsix
```