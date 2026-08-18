import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { inputSchemas } from './schemas'
import { ok, err, withErrorHandling } from './shared'
import { state } from '../state'
import { registry } from '../config/registry'
import type { WorkspaceConfig } from '../config/workspace-config'

export const getWorkspaceInfoTool = {
    name: 'get-workspace-info',
    config: {
        title: 'Get Workspace Information',
        description: 'Get information about the current workspace and this server instance',
        inputSchema: inputSchemas['get-workspace-info'],
    },
    handler: async () => withErrorHandling(async () => {
        const folder = vscode.workspace.workspaceFolders?.[0]
        if (!folder) return ok({ message: 'No workspace folder open' })

        const candidatePaths = [
            path.join(folder.uri.fsPath, '.vscode', 'mcp-dap-debugger.json'),
            path.join(folder.uri.fsPath, '.vscode-mcp-dap-debugger', 'config.json'),
        ]
        let configSummary: { port: number; pid: number } | 'No config file' = 'No config file'
        for (const configPath of candidatePaths) {
            if (fs.existsSync(configPath)) {
                try {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as WorkspaceConfig
                    configSummary = { port: config.port, pid: config.pid }
                    break
                } catch {
                    // try next candidate
                }
            }
        }

        return ok({
            name: folder.name,
            path: folder.uri.fsPath,
            config: configSummary,
            server: {
                isRunning: state.isServerRunning(),
                port: state.currentPort,
                uptime: state.getUptime(),
            },
        })
    }),
}

export const listVSCodeInstancesTool = {
    name: 'list-vscode-instances',
    config: {
        title: 'List VSCode Instances',
        description: 'List all active VS Code instances running this MCP server',
        inputSchema: inputSchemas['list-vscode-instances'],
    },
    handler: async () => withErrorHandling(async () => {
        const instances = await registry.getActiveInstances()
        return ok({
            total: instances.length,
            instances: instances.map((i) => ({
                port: i.port,
                workspaceName: i.workspaceName,
                workspacePath: i.workspacePath,
                pid: i.pid,
            })),
        })
    }),
}

export const selectVSCodeInstanceTool = {
    name: 'select-vscode-instance',
    config: {
        title: 'Select VSCode Instance',
        description:
            'Look up connection details (port, workspace) for a specific VS Code instance by port or workspace name. ' +
            'This only returns information - it does not change which instance the current CLI/agent connection ' +
            'talks to. Use the returned port with --port on the CLI to actually connect to that instance.',
        inputSchema: inputSchemas['select-vscode-instance'],
    },
    handler: async (args: { port?: number; workspace?: string }) => withErrorHandling(async () => {
        const instances = await registry.getActiveInstances()

        const selected = args.port
            ? instances.find((i) => i.port === args.port)
            : args.workspace
                ? instances.find((i) => i.workspacePath === args.workspace || i.workspaceName === args.workspace)
                : undefined

        if (!selected) {
            const available = instances.map((i) => `${i.workspaceName} (port ${i.port})`).join(', ') || 'none'
            return err(`No matching VS Code instance found. Active: ${available}`)
        }

        return ok({
            port: selected.port,
            workspaceName: selected.workspaceName,
            workspacePath: selected.workspacePath,
            recommendation: `Use --port=${selected.port} when running the CLI`,
        })
    }),
}
