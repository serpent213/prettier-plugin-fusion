# Prettier plugin for Neos CMS Fusion/AFX files

_ALPHA SOFTWARE – HANDLE WITH CARE!_
_OUTPUT FORMAT NOT STABLE YET!_

This is a Prettier plugin that understands [Neos Fusion/AFX](https://docs.neos.io/guide/rendering/fusion) syntax through
the [`ts-fusion-parser`](https://jsr.io/@sjs/ts-fusion-parser). The parser is production proven (it powers the
Neos Fusion VS Code extension) and can parse Fusion code, embedded AFX markup, and inline (unparsed) Eel expressions.

The printer mirrors the parser’s object model and emits Prettier docs, which means Fusion statements, nested blocks,
embedded AFX templates, and inline Eel expressions are formatted consistently.

## Usage

```sh
npm install --save-dev prettier-plugin-fusion
yarn add--dev prettier-plugin-fusion
pnpm install --save-dev prettier-plugin-fusion
bun add --development prettier-plugin-fusion
```

Add to your `.prettierrc.js`:

```js
module.exports = {
  plugins: [require.resolve("prettier-plugin-fusion")]
}
```

...and run:

```sh
# Format Fusion files in-place
prettier --write "src/**/*.fusion"
```

The plugin registers a `fusion` parser and handles `.fusion` files automatically. It ships a couple of parser
options that mirror the `ts-fusion-parser` configuration:

| Option                                  | Default     | Description                                                                                              |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `fusionContextPath`                     | `undefined` | Optional context path forwarded to the parser (defaults to Prettier's filepath).                         |
| `fusionIgnoreParserErrors`              | `false`     | Set to `true` to keep formatting resilient while typing by collecting parser errors instead of throwing. |
| `fusionAllowIncompleteObjectStatements` | `false`     | Set to `true` when you want to allow unfinished Fusion object statements while editing.                  |
| `fusionAllowIncompleteEelPaths`         | `true`      | Allows incomplete Eel object paths.                                                                      |
| `fusionAllowUnclosedAfxTags`            | `true`      | Lets the AFX parser auto-close tags the way the VS Code tooling does.                                    |

## Funktionsweise

- **Fusion**: The plugin registers a `fusion` parser backed by `ts-fusion-parser`, which returns a strongly typed AST of statements, object paths, blocks, and comments. The printer in `src/printer/index.ts` walks that AST and rebuilds it following an algorithm.

- **AFX/HTML**: When a DSL expression is marked as `afx`, the `embed` hook normalises leading/trailing whitespace, masks embedded Eel placeholders, and lets Prettier’s `html` parser format the inner markup. The result is restored and wrapped back into the ``afx`...` `` fence.

- **Eel**: `${...}` is treated as a string value (that’s what `ts-fusion-parser` gives us). We keep the original text as the source of truth, normalise whitespace, split logical operators onto continuation lines when they spill past the print width, and break long function-call arguments heuristically. There is no dedicated Eel AST here, so formatting falls back to these best-effort string transforms rather than semantic reprinting.

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
ts-node scripts/inspect-ast.ts fixtures/fusion/Card/input.fusion
```

`src/index.ts` wires up Prettier with the `ts-fusion-parser`, while `src/printer/` hosts the printer logic and doc
builder helpers.
