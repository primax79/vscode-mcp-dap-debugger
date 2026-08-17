import * as vscode from 'vscode'
import * as path from 'path'

/**
 * Get the current workspace root path.
 */
export function getWorkspaceRoot(): string {
    const activeSession = vscode.debug.activeDebugSession
    if (activeSession?.workspaceFolder) {
        return activeSession.workspaceFolder.uri.fsPath
    }

    const folders = vscode.workspace.workspaceFolders
    if (folders && folders.length > 0) {
        return folders[0].uri.fsPath
    }

    throw new Error('No workspace folder found. Please open a workspace or folder in VS Code.')
}

/**
 * Convert an absolute path to a path relative to the workspace root.
 * Falls back to the absolute path if it's outside the workspace.
 */
export function getRelativePath(absolutePath: string): string {
    try {
        const workspaceRoot = getWorkspaceRoot()
        const relativePath = path.relative(workspaceRoot, absolutePath)
        return relativePath.startsWith('..') ? absolutePath : relativePath
    } catch {
        return absolutePath
    }
}

/**
 * Resolve a possibly-relative path against the workspace root.
 * Absolute paths are returned unchanged.
 */
export function resolveWorkspacePath(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(), filePath)
}
