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
import {
  concat,
  group,
  hardline,
  ifBreak,
  indent,
  join,
  line,
  mapDoc,
  softline,
  stripTrailingHardline
} from "./docBuilders"

type FusionPrinterContext = {
  sourceText: string
  lineWidth: number
  embedEelParser: boolean
  useSingleQuote: boolean
  tabWidth: number
}

type NodeWithPosition = { position?: { begin?: number; end?: number } }
type AfxDslExpressionValue = DslExpressionValue & { __formattedAfxDoc?: Doc }

const AFX_EEL_PLACEHOLDER_PREFIX = "__FUSION_AFX_EEL_"
const AFX_EEL_PLACEHOLDER_PATTERN = /(['"])?__FUSION_AFX_EEL_(\d+)__\1?/g

export const embedFusionAst: NonNullable<Printer["embed"]> = (path: AstPath, options: Options) => {
  const node = path.getValue()

  if (!isDslExpressionValue(node) || !isAfxExpression(node)) {
    return null
  }

  const lineWidth = resolveLineWidth(options)

  return async (textToDoc) => {
    const rawContent = (node.value ?? "").replace(/\r\n/g, "\n")
    const normalizedContent = dedentAfxContent(node)
    const content = softWrapAfxContent(normalizedContent, lineWidth)

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

    const normalizedLines = content.split("\n")
    const exceedsLineWidth = normalizedLines.some((line) => line.length > lineWidth)
    const hasNormalizedBreaks = normalizedLines.length > 1
    const isSplitClosingTag =
      normalizedLines.length === 2 &&
      normalizedLines[1].trim() === "/>" &&
      (normalizedLines[0]?.trim().length ?? 0) + 3 <= lineWidth
    const hasOuterPadding = rawContent.startsWith("\n") || rawContent.endsWith("\n")
    const shouldKeepBlockPadding =
      hasOuterPadding &&
      !hasNormalizedBreaks &&
      !isSplitClosingTag &&
      (normalizedLines[0]?.length ?? 0) >= lineWidth * 0.75
    const shouldExpand = (hasNormalizedBreaks && !isSplitClosingTag) || exceedsLineWidth || shouldKeepBlockPadding

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
    useSingleQuote: options.singleQuote === true,
    tabWidth: resolveTabWidth(options)
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
  let seenNonComment = false

  for (let i = 0; i < items.length; i += 1) {
    const current = items[i].node
    const next = items[i + 1]?.node
    const doc = isCommentNode(current) ? printComments([current]) : printStatement(current, context)

    parts.push(doc)

    if (next) {
      parts.push(hardline)
      const hasPrevContent = seenNonComment || !isCommentNode(current)
      const originalBlankLine = hasOriginalBlankLine(current, next, context)
      const sharePath = areSameStatementPaths(current, next)
      const leadingCommentForNextBlock =
        isCommentNode(current) && hasNonEmptyBlock(next) && !originalBlankLine && !sharePath
      const needsSpacing =
        originalBlankLine ||
        (hasNonEmptyBlock(current) && !sharePath) ||
        (hasPrevContent && hasNonEmptyBlock(next) && !sharePath && !leadingCommentForNextBlock)
      if (needsSpacing) {
        parts.push(hardline)
      }
    }

    if (!isCommentNode(current)) {
      seenNonComment = true
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
  const raw = (getSourceForNode(value, context) ?? String(value.value ?? "")).replace(/\r\n?/g, "\n").trim()
  const normalized = normalizeEelWhitespace(raw)
  const baseColumn = getEelExpressionBaseColumn(value, context)
  const logicalParts = splitLogicalExpression(normalized)
  const hasLogicalOperators = logicalParts.some((part) => part === "||" || part === "&&")
  const shouldMultiline = normalized.includes("\n") || normalized.length + (baseColumn ?? 0) > context.lineWidth
  const firstFunctionCall = parseFunctionCall(logicalParts[0] ?? normalized)
  const shouldBlockWrap = Boolean(
    hasLogicalOperators && shouldMultiline && firstFunctionCall && firstFunctionCall.args.length > 2
  )

  if (hasLogicalOperators) {
    const lineIndentation = getLineIndentation(value, context) ?? 0
    const continuationPadding = Math.max(0, (baseColumn ?? lineIndentation) - lineIndentation + context.tabWidth * 2)
    const continuationIndent = continuationPadding > 0 ? ifBreak(" ".repeat(continuationPadding), "") : ""
    const blockOperatorIndent = " ".repeat(context.tabWidth)
    const parts: Doc[] = []
    for (let index = 0; index < logicalParts.length; index += 1) {
      const part = logicalParts[index] ?? ""

      if (index === 0) {
        parts.push(formatEelSegment(part, context, baseColumn))
        continue
      }

      const isOperator = part === "||" || part === "&&"
      if (isOperator) {
        const next = logicalParts[index + 1] ?? ""
        parts.push(line, shouldBlockWrap ? blockOperatorIndent : continuationIndent, part)
        if (next) {
          parts.push(" ", formatEelSegment(next, context, baseColumn))
          index += 1
        }
      } else {
        parts.push(
          line,
          shouldBlockWrap ? blockOperatorIndent : continuationIndent,
          formatEelSegment(part, context, baseColumn)
        )
      }
    }

    const logicalDoc = group(concat(parts))
    if (shouldBlockWrap) {
      const blockIndent = " ".repeat(context.tabWidth)
      return concat(["${", hardline, blockIndent, indent(logicalDoc), hardline, "}"])
    }
    return concat(["${", logicalDoc, "}"])
  }

  if (shouldMultiline) {
    const continuationPadding = Math.max(0, context.tabWidth)
    const continuationIndent = continuationPadding > 0 ? " ".repeat(continuationPadding) : ""
    const multilineDoc = continuationIndent
      ? concat([continuationIndent, formatEelSegment(normalized, context, baseColumn)])
      : formatEelSegment(normalized, context, baseColumn)
    return concat(["${", hardline, multilineDoc, hardline, "}"])
  }

  return concat(["${", formatEelSegment(normalized, context, baseColumn), "}"])
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

function areSameStatementPaths(first: unknown, second: unknown): boolean {
  if (!isObjectStatement(first) || !isObjectStatement(second)) {
    return false
  }

  return formatObjectPath(first.path) === formatObjectPath(second.path)
}

function resolveLineWidth(options: { printWidth?: number }): number {
  if (typeof options.printWidth === "number") {
    return options.printWidth
  }

  return 80
}

function resolveTabWidth(options: { tabWidth?: number }): number {
  if (typeof options.tabWidth === "number" && options.tabWidth > 0) {
    return options.tabWidth
  }

  return 2
}

function normalizeEelWhitespace(expression: string): string {
  let normalized = ""
  let inString: "'" | '"' | null = null
  let escaped = false
  let pendingWhitespace = false

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index] ?? ""

    if (escaped) {
      normalized += char
      escaped = false
      continue
    }

    if (char === "\\" && inString) {
      normalized += char
      escaped = true
      continue
    }

    if (!inString && (char === "'" || char === '"')) {
      if (pendingWhitespace) {
        normalized += " "
        pendingWhitespace = false
      }
      normalized += char
      inString = char
      continue
    }

    if (inString) {
      if (char === inString) {
        inString = null
      }
      normalized += char
      continue
    }

    if (/\s/.test(char)) {
      pendingWhitespace = true
      continue
    }

    if (pendingWhitespace) {
      normalized += " "
      pendingWhitespace = false
    }

    normalized += char
  }

  const output = pendingWhitespace ? normalized.trimEnd() : normalized
  return output.trim()
}

function splitLogicalExpression(expression: string): string[] {
  const parts: string[] = []
  let buffer = ""
  let inString: "'" | '"' | null = null
  let escaped = false
  let depth = 0

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index] ?? ""
    const nextTwo = expression.slice(index, index + 2)

    if (escaped) {
      buffer += char
      escaped = false
      continue
    }

    if (char === "\\" && inString) {
      buffer += char
      escaped = true
      continue
    }

    if (char === inString) {
      buffer += char
      inString = null
      continue
    }

    if (!inString && (char === "'" || char === '"')) {
      buffer += char
      inString = char
      continue
    }

    const isOpening = !inString && (char === "(" || char === "[" || char === "{")
    const isClosing = !inString && (char === ")" || char === "]" || char === "}")
    if (isOpening) {
      depth += 1
      buffer += char
      continue
    }

    if (isClosing) {
      depth = Math.max(0, depth - 1)
      buffer += char
      continue
    }

    const isLogicalOperator = !inString && depth === 0 && (nextTwo === "&&" || nextTwo === "||")
    if (isLogicalOperator) {
      if (buffer.trim()) {
        parts.push(buffer.trim())
      }
      parts.push(nextTwo)
      buffer = ""
      index += 1
      continue
    }

    buffer += char
  }

  if (buffer.trim()) {
    parts.push(buffer.trim())
  }

  return parts
}

function formatEelSegment(segment: string, context: FusionPrinterContext, baseColumn?: number): Doc {
  const functionCallDoc = formatFunctionCall(segment, context, baseColumn)
  if (functionCallDoc) {
    return functionCallDoc
  }

  return segment
}

type ParsedFunctionCall = {
  callee: string
  args: string[]
  suffix: string
}

function formatFunctionCall(segment: string, context: FusionPrinterContext, baseColumn?: number): Doc | null {
  const parsed = parseFunctionCall(segment)
  if (!parsed || parsed.args.length <= 1) {
    return null
  }

  const availableWidth = Math.max(0, context.lineWidth - (baseColumn ?? 0))
  const shouldSplitArguments =
    parsed.args.length > 2 ||
    segment.length + (baseColumn ?? 0) > context.lineWidth ||
    parsed.args.some((arg) => arg.length >= availableWidth)

  if (!shouldSplitArguments) {
    return null
  }

  const argsDoc = join(concat([",", line]), parsed.args)
  const callDoc = group(concat([parsed.callee, "(", indent(concat([softline, argsDoc])), softline, ")"]))

  if (parsed.suffix) {
    return concat([callDoc, " ", parsed.suffix])
  }

  return callDoc
}

function parseFunctionCall(segment: string): ParsedFunctionCall | null {
  let inString: "'" | '"' | null = null
  let escaped = false
  let depth = 0
  let openIndex = -1
  let closeIndex = -1

  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index] ?? ""

    if (escaped) {
      escaped = false
      continue
    }

    if (char === "\\" && inString) {
      escaped = true
      continue
    }

    if (char === inString) {
      inString = null
      continue
    }

    if (char === "'" || char === '"') {
      inString = char
      continue
    }

    if (char === "(") {
      if (depth === 0) {
        openIndex = index
      }
      depth += 1
      continue
    }

    if (char === ")" && depth > 0) {
      depth -= 1
      if (depth === 0) {
        closeIndex = index
        break
      }
    }
  }

  if (openIndex <= 0 || closeIndex < 0) {
    return null
  }

  const callee = segment.slice(0, openIndex).trim()
  if (!callee || /\s/.test(segment.slice(callee.length, openIndex))) {
    return null
  }

  if (!/^[\w$.]+$/.test(callee)) {
    return null
  }

  const argsText = segment.slice(openIndex + 1, closeIndex)
  const args = splitFunctionArguments(argsText)
  if (args.length === 0) {
    return null
  }

  const suffix = segment.slice(closeIndex + 1).trim()
  return { callee, args, suffix }
}

function splitFunctionArguments(value: string): string[] {
  const args: string[] = []
  let buffer = ""
  let depth = 0
  let inString: "'" | '"' | null = null
  let escaped = false

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? ""

    if (escaped) {
      buffer += char
      escaped = false
      continue
    }

    if (char === "\\" && inString) {
      buffer += char
      escaped = true
      continue
    }

    if (char === inString) {
      buffer += char
      inString = null
      continue
    }

    if (char === "'" || char === '"') {
      buffer += char
      inString = char
      continue
    }

    if (char === "(" || char === "[" || char === "{") {
      depth += 1
      buffer += char
      continue
    }

    if ((char === ")" || char === "]" || char === "}") && depth > 0) {
      depth -= 1
      buffer += char
      continue
    }

    if (char === "," && depth === 0) {
      const trimmed = buffer.trim()
      if (trimmed) {
        args.push(trimmed)
      }
      buffer = ""
      continue
    }

    buffer += char
  }

  const trimmed = buffer.trim()
  if (trimmed) {
    args.push(trimmed)
  }

  return args
}

function getEelExpressionBaseColumn(value: EelExpressionValue, context: FusionPrinterContext): number | undefined {
  const position = getNodePosition(value)
  if (!context.sourceText || !position) {
    return undefined
  }

  const startOfExpression = position.begin
  const source = context.sourceText
  const openBraceIndex = source.lastIndexOf("${", startOfExpression)
  if (openBraceIndex < 0) {
    return undefined
  }

  const lineStart = source.lastIndexOf("\n", openBraceIndex)
  return openBraceIndex - (lineStart + 1)
}

function getLineIndentation(value: EelExpressionValue, context: FusionPrinterContext): number | undefined {
  const position = getNodePosition(value)
  if (!context.sourceText || !position) {
    return undefined
  }

  const source = context.sourceText
  const openBraceIndex = source.lastIndexOf("${", position.begin)
  if (openBraceIndex < 0) {
    return undefined
  }

  const lineStart = source.lastIndexOf("\n", openBraceIndex)
  const lineText = source.slice(lineStart + 1, openBraceIndex + 1)
  const indentMatch = lineText.match(/^[\t ]*/)
  return indentMatch ? indentMatch[0].length : undefined
}

function dedentAfxContent(value: DslExpressionValue): string {
  const raw = (value.value ?? "").replace(/\r\n/g, "\n")
  const normalized = normalizeMultilineText(raw)
  return normalized.join("\n")
}

function softWrapAfxContent(content: string, lineWidth: number): string {
  if (!content) {
    return content
  }

  return content
    .split("\n")
    .map((line) => (line.length > lineWidth ? line.replace(/>\s*</g, ">\n<") : line))
    .join("\n")
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
        placeholders.push(normalizeMaskedEelExpression(expression))
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

function normalizeMaskedEelExpression(expression: string): string {
  const trimmed = expression.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inner = trimmed.slice(1, -1)
    return `{${normalizeEelWhitespace(inner)}}`
  }

  return normalizeEelWhitespace(trimmed)
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
