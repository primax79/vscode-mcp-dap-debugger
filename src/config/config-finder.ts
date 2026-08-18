import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { promisify } from 'util'
import type { WorkspaceConfig } from './workspace-config'
import type { RegistryEntry } from './registry'

const readFile = promisify(fs.readFile)

export type DiscoveryResult =
    | { status: 'found'; port: number; token: string; workspace?: string }
    | { status: 'not-found' }
    | { status: 'ambiguous'; candidates: { port: number; workspace: string }[] }

/**
 * CLI-side discovery: walk up from the current directory looking for
 * .vscode-mcp-dap-debugger/config.json, falling back to the global registry.
 */
export class ConfigFinder {
    static async findWorkspaceConfig(): Promise<WorkspaceConfig | null> {
        let currentDir = process.cwd()
        const root = path.parse(currentDir).root

        while (currentDir !== root) {
            const candidatePaths = [
                path.join(currentDir, '.vscode', 'mcp-dap-debugger.json'),
                path.join(currentDir, '.vscode-mcp-dap-debugger', 'config.json'),
            ]

            for (const configPath of candidatePaths) {
                if (fs.existsSync(configPath)) {
                    try {
                        const config = JSON.parse(await readFile(configPath, 'utf8')) as WorkspaceConfig
                        if (this.isAlive(config.pid)) return config
                    } catch {
                        // Ignore malformed config and keep checking.
                    }
                }
            }
            currentDir = path.dirname(currentDir)
        }
        return null
    }

    static async findFromGlobalRegistry(): Promise<RegistryEntry[]> {
        const registryPath = path.join(os.homedir(), '.vscode-mcp-dap-debugger', 'active-configs.json')
        if (!fs.existsSync(registryPath)) return []

        try {
            const registry = JSON.parse(await readFile(registryPath, 'utf8'))
            return (registry.activeInstances ?? []).filter((entry: RegistryEntry) => this.isAlive(entry.pid))
        } catch {
            return []
        }
    }

    /** Looks up a specific instance by port in the global registry - used when --port is given without --token. */
    static async findInstanceByPort(port: number): Promise<RegistryEntry | null> {
        const instances = await this.findFromGlobalRegistry()
        return instances.find((e) => e.port === port) ?? null
    }

    /**
     * Full discovery: workspace config takes priority (unambiguous by
     * construction - it's the one file for this directory tree), otherwise
     * the global registry. A registry with more than one live instance and no
     * workspace-config match is reported as ambiguous instead of silently
     * picking the first entry - the CLI is responsible for surfacing that to
     * the user with the candidate ports/workspaces.
     */
    static async discoverInstance(): Promise<DiscoveryResult> {
        const workspaceConfig = await this.findWorkspaceConfig()
        if (workspaceConfig) {
            return { status: 'found', port: workspaceConfig.port, token: workspaceConfig.token, workspace: workspaceConfig.workspacePath }
        }

        const instances = await this.findFromGlobalRegistry()
        if (instances.length === 0) return { status: 'not-found' }

        if (instances.length === 1) {
            const only = instances[0]
            return { status: 'found', port: only.port, token: only.token, workspace: only.workspacePath }
        }

        return {
            status: 'ambiguous',
            candidates: instances.map((i) => ({ port: i.port, workspace: i.workspaceName })),
        }
    }

    private static isAlive(pid: number): boolean {
        try {
            process.kill(pid, 0)
            return true
        } catch {
            return false
        }
    }
}
