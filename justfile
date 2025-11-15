# Show available commands
default:
    @just --list

# Build the plugin
build:
    pnpm build:lib

# Run tests
test: build
    vitest --reporter=verbose

# Format fixtures directory with plugin
format-fixtures: build
    prettier --write ./fixtures

# Format REPL files (check only)
format-repl: build
    prettier --plugin=dist/index.js *.repl.js --ignore-path=.prettierignore

# Format REPL files (write changes)
format-repl-write: build
    prettier --plugin=dist/index.js --write *.repl.js --ignore-path=.prettierignore

# Format all source files (TypeScript/JavaScript)
format-src:
    prettier --write "src/**/*.{ts,js,json}"

# Format all files in project
format: build
    prettier --write "src/**/*.{ts,js,json}"
    prettier --write ./fixtures
    prettier --plugin=dist/index.js --write *.repl.js --ignore-path=.prettierignore

# Check formatting without making changes
check:
    prettier --check "src/**/*.{ts,js,json}"

# Check all formatting (including fixtures and REPL)
check-all: build
    prettier --check "src/**/*.{ts,js,json}"
    prettier --check ./fixtures
    prettier --plugin=dist/index.js --check *.repl.js --ignore-path=.prettierignore
