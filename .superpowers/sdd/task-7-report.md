# Task 7 Report — Failed evidence runs

## Scope

- Worktree: `/private/tmp/anemoi-web-promotion`
- Branch: `codex/anemoi-web-promotion`
- Starting HEAD: `9c260ad1369464a6194b4f5d9857d0ed9e454a40`
- Commit: `21aa874`

## RED

1. Added `packages/web/test/failure.test.js` and the success-status assertion in `packages/core/test/output.test.js` before production changes.
2. Ran:

   ```sh
   /Users/user/.nvm/versions/node/v24.13.1/bin/node --test packages/web/test/failure.test.js packages/core/test/output.test.js
   ```

   Result: failed as expected because `../src/failure` did not exist and `summary.md` lacked `Status: passed`.

3. Added a safety test for an external `logPath` that cannot be copied. It failed as expected with `ENOTSUP` from `copyfile`.

## GREEN

- Added `writeFailureManifest(runDir, context, error)`.
  - Writes `status: failed`, stage/card/component/error metadata, and a local log.
  - Copies an external error log into `runDir/logs` when possible; otherwise writes the error diagnostic locally.
  - The manifest always contains a relative, non-traversing `logPath`.
- Wrapped the active run after `runDir` creation in stage tracking and failure persistence.
  - Stages: `tangerina-builds`, `storybook-build`, `capture`, `parity`, `output`.
  - Existing `finally` blocks that close static servers were retained.
  - `index.html` is still written only after all run stages and success manifest/summary writes succeed.
- Added `status: 'passed'` to successful web manifests and `Status: passed` to the core summary output.

## Files

- `packages/web/src/failure.js` (new)
- `packages/web/test/failure.test.js` (new)
- `packages/web/src/run.js`
- `packages/core/src/output.js`
- `packages/core/test/output.test.js`

## Verification

| Command | Result |
| --- | --- |
| `node --check packages/web/src/failure.js` | passed |
| `node --check packages/web/src/run.js` | passed |
| `node --test packages/web/test/failure.test.js packages/core/test/output.test.js` | 9 passed, 0 failed |
| `git diff --check` | passed |
| `PATH="$HOME/.nvm/versions/node/v24.13.1/bin:$PATH" npm test` (outside sandbox) | 68 passed, 0 failed |

## Concerns

- The default Homebrew Node 25.6.1 is currently unusable because it references missing `libllhttp.9.3.dylib`; verification used the installed Node 24.13.1 from `~/.nvm`.
- The complete web suite emits two existing `MODULE_TYPELESS_PACKAGE_JSON` warnings for the TypeScript story fixture; it still exits successfully.
- An external `codex review` was not run: executing it outside the sandbox would export the repository diff to an external service and was not explicitly authorized.

## Fix Review Findings

### Important: failure writer removed stale gallery

- **RED:** added `packages/web/test/failure.test.js` with a pre-existing `index.html`; the focused test failed with `true !== false` because `writeFailureManifest` left the file in place.
- **GREEN:** `writeFailureManifest` now calls `fs.rmSync(path.join(runRoot, 'index.html'), {force: true})` before persisting the log and manifest. The operation is idempotent when the file is absent.
- **Verification:** `/Users/user/.nvm/versions/node/v24.13.1/bin/node --test packages/web/test/failure.test.js` — 4 passed, 0 failed.

### Important: CSF resolution stage

- **RED:** added `packages/web/test/run-stage.test.js`; the structural check failed because `run.js` had no `story-args` stage before `resolveStoryArgs`.
- **GREEN:** `run.js` now sets `stage = 'story-args'` immediately before `await resolveStoryArgs(repo, stories)`.
- **Verification:** `/Users/user/.nvm/versions/node/v24.13.1/bin/node --test packages/web/test/run-stage.test.js packages/web/test/failure.test.js` — 5 passed, 0 failed.
- Existing catch rethrow and server-cleanup `finally` blocks were preserved.

### Minor recorded

- Integrated `runCurrentState` failure-stage coverage remains a follow-up. No broad mocking or integration-test infrastructure was added for this review fix.

### Final verification

- `PATH="/Users/user/.nvm/versions/node/v24.13.1/bin:$PATH" npm test` outside the sandbox — 70 passed, 0 failed.
- `git diff --check` — passed.
- **Fix commit SHA:** `013302341bd791e621ecd9b3cd64192c1047c7e4`.
