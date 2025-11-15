# Repository Guidelines

## Project Structure & Module Organization

`src/index.ts` registers the Prettier plugin entry point, while `src/printer/` contains printer utilities split by concern (doc builders, helpers, node visitors). Built artifacts land in `dist/` via Rollup; keep human edits in `src/` only. Golden-format fixtures for Fusion inputs live under `fixtures/fusion/<CaseName>/(input|output).fusion`. Docs stay in `docs/`, helper scripts in `scripts/`, and ad-hoc TypeScript assertions in `__tests__/`.

## Build, Test, and Development Commands

- `pnpm build:lib` – transpiles TypeScript through Rollup+@rollup/plugin-typescript into `dist/`.
- `pnpm test:lib` – runs the build then executes Vitest across fixture-driven suites.
- `pnpm write` – rebuilds and rewrites `fixtures/` using the local plugin to refresh goldens.
- `pnpm repl` / `pnpm repl:write` – formats `*.repl.js` playground files with the built plugin.
- `tsx scripts/inspect-ast.ts fixtures/fusion/Card/input.fusion` – dumps the parser AST to inspect weird nodes before changing the printer logic.

## Coding Style & Naming Conventions

This codebase is TypeScript-first with strict ES modules. Follow the repo's Prettier config (`tabWidth: 4`, `semi: false`, `singleQuote: true`, `trailingComma: 'all'`, `printWidth: 120`). Keep printer helpers pure, prefer descriptive verb-noun names (e.g., `printAfxNode`), and mirror parser node naming. Files exporting a single helper stay singular (`printer/afx.ts`), while grouped utilities use `*.utils.ts` suffixes. Commit generated `dist/` outputs only when preparing releases.

## Testing Guidelines

Snapshot fidelity matters: add or update fixture directories whenever you touch formatting behavior. Each fixture must keep `input.fusion` intentionally ragged and `output.fusion` as the authoritative rendering. Use `pnpm test:lib` before pushing; failures typically point at Vitest's fixture assertions. When debugging, re-run `pnpm write` to regenerate outputs, inspect the diff, and ensure no unrelated fixture noise ships.

## Commit & Pull Request Guidelines

Recent history uses short, typed prefixes (`Refactor:`, `Chore:`, `wip:`). Match that style, keep the subject under ~60 characters, and expand intent plus testing info in the body when necessary. PRs should describe the formatting scenario, reference affected fixture folders, and include any AST screenshots or logs relevant to reviewers. Link tracking issues when available and attach before/after snippets for tricky printer changes.

## Tooling & Debug Tips

Leverage `vitest --watch` locally when iterating quickly, but commit only deterministic outputs. When printer changes depend on parser upgrades, bump `ts-fusion-parser` in `package.json` and note the upstream change in the PR. For debugging embedded EEL or AFX nodes, capture AST excerpts in `docs/` to give future contributors context.
