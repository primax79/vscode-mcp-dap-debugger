import * as vscode from 'vscode'
import * as path from 'path'
import { getRelativePath, getWorkspaceRoot } from './utils/path'
import { createMonitoringPanel } from './monitor-panel'
import { startServer, stopServer } from './server-lifecycle'

type StatusBarStatus = 'initializing' | 'running' | 'stopping' | 'error' | 'stopped'
let updateStatusBar: ((status: StatusBarStatus) => void) | undefined

export function setStatusBarUpdater(updater: (status: StatusBarStatus) => void): void {
    updateStatusBar = updater
}

export async function addBreakpointToUri(filePath: string, lineNumber: number): Promise<void> {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(), filePath)
    const uri = vscode.Uri.file(absolutePath)
    const location = new vscode.Location(uri, new vscode.Range(lineNumber - 1, 0, lineNumber - 1, 0))
    await vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(location)])
}

function safeRegisterCommand(context: vscode.ExtensionContext, commandId: string, callback: (...args: any[]) => any): void {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, callback))
}

export function registerCommands(context: vscode.ExtensionContext): void {
    safeRegisterCommand(context, 'vscode-mcp-dap-debugger.addUnboundBreakpoint', async () => {
        const activeEditor = vscode.window.activeTextEditor
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active text editor. Open a file and try again.')
            return
        }

        const lineNumberStr = await vscode.window.showInputBox({
            prompt: 'Enter the line number to set the breakpoint on',
            placeHolder: '10',
        })
        if (!lineNumberStr) return

        const lineNumber = parseInt(lineNumberStr, 10)
        if (isNaN(lineNumber) || lineNumber <= 0) {
            vscode.window.showErrorMessage('Invalid line number.')
            return
        }

        const relativePath = getRelativePath(activeEditor.document.uri.fsPath)
        await addBreakpointToUri(relativePath, lineNumber)
        vscode.window.showInformationMessage(`Breakpoint added to ${relativePath}:${lineNumber}`)
    })

    safeRegisterCommand(context, 'vscode-mcp-dap-debugger.openMonitorPanel', () => createMonitoringPanel())

    safeRegisterCommand(context, 'vscode-mcp-dap-debugger.startServer', async () => {
        updateStatusBar?.('initializing')
        try {
            await startServer()
            updateStatusBar?.('running')
            vscode.window.showInformationMessage('MCP server started')
        } catch (error) {
            updateStatusBar?.('error')
            vscode.window.showErrorMessage(`Failed to start server: ${error}`)
        }
    })

    safeRegisterCommand(context, 'vscode-mcp-dap-debugger.stopServer', async () => {
        updateStatusBar?.('stopping')
        try {
            await stopServer()
            updateStatusBar?.('stopped')
            vscode.window.showInformationMessage('MCP server stopped')
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stop server: ${error}`)
        }
    })
}
