# Development & Installation Guide

## Development

```bash
npm install
npm run build       # esbuild -> out/extension.js, out/cli.js
npm run typecheck    # tsc --noEmit
npm run lint
```

Run the extension: open this folder in VS Code and press F5 (Extension Development Host).

Run the CLI standalone: `node out/cli.js <command> [args]` - see `resources/skills/dap-cli-debugging.md` for the full command/tool reference.

## Packaging & Installation

To create an installable `.vsix` package for VS Code, run:

```bash
npx @vscode/vsce package
```

This will generate a `vscode-mcp-dap-debugger-X.Y.Z.vsix` file in the repository root. You can install it in VS Code via the UI:

1. Open the **Extensions** view (`Cmd+Shift+X` on Mac / `Ctrl+Shift+X` on Windows).
2. Click the three dots `...` in the top right corner.
3. Select **Install from VSIX...**.
4. Choose the generated `.vsix` file.

Alternatively, you can install it from the command line:

```bash
code --install-extension vscode-mcp-dap-debugger-*.vsix
```