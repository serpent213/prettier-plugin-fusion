# Show available commands
default:
    @just --list

# Build the plugin
build:
    pnpm build:lib

# Run tests
test: build
    vitest run --reporter=verbose

# Update Vitest snapshots
update-snapshots: build
    vitest --update --reporter=verbose

# Format fixtures directory with plugin
format-fixtures: build
    prettier --plugin=dist/index.js --write ./fixtures

# Format fixtures and refresh snapshots
refresh-fixtures: format-fixtures update-snapshots

# Format REPL files (check only)
# format-repl: build
#     prettier --plugin=dist/index.js *.repl.js

# Format REPL files (write changes)
# format-repl-write: build
#     prettier --plugin=dist/index.js --write *.repl.js

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
    prettier --plugin=dist/index.js --check ./fixtures
    # prettier --plugin=dist/index.js --check *.repl.js

# Clean build artifacts
clean:
    rm -rf dist
