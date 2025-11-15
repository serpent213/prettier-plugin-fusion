# Show available commands
default:
    @just --list

# Build the plugin
build:
    pnpm build:lib

# Run tests
test: build
    vitest run --reporter=verbose

# Format fixtures directory with plugin
format-fixtures: build
    prettier --plugin=dist/index.js --write ./fixtures --ignore-path=.prettierignore

# Format REPL files (check only)
# format-repl: build
#     prettier --plugin=dist/index.js *.repl.js --ignore-path=.prettierignore

# Format REPL files (write changes)
# format-repl-write: build
#     prettier --plugin=dist/index.js --write *.repl.js --ignore-path=.prettierignore

# Format all source files (TypeScript/JavaScript)
format-src:
    prettier --write "{src,__tests__}/**/*.{ts,js,json}" "*.{json,md}"

# Format all files in project
format: format-src

# Check formatting without making changes
check:
    prettier --check "{src,__tests__}/**/*.{ts,js,json}" "*.{json,md}"

# Check all formatting (including fixtures and REPL)
check-all: build
    prettier --check "{src,__tests__}/**/*.{ts,js,json}" "*.md"
    prettier --plugin=dist/index.js --check ./fixtures --ignore-path=.prettierignore
    # prettier --plugin=dist/index.js --check *.repl.js --ignore-path=.prettierignore
