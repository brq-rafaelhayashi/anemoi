# Anemoi Architecture Compaction Design

**Date:** 2026-07-13
**Status:** Design approved; written specification pending user review

## Summary

Anemoi is the Tangerina DS visual-evidence workbench. Its primary workflow reads components and
CSF stories from `tangerina-web-core`, renders the same state as a raw Web Component, React wrapper,
and Angular wrapper, then produces screenshots and pixel-parity diffs. A secondary mobile workflow
uses React Native and Detox for evidence in host applications.

The repository grew by extracting a browser core from an older Storybook/Lit tool, adding a
cross-framework tool, and retaining a large mobile CLI. The resulting package boundaries are useful,
but the active web product has the wrong name, the obsolete web implementation remains present, the
mobile CLI has 2,013 lines, and documentation is distributed across package-specific locations.

The target is a conventional modular workspace that a development team can understand without AI
assistance. The migration will be incremental, and every phase must leave the active workflows
operational.

## Product Boundaries

- The current `anemoi-cross` implementation becomes the only **Anemoi Web** implementation and the
  primary product workflow.
- The old `anemoi-web` Storybook/Lit implementation is removed after auditing its consumers.
- The `cross` package, command, bin, output name, and operational documentation are removed. There is
  no compatibility alias or deprecation period.
- The mobile Detox workflow remains a separate engine because it has a different runtime and host
  contract. It is modularized but not forced to depend on the Playwright core.
- The product remains Tangerina-first. It will retain useful host boundaries, but will not introduce
  a plugin platform for hypothetical design systems or frameworks.

## Target Structure

```text
anemoi/
├── packages/
│   ├── core/                    # Browser capture, diff, matrix, output, static server
│   ├── web/                     # Active WC/React/Angular evidence workflow
│   │   └── harness/
│   │       ├── react/
│   │       └── angular/
│   └── mobile/                  # React Native/Detox engine; package name stays anemoi-preset
├── integrations/
│   └── gol-app-mobile/          # GOL_APP_Mobile registry and host-specific adapter
├── docs/
│   ├── architecture.md
│   ├── adr/
│   └── guides/
├── .anemoi.local.example.json
├── README.md
└── package.json
```

The npm package names are:

- `@gol-smiles/anemoi-core` in `packages/core`.
- `@gol-smiles/anemoi-web` in `packages/web`, now backed by the former cross implementation.
- `@gol-smiles/anemoi-preset` in `packages/mobile`, preserved for mobile compatibility.

The former `@gol-smiles/anemoi-cross` package is deleted. The former implementation of
`@gol-smiles/anemoi-web` is also deleted rather than archived in the active workspace.

## Anemoi Web

### Internal Modules

`packages/core` contains only primitives used by the active browser workflow:

- `capture.js`: Playwright lifecycle, readiness checks, and element screenshots.
- `diff.js`: pixel comparison and diff-image generation.
- `matrix.js`: framework, story, theme, viewport, and brand combinations.
- `output.js`: manifest, summary, and parity gallery generation.
- `server.js`: static hosting for built render hosts.

The legacy generic doctor, Git before/after utilities, and unused output layouts are removed when the
consumer audit confirms that only the deleted web workflow used them. The core stays flat because the
remaining module set is small and cohesive.

`packages/web` owns the active use case:

- `cli.js`: argument parsing and command dispatch only.
- `config.js`: repository-alias configuration and `--repo` resolution.
- `tangerina.js`: the known `tangerina-web-core` layout, packages, build commands, brands, and themes.
- `stories.js`: CSF discovery and `meta.args + story.args` resolution.
- `parity.js`: React-versus-WC and Angular-versus-WC grouping and comparison.
- `doctor.js`: checks specific to the Tangerina repository and browser runtimes.
- `hosts/wc.js`, `hosts/react.js`, and `hosts/angular.js`: render-host implementations.
- `harness/react` and `harness/angular`: isolated applications with their existing independent
  dependency trees.

### Local Configuration

Developers run Anemoi from this repository. A one-time configuration records each local checkout
under a short alias:

```bash
npm run web:configure -- --alias tangerina --repo /absolute/path/to/tangerina-web-core
```

The command writes the Git-ignored `.anemoi.local.json`:

```json
{
  "defaultRepository": "tangerina",
  "repositories": {
    "tangerina": {
      "path": "/absolute/path/to/tangerina-web-core"
    }
  }
}
```

The first configured alias becomes `defaultRepository`. Configuring another alias preserves the
current default unless `--default` is supplied. Alias names must contain only lowercase letters,
digits, and single hyphens, and must start with a letter.

When `--repo` is present, an exact alias match resolves to its configured path. An absolute or
relative filesystem path remains accepted as a direct override. An unknown non-path value fails and
lists the configured aliases. When `--repo` is omitted, Anemoi resolves `defaultRepository`; missing
configuration fails with an actionable error pointing to `npm run web:configure`. The committed
`.anemoi.local.example.json` documents the schema without storing a developer-specific path.

### Public Commands

```bash
npm run web -- --doctor
npm run web -- --component tgr-button --card CDCOM-123
npm run web -- --repo tangerina --component tgr-button
npm run web -- --repo /alternate/tangerina-web-core --component tgr-button
```

Existing active flags remain supported: `--component`, `--card`, `--frameworks`, `--stories`,
`--themes`, `--viewports`, `--brands`, `--doctor`, `--list-stories`, `--repo`, and `--skip-build`.
There is no `npm run cross` script and no `anemoi-cross` bin.

### Tangerina Integration Contract

The integration is built into Anemoi Web rather than maintained as a brittle symlink inside
`tangerina-web-core`. The consumer repository supplies:

- CSF stories under `packages/components`, which are the only variation registry.
- A static Storybook baseline for raw Web Components.
- `packages/components/dist/components` for custom-element definitions.
- `@gol-smiles/tangerina-react` and `@gol-smiles/tangerina-angular` generated wrappers.
- Brand and theme behavior defined by the Tangerina Storybook preview.

Before capture, Anemoi runs these consumer scripts in order:

1. `pnpm build:tokens`
2. `pnpm build:assets`
3. `pnpm build:fonts`
4. `pnpm build:components`
5. `pnpm build:react`
6. `pnpm build:angular`

It then builds the static Storybook and both render harnesses. `--skip-build` skips the six consumer
builds but does not skip doctor validation of their artifacts. Anemoi does not run Git stash, reset,
checkout, or cleanup operations in the consumer. The documented build scripts may update generated
artifacts as they do during normal Tangerina development.

### Evidence Data Flow

1. Resolve the repository alias or direct path and validate the `tangerina-web-core` checkout.
2. Run the targeted builds unless `--skip-build` is present.
3. Build Storybook and the React and Angular harnesses.
4. Read component stories and merge serializable `meta.args` and `story.args`.
5. Build the WC, React, and Angular capture matrix.
6. Render each cell with the same arguments and capture it through Playwright.
7. Compare React and Angular against the WC baseline.
8. Write the bundle to
   `<tangerina-web-core>/outputs/anemoi-web/<card>/<component>/<timestamp>/`.

The bundle contains `manifest.json`, `summary.md`, `index.html`, framework screenshots, and parity
diffs. The success manifest adds `status: "passed"`; this is backward-compatible for structured
consumers that ignore unknown fields.

## Mobile Engine

The mobile engine preserves package name, commands, flags, environment variables, output paths,
registry schema, Detox behavior, and GOL_APP_Mobile legacy contracts. Its internal layout becomes:

```text
packages/mobile/src/
├── cli.js                      # Thin dispatcher
├── config.js                   # Load, normalize, and initialize host config
├── registry.js                 # Flows, references, selection, and add-flow
├── doctor.js                   # Mobile preflight checks
├── runners/
│   ├── evidence.js             # Before/after and reference orchestration
│   └── interactive.js          # Interactive device flow
├── runtime/
│   ├── metro.js
│   ├── detox.js
│   ├── device.js
│   └── source-toggle.js
└── reporting/
    ├── manifest.js
    ├── summary.js
    └── html.js
```

Modules are split by existing responsibilities, not by speculative abstraction. Shared code between
browser and mobile is introduced only when both runtimes have the same contract and behavior; small
similar helpers alone do not justify coupling the packages.

## Failure Handling

- Missing local configuration fails before builds and names the configure command.
- An unknown repository alias fails before builds and lists every configured alias.
- An invalid target must identify the missing Tangerina package, script, or artifact.
- Consumer-build and harness-build failures stop capture and retain their logs.
- A non-serializable story error identifies the story and source file.
- Child servers and processes are stopped in `finally` blocks on success, failure, or interruption.
- A failed run retains logs and a `manifest.json` with `status: "failed"` and the failing stage. It
  does not produce `index.html`, so partial evidence cannot be mistaken for a valid bundle.
- Web evidence generation never performs destructive or state-changing Git operations.

## Documentation

- The root `README.md` is the short operational entry point and describes Web first, Mobile second.
- `docs/architecture.md` is the canonical system map and dependency-direction reference.
- `docs/guides/web.md` documents configuration, commands, matrix axes, outputs, and interpretation.
- `docs/guides/mobile.md` consolidates the current mobile operational guide.
- ADRs move to `docs/adr`, grouped by web or mobile in their titles. Integration-only GOL details
  remain in `integrations/gol-app-mobile/README.md` and its context document.
- Documentation does not require knowledge of the historical `cross` name to operate the tool.

## Incremental Migration

1. Audit consumers of the current `anemoi-web` and `anemoi-cross` packages, bins, scripts, and
   output paths. Record any unexpected active consumer before deletion.
2. Atomically delete the obsolete web implementation and promote the current cross implementation
   to Web, so the workspace never contains two packages named `@gol-smiles/anemoi-web`. In the same
   step, remove all operational `cross` names, add local Tangerina configuration, make the targeted
   builds automatic, and change output to `outputs/anemoi-web`.
3. Prune core modules and behavior that became dead after the legacy deletion.
4. Move active packages under `packages/`, the GOL adapter under `integrations/`, and update workspace
   scripts and internal references.
5. Decompose the mobile CLI without changing its external behavior.
6. Consolidate documentation and run the complete acceptance suite.

Every step is independently committed and must leave the applicable tests green. No compatibility
shim for `cross` is introduced during any phase.

## Verification and Acceptance

- Unit tests cover core capture-path construction, diff, matrix, output, and server behavior.
- Web tests cover alias validation, alias/default/direct-path precedence, Tangerina contract
  validation, CSF extraction, hosts, parity, failure manifests, and process cleanup.
- A fixture repository reproduces the required Tangerina layout for contract tests without relying
  on a developer's real checkout.
- React and Angular harness builds run as integration tests.
- Mobile gains unit tests for config, registry, CLI dispatch, runtime command construction, failure
  cleanup, and reporting.
- Root `npm test` runs every workspace package without `--if-present` and passes outside sandboxed
  environments that prohibit local HTTP listeners.
- A real `tgr-button` smoke run captures WC, React, and Angular for light/dark and sm/lg; every parity
  mismatch is zero.
- A deliberate divergence in one wrapper fails only that wrapper's parity comparison, proving the
  signal is correctly isolated.
- A final search finds no operational reference to `anemoi-cross`, the removed cross package, or the
  obsolete web implementation. Historical ADR text may retain old terms only when explicitly marked
  as history.

## Out of Scope

- A generic plugin API for other design systems.
- New rendering frameworks or a Liferay/vanilla host.
- Interactive event and behavior capture beyond the current static evidence contract.
- Changing GOL_APP_Mobile's public legacy names as part of this architecture migration.
