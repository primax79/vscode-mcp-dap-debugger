import * as vscode from 'vscode'
import { inputSchemas } from './schemas'
import { ok, withErrorHandling } from './shared'
import { resolveWorkspacePath, getRelativePath } from '../utils/path'

interface BreakpointInput {
    file: string
    line: number
    condition?: string
    hitCondition?: string
    logMessage?: string
}

function buildBreakpoint(input: BreakpointInput): vscode.SourceBreakpoint {
    const uri = vscode.Uri.file(resolveWorkspacePath(input.file))
    const location = new vscode.Location(uri, new vscode.Position(input.line - 1, 0))
    // Pass condition/hitCondition/logMessage through the real constructor
    // parameters. The original code bolted condition/hitCondition on via an
    // `as any` cast after construction and left logMessage commented out
    // entirely, so requested logpoints silently became plain breakpoints.
    return new vscode.SourceBreakpoint(location, true, input.condition, input.hitCondition, input.logMessage)
}

function describeBreakpoint(input: BreakpointInput) {
    return {
        file: input.file,
        line: input.line,
        condition: input.condition ?? null,
        hitCondition: input.hitCondition ?? null,
        logMessage: input.logMessage ?? null,
        kind: input.logMessage ? 'logpoint' : 'breakpoint',
    }
}

export const addBreakpointTool = {
    name: 'add-breakpoint',
    config: {
        title: 'Add Breakpoint',
        description: 'Add a breakpoint (or logpoint, if logMessage is set) to a file at a specified line',
        inputSchema: inputSchemas['add-breakpoint'],
    },
    handler: async (args: BreakpointInput) => withErrorHandling(async () => {
        await vscode.debug.addBreakpoints([buildBreakpoint(args)])
        return ok({ ...describeBreakpoint(args), message: `${args.logMessage ? 'Logpoint' : 'Breakpoint'} added successfully` })
    }),
}

export const addBreakpointsTool = {
    name: 'add-breakpoints',
    config: {
        title: 'Add Multiple Breakpoints',
        description: 'Add multiple breakpoints/logpoints in one call',
        inputSchema: inputSchemas['add-breakpoints'],
    },
    handler: async (args: { breakpoints: BreakpointInput[] }) => withErrorHandling(async () => {
        const breakpoints = args.breakpoints.map(buildBreakpoint)
        await vscode.debug.addBreakpoints(breakpoints)
        return ok({
            totalBreakpoints: args.breakpoints.length,
            results: args.breakpoints.map((bp) => ({
                ...describeBreakpoint(bp),
                message: `${bp.logMessage ? 'Logpoint' : 'Breakpoint'} added successfully`,
            })),
        })
    }),
}

export const removeBreakpointTool = {
    name: 'remove-breakpoint',
    config: {
        title: 'Remove Breakpoint',
        description: 'Remove the breakpoint at a specific file and line',
        inputSchema: inputSchemas['remove-breakpoint'],
    },
    handler: async (args: { file: string; line: number }) => withErrorHandling(async () => {
        const targetPath = resolveWorkspacePath(args.file)
        const matches = vscode.debug.breakpoints.filter(
            (bp): bp is vscode.SourceBreakpoint =>
                bp instanceof vscode.SourceBreakpoint &&
                bp.location.uri.fsPath === targetPath &&
                bp.location.range.start.line === args.line - 1
        )

        if (matches.length === 0) {
            return ok({ message: `No breakpoint found at ${args.file}:${args.line}` })
        }

        vscode.debug.removeBreakpoints(matches)
        return ok({ message: `Breakpoint removed from ${args.file}:${args.line}` })
    }),
}

export const clearBreakpointsTool = {
    name: 'clear-breakpoints',
    config: {
        title: 'Clear Breakpoints',
        description: 'Remove all breakpoints, or only those in the given files',
        inputSchema: inputSchemas['clear-breakpoints'],
    },
    handler: async (args: { files?: string[] }) => withErrorHandling(async () => {
        let toRemove: vscode.Breakpoint[]

        if (args.files && args.files.length > 0) {
            const targetPaths = args.files.map(resolveWorkspacePath)
            toRemove = vscode.debug.breakpoints.filter(
                (bp) => bp instanceof vscode.SourceBreakpoint && targetPaths.includes(bp.location.uri.fsPath)
            )
        } else {
            toRemove = vscode.debug.breakpoints.filter((bp) => bp instanceof vscode.SourceBreakpoint)
        }

        if (toRemove.length === 0) {
            return ok({ message: 'No breakpoints to clear' })
        }

        vscode.debug.removeBreakpoints(toRemove)
        return ok({ message: `Cleared ${toRemove.length} breakpoint(s)` })
    }),
}

function serializeBreakpoint(bp: vscode.SourceBreakpoint) {
    return {
        file: getRelativePath(bp.location.uri.fsPath),
        line: bp.location.range.start.line + 1,
        enabled: bp.enabled,
        condition: bp.condition,
        hitCondition: bp.hitCondition,
        logMessage: bp.logMessage,
    }
}

/** Shared by the list-breakpoints tool and the breakpoints:// resource. */
export function listBreakpointsData() {
    return vscode.debug.breakpoints
        .filter((bp): bp is vscode.SourceBreakpoint => bp instanceof vscode.SourceBreakpoint)
        .map(serializeBreakpoint)
}

export const listBreakpointsTool = {
    name: 'list-breakpoints',
    config: {
        title: 'List Breakpoints',
        description: 'List all breakpoints in the workspace',
        inputSchema: inputSchemas['list-breakpoints'],
    },
    handler: async () => withErrorHandling(async () => ok(listBreakpointsData())),
}
