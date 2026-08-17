import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { promisify } from 'util'

const writeFile = promisify(fs.writeFile)
const readFile = promisify(fs.readFile)
const mkdir = promisify(fs.mkdir)

const REGISTRY_DIR = path.join(os.homedir(), '.vscode-debug-mcp')
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'active-configs.json')
const STALE_SWEEP_INTERVAL_MS = 30_000

export interface RegistryEntry {
    vscodeInstanceId: string
    workspacePath: string
    workspaceName: string
    configPath: string
    port: number
    token: string
    pid: number
}

interface GlobalRegistry {
    activeInstances: RegistryEntry[]
    lastUpdated: number
}

/**
 * Tracks every active VS Code Debug MCP instance across the machine, so the
 * CLI can discover the right port/token even when invoked outside a
 * workspace with its own config file.
 */
class RegistryManager {
    private sweepTimer: NodeJS.Timeout | undefined

    async initialize(): Promise<void> {
        await mkdir(REGISTRY_DIR, { recursive: true })
        this.startSweep()
    }

    /**
     * Registers this instance. Only a *stale* registration for this exact
     * instance id is replaced (e.g. re-registering after a restart) - a
     * different, still-live instance that happens to share the same
     * workspacePath is kept, not evicted. An earlier version of this method
     * deduped by workspacePath alone, which silently dropped a still-live
     * instance from the registry the moment a second window registered for
     * the same folder - exactly the port/token confusion this is meant to
     * prevent. `duplicateWorkspace` is returned (non-evicted) so the caller
     * can warn the user that two live instances now share a workspace path.
     */
    async registerInstance(entry: RegistryEntry): Promise<{ duplicateWorkspace: RegistryEntry | null }> {
        const registry = await this.load()

        const duplicateWorkspace = registry.activeInstances.find(
            (e) => e.workspacePath === entry.workspacePath && e.vscodeInstanceId !== entry.vscodeInstanceId && this.isAlive(e)
        ) ?? null

        registry.activeInstances = registry.activeInstances.filter((e) => e.vscodeInstanceId !== entry.vscodeInstanceId)
        registry.activeInstances.push(entry)
        registry.lastUpdated = Date.now()
        await this.save(registry)

        return { duplicateWorkspace }
    }

    async unregisterInstance(vscodeInstanceId: string): Promise<void> {
        const registry = await this.load()
        registry.activeInstances = registry.activeInstances.filter((e) => e.vscodeInstanceId !== vscodeInstanceId)
        registry.lastUpdated = Date.now()
        await this.save(registry)
    }

    async getActiveInstances(): Promise<RegistryEntry[]> {
        const registry = await this.load()
        return registry.activeInstances.filter((e) => this.isAlive(e))
    }

    private isAlive(entry: RegistryEntry): boolean {
        try {
            process.kill(entry.pid, 0)
            return true
        } catch {
            return false
        }
    }

    private async load(): Promise<GlobalRegistry> {
        try {
            const data = await readFile(REGISTRY_PATH, 'utf8')
            return JSON.parse(data)
        } catch (error: any) {
            if (error.code === 'ENOENT') return { activeInstances: [], lastUpdated: Date.now() }
            throw error
        }
    }

    private async save(registry: GlobalRegistry): Promise<void> {
        await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2), { encoding: 'utf8', mode: 0o600 })
    }

    private startSweep(): void {
        this.stopSweep()
        this.sweepTimer = setInterval(async () => {
            const registry = await this.load()
            const alive = registry.activeInstances.filter((e) => this.isAlive(e))
            if (alive.length !== registry.activeInstances.length) {
                registry.activeInstances = alive
                registry.lastUpdated = Date.now()
                await this.save(registry)
            }
        }, STALE_SWEEP_INTERVAL_MS)
    }

    stopSweep(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer)
            this.sweepTimer = undefined
        }
    }

    async cleanup(vscodeInstanceId?: string): Promise<void> {
        this.stopSweep()
        if (vscodeInstanceId) await this.unregisterInstance(vscodeInstanceId)
    }
}

export const registry = new RegistryManager()
