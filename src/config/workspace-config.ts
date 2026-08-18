import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { promisify } from 'util'
import {
    SKILL_ENVIRONMENTS,
    injectSkillEnvironment,
    injectAgentsMdSection,
    buildAgentsMdSection,
    type InjectionSettings,
    type InjectionResult,
} from './agent-environments'

const writeFile = promisify(fs.writeFile)
const readFile = promisify(fs.readFile)
const mkdir = promisify(fs.mkdir)
const unlink = promisify(fs.unlink)

const SKILL_NAME = 'dap-cli-debugging'

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
        await this.maybeInjectSkillDocuments()
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
     * Writes/updates the AI-agent skill guide for each configured environment
     * (Claude Code, Gemini CLI, Kilo Code, plus a marked section in AGENTS.md
     * for Codex CLI and similar tools). Each environment is independently
     * configurable via "vscodeDebugMcp.agentSkills.<id>.*" - enabled, scope
     * (project/global/both), and onlyIfAlreadyPresent (only write into a
     * location whose base folder/file already exists, instead of creating it
     * from scratch). A SKILL.md that already exists at the target path is
     * never overwritten, regardless of these settings - see agent-environments.ts.
     */
    private async maybeInjectSkillDocuments(): Promise<void> {
        const skillSourcePath = path.join(this.extensionPath, 'resources', 'skills', `${SKILL_NAME}.md`)
        if (!fs.existsSync(skillSourcePath)) return

        const content = await readFile(skillSourcePath, 'utf8')
        const workspaceRoot = this.workspaceFolder.uri.fsPath
        const config = vscode.workspace.getConfiguration('vscodeDebugMcp')
        const results: InjectionResult[] = []

        for (const env of SKILL_ENVIRONMENTS) {
            const settings = readInjectionSettings(config, env.id)
            results.push(...(await injectSkillEnvironment(env, settings, SKILL_NAME, workspaceRoot, content)))
        }

        const agentsMdSettings = readInjectionSettings(config, 'agentsMd')
        results.push(...(await injectAgentsMdSection(agentsMdSettings, workspaceRoot, buildAgentsMdSection(content))))

        const written = results.filter((r) => r.written)
        if (written.length > 0) {
            void vscode.window.showInformationMessage(
                `VSCode MCP DAP Debugger wrote/updated AI-agent guides for: ${written.map((r) => r.label).join(', ')}. ` +
                'Configure per environment via the "vscodeDebugMcp.agentSkills.*" settings.'
            )
        }
    }
}

/**
 * onlyIfAlreadyPresent defaults to true across every environment - this
 * matches the tool's existing behavior (it never created .claude/.gemini/.kilo
 * from scratch) and is the least surprising default: opting into "force
 * create" is a deliberate per-environment choice, not the out-of-the-box one.
 */
function readInjectionSettings(config: vscode.WorkspaceConfiguration, id: string): InjectionSettings {
    return {
        enabled: config.get<boolean>(`agentSkills.${id}.enabled`, true),
        scope: config.get<'project' | 'global' | 'both'>(`agentSkills.${id}.scope`, 'project'),
        onlyIfAlreadyPresent: config.get<boolean>(`agentSkills.${id}.onlyIfAlreadyPresent`, true),
    }
}
