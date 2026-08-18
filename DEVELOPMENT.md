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
   - Press `F5` to launch a new VS Code window (Extension Development Host).
   - **Important:** In the new window that opens, you *must* open a folder (e.g., a sample project). The MCP server only generates its configuration and auth token when a workspace is active.

4. **Test the CLI standalone:**
   To test the CLI against your running development extension, open a terminal in your **original** VS Code window (the one where the `vscode-mcp-dap-debugger` source code is) and run:
   ```bash
   node out/cli.js --help
   ```
   Available commands:
   - `node out/cli.js proxy`: Start the stdio MCP proxy (default behavior).
   - `node out/cli.js list`: List all available MCP tools and resources provided by the debugger.
   - `node out/cli.js call <toolName> [argsJson]`: Call a specific tool directly and print the JSON result (e.g., `node out/cli.js call list-debug-sessions`).
   - `node out/cli.js read <resourceUri>`: Read an MCP resource directly and print the JSON result.
   
   *(Note: Because the CLI uses a global registry in `~/.vscode-mcp-dap-debugger/` to auto-discover running instances, you can run the CLI from this original window and it will automatically find the MCP server running in your Extension Development Host).*

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
