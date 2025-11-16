# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-11-16

### Added

- HTML formatting support for AFX-embedded HTML via Prettier's HTML parser
- Eel formatting support for inline Eel expressions

### Fixed

- Respect Prettier's `singleQuote` option when formatting string literals (previously always used single quotes)
- Improved block formatting

## [0.1.1] - 2025-11-16

### Fixed

- Unified Prettier configuration (removed conflicting `.prettierrc`, consolidated to `prettier.config.js`)
- Fixed "clear" operator output (was incorrectly rendering as `~` instead of `>`)
- Preserve source order of comments relative to statements (comments no longer shuffle to the top)
- Empty blocks now render with hardline: `{\n}` instead of `{}`

## [0.1.0] - 2025-11-16

### Added

- Initial release of prettier-plugin-fusion
- Core Fusion language formatting support
- Snapshot-based testing infrastructure
