import type { SupportLanguage, Parser, Printer, SupportOption, Options, ParserOptions, AstPath } from 'prettier'
import { ObjectTreeParser } from 'ts-fusion-parser'
import type { FusionParserOptions } from 'ts-fusion-parser'
import type { AfxParserOptions } from 'ts-fusion-parser/out/dsl/afx/parser'
import type { EelParserOptions } from 'ts-fusion-parser/out/dsl/eel/parser'
import { printFusionAst } from './printer'

const FUSION_AST_FORMAT = 'fusion-ast'
const OPTION_CATEGORY = 'Fusion parser'

type NodeWithPosition = {
    position?: {
        begin?: number
        end?: number
    }
}

function buildEelParserOptions(options: ParserOptions): EelParserOptions {
    return {
        allowIncompleteObjectPaths: options.fusionAllowIncompleteEelPaths ?? true,
    }
}

function buildAfxParserOptions(options: ParserOptions): AfxParserOptions {
    return {
        allowUnclosedTags: options.fusionAllowUnclosedAfxTags ?? true,
        eelParserOptions: buildEelParserOptions(options),
    }
}

function buildFusionParserOptions(options: ParserOptions): FusionParserOptions {
    return {
        ignoreErrors: options.fusionIgnoreParserErrors ?? true,
        allowIncompleteObjectStatements: options.fusionAllowIncompleteObjectStatements ?? true,
        afxParserOptions: buildAfxParserOptions(options),
        eelParserOptions: buildEelParserOptions(options),
    }
}

function getPosition(node: unknown): { begin: number; end: number } {
    if (isNodeWithPosition(node)) {
        const begin = typeof node.position?.begin === 'number' ? node.position.begin : 0
        const end = typeof node.position?.end === 'number' ? node.position.end : begin
        return { begin, end }
    }
    return { begin: 0, end: 0 }
}

function isNodeWithPosition(node: unknown): node is NodeWithPosition {
    return typeof node === 'object' && node !== null && 'position' in node
}

// https://prettier.io/docs/en/plugins#languages
export const languages: Partial<SupportLanguage>[] = [
    {
        name: 'Neos Fusion',
        parsers: ['fusion'],
        extensions: ['.fusion'],
        vscodeLanguageIds: ['fusion'],
    },
]

// https://prettier.io/docs/en/plugins#parsers
export const parsers: Record<'fusion', Parser> = {
    fusion: {
        parse(text: string, options: ParserOptions) {
            const contextPath = options.fusionContextPath || options.filepath
            const fusionFile = ObjectTreeParser.parse(text, contextPath, buildFusionParserOptions(options))

            return fusionFile
        },
        astFormat: FUSION_AST_FORMAT,
        locStart(node) {
            return getPosition(node).begin
        },
        locEnd(node) {
            return getPosition(node).end
        },
    },
}

// https://prettier.io/docs/en/plugins#printers
export const printers: Record<typeof FUSION_AST_FORMAT, Printer> = {
    [FUSION_AST_FORMAT]: {
        print(path: AstPath, options) {
            return printFusionAst(path, options)
        },
    },
}

// https://prettier.io/docs/en/plugins.html#options
export const options: Record<
    | 'fusionContextPath'
    | 'fusionIgnoreParserErrors'
    | 'fusionAllowIncompleteObjectStatements'
    | 'fusionAllowIncompleteEelPaths'
    | 'fusionAllowUnclosedAfxTags'
    | 'fusionLineWidth'
    | 'fusionEmbedEelParser',
    SupportOption
> = {
    fusionContextPath: {
        type: 'string',
        category: OPTION_CATEGORY,
        default: undefined,
        description: 'Overrides the context path that is passed to ts-fusion-parser (falls back to Prettier filepath).',
    },
    fusionIgnoreParserErrors: {
        type: 'boolean',
        category: OPTION_CATEGORY,
        default: true,
        description: 'Forwarded to ts-fusion-parser ignoreErrors option to keep formatting resilient to syntax errors.',
    },
    fusionAllowIncompleteObjectStatements: {
        type: 'boolean',
        category: OPTION_CATEGORY,
        default: true,
        description: 'Allows incomplete Fusion object statements while typing.',
    },
    fusionAllowIncompleteEelPaths: {
        type: 'boolean',
        category: OPTION_CATEGORY,
        default: true,
        description: 'Allows incomplete EEL object paths which helps when formatting unfinished expressions.',
    },
    fusionAllowUnclosedAfxTags: {
        type: 'boolean',
        category: OPTION_CATEGORY,
        default: true,
        description: 'Toggles the AFX parser option that automatically closes tags.',
    },
    fusionLineWidth: {
        type: 'int',
        category: OPTION_CATEGORY,
        default: undefined,
        description: 'Optional override that influences when embedded DSL blocks expand to multiple lines.',
    },
    fusionEmbedEelParser: {
        type: 'boolean',
        category: OPTION_CATEGORY,
        default: false,
        description: 'When enabled, embedded EEL expressions are normalized via Prettier’s babel-ts parser.',
    },
}

// https://prettier.io/docs/en/plugins#defaultoptions
export const defaultOptions: Options = {
    tabWidth: 4,
}

declare module 'prettier' {
    interface ParserOptions {
        fusionContextPath?: string
        fusionIgnoreParserErrors?: boolean
        fusionAllowIncompleteObjectStatements?: boolean
        fusionAllowIncompleteEelPaths?: boolean
        fusionAllowUnclosedAfxTags?: boolean
        fusionLineWidth?: number
        fusionEmbedEelParser?: boolean
    }
}
