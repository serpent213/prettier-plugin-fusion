## Fusion Prettier Plugin Plan

### 1. Parser integration (in progress)

- Finalize the minimal plugin surface: `languages`, `parsers`, and `printers` wired to `ts-fusion-parser`.
- Expose parser options mirroring `ts-fusion-parser` knobs (ignore errors, incomplete flags, context path override) and document them in README.
- Ensure `locStart`/`locEnd` leverage `position.begin/end` on every AST node.
- Verify parser output by running `ObjectTreeParser.parse` against each fixture and storing the AST JSON for inspection (temporary tooling under `scripts/`).

### 2. Printer architecture

- Define a printer scaffold in `printers[FUSION_AST_FORMAT].print` that delegates to dedicated helpers per node category (Fusion statements, AFX, EEL).
- Create a `docBuilders.ts` helper exporting shortcuts for `group`, `indent`, `line`, `softline`, `hardline`, etc.
- Implement traversal utilities that convert the parser AST (class-based nodes) into lightweight serializable structures or wrap them in `AstPath`-friendly objects.
- Support comment attachment: re-use Prettier’s `printComments` with `options.printer` or implement `embed` hooks if necessary once we detect actual comment nodes.

### 3. Formatting rules

- Start with baseline Fusion formatting:
  - One statement per line (`prototype(...) { ... }`, assignments, includes) honoring indentation for blocks.
  - Normalize spacing around `=` and `<`.
  - Support meta-properties (`@if`, `@process`) and nested blocks.
- Add AFX formatting using HTML/JSX-style conventions (attributes on new lines when multiline, self-closing tags, indentation).
- Embed EEL expressions: format `${}` fragments with reasonable whitespace and hand off to Prettier’s `babel-ts` parser for JS-ish portions if feasible.
- Provide configuration switches for contentious styles (e.g., `fusionLineWidth`, `fusionEmbedEelParser`).

### 4. Fixtures and tests

- Migrate existing raw `.fusion` files into `fixtures/fusion/<name>/{input,output}.fusion` (done) and curate expected outputs once printer logic exists.
- Add regression tests for mixed Fusion/AFX/EEL constructs and tricky comment placement.
- Snapshot tests via Vitest + Prettier to ensure docs stay stable.
- Add negative tests for incomplete syntax to guard against parser crashes.

### 5. Tooling & DX

- Extend `just` targets: `just write-fixtures`, `just repl` to iterate on single files.
- Introduce a `scripts/inspect-ast.ts` tool (run via `tsx`) that prints the AST tree for debugging.
- Optimize Vitest runs (already using `vitest run` + 6s timeout); consider `--runInBand` if concurrency causes hangs.
- Update CI (if available) to run `pnpm test:lib` and lint TypeScript.

### 6. Future enhancements

- Integrate with VS Code extension by publishing the plugin and recommending Prettier config.
- Explore comment preservation thoroughly; adopt Prettier’s `attachComments` utilities if parser exposes comment nodes separately.
- Benchmark formatting large Fusion files, profiling hotspots in printer recursion.
- Publish alpha releases for community feedback and iterate on formatting conventions.
