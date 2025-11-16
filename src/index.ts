import type { SupportLanguage, Parser, Printer, SupportOption, Options, ParserOptions, AstPath } from "prettier"
import { ObjectTreeParser } from "ts-fusion-parser"
import type { FusionParserOptions } from "ts-fusion-parser"
import type { AfxParserOptions } from "ts-fusion-parser/out/dsl/afx/parser"
import type { EelParserOptions } from "ts-fusion-parser/out/dsl/eel/parser"
import { embedFusionAst, printFusionAst } from "./printer"

const FUSION_AST_FORMAT = "fusion-ast"
const OPTION_CATEGORY = "Fusion parser"

type NodeWithPosition = {
  position?: {
    begin?: number
    end?: number
  }
}

type ErrorWithPosition = Error & {
  position?: number
  getPosition?: () => number
}

type FusionParserSyntaxError = SyntaxError & {
  fusionParserError?: true
  loc?: {
    start: {
      line: number
      column: number
    }
  }
  cause?: unknown
}

function shouldIgnoreParserErrors(options: ParserOptions): boolean {
  return options.fusionIgnoreParserErrors ?? false
}

function isFusionParserSyntaxError(error: unknown): error is FusionParserSyntaxError {
  return Boolean(error && typeof error === "object" && (error as FusionParserSyntaxError).fusionParserError)
}

function createFusionParserSyntaxError(
  error: unknown,
  sourceText: string,
  filePath?: string
): FusionParserSyntaxError {
  const baseError =
    error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown parser error")

  const offset = getErrorPosition(baseError)
  const location = typeof offset === "number" && offset >= 0 ? getLocationFromOffset(sourceText, offset) : undefined
  const fileLabel = filePath || "Fusion document"
  const locationLabel = location ? `${fileLabel}:${location.line}:${location.column}` : fileLabel
  const prefix = location ? "at" : "in"

  const syntaxError = new SyntaxError(
    `Fusion parser error ${prefix} ${locationLabel}: ${baseError.message}`
  ) as FusionParserSyntaxError

  syntaxError.fusionParserError = true
  syntaxError.cause = baseError

  if (location) {
    syntaxError.loc = {
      start: {
        line: location.line,
        column: location.column
      }
    }
  }

  return syntaxError
}

function getErrorPosition(error: ErrorWithPosition): number | undefined {
  if (typeof error.position === "number") {
    return error.position
  }

  if (typeof error.getPosition === "function") {
    const result = error.getPosition()
    if (typeof result === "number") {
      return result
    }
  }

  return undefined
}

function getLocationFromOffset(sourceText: string, index: number): { line: number; column: number } {
  if (sourceText.length === 0) {
    return { line: 1, column: 1 }
  }

  const normalizedIndex = Math.max(0, Math.min(index, sourceText.length))
  const precedingText = sourceText.slice(0, normalizedIndex)
  const lines = precedingText.split(/\r?\n/)

  const line = lines.length
  const lastLine = lines[line - 1] ?? ""
  const column = lastLine.length + 1

  return { line, column }
}

function buildEelParserOptions(options: ParserOptions): EelParserOptions {
  return {
    allowIncompleteObjectPaths: options.fusionAllowIncompleteEelPaths ?? true
  }
}

function buildAfxParserOptions(options: ParserOptions): AfxParserOptions {
  return {
    allowUnclosedTags: options.fusionAllowUnclosedAfxTags ?? true,
    eelParserOptions: buildEelParserOptions(options)
  }
}

function buildFusionParserOptions(options: ParserOptions): FusionParserOptions {
  const ignoreErrors = shouldIgnoreParserErrors(options)
  return {
    ignoreErrors,
    allowIncompleteObjectStatements: options.fusionAllowIncompleteObjectStatements ?? false,
    afxParserOptions: buildAfxParserOptions(options),
    eelParserOptions: buildEelParserOptions(options)
  }
}

function getPosition(node: unknown): { begin: number; end: number } {
  if (isNodeWithPosition(node)) {
    const begin = typeof node.position?.begin === "number" ? node.position.begin : 0
    const end = typeof node.position?.end === "number" ? node.position.end : begin
    return { begin, end }
  }
  return { begin: 0, end: 0 }
}

function isNodeWithPosition(node: unknown): node is NodeWithPosition {
  return typeof node === "object" && node !== null && "position" in node
}

// https://prettier.io/docs/en/plugins#languages
export const languages: Partial<SupportLanguage>[] = [
  {
    name: "Neos Fusion",
    parsers: ["fusion"],
    extensions: [".fusion"],
    vscodeLanguageIds: ["fusion"]
  }
]

// https://prettier.io/docs/en/plugins#parsers
export const parsers: Record<"fusion", Parser> = {
  fusion: {
    parse(text: string, options: ParserOptions) {
      const contextPath = options.fusionContextPath || options.filepath
      const parserOptions = buildFusionParserOptions(options)

      try {
        const fusionFile = ObjectTreeParser.parse(text, contextPath, parserOptions)

        if (!parserOptions.ignoreErrors && fusionFile.errors.length > 0) {
          throw createFusionParserSyntaxError(fusionFile.errors[0], text, contextPath)
        }

        return fusionFile
      } catch (error) {
        if (isFusionParserSyntaxError(error)) {
          throw error
        }
        throw createFusionParserSyntaxError(error, text, contextPath)
      }
    },
    astFormat: FUSION_AST_FORMAT,
    locStart(node) {
      return getPosition(node).begin
    },
    locEnd(node) {
      return getPosition(node).end
    }
  }
}

// https://prettier.io/docs/en/plugins#printers
export const printers: Record<typeof FUSION_AST_FORMAT, Printer> = {
  [FUSION_AST_FORMAT]: {
    print(path: AstPath, options) {
      return printFusionAst(path, options)
    },
    embed(path, options) {
      return embedFusionAst(path, options)
    }
  }
}

// https://prettier.io/docs/en/plugins.html#options
export const options: Record<
  | "fusionContextPath"
  | "fusionIgnoreParserErrors"
  | "fusionAllowIncompleteObjectStatements"
  | "fusionAllowIncompleteEelPaths"
  | "fusionAllowUnclosedAfxTags"
  | "fusionLineWidth"
  | "fusionEmbedEelParser",
  SupportOption
> = {
  fusionContextPath: {
    type: "string",
    category: OPTION_CATEGORY,
    default: undefined,
    description: "Overrides the context path that is passed to ts-fusion-parser (falls back to Prettier filepath)."
  },
  fusionIgnoreParserErrors: {
    type: "boolean",
    category: OPTION_CATEGORY,
    default: false,
    description: "Forwarded to ts-fusion-parser ignoreErrors option to keep formatting resilient to syntax errors."
  },
  fusionAllowIncompleteObjectStatements: {
    type: "boolean",
    category: OPTION_CATEGORY,
    default: false,
    description: "Allows incomplete Fusion object statements while typing."
  },
  fusionAllowIncompleteEelPaths: {
    type: "boolean",
    category: OPTION_CATEGORY,
    default: true,
    description: "Allows incomplete EEL object paths which helps when formatting unfinished expressions."
  },
  fusionAllowUnclosedAfxTags: {
    type: "boolean",
    category: OPTION_CATEGORY,
    default: true,
    description: "Toggles the AFX parser option that automatically closes tags."
  },
  fusionLineWidth: {
    type: "int",
    category: OPTION_CATEGORY,
    default: undefined,
    description: "Optional override that influences when embedded DSL blocks expand to multiple lines."
  },
  fusionEmbedEelParser: {
    type: "boolean",
    category: OPTION_CATEGORY,
    default: false,
    description: "When enabled, embedded EEL expressions are normalized via Prettier’s babel-ts parser."
  }
}

// https://prettier.io/docs/en/plugins#defaultoptions
export const defaultOptions: Options = {
  tabWidth: 4
}

declare module "prettier" {
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
