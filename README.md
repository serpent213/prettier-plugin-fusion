# Prettier plugin for Neos Fusion/AFX files

This repository bootstraps a Prettier plugin that understands Neos Fusion/AFX syntax through the
[`ts-fusion-parser`](https://jsr.io/@sjs/ts-fusion-parser). The parser is production proven (it powers the
Neos Fusion VS Code extension) and can parse Fusion code, embedded AFX markup, and inline EEL expressions.

The current printer simply returns the original input, so formatting is still a work in progress. Parsing already
works, which means we have everything in place to start experimenting with doc builders and formatting rules.

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

## Development

```
pnpm install
pnpm test:lib
```

`pnpm test:lib` builds the TypeScript sources and runs Vitest over the fixtures in `./fixtures/fusion`. Each fixture
directory contains an `input.fusion` and `output.fusion` file. While the printer currently echoes the input, these
files will become the golden copies for future formatting behavior.

The most interesting code lives in `src/index.ts`, which wires up Prettier with the `ts-fusion-parser`. Formatting
logic will be implemented in `printers[fusion-ast].print` using Prettier's doc builders.
