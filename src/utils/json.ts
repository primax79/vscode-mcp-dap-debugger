import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser'

/**
 * Parses a JSONC string (VS Code's launch.json dialect: // and /* *\/
 * comments, trailing commas). Uses a real tokenizer instead of the previous
 * regex-based comment stripper, which corrupted valid JSON whenever a string
 * value contained "//" (e.g. a URL like "http://localhost:3000") or "/*"/"*\/"
 * sequences - it had no notion of string boundaries.
 */
export function parseJsonWithComments(jsonString: string): any {
    const errors: ParseError[] = []
    const result = parse(jsonString, errors, { allowTrailingComma: true, disallowComments: false })

    if (errors.length > 0) {
        const details = errors
            .map((error) => {
                const { line, column } = offsetToLineColumn(jsonString, error.offset)
                return `${printParseErrorCode(error.error)} at line ${line}, column ${column}`
            })
            .join('; ')
        throw new Error(`Failed to parse JSONC: ${details}`)
    }

    return result
}

function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
    const before = text.slice(0, offset)
    const lines = before.split('\n')
    return { line: lines.length, column: lines[lines.length - 1].length + 1 }
}
