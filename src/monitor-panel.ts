import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { state } from './state'
import { SKILL_CONSENT_KEY, type WorkspaceConfig } from './config/workspace-config'
import {
    SKILL_ENVIRONMENTS,
    injectSkillEnvironment,
    injectAgentsMdSection,
    buildAgentsMdSection,
    AGENTS_MD_RELATIVE_PATH,
    AGENTS_MD_MARKER_BEGIN,
} from './config/agent-environments'

const SKILL_NAME = 'ai-debugger'

export function createMonitoringPanel(): void {
    const panel = vscode.window.createWebviewPanel('vscodeMcpDapDebuggerMonitor', 'Debug MCP Monitor', vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
    })

    state.addPanel(panel)
    panel.onDidDispose(() => state.removePanel(panel))

    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'refresh':
                updatePanel(panel)
                break
            case 'startServer':
                vscode.commands.executeCommand('vscode-mcp-dap-debugger.startServer')
                break
            case 'stopServer':
                vscode.commands.executeCommand('vscode-mcp-dap-debugger.stopServer')
                break
            case 'installSkill':
                await handleInstallSkill(message.envId, message.scope)
                updateAllPanels()
                break
        }
    })

    panel.webview.html = getWebviewContent()
}

export function updateAllPanels(): void {
    state.activePanels.forEach(updatePanel)
}

function updatePanel(panel: vscode.WebviewPanel): void {
    panel.webview.html = getWebviewContent()
}

async function handleInstallSkill(envId: string, scope: 'project' | 'global'): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder && scope === 'project') {
        vscode.window.showErrorMessage('No workspace folder open. Open a project first to install project-scoped skills.')
        return
    }

    const extPath = state.extensionPath
    if (!extPath) {
        vscode.window.showErrorMessage('Extension path not available.')
        return
    }

    const skillSourcePath = path.join(extPath, 'resources', 'skills', `${SKILL_NAME}.md`)
    if (!fs.existsSync(skillSourcePath)) {
        vscode.window.showErrorMessage(`Skill template not found at ${skillSourcePath}`)
        return
    }

    const content = fs.readFileSync(skillSourcePath, 'utf8')
    const workspaceRoot = workspaceFolder?.uri.fsPath ?? ''

    if (envId === 'agentsMd') {
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder open.')
            return
        }
        const agentsMdSection = buildAgentsMdSection(content)
        const results = await injectAgentsMdSection(
            { enabled: true, scope: 'project', onlyIfAlreadyPresent: false },
            workspaceRoot,
            agentsMdSection,
            false
        )
        const written = results.filter((r) => r.written)
        if (written.length > 0) {
            await markSkillConsentGranted()
            vscode.window.showInformationMessage('Successfully added/updated debugging instructions in AGENTS.md')
        } else {
            const reason = results[0]?.reason ?? 'Unknown'
            vscode.window.showInformationMessage(`AGENTS.md: ${reason}`)
        }
        return
    }

    const env = SKILL_ENVIRONMENTS.find((e) => e.id === envId)
    if (!env) {
        vscode.window.showErrorMessage(`Unknown environment: ${envId}`)
        return
    }

    const results = await injectSkillEnvironment(
        env,
        { enabled: true, scope, onlyIfAlreadyPresent: false },
        SKILL_NAME,
        workspaceRoot,
        content,
        false
    )

    const written = results.filter((r) => r.written)
    if (written.length > 0) {
        await markSkillConsentGranted()
        vscode.window.showInformationMessage(`Successfully installed DAP debugging skill for ${env.label} (${scope}).`)
    } else {
        const reason = results[0]?.reason ?? 'Unknown'
        vscode.window.showInformationMessage(`${env.label} (${scope}): ${reason}`)
    }
}

/**
 * A manual install from this panel is itself explicit consent - without this,
 * the automatic on-activation check in workspace-config.ts would still find
 * its own workspaceState flag unset and pop up asking to "install/update"
 * something the user just installed by hand a moment ago.
 */
async function markSkillConsentGranted(): Promise<void> {
    await state.workspaceState?.update(SKILL_CONSENT_KEY, 'granted')
}

function getWorkspaceConfigStatus(): { exists: boolean; config?: WorkspaceConfig } {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) return { exists: false }

    const candidatePaths = [
        path.join(workspaceFolder.uri.fsPath, '.vscode', 'mcp-dap-debugger.json'),
        path.join(workspaceFolder.uri.fsPath, '.vscode-mcp-dap-debugger', 'config.json'),
    ]

    for (const configPath of candidatePaths) {
        if (fs.existsSync(configPath)) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as WorkspaceConfig
                return { exists: true, config }
            } catch {
                return { exists: false }
            }
        }
    }

    return { exists: false }
}

function maskToken(token: string): string {
    return `${token.slice(0, 6)}...${token.slice(-4)}`
}

interface SkillStatusItem {
    id: string
    label: string
    baseFolder: string
    projectInstalled: boolean
    globalInstalled?: boolean
}

function getSkillStatusList(): SkillStatusItem[] {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    const workspaceRoot = workspaceFolder?.uri.fsPath
    const list: SkillStatusItem[] = []

    for (const env of SKILL_ENVIRONMENTS) {
        const projPath = workspaceRoot ? path.join(workspaceRoot, env.projectSkillPath(SKILL_NAME)) : ''
        const globPath = env.globalSkillPath(SKILL_NAME)

        list.push({
            id: env.id,
            label: env.label,
            baseFolder: env.baseFolderName,
            projectInstalled: !!(projPath && fs.existsSync(projPath)),
            globalInstalled: fs.existsSync(globPath),
        })
    }

    const agentsMdPath = workspaceRoot ? path.join(workspaceRoot, AGENTS_MD_RELATIVE_PATH) : ''
    let agentsMdInstalled = false
    if (agentsMdPath && fs.existsSync(agentsMdPath)) {
        try {
            const content = fs.readFileSync(agentsMdPath, 'utf8')
            agentsMdInstalled = content.includes(AGENTS_MD_MARKER_BEGIN)
        } catch {
            agentsMdInstalled = false
        }
    }

    list.push({
        id: 'agentsMd',
        label: 'Codex / Generic Agents',
        baseFolder: 'AGENTS.md',
        projectInstalled: agentsMdInstalled,
    })

    return list
}

function getWebviewContent(): string {
    const isRunning = state.isServerRunning()
    const configStatus = getWorkspaceConfigStatus()
    const skills = getSkillStatusList()

    const configInfo = configStatus.exists && configStatus.config
        ? `<div class="info-grid">
            <span class="info-label">Workspace:</span><span>${configStatus.config.workspaceName}</span>
            <span class="info-label">PID:</span><span>${configStatus.config.pid}</span>
            <span class="info-label">Token:</span><span style="font-family:monospace">${maskToken(configStatus.config.token)}</span>
          </div>`
        : '<p style="color: var(--vscode-descriptionForeground);">No workspace configuration file found (.vscode/mcp-dap-debugger.json).</p>'

    const skillsRows = skills.map((s) => {
        if (s.id === 'agentsMd') {
            return `
            <tr>
                <td><strong>${s.label}</strong> (<code>${s.baseFolder}</code>)</td>
                <td colspan="2">
                    <span class="badge ${s.projectInstalled ? 'badge-ok' : 'badge-none'}">
                        ${s.projectInstalled ? 'Installed in AGENTS.md' : 'Not configured'}
                    </span>
                    <button class="button button-sm" onclick="installSkill('${s.id}', 'project')">
                        ${s.projectInstalled ? 'Update AGENTS.md' : 'Add to AGENTS.md'}
                    </button>
                </td>
            </tr>`
        }

        return `
        <tr>
            <td><strong>${s.label}</strong> (<code>${s.baseFolder}</code>)</td>
            <td>
                <span class="badge ${s.projectInstalled ? 'badge-ok' : 'badge-none'}">
                    ${s.projectInstalled ? 'Installed' : 'Not installed'}
                </span>
                <button class="button button-sm" onclick="installSkill('${s.id}', 'project')">
                    ${s.projectInstalled ? 'Reinstall' : 'Install (Project)'}
                </button>
            </td>
            <td>
                <span class="badge ${s.globalInstalled ? 'badge-ok' : 'badge-none'}">
                    ${s.globalInstalled ? 'Installed (~/)' : 'Not installed'}
                </span>
                <button class="button button-sm" onclick="installSkill('${s.id}', 'global')">
                    ${s.globalInstalled ? 'Reinstall' : 'Install (Global)'}
                </button>
            </td>
        </tr>`
    }).join('')

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Debug MCP Monitor</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    padding: 20px; 
                    background-color: var(--vscode-editor-background); 
                    color: var(--vscode-editor-foreground); 
                }
                h1, h2 { 
                    border-bottom: 1px solid var(--vscode-panel-border); 
                    padding-bottom: 10px; 
                    margin-top: 25px;
                }
                h1:first-of-type { margin-top: 0; }
                .status-indicator { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
                .status-running { background-color: #4CAF50; }
                .status-stopped { background-color: #f44336; }
                .info-grid { display: grid; grid-template-columns: auto 1fr; gap: 8px 20px; margin: 15px 0; font-family: monospace; }
                .info-label { font-weight: bold; color: var(--vscode-descriptionForeground); }
                .button { 
                    background-color: var(--vscode-button-background); 
                    color: var(--vscode-button-foreground); 
                    border: none; 
                    padding: 6px 14px; 
                    border-radius: 4px; 
                    cursor: pointer; 
                    margin: 4px 4px 4px 0; 
                    font-size: 13px;
                }
                .button:hover { background-color: var(--vscode-button-hoverBackground); }
                .button-sm {
                    padding: 3px 8px;
                    font-size: 11px;
                    background-color: var(--vscode-button-secondaryBackground, #3a3d41);
                    color: var(--vscode-button-secondaryForeground, #ffffff);
                }
                .button-sm:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground, #45494e);
                }
                .skills-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                }
                .skills-table th, .skills-table td {
                    text-align: left;
                    padding: 10px 12px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .skills-table th {
                    color: var(--vscode-descriptionForeground);
                    font-size: 12px;
                    text-transform: uppercase;
                }
                .badge {
                    display: inline-block;
                    padding: 2px 7px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 500;
                    margin-right: 8px;
                }
                .badge-ok {
                    background-color: rgba(76, 175, 80, 0.2);
                    color: #4CAF50;
                    border: 1px solid rgba(76, 175, 80, 0.4);
                }
                .badge-none {
                    background-color: rgba(128, 128, 128, 0.15);
                    color: var(--vscode-descriptionForeground);
                    border: 1px solid rgba(128, 128, 128, 0.3);
                }
            </style>
        </head>
        <body>
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px;">
                <h1 style="border-bottom: none; margin: 0;">🐞 Debug MCP Monitor</h1>
                <button class="button" onclick="refresh()">Refresh</button>
            </div>

            <h2>Server Status</h2>
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <span class="status-indicator ${isRunning ? 'status-running' : 'status-stopped'}"></span>
                <strong>${isRunning ? 'Running' : 'Stopped'}</strong>
            </div>
            
            <div class="info-grid">
                <span class="info-label">Port:</span><span>${state.currentPort ?? 'n/a'}</span>
                <span class="info-label">Uptime:</span><span>${state.getUptime() || 'n/a'}</span>
            </div>

            <div>
                ${isRunning
                    ? '<button class="button" onclick="stopServer()" style="background-color:#f44336; color:white;">Stop Server</button>'
                    : '<button class="button" onclick="startServer()" style="background-color:#4CAF50; color:white;">Start Server</button>'}
            </div>

            <h2>Workspace Configuration</h2>
            ${configInfo}

            <h2>AI Agent Skills</h2>
            <p style="color: var(--vscode-descriptionForeground); font-size: 13px; margin: 5px 0 15px 0;">
                Click below to install or update the DAP debugging skill guide into your workspace or user home directory.
            </p>
            <table class="skills-table">
                <thead>
                    <tr>
                        <th>Agent Environment</th>
                        <th>Project Scope</th>
                        <th>Global Scope</th>
                    </tr>
                </thead>
                <tbody>
                    ${skillsRows}
                </tbody>
            </table>

            <script>
                const vscode = acquireVsCodeApi();
                function refresh() { vscode.postMessage({ command: 'refresh' }); }
                function startServer() { vscode.postMessage({ command: 'startServer' }); }
                function stopServer() { vscode.postMessage({ command: 'stopServer' }); }
                function installSkill(envId, scope) { vscode.postMessage({ command: 'installSkill', envId, scope }); }
            </script>
        </body>
        </html>
    `
}
