import type { Doc } from 'prettier'
import { doc } from 'prettier'

const {
    builders: { group, hardline, indent, join, line, softline, lineSuffixBoundary, ifBreak },
} = doc

const concat = (parts: Doc[]): Doc => parts

export { concat, group, hardline, indent, join, line, softline, lineSuffixBoundary, ifBreak }
