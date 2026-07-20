# Repository Guidelines

## Project Structure & Module Organization

Anemoi is an npm workspace for generating and comparing Tangerina DS visual evidence. `packages/core/src/` contains framework-agnostic matrix, Playwright capture, pixel diff, accessibility (axe/ARIA), output, and static-server primitives. `packages/web/src/` orchestrates Tangerina Web Components, React, and Angular; its isolated harnesses live under `packages/web/harness/`. `packages/service/src/` is a local HTTP service that verifies React×Angular parity on demand over Koba's live state, reusing the core/web capture pipeline. Tests are colocated in each package's `test/` directory, with workspace-level checks in `test/`. Operational documentation lives in `docs/guides/` and `docs/architecture.md`.

`anemoi-preset/` and `gol-adapter-detox/` are the existing Mobile/Detox areas and are being migrated. Keep Mobile runtime concerns separate from the Web core unless their contracts are genuinely equivalent.

## Build, Test, and Development Commands

- `npm install` installs all workspaces and React/Angular harness dependencies. Requires Node.js 24.13.1.
- `npm test` runs the root checks and every workspace test suite.
- `npm run setup:harnesses` reinstalls only the isolated Web harnesses.
- `npm run web:configure -- --alias tangerina --repo /absolute/path/to/tangerina-web-core` records a local consumer checkout.
- `npm run web -- --repo tangerina --doctor` validates pnpm, builds, artifacts, and Chromium/Firefox/WebKit without capturing.
- `npm run web -- --repo tangerina --component tgr-button --card CDCOM-123` runs a complete evidence capture.

## Coding Style & Naming Conventions

Use CommonJS modules, two-space indentation, semicolons, single quotes, and trailing commas in multiline objects and calls. Prefer small modules with explicit exports and dependency injection for process or filesystem boundaries. Use `camelCase` for functions and variables, `PascalCase` only for constructors/types, and kebab-case for component names such as `tgr-button`. No repository-wide formatter or linter is configured; match adjacent code and run `git diff --check`.

## Testing Guidelines

Tests use Node's built-in `node:test` and `node:assert/strict`. Name files `*.test.js` and describe observable behavior in test names. Add regression coverage beside the affected package and run `npm test` before submitting. For capture changes, also run the doctor and a focused real component matrix when practical.

## Commit & Pull Request Guidelines

History follows Conventional Commit-style subjects: `feat(web): ...`, `fix(web): ...`, `refactor(core): ...`, and `docs: ...`. Keep commits focused and imperative. Pull requests should explain the behavior change, identify the affected package, link the Jira/card when applicable, and report test commands. Include evidence output paths or screenshots for visual changes, but never commit generated `outputs/` or `.anemoi.local.json`.
