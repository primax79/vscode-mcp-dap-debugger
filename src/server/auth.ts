import { randomBytes } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'

const TOKEN_HEADER = 'x-mcp-debug-token'

export function generateAuthToken(): string {
    return randomBytes(32).toString('hex')
}

/**
 * Requires every /mcp request to present the current instance's token.
 * The token is generated fresh per server start and discovered by the CLI
 * via the workspace config file / global registry - it is not meant as
 * strong auth, only as a guard against other local processes/users
 * stumbling onto the port and driving the debugger (e.g. via
 * evaluate-expression) without ever having had filesystem access to this
 * workspace.
 */
export function createAuthMiddleware(getToken: () => string | undefined) {
    return (req: Request, res: Response, next: NextFunction) => {
        const expected = getToken()
        if (!expected) {
            res.status(503).json({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Server not ready yet' },
                id: null,
            })
            return
        }

        const provided = req.header(TOKEN_HEADER)
        if (provided !== expected) {
            res.status(401).json({
                jsonrpc: '2.0',
                error: { code: -32001, message: `Unauthorized: missing or invalid ${TOKEN_HEADER} header` },
                id: null,
            })
            return
        }

        next()
    }
}
