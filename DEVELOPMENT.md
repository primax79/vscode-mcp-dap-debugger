# Development & Installation Guide

This guide is for developers who want to contribute to the project, build it from source, or install preview versions manually.

## 🛠️ Local Development

Follow these steps to set up the project locally:

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Useful scripts:**
   ```bash
   npm run build       # Build the extension and CLI using esbuild
   npm run typecheck   # Run TypeScript type checking
   npm run lint        # Run ESLint
   ```

3. **Run the extension in debug mode:**
   - Open this folder in VS Code.
   - Press `F5` to launch a new VS Code window (Extension Development Host) with the extension loaded.

4. **Test the CLI standalone:**
   ```bash
   node out/cli.js <command> [args]
   ```
   *(For a complete reference of all available CLI commands and tools, see the `resources/skills/dap-cli-debugging.md` file, which is also used as the AI usage manual).*

## 📦 Packaging & Manual Installation

While the official extension is available on the VS Code Marketplace, you can manually install `.vsix` files to test preview versions or your own builds.

### 1. Get the `.vsix` package
- **Download it:** Get the latest `.vsix` file from the [Releases](https://github.com/primax79/vscode-mcp-dap-debugger/releases) page.
- **Build it yourself:** Run `npx @vscode/vsce package` in the repository root to generate the `.vsix` file locally.

### 2. Install the extension

**Option A: Via the VS Code UI**
1. Open the **Extensions** view (`Cmd+Shift+X` on Mac / `Ctrl+Shift+X` on Windows).
2. Click the three dots `...` in the top right corner of the Extensions view.
3. Select **Install from VSIX...** and choose the downloaded or built `.vsix` file.

**Option B: Via the command line**
```bash
code --install-extension vscode-mcp-dap-debugger-*.vsix
```
