# aeat-downloader

default:
    @just --list

# Install the locked dependencies into node_modules/
install:
    bun install --frozen-lockfile

# Type-check and run the unit tests
test: install
    tsc --noEmit
    bun run test

# Build the unpacked extension into build/
build: install
    bun run build

# End-to-end runs in Chromium against intercepted AEAT endpoints
test-browser: build
    bun run test:browser

# Format everything (nix, ts, css, html, json, markdown, justfile)
fmt:
    nix fmt

# Every check: package build with unit tests, browser runs, format
check:
    nix flake check --log-format bar-with-logs

# Build the extension with Nix into ./result
package:
    nix build .#aeat-downloader --log-format bar-with-logs
