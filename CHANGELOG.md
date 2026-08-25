# Changelog

All notable changes to `astro-consent` will be documented in this file.

The format follows a simple Keep a Changelog style, with semantic versioning.

## [2.1.1] - 2026-08-25

### Fixed

- `init`, `doctor`, `status`, and `remove` no longer hardcode `src/layouts/BaseLayout.astro`. Layout file names aren't standardized across Astro projects, so previously the CLI silently failed to wire up (or even detect) the required stylesheet import on any project using a differently named layout (e.g. `MainLayout.astro`). All `.astro` files under `src/layouts` are now treated as candidates:
  - `init` automatically inserts `import "../cookiebanner/styles.css";` into every layout file that's missing it
  - `doctor` reports per-file findings instead of a single pass/fail against one fixed filename
  - `remove` strips only the marker-tagged import it added, leaving unrelated imports untouched
- Without this fix, the consent banner would still render in the DOM but with no styling applied — no fixed positioning, no colors, no transitions — making it easy to miss entirely on real projects with non-standard layout names.

### Changed

- README Quick Start now has an explicit, required step for importing `src/cookiebanner/styles.css` into your layout, instead of only mentioning it as an optional customization step

## [2.1.0] - 2026-08-25

### Added

- Support for Astro 7 as a peer dependency, alongside the existing Astro 4, 5, and 6 support
- Unit test suite (via Vitest) covering the integration's hook wiring and the config-merge logic
- `npm test` script
- License section in the README

### Changed

- Extracted the user-config merge logic in `loadConfig.ts` into a standalone, independently testable `mergeUserConfig` function
- Tightened the user-config input types so nested `consent` and `categories` overrides are properly optional instead of requiring every field

## [2.0.0] - 2026-04-01

### Breaking

- Changed the package to a major release after the CLI and integration workflow were expanded.
- The installer now writes a marked `astro-consent` block into `astro.config.*` so `init` and `remove` can target only the plugin stanza.

### Added

- `init`, `remove`, `doctor`, and `status` CLI commands
- `--dry-run` support for install and remove
- `--json` output for `doctor` and `status`
- `banner` and `overlay` presentation modes
- Configurable display timing with `displayUntilIdle` and `displayIdleDelayMs`
- Configurable copy with `headline`, `description`, `acceptLabel`, `rejectLabel`, and `manageLabel`
- Separate `cookiePolicyUrl` and `privacyPolicyUrl` support with backwards-compatible `policyUrl` fallback
- Overlay accessibility improvements, including focus trapping, `Escape` to close, and focus return
- Generated editable stylesheet at `src/cookiebanner/styles.css`

### Changed

- Updated default copy to be more professional and concise
- Improved banner and overlay motion and spacing
- Reworked the README into a full onboarding guide
- Updated package branding to `Velohost UK Limited`
- Bumped the package major version to `2.0.0`

### Fixed

- Safer install and removal behavior for `astro.config.*`
- Removed older CSS injection path in favor of a real generated stylesheet
- Improved CLI diagnostics and install/status reporting
