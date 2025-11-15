# Prettier plugin for Neos Fusion/AFX files

This repository bootstraps a Prettier plugin that understands Neos Fusion/AFX syntax through the
[`ts-fusion-parser`](https://jsr.io/@sjs/ts-fusion-parser). The parser is production proven (it powers the
Neos Fusion VS Code extension) and can parse Fusion code, embedded AFX markup, and inline EEL expressions.

The printer mirrors the parser’s object model and emits Prettier docs, which means Fusion statements, nested blocks,
embedded AFX templates, and inline EEL expressions are formatted consistently.

## Usage

```
pnpm add -D prettier-plugin-fusion

# Format Fusion files in-place
prettier --plugin=prettier-plugin-fusion "src/**/*.fusion" --write
```

The plugin registers a `fusion` parser and handles `.fusion` files automatically. It ships a couple of parser
options that mirror the `ts-fusion-parser` configuration:

| Option                                  | Default     | Description                                                                              |
| --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `fusionContextPath`                     | `undefined` | Optional context path forwarded to the parser (defaults to Prettier's filepath).         |
| `fusionIgnoreParserErrors`              | `true`      | Keeps formatting resilient while typing by collecting parser errors instead of throwing. |
| `fusionAllowIncompleteObjectStatements` | `true`      | Allows unfinished Fusion object statements.                                              |
| `fusionAllowIncompleteEelPaths`         | `true`      | Allows incomplete EEL object paths.                                                      |
| `fusionAllowUnclosedAfxTags`            | `true`      | Lets the AFX parser auto-close tags the way the VS Code tooling does.                    |
| `fusionLineWidth`                       | `undefined` | Optional override that controls when embedded DSL blocks expand to multiple lines.       |
| `fusionEmbedEelParser`                  | `false`     | Collapses whitespace inside embedded EEL expressions for a JS-like look.                 |

## Development

```
pnpm install
pnpm test:lib
```

`pnpm test:lib` builds the TypeScript sources and runs Vitest over the fixtures in `./fixtures/fusion`. Each fixture
directory contains an `input.fusion` and `output.fusion` file – the former stays intentionally unformatted while the
latter acts as the golden copy for regression testing.

Need to inspect the parser output for a particular file? Run the helper script:

```
tsx scripts/inspect-ast.ts fixtures/fusion/Card/input.fusion
```

`src/index.ts` wires up Prettier with the `ts-fusion-parser`, while `src/printer/` hosts the printer logic and doc
builder helpers.
