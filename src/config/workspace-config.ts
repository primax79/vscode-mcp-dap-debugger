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
const SKILL_CONSENT_KEY = 'vscode-mcp-dap-debugger.skillInjectionConsent'

// The bundled skill doc tells agents to run `npx vscode-mcp-dap-debugger` -
// correct once the CLI is published to npm, and already correct for a
// developer working from this source tree (npx resolves the local package.json
// bin first). But it 404s for anyone who only installed the .vsix: there is no
// npm package for npx to find. Injected copies get this swapped for the exact
// path to the cli.js that ships inside *this* install, which always works.
const NPX_INVOCATION = 'npx vscode-mcp-dap-debugger'

// Matches the `node "<...>/out/cli.js"` invocation produced by templating
// NPX_INVOCATION above, regardless of which install (path, version, OS) wrote
// it - used to recognize a skill file written by an older version of this
// extension as unmodified, so it can still be safely auto-updated even though
// it predates the content-hash marker in agent-environments.ts.
const CLI_INVOCATION_PATTERN = /node\s+"[^"\n]*[\\/]out[\\/]cli\.js"/g

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

    constructor(
        private readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly extensionPath: string,
        private readonly context: vscode.ExtensionContext
    ) {
        this.configDir = path.join(workspaceFolder.uri.fsPath, '.vscode')
        this.configPath = path.join(this.configDir, 'mcp-dap-debugger.json')
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
     * from scratch). A SKILL.md that already exists at the target path is only
     * replaced if it's still unmodified since this extension last wrote it -
     * a hand-edited copy is left alone regardless of these settings, so a
     * version bump can still ship content fixes to everyone else - see
     * canReplaceManagedContent in agent-environments.ts.
     *
     * Before writing anything for the first time in a given workspace, this
     * asks the user via a native popup - a heuristic (folder already exists)
     * is a proxy for consent, not consent itself. The answer is remembered in
     * workspaceState so the user is asked once per workspace, not on every
     * VS Code restart.
     */
    private async maybeInjectSkillDocuments(): Promise<void> {
        const skillSourcePath = path.join(this.extensionPath, 'resources', 'skills', `${SKILL_NAME}.md`)
        if (!fs.existsSync(skillSourcePath)) return

        const rawContent = await readFile(skillSourcePath, 'utf8')
        const cliPath = path.join(this.extensionPath, 'out', 'cli.js')
        const content = rawContent.split(NPX_INVOCATION).join(`node ${JSON.stringify(cliPath)}`)

        // A SKILL.md written by a version of this extension before the
        // content-hash marker existed has no marker to check - but if
        // reversing our CLI-path templating gets back exactly the bundled
        // template, nobody hand-edited it, so it's still safe to upgrade in
        // place (this is what lets an already-injected, pre-fix copy pick up
        // e.g. the npx -> absolute cli.js path change below).
        const isLegacyUnmodified = (existing: string) => existing.replace(CLI_INVOCATION_PATTERN, NPX_INVOCATION).trim() === rawContent.trim()

        const workspaceRoot = this.workspaceFolder.uri.fsPath
        const config = vscode.workspace.getConfiguration('vscodeDebugMcp')
        const agentsMdSection = buildAgentsMdSection(content)

        const candidates = await this.collectInjectionResults(config, workspaceRoot, content, agentsMdSection, true, isLegacyUnmodified)
        const pending = candidates.filter((r) => r.reason === 'pending consent')
        if (pending.length === 0) return

        const consent = this.context.workspaceState.get<'granted' | 'declined'>(SKILL_CONSENT_KEY)
        if (consent === 'declined') return

        if (consent !== 'granted') {
            const choice = await vscode.window.showInformationMessage(
                `VSCode MCP DAP Debugger can add or update AI-agent debugging instructions for: ${pending.map((r) => r.label).join(', ')}. ` +
                'This lets your AI coding assistant discover and use the debugger CLI. Install/update these guides?',
                'Install',
                "Don't ask again",
                'Not now'
            )

            if (choice === "Don't ask again") {
                await this.context.workspaceState.update(SKILL_CONSENT_KEY, 'declined')
                return
            }
            if (choice !== 'Install') return // "Not now" or dismissed - ask again next activation
            await this.context.workspaceState.update(SKILL_CONSENT_KEY, 'granted')
        }

        const results = await this.collectInjectionResults(config, workspaceRoot, content, agentsMdSection, false, isLegacyUnmodified)
        const written = results.filter((r) => r.written)
        if (written.length > 0) {
            void vscode.window.showInformationMessage(
                `VSCode MCP DAP Debugger wrote/updated AI-agent guides for: ${written.map((r) => r.label).join(', ')}. ` +
                'Configure per environment via the "vscodeDebugMcp.agentSkills.*" settings.'
            )
        }
    }

    private async collectInjectionResults(
        config: vscode.WorkspaceConfiguration,
        workspaceRoot: string,
        content: string,
        agentsMdSection: string,
        dryRun: boolean,
        isLegacyUnmodified: (existing: string) => boolean
    ): Promise<InjectionResult[]> {
        const results: InjectionResult[] = []

        for (const env of SKILL_ENVIRONMENTS) {
            const settings = readInjectionSettings(config, env.id)
            results.push(...(await injectSkillEnvironment(env, settings, SKILL_NAME, workspaceRoot, content, dryRun, isLegacyUnmodified)))
        }

        const agentsMdSettings = readInjectionSettings(config, 'agentsMd')
        results.push(...(await injectAgentsMdSection(agentsMdSettings, workspaceRoot, agentsMdSection, dryRun)))

        return results
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
