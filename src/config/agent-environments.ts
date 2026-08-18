import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

const writeFile = promisify(fs.writeFile)
const readFile = promisify(fs.readFile)
const mkdir = promisify(fs.mkdir)

export type SkillEnvironmentId = 'claude' | 'gemini' | 'kilo'
export type InjectionScope = 'project' | 'global' | 'both'

export interface SkillEnvironment {
    id: SkillEnvironmentId
    label: string
    baseFolderName: string
    projectSkillPath(skillName: string): string // relative to the workspace root
    globalSkillPath(skillName: string): string // absolute, under the user's home directory
}

function defineSkillEnvironment(id: SkillEnvironmentId, label: string, baseFolderName: string): SkillEnvironment {
    return {
        id,
        label,
        baseFolderName,
        projectSkillPath: (skillName) => path.join(baseFolderName, 'skills', skillName, 'SKILL.md'),
        globalSkillPath: (skillName) => path.join(os.homedir(), baseFolderName, 'skills', skillName, 'SKILL.md'),
    }
}

// Environments that share the same convention: a base folder containing
// skills/<name>/SKILL.md. Roo Code (custom modes), Cursor (.cursor/rules/*.mdc)
// and GitHub Copilot (.github/copilot-instructions.md) use genuinely different
// formats and aren't a fit for this same writer - they'd need their own content
// generator, not just a different folder.
export const SKILL_ENVIRONMENTS: SkillEnvironment[] = [
    defineSkillEnvironment('claude', 'Claude Code', '.claude'),
    defineSkillEnvironment('gemini', 'Gemini CLI', '.gemini'),
    defineSkillEnvironment('kilo', 'Kilo Code', '.kilo'),
]

// AGENTS.md is a single file at the project root (no per-agent folder, and no
// established "global" location any tool reads), used by Codex CLI and a
// growing set of other coding agents as a generic instructions file.
export const AGENTS_MD_RELATIVE_PATH = 'AGENTS.md'
const AGENTS_MD_MARKER_BEGIN = '<!-- BEGIN vscode-mcp-dap-debugger:dap-cli-debugging -->'
const AGENTS_MD_MARKER_END = '<!-- END vscode-mcp-dap-debugger:dap-cli-debugging -->'

export interface InjectionSettings {
    enabled: boolean
    scope: InjectionScope
    onlyIfAlreadyPresent: boolean
}

export interface InjectionResult {
    label: string
    target: string
    written: boolean
    reason?: string
}

/**
 * Writes (or skips) a skill document for one environment, at one or both
 * scopes. Two independent gates, both opt-outable:
 * - onlyIfAlreadyPresent: only write into a scope whose base folder
 *   (.claude/.gemini/.kilo) already exists there, instead of creating it.
 * - never overwrite a SKILL.md that already exists at the target path - a
 *   customized skill the user wrote themselves is left alone unconditionally,
 *   regardless of onlyIfAlreadyPresent.
 */
export async function injectSkillEnvironment(
    env: SkillEnvironment,
    settings: InjectionSettings,
    skillName: string,
    workspaceRoot: string,
    content: string
): Promise<InjectionResult[]> {
    if (!settings.enabled) return []

    const scopes: ('project' | 'global')[] = settings.scope === 'both' ? ['project', 'global'] : [settings.scope]
    const results: InjectionResult[] = []

    for (const scope of scopes) {
        const baseFolder = scope === 'project' ? path.join(workspaceRoot, env.baseFolderName) : path.join(os.homedir(), env.baseFolderName)
        const targetPath = scope === 'project' ? path.join(workspaceRoot, env.projectSkillPath(skillName)) : env.globalSkillPath(skillName)
        const label = `${env.label} (${scope})`

        if (settings.onlyIfAlreadyPresent && !fs.existsSync(baseFolder)) {
            results.push({ label, target: targetPath, written: false, reason: `${env.baseFolderName} not found` })
            continue
        }

        if (fs.existsSync(targetPath)) {
            results.push({ label, target: targetPath, written: false, reason: 'already exists, not overwritten' })
            continue
        }

        try {
            await mkdir(path.dirname(targetPath), { recursive: true })
            await writeFile(targetPath, content, 'utf8')
            results.push({ label, target: targetPath, written: true })
        } catch (error) {
            results.push({ label, target: targetPath, written: false, reason: String(error) })
        }
    }

    return results
}

/**
 * Adds or updates a clearly-marked section in AGENTS.md instead of writing a
 * whole file: AGENTS.md commonly holds hand-written, project-specific
 * instructions, so this only ever touches the content between its own
 * markers, leaving everything else in the file untouched. Idempotent: running
 * it again just replaces the same marked section, it never duplicates it.
 */
export async function injectAgentsMdSection(settings: InjectionSettings, workspaceRoot: string, sectionContent: string): Promise<InjectionResult[]> {
    if (!settings.enabled) return []

    const targetPath = path.join(workspaceRoot, AGENTS_MD_RELATIVE_PATH)
    const exists = fs.existsSync(targetPath)

    if (settings.onlyIfAlreadyPresent && !exists) {
        return [{ label: 'AGENTS.md', target: targetPath, written: false, reason: 'AGENTS.md not found' }]
    }

    const marked = `${AGENTS_MD_MARKER_BEGIN}\n${sectionContent}\n${AGENTS_MD_MARKER_END}`
    const existing = exists ? await readFile(targetPath, 'utf8') : ''
    const markerRegex = new RegExp(`${escapeRegExp(AGENTS_MD_MARKER_BEGIN)}[\\s\\S]*?${escapeRegExp(AGENTS_MD_MARKER_END)}`)

    const updated = markerRegex.test(existing)
        ? existing.replace(markerRegex, marked)
        : existing.length > 0
            ? `${existing.trimEnd()}\n\n${marked}\n`
            : `${marked}\n`

    if (updated === existing) {
        return [{ label: 'AGENTS.md', target: targetPath, written: false, reason: 'already up to date' }]
    }

    try {
        await writeFile(targetPath, updated, 'utf8')
        return [{ label: 'AGENTS.md', target: targetPath, written: true }]
    } catch (error) {
        return [{ label: 'AGENTS.md', target: targetPath, written: false, reason: String(error) }]
    }
}

/** Strips a SKILL.md's YAML frontmatter and adds a heading, for embedding into AGENTS.md. */
export function buildAgentsMdSection(skillMarkdown: string): string {
    const body = skillMarkdown.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
    return `## VS Code MCP DAP Debugger\n\n${body}`
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
