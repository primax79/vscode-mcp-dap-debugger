import * as vscode from 'vscode'
import type { Server } from 'http'

/**
 * Global extension state. The MCP server/transport lifecycle for individual
 * client sessions lives in server/http-server.ts, not here - this only tracks
 * the HTTP listener and UI-facing state.
 */
class ExtensionState {
    private _httpServer: Server | undefined
    private _currentPort: number | undefined
    private _serverStartTime: Date | undefined
    private _authToken: string | undefined
    private _extensionPath: string | undefined
    private _activePanels: vscode.WebviewPanel[] = []

    get extensionPath(): string | undefined {
        return this._extensionPath
    }

    set extensionPath(path: string | undefined) {
        this._extensionPath = path
    }

    get httpServer(): Server | undefined {
        return this._httpServer
    }

    set httpServer(server: Server | undefined) {
        this._httpServer = server
    }

    get currentPort(): number | undefined {
        return this._currentPort
    }

    set currentPort(port: number | undefined) {
        this._currentPort = port
    }

    get serverStartTime(): Date | undefined {
        return this._serverStartTime
    }

    set serverStartTime(time: Date | undefined) {
        this._serverStartTime = time
    }

    get authToken(): string | undefined {
        return this._authToken
    }

    set authToken(token: string | undefined) {
        this._authToken = token
    }

    get activePanels(): vscode.WebviewPanel[] {
        return this._activePanels
    }

    addPanel(panel: vscode.WebviewPanel): void {
        this._activePanels.push(panel)
    }

    removePanel(panel: vscode.WebviewPanel): void {
        const index = this._activePanels.indexOf(panel)
        if (index > -1) {
            this._activePanels.splice(index, 1)
        }
    }

    isServerRunning(): boolean {
        return this._currentPort !== undefined && this._httpServer !== undefined
    }

    getUptime(): string {
        if (!this._serverStartTime) {
            return ''
        }

        const diff = Date.now() - this._serverStartTime.getTime()
        const minutes = Math.floor(diff / 60000)
        const seconds = Math.floor((diff % 60000) / 1000)
        return `${minutes}m ${seconds}s`
    }

    reset(): void {
        this._httpServer = undefined
        this._currentPort = undefined
        this._serverStartTime = undefined
        this._authToken = undefined
        this._activePanels = []
    }
}

export const state = new ExtensionState()
