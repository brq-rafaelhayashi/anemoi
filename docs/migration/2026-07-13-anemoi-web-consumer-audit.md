# Anemoi Web Consumer Audit

Date: 2026-07-13

## Decision

The WC/React/Angular implementation in `anemoi-cross` is the active Web product. The Storybook/Lit-only implementation in `anemoi-web` is obsolete and can be deleted atomically when the active package assumes the `@gol-smiles/anemoi-web` identity.

## Known Consumers

- Anemoi root scripts: internal and updated in the same migration.
- `tangerina-web-core`: historical symlink integration is removed from the current working tree; the new integration remains owned by Anemoi.
- No other active consumer was found in the inspected repositories.

## Compatibility Decision

There will be no `cross` package, bin, command, output alias, or deprecation period. Browser evidence moves to `outputs/anemoi-web`.
