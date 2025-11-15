import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ObjectTreeParser } from 'ts-fusion-parser'
import type { FusionParserOptions } from 'ts-fusion-parser'

const targetPath = process.argv[2]
const contextPath = process.argv[3]

if (!targetPath) {
    console.error('Usage: tsx scripts/inspect-ast.ts <path-to-fusion-file> [contextPath]')
    process.exit(1)
}

const absolute = resolve(process.cwd(), targetPath)
const source = readFileSync(absolute, 'utf8')

const parserOptions: FusionParserOptions = {
    ignoreErrors: true,
    allowIncompleteObjectStatements: true,
    eelParserOptions: {
        allowIncompleteObjectPaths: true,
    },
    afxParserOptions: {
        allowUnclosedTags: true,
        eelParserOptions: {
            allowIncompleteObjectPaths: true,
        },
    },
}

const ast = ObjectTreeParser.parse(source, contextPath ?? absolute, parserOptions)
const serializable = toSerializable(ast)

console.log(JSON.stringify(serializable, null, 2))

function toSerializable(value: unknown, seen = new WeakSet()): unknown {
    if (value === null || typeof value !== 'object') {
        return value
    }

    if (seen.has(value)) {
        return undefined
    }

    seen.add(value)

    if (Array.isArray(value)) {
        return value.map((item) => toSerializable(item, seen))
    }

    if (value instanceof Map) {
        return Array.from(value.entries()).map(([key, items]) => ({
            key: typeof key === 'function' ? key.name : String(key),
            items: toSerializable(items, seen),
        }))
    }

    const output: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
        if (key === 'parent' || key === 'nodesByType') {
            continue
        }
        output[key] = toSerializable(entry, seen)
    }

    return output
}
