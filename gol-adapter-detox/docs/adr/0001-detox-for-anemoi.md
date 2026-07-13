# ADR 0001: Use Detox for Anemoi evidence automation

## Status

Accepted

## Context

The CDCOM patch-package cleanup flow needs local before/after evidence for Tangerina DS fixes in `GOL_APP_Mobile`.
The evidence must compare the current patched package with the corrected DS source, capture screenshots, and record accessibility-oriented UI state.

The repository did not have an existing e2e runner. The local machine already has iOS Simulator and Android SDK support, and the app already has an automation environment through `.env.automation`.

## Decision

Use Detox as the official runner for DS evidence automation.

The first implementation runs locally, by component, against:

- `before`: `TANGERINA_MODE=package`
- `after`: `TANGERINA_MODE=source`

The automation uses a hidden React Navigation route enabled by the E2E build and a curated registry of supported scenarios.

## Consequences

- Detox adds native Android test configuration and a Jest-based e2e folder.
- The runner can take screenshots at element level and inspect the native hierarchy, which is useful for accessibility fixes that do not change pixels.
- The setup is heavier than Maestro, but it gives stronger programmatic assertions and fits React Native test code better.
- Appium remains unnecessary for the local v1 because the target is one app, one repo, and controlled simulator/emulator execution.
