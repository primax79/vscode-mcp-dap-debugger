import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { promisify } from 'util'

const writeFile = promisify(fs.writeFile)
const readFile = promisify(fs.readFile)
const mkdir = promisify(fs.mkdir)
const unlink = promisify(fs.unlink)

export interface WorkspaceConfig {
    vscodeInstanceId: string
    port: number
    pid: number
    token: string
    workspacePath: string
    workspaceName: string
}

export class WorkspaceConfigManager {
    private readonly configDir: string
    private readonly configPath: string

    constructor(private readonly workspaceFolder: vscode.WorkspaceFolder, private readonly extensionPath: string) {
        this.configDir = path.join(workspaceFolder.uri.fsPath, '.vscode-mcp-dap-debugger')
        this.configPath = path.join(this.configDir, 'config.json')
    }

    /**
     * Writes the workspace config file. `token` is generated once by the
     * caller (server-lifecycle.ts) so the same value is used both to guard
     * the HTTP server and to let the CLI discover it - this class doesn't
     * generate its own token.
     */
    async initialize(port: number, token: string): Promise<WorkspaceConfig> {
        await mkdir(this.configDir, { recursive: true })

        const config: WorkspaceConfig = {
            vscodeInstanceId: `vscode-${process.pid}-${Date.now()}`,
            port,
            pid: process.pid,
            token,
            workspacePath: this.workspaceFolder.uri.fsPath,
            workspaceName: this.workspaceFolder.name,
        }

        await this.save(config)
        await this.maybeInjectSkillDocument()
        return config
    }

    async loadConfig(): Promise<WorkspaceConfig | null> {
        try {
            const data = await readFile(this.configPath, 'utf8')
            return JSON.parse(data)
        } catch (error: any) {
            if (error.code === 'ENOENT') return null
            throw error
        }
    }

    get configFilePath(): string {
        return this.configPath
    }

    async cleanup(): Promise<void> {
        try {
            await unlink(this.configPath)
        } catch (error: any) {
            if (error.code !== 'ENOENT') console.error('[vscode-mcp-dap-debugger] Failed to remove config file:', error)
        }
    }

    private async save(config: WorkspaceConfig): Promise<void> {
        // mode 0o600: the file holds an auth token, keep it owner-only.
        await writeFile(this.configPath, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 })
    }

    /**
     * Writes the AI-agent SKILL.md guide into .claude/skills and
     * .gemini/skills, unless disabled via the vscodeDebugMcp.injectAgentSkills
     * setting. Unlike the original tool, this always tells the user it
     * happened instead of writing into their workspace silently.
     */
    private async maybeInjectSkillDocument(): Promise<void> {
        const enabled = vscode.workspace.getConfiguration('vscodeDebugMcp').get<boolean>('injectAgentSkills', true)
        if (!enabled) return

        const skillSourcePath = path.join(this.extensionPath, 'resources', 'skills', 'dap-cli-debugging.md')
        if (!fs.existsSync(skillSourcePath)) return

        const content = await readFile(skillSourcePath, 'utf8')
        const workspacePath = this.workspaceFolder.uri.fsPath
        const targets = [
            path.join(workspacePath, '.gemini', 'skills', 'dap-cli-debugging', 'SKILL.md'),
            path.join(workspacePath, '.claude', 'skills', 'dap-cli-debugging', 'SKILL.md'),
        ]

        let wroteAny = false
        for (const destPath of targets) {
            try {
                await mkdir(path.dirname(destPath), { recursive: true })
                await writeFile(destPath, content, 'utf8')
                wroteAny = true
            } catch (error) {
                console.error(`[vscode-mcp-dap-debugger] Failed to inject skill document to ${destPath}:`, error)
            }
        }

        if (wroteAny) {
            void vscode.window.showInformationMessage(
                'VSCode Debug MCP wrote AI-agent skill guides to .claude/skills and .gemini/skills in this workspace. ' +
                'Disable via the "vscodeDebugMcp.injectAgentSkills" setting.'
            )
        }
    }
}
