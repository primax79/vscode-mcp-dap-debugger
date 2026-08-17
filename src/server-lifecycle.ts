import * as vscode from 'vscode'
import { state } from './state'
import { createHttpApp, startHttpServer, stopHttpServer } from './server/http-server'
import { generateAuthToken } from './server/auth'
import { WorkspaceConfigManager } from './config/workspace-config'
import { registry } from './config/registry'
import { updateAllPanels } from './monitor-panel'

// Single lifecycle used by BOTH extension activation and the
// start/stop commands - the original tool duplicated this logic in two
// places (extension.ts's activate() and commands.ts's startServer/stopServer),
// and the command-triggered path never touched ConfigManager/RegistryManager,
// so a manual stop+start left the on-disk config file pointing at a stale
// port while the live server had already moved to a new one.

let configManager: WorkspaceConfigManager | undefined
let extensionPath: string | undefined

// Shared by concurrent startServer() callers, so a second call while one is
// already in flight awaits the same attempt instead of racing a second
// findAvailablePort()/listen() and ending up with two listeners.
let startingPromise: Promise<void> | undefined

export function initLifecycle(context: vscode.ExtensionContext): void {
    extensionPath = context.extensionPath
}

export async function startServer(): Promise<void> {
    if (startingPromise) return startingPromise
    if (state.isServerRunning()) return

    startingPromise = (async () => {
        const app = createHttpApp(() => state.authToken)

        try {
            await startHttpServer(app, async () => {
                state.authToken = generateAuthToken()

                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
                if (workspaceFolder && extensionPath) {
                    configManager = new WorkspaceConfigManager(workspaceFolder, extensionPath)
                    // If this throws (e.g. can't write the config file), the whole
                    // start fails and is rolled back below - without a config file
                    // the CLI has no way to discover the token, so a "running but
                    // undiscoverable" server is worse than no server at all.
                    const config = await configManager.initialize(state.currentPort!, state.authToken)

                    await registry.initialize()
                    const { duplicateWorkspace } = await registry.registerInstance({
                        vscodeInstanceId: config.vscodeInstanceId,
                        workspacePath: config.workspacePath,
                        workspaceName: config.workspaceName,
                        configPath: configManager.configFilePath,
                        port: config.port,
                        token: config.token,
                        pid: config.pid,
                    })

                    if (duplicateWorkspace) {
                        void vscode.window.showWarningMessage(
                            `Another live VS Code Debug MCP instance is already running for this workspace ` +
                            `(port ${duplicateWorkspace.port}, pid ${duplicateWorkspace.pid}). ` +
                            `Both are now registered - CLI auto-discovery will report this as ambiguous and ` +
                            `require --port. Consider closing the duplicate window.`
                        )
                    }
                }

                updateAllPanels()
            })
        } catch (error) {
            // Don't leave a listening socket with no valid config/token behind.
            await stopHttpServer().catch((cleanupError) => {
                console.error('[vscode-mcp-dap-debugger] Failed to roll back a failed server start:', cleanupError)
            })
            configManager = undefined
            throw error
        }
    })()

    try {
        await startingPromise
    } finally {
        startingPromise = undefined
    }
}

export async function stopServer(): Promise<void> {
    // If a start is in flight, let it settle (success or failure) first so we
    // don't tear down a listener that's still being set up.
    if (startingPromise) {
        await startingPromise.catch(() => {})
    }

    if (!state.isServerRunning()) return

    if (configManager) {
        const config = await configManager.loadConfig()
        if (config) await registry.cleanup(config.vscodeInstanceId)
        await configManager.cleanup()
        configManager = undefined
    }

    await stopHttpServer()
    updateAllPanels()
}
