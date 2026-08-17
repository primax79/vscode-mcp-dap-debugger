import * as vscode from 'vscode'
import { state } from './state'
import { registerDapTracker } from './dap/tracker'
import { registerCommands, setStatusBarUpdater } from './commands'
import { initLifecycle, startServer, stopServer } from './server-lifecycle'

type StatusBarStatus = 'initializing' | 'running' | 'stopping' | 'error' | 'stopped'
let statusBarItem: vscode.StatusBarItem

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
        statusBarItem.command = 'vscode-mcp-dap-debugger.openMonitorPanel'
        statusBarItem.show()
        context.subscriptions.push(statusBarItem)

        updateStatusBar('initializing')
        initLifecycle(context)

        await startServer()
        updateStatusBar('running')

        setStatusBarUpdater(updateStatusBar)
        registerCommands(context)
        context.subscriptions.push(registerDapTracker())

        console.log('[vscode-mcp-dap-debugger] Extension activated')
    } catch (error) {
        console.error('[vscode-mcp-dap-debugger] Activation failed:', error)
        vscode.window.showErrorMessage(`VSCode Debug MCP failed to start: ${error}`)
        updateStatusBar('error')
    }
}

export async function deactivate(): Promise<void> {
    updateStatusBar('stopping')
    await stopServer()
    state.reset()
    statusBarItem?.dispose()
}

function updateStatusBar(status: StatusBarStatus): void {
    if (!statusBarItem) return

    switch (status) {
        case 'initializing':
            statusBarItem.text = '$(sync~spin) Debug MCP starting...'
            statusBarItem.color = undefined
            statusBarItem.backgroundColor = undefined
            break
        case 'running':
            statusBarItem.text = `$(circle-filled) Debug MCP:${state.currentPort ?? '????'}`
            statusBarItem.color = new vscode.ThemeColor('terminal.ansiGreen')
            statusBarItem.backgroundColor = undefined
            break
        case 'stopping':
            statusBarItem.text = '$(circle-slash) Debug MCP stopping...'
            statusBarItem.color = new vscode.ThemeColor('terminal.ansiYellow')
            statusBarItem.backgroundColor = undefined
            break
        case 'stopped':
            statusBarItem.text = '$(circle-slash) Debug MCP: stopped'
            statusBarItem.color = new vscode.ThemeColor('terminal.ansiGray')
            statusBarItem.backgroundColor = undefined
            break
        case 'error':
            statusBarItem.text = '$(error) Debug MCP error'
            statusBarItem.color = undefined
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
            break
    }
}
