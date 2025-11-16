import type { AstPath, Doc, Options, ParserOptions, Printer } from "prettier"
import type { FusionFile } from "ts-fusion-parser/out/fusion/nodes/FusionFile"
import type { StatementList } from "ts-fusion-parser/out/fusion/nodes/StatementList"
import type { ObjectStatement } from "ts-fusion-parser/out/fusion/nodes/ObjectStatement"
import type { Block } from "ts-fusion-parser/out/fusion/nodes/Block"
import type { AbstractOperation } from "ts-fusion-parser/out/fusion/nodes/AbstractOperation"
import type { ValueAssignment } from "ts-fusion-parser/out/fusion/nodes/ValueAssignment"
import type { ValueCopy } from "ts-fusion-parser/out/fusion/nodes/ValueCopy"
import type { ValueUnset } from "ts-fusion-parser/out/fusion/nodes/ValueUnset"
import type { AbstractPathValue } from "ts-fusion-parser/out/fusion/nodes/AbstractPathValue"
import type { DslExpressionValue } from "ts-fusion-parser/out/fusion/nodes/DslExpressionValue"
import type { EelExpressionValue } from "ts-fusion-parser/out/fusion/nodes/EelExpressionValue"
import type { ObjectPath } from "ts-fusion-parser/out/fusion/nodes/ObjectPath"
import type { Comment } from "ts-fusion-parser/out/common/Comment"
import type { AssignedObjectPath } from "ts-fusion-parser/out/fusion/nodes/AssignedObjectPath"
import { concat, group, hardline, indent, join, mapDoc, stripTrailingHardline } from "./docBuilders"

type FusionPrinterContext = {
  sourceText: string
  lineWidth: number
  embedEelParser: boolean
  useSingleQuote: boolean
}

type NodeWithPosition = { position?: { begin?: number; end?: number } }
type AfxDslExpressionValue = DslExpressionValue & { __formattedAfxDoc?: Doc }

const AFX_EEL_PLACEHOLDER_PREFIX = "__FUSION_AFX_EEL_"
const AFX_EEL_PLACEHOLDER_PATTERN = /(['"])?__FUSION_AFX_EEL_(\d+)__\1?/g

function docContainsLineBreak(doc: Doc): boolean {
  if (typeof doc === "string") {
    return false
  }

  if (Array.isArray(doc)) {
    return doc.some(docContainsLineBreak)
  }

  if (typeof doc === "object" && doc !== null) {
    // Check for any line break or indent which suggests multi-line formatting
    if ("type" in doc) {
      if (doc.type === "line" || doc.type === "indent" || doc.type === "line-suffix-boundary") {
        return true
      }
    }
    return Object.values(doc).some((value) => docContainsLineBreak(value as Doc))
  }

  return false
}

export const embedFusionAst: NonNullable<Printer["embed"]> = (path: AstPath, options: Options) => {
  const node = path.getValue()

  if (!isDslExpressionValue(node) || !isAfxExpression(node)) {
    return null
  }

  const lineWidth = resolveLineWidth(options)

  return async (textToDoc) => {
    const content = getNormalizedAfxContent(node)

    if (!content) {
      const emptyDoc = concat([node.identifier, "`", "`"])
      setAfxDoc(node, emptyDoc)
      return emptyDoc
    }

    const { sanitized, placeholders } = maskEelExpressions(content)
    const htmlDoc = await textToDoc(sanitized, {
      parser: "html",
      printWidth: options.printWidth,
      tabWidth: options.tabWidth,
      useTabs: options.useTabs,
      singleAttributePerLine: false
    })
    const restored = restoreEelExpressions(stripTrailingHardline(htmlDoc), placeholders)

    // Check if the formatted HTML contains line breaks
    const shouldExpand = docContainsLineBreak(restored)

    const wrapped = shouldExpand
      ? concat([node.identifier, "`", indent(concat([hardline, restored])), hardline, "`"])
      : concat([node.identifier, "`", restored, "`"])

    setAfxDoc(node, wrapped)
    return wrapped
  }
}

export function printFusionAst(path: AstPath, options: ParserOptions): Doc {
  const node = path.getValue()
  if (!node) {
    return ""
  }

  const context = createContext(options)

  if (isFusionFile(node)) {
    const printed = printStatementList(node.statementList, context)
    return printed ? concat([printed, hardline]) : ""
  }

  if (isStatementList(node)) {
    return printStatementList(node, context)
  }

  if (isObjectStatement(node)) {
    return printObjectStatement(node, context)
  }

  if (isValueAssignment(node)) {
    const valueDoc = node.pathValue ? path.call((p) => printFusionAst(p, options), "pathValue") : ""
    return concat([" = ", valueDoc])
  }

  if (isDslExpressionValue(node)) {
    return formatDslExpression(node, context)
  }

  if (isEelExpressionValue(node)) {
    return formatEelExpression(node, context)
  }

  return ""
}

function createContext(options: ParserOptions): FusionPrinterContext {
  const source = typeof options.originalText === "string" ? options.originalText : ""
  return {
    sourceText: source,
    lineWidth: resolveLineWidth(options),
    embedEelParser: options.fusionEmbedEelParser ?? false,
    useSingleQuote: options.singleQuote === true
  }
}

function printStatementList(list: StatementList | undefined, context: FusionPrinterContext): Doc {
  if (!list) {
    return ""
  }

  const items = [...(list.statements ?? []), ...(list.comments ?? [])]
    .map((node, index) => ({ node, index }))
    .sort((a, b) => {
      const aPos = getNodePosition(a.node)
      const bPos = getNodePosition(b.node)

      if (!aPos && !bPos) {
        return a.index - b.index
      }

      if (!aPos) {
        return 1
      }

      if (!bPos) {
        return -1
      }

      if (aPos.begin === bPos.begin) {
        return a.index - b.index
      }

      return aPos.begin - bPos.begin
    })

  const parts: Doc[] = []

  for (let i = 0; i < items.length; i += 1) {
    const current = items[i].node
    const next = items[i + 1]?.node
    const doc = isCommentNode(current) ? printComments([current]) : printStatement(current, context)

    parts.push(doc)

    if (next) {
      parts.push(hardline)
      if (hasOriginalBlankLine(current, next, context) || hasNonEmptyBlock(current)) {
        parts.push(hardline)
      }
    }
  }

  return parts.length > 0 ? concat(parts) : ""
}

function printStatement(statement: unknown, context: FusionPrinterContext): Doc {
  if (isObjectStatement(statement)) {
    return printObjectStatement(statement, context)
  }

  if (isIncludeStatement(statement)) {
    return concat(["include: ", statement.filePattern])
  }

  return getSourceForNode(statement, context) ?? ""
}

function printObjectStatement(statement: ObjectStatement, context: FusionPrinterContext): Doc {
  const docs: Doc[] = []
  const path = formatObjectPath(statement.path)

  if (path) {
    docs.push(path)
  }

  if (statement.operation) {
    docs.push(printOperation(statement.operation, context))
  }

  if (statement.block) {
    const blockDoc = printBlock(statement.block, context)
    if (blockDoc) {
      if (docs.length > 0) {
        docs.push(" ")
      }
      docs.push(blockDoc)
    }
  }

  return docs.length > 0 ? group(concat(docs)) : ""
}

function printOperation(operation: AbstractOperation, context: FusionPrinterContext, valuePrinter?: () => Doc): Doc {
  if (isValueAssignment(operation)) {
    const valueDoc = valuePrinter ? valuePrinter() : formatPathValue(operation.pathValue, context)
    return concat([" = ", valueDoc])
  }

  if (isValueCopy(operation)) {
    return concat([" < ", formatAssignedObjectPath(operation.assignedObjectPath)])
  }

  if (isValueUnset(operation)) {
    return " >"
  }

  return ""
}

function printBlock(block: Block, context: FusionPrinterContext): Doc {
  const hasContent =
    (block.statementList?.statements?.length ?? 0) > 0 || (block.statementList?.comments?.length ?? 0) > 0

  if (!hasContent) {
    return group(concat(["{", hardline, "}"]))
  }

  const inner = printStatementList(block.statementList, context)
  return group(concat(["{", indent(concat([hardline, inner])), hardline, "}"]))
}

function formatObjectPath(path: ObjectPath | undefined): string {
  if (!path || !Array.isArray(path.segments)) {
    return ""
  }

  const segments = path.segments.map((segment) => {
    if (!segment) {
      return ""
    }

    if (segment.constructor?.name === "PrototypePathSegment") {
      return `prototype(${segment.identifier})`
    }

    if (segment.constructor?.name === "MetaPathSegment") {
      return `@${segment.identifier}`
    }

    return segment.identifier
  })

  return segments.filter(Boolean).join(".")
}

function formatPathValue(pathValue: AbstractPathValue<unknown>, context: FusionPrinterContext): Doc {
  const ctorName = pathValue?.constructor?.name

  switch (ctorName) {
    case "StringValue":
    case "CharValue":
      return quoteString(String(pathValue.value ?? ""), context)
    case "IntValue":
    case "FloatValue":
    case "SimpleValue":
      return String(pathValue.value ?? "")
    case "BoolValue":
      return pathValue.value ? "true" : "false"
    case "NullValue":
      return "null"
    case "FusionObjectValue":
      return String(pathValue.value ?? "")
    case "DslExpressionValue":
      return formatDslExpression(pathValue as DslExpressionValue, context)
    case "EelExpressionValue":
      return formatEelExpression(pathValue as EelExpressionValue, context)
    default:
      return String(pathValue?.value ?? "")
  }
}

function formatDslExpression(value: DslExpressionValue, context: FusionPrinterContext): Doc {
  const embeddedAfxDoc = getAfxDoc(value)
  if (embeddedAfxDoc && isAfxExpression(value)) {
    return embeddedAfxDoc
  }

  const raw = (value.value ?? "").replace(/\r\n/g, "\n")
  const trimmedEnd = raw.replace(/\s+$/, "")
  const shouldExpand = trimmedEnd.includes("\n") || trimmedEnd.length > context.lineWidth

  if (!shouldExpand) {
    return concat([value.identifier, "`", trimmedEnd.trim(), "`"])
  }

  const normalized = normalizeMultilineText(trimmedEnd)
  const bodyDoc = normalized.length > 0 ? join(hardline, normalized) : ""
  return concat([value.identifier, "`", indent(concat([hardline, bodyDoc])), hardline, "`"])
}

function normalizeMultilineText(value: string): string[] {
  const lines = value.split("\n")

  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift()
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop()
  }

  if (lines.length === 0) {
    return []
  }

  const indents = lines.filter((line) => line.trim().length > 0).map((line) => line.match(/^[\t ]*/)?.[0].length ?? 0)

  const commonIndent = indents.length > 0 ? Math.min(...indents) : 0

  return lines.map((line) => {
    if (line.trim().length === 0) {
      return ""
    }
    return line.slice(Math.min(commonIndent, line.length))
  })
}

function formatEelExpression(value: EelExpressionValue, context: FusionPrinterContext): Doc {
  const raw = (getSourceForNode(value, context) ?? String(value.value ?? "")).trim()
  const formatted = context.embedEelParser ? normalizeEelExpression(raw) : raw
  return concat(["${", formatted, "}"])
}

function normalizeEelExpression(expression: string): string {
  return expression
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function formatAssignedObjectPath(path: AssignedObjectPath | undefined): string {
  if (!path?.objectPath) {
    return ""
  }

  const formatted = formatObjectPath(path.objectPath)
  return path.isRelative ? `.${formatted}` : formatted
}

function printComments(comments: Comment[]): Doc {
  const linesDocs = comments.map((comment) => {
    const prefix = comment.prefix ?? ""
    const value = comment.value ?? ""
    return `${prefix}${value}`
  })
  return join(hardline, linesDocs)
}

function hasOriginalBlankLine(prev: unknown, next: unknown, context: FusionPrinterContext): boolean {
  if (!context.sourceText || !next) {
    return false
  }

  const nextPosition = getNodePosition(next)
  if (!nextPosition) {
    return false
  }

  const source = context.sourceText
  let cursor = nextPosition.begin - 1

  while (cursor >= 0 && /\s/.test(source[cursor])) {
    cursor -= 1
  }

  const whitespaceBeforeNext = source.slice(cursor + 1, nextPosition.begin)
  const newlineCount = (whitespaceBeforeNext.match(/\n/g) ?? []).length
  return newlineCount >= 2
}

function getSourceForNode(node: unknown, context: FusionPrinterContext): string | undefined {
  if (!context.sourceText) {
    return undefined
  }

  const position = getNodePosition(node)
  if (!position) {
    return undefined
  }

  return context.sourceText.slice(position.begin, position.end)
}

function getNodePosition(node: unknown): { begin: number; end: number } | undefined {
  if (!node || typeof node !== "object") {
    return undefined
  }

  const candidate = node as NodeWithPosition
  const begin = candidate.position?.begin
  const end = candidate.position?.end

  if (typeof begin === "number" && typeof end === "number" && end >= begin) {
    return { begin, end }
  }

  return undefined
}

function quoteString(value: string, context: FusionPrinterContext): string {
  const escaped = value.replace(/\\/g, "\\\\")

  if (context.useSingleQuote) {
    return `'${escaped.replace(/'/g, "\\'")}'`
  }

  return `"${escaped.replace(/"/g, '\\"')}"`
}

function isFusionFile(node: unknown): node is FusionFile {
  return Boolean(node && node.constructor && node.constructor.name === "FusionFile")
}

function isStatementList(node: unknown): node is StatementList {
  return Boolean(node && node.constructor && node.constructor.name === "StatementList")
}

function isObjectStatement(node: unknown): node is ObjectStatement {
  return Boolean(node && node.constructor && node.constructor.name === "ObjectStatement")
}

function isIncludeStatement(node: unknown): node is { filePattern: string } {
  return Boolean(node && node.constructor && node.constructor.name === "IncludeStatement")
}

function isCommentNode(node: unknown): node is Comment {
  return Boolean(node && node.constructor && node.constructor.name === "Comment")
}

function isValueAssignment(operation: AbstractOperation): operation is ValueAssignment {
  return operation.constructor?.name === "ValueAssignment"
}

function isValueCopy(operation: AbstractOperation): operation is ValueCopy {
  return operation.constructor?.name === "ValueCopy"
}

function isValueUnset(operation: AbstractOperation): operation is ValueUnset {
  return operation.constructor?.name === "ValueUnset"
}

function isDslExpressionValue(value: unknown): value is DslExpressionValue {
  return Boolean(value && value.constructor && value.constructor.name === "DslExpressionValue")
}

function isEelExpressionValue(value: unknown): value is EelExpressionValue {
  return Boolean(value && value.constructor && value.constructor.name === "EelExpressionValue")
}

function isAfxExpression(value: DslExpressionValue): boolean {
  return (value.identifier ?? "").toLowerCase() === "afx"
}

function hasNonEmptyBlock(statement: unknown): boolean {
  if (!isObjectStatement(statement)) {
    return false
  }

  const block = statement.block
  if (!block) {
    return false
  }

  return (block.statementList?.statements?.length ?? 0) > 0 || (block.statementList?.comments?.length ?? 0) > 0
}

function resolveLineWidth(options: { fusionLineWidth?: number; printWidth?: number }): number {
  if (typeof options.fusionLineWidth === "number") {
    return options.fusionLineWidth
  }

  if (typeof options.printWidth === "number") {
    return options.printWidth
  }

  return 80
}

function getNormalizedAfxContent(value: DslExpressionValue): string {
  const raw = (value.value ?? "").replace(/\r\n/g, "\n")
  const normalized = normalizeMultilineText(raw)
  return normalized.join("\n")
}

function maskEelExpressions(content: string): { sanitized: string; placeholders: string[] } {
  const placeholders: string[] = []
  let sanitized = ""
  let depth = 0
  let start = -1

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index] ?? ""

    if (char === "{") {
      if (depth === 0) {
        start = index
      }
      depth += 1
      continue
    }

    if (char === "}" && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        const expression = content.slice(start, index + 1)
        const placeholder = `${AFX_EEL_PLACEHOLDER_PREFIX}${placeholders.length}__`
        placeholders.push(expression)
        sanitized += placeholder
        start = -1
        continue
      }
    }

    if (depth === 0) {
      sanitized += char
    }
  }

  if (depth > 0 && start >= 0) {
    sanitized += content.slice(start)
  }

  return { sanitized, placeholders }
}

function restoreEelExpressions(doc: Doc, placeholders: string[]): Doc {
  if (placeholders.length === 0) {
    return doc
  }

  return mapDoc(doc, (part) => {
    if (typeof part !== "string") {
      return part
    }

    return part.replace(AFX_EEL_PLACEHOLDER_PATTERN, (match, quote, index) => {
      const replacement = placeholders[Number(index)] ?? match
      if (quote) {
        return replacement
      }
      return replacement
    })
  })
}

function setAfxDoc(value: DslExpressionValue, doc: Doc): void {
  ;(value as AfxDslExpressionValue).__formattedAfxDoc = doc
}

function getAfxDoc(value: DslExpressionValue): Doc | undefined {
  return (value as AfxDslExpressionValue).__formattedAfxDoc
}
