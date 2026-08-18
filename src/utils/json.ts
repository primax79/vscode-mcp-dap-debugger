import { parse, printParseErrorCode, ParseError } from 'jsonc-parser'

/**
 * Parses JSONC (JSON with Comments) into a JavaScript object.
 * This is particularly useful for files like launch.json or settings.json
 * in VS Code environments which often contain comments and trailing commas.
 * 
 * @param text The JSON string to parse.
 * @returns The parsed JavaScript object.
 * @throws Error if the JSON cannot be parsed.
 */
export function parseJsonWithComments(text: string): any {
    const parseErrors: ParseError[] = []
    const parsedData = parse(text, parseErrors, { 
        allowTrailingComma: true, 
        disallowComments: false 
    })

    if (parseErrors.length > 0) {
        const errorMessages = parseErrors.map(err => {
            const pos = getLineAndColumn(text, err.offset)
            return `${printParseErrorCode(err.error)} at [${pos.line}:${pos.column}]`
        })
        throw new Error(`JSONC Parsing Error: ${errorMessages.join(' | ')}`)
    }

    return parsedData
}

function getLineAndColumn(content: string, offset: number): { line: number; column: number } {
    let line = 1
    let column = 1
    for (let i = 0; i < offset; i++) {
        if (content[i] === '\n') {
            line++
            column = 1
        } else {
            column++
        }
    }
    return { line, column }
}
