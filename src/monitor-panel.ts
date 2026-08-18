import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { state } from './state'
import type { WorkspaceConfig } from './config/workspace-config'

export function createMonitoringPanel(): void {
    const panel = vscode.window.createWebviewPanel('vscodeDebugMcpMonitor', 'Debug MCP Monitor', vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
    })

    state.addPanel(panel)
    panel.onDidDispose(() => state.removePanel(panel))

    panel.webview.onDidReceiveMessage((message) => {
        switch (message.command) {
            case 'refresh':
                updatePanel(panel)
                break
            case 'startServer':
                vscode.commands.executeCommand('vscode-mcp-dap-debugger.startServer')
                break
            case 'stopServer':
                vscode.commands.executeCommand('vscode-mcp-dap-debugger.stopServer')
                break
        }
    })

    panel.webview.html = getWebviewContent()
}

export function updateAllPanels(): void {
    state.activePanels.forEach(updatePanel)
}

function updatePanel(panel: vscode.WebviewPanel): void {
    panel.webview.html = getWebviewContent()
}

function getWorkspaceConfigStatus(): { exists: boolean; config?: WorkspaceConfig } {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) return { exists: false }

    const candidatePaths = [
        path.join(workspaceFolder.uri.fsPath, '.vscode', 'mcp-dap-debugger.json'),
        path.join(workspaceFolder.uri.fsPath, '.vscode-mcp-dap-debugger', 'config.json'),
    ]

    for (const configPath of candidatePaths) {
        if (fs.existsSync(configPath)) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as WorkspaceConfig
                return { exists: true, config }
            } catch {
                return { exists: false }
            }
        }
    }

    return { exists: false }
}

function maskToken(token: string): string {
    return `${token.slice(0, 6)}...${token.slice(-4)}`
}

function getWebviewContent(): string {
    const isRunning = state.isServerRunning()
    const configStatus = getWorkspaceConfigStatus()

    const configInfo = configStatus.exists && configStatus.config
        ? `<div class="info-grid">
            <span class="info-label">Workspace:</span><span>${configStatus.config.workspaceName}</span>
            <span class="info-label">PID:</span><span>${configStatus.config.pid}</span>
            <span class="info-label">Token:</span><span style="font-family:monospace">${maskToken(configStatus.config.token)}</span>
          </div>`
        : '<p>No workspace configuration file found.</p>'

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Debug MCP Monitor</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
                h1, h2 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
                .status-indicator { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
                .status-running { background-color: #4CAF50; }
                .status-stopped { background-color: #f44336; }
                .info-grid { display: grid; grid-template-columns: auto 1fr; gap: 8px 20px; margin: 15px 0; font-family: monospace; }
                .info-label { font-weight: bold; }
                .button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin: 5px 5px 5px 0; }
                .button:hover { background-color: var(--vscode-button-hoverBackground); }
            </style>
        </head>
        <body>
            <h1>Debug MCP Monitor <button class="button" onclick="refresh()">Refresh</button></h1>

            <h2>Server Status</h2>
            <span class="status-indicator ${isRunning ? 'status-running' : 'status-stopped'}"></span>
            <strong>${isRunning ? 'Running' : 'Stopped'}</strong>
            <div style="margin-top: 15px;">
                ${isRunning
                    ? '<button class="button" onclick="stopServer()" style="background-color:#f44336;">Stop Server</button>'
                    : '<button class="button" onclick="startServer()" style="background-color:#4CAF50;">Start Server</button>'}
            </div>

            <div class="info-grid">
                <span class="info-label">Port:</span><span>${state.currentPort ?? 'n/a'}</span>
                <span class="info-label">Uptime:</span><span>${state.getUptime() || 'n/a'}</span>
            </div>

            <h2>Workspace Configuration</h2>
            ${configInfo}

            <script>
                const vscode = acquireVsCodeApi();
                function refresh() { vscode.postMessage({ command: 'refresh' }); }
                function startServer() { vscode.postMessage({ command: 'startServer' }); }
                function stopServer() { vscode.postMessage({ command: 'stopServer' }); }
            </script>
        </body>
        </html>
    `
}
