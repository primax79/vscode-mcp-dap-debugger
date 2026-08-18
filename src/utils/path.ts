import * as vscode from 'vscode'
import * as path from 'path'

/**
 * Retrieves the absolute path of the currently active workspace root.
 * Prioritizes the active debug session's workspace, then falls back to the first open workspace folder.
 * 
 * @throws Error if no workspace is currently opened.
 */
export function getWorkspaceRoot(): string {
    const sessionWorkspace = vscode.debug.activeDebugSession?.workspaceFolder
    if (sessionWorkspace) {
        return sessionWorkspace.uri.fsPath
    }

    const allFolders = vscode.workspace.workspaceFolders
    if (allFolders && allFolders.length > 0) {
        return allFolders[0].uri.fsPath
    }

    throw new Error('A workspace folder must be opened to perform this action.')
}

/**
 * Translates an absolute path to a relative one starting from the workspace root.
 * If the path resides outside the workspace, the original absolute path is returned.
 */
export function getRelativePath(absolutePath: string): string {
    try {
        const root = getWorkspaceRoot()
        const relative = path.relative(root, absolutePath)
        
        // If it starts with '..' or is an absolute path on Windows (e.g. C:\), it's outside the workspace
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            return absolutePath
        }
        return relative
    } catch {
        return absolutePath
    }
}

/**
 * Converts a relative path into an absolute path based on the workspace root.
 * If the input path is already absolute, it returns it as-is.
 */
export function resolveWorkspacePath(targetPath: string): string {
    if (path.isAbsolute(targetPath)) {
        return targetPath
    }
    return path.join(getWorkspaceRoot(), targetPath)
}
