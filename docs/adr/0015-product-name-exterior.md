# Product name: Exterior

Decided: Exterior. The name means an external brain: a relay that lends a web app reach to an agent on a machine the person owns. This supersedes [ADR 0004](0004-product-name-mukae.md).

The rename is total: display name `Exterior`, CLI `exterior`, npm scope `@exterior`, config path `~/.config/exterior`, environment `EXTERIOR_RELAY` and `VITE_EXTERIOR_URL`, browser storage keys `exterior.*`, client software ids `exterior-*`, the `exterior_device` table, and the reserved-name rule, which now reserves `Exterior`. Nothing has shipped to npm, so no migration: preview installs are replaced by reinstalling, a device signs in again under the new config path, and the relay leaves the old device table behind.

## Considered Options

- **Keep Mukae**: Japanese 迎え, going out to meet an arrival and bring them inside. Set aside: an external brain that lends its reach fits the relay act more directly.
- **Keep the old identifiers beside the new ones**: a compat alias for the CLI, the old config path as fallback, the old storage keys. Rejected: two names for one product is how a rename never finishes.

## Collision note

- npm bare `exterior` is a versionless placeholder, last modified 2014, with zero versions. The npm release is deferred until the product is ready; when it ships, the CLI can publish under the scope (for example `@exterior/cli`) with bin `exterior`, since a bin name does not need the bare package name.
- `@exterior/client` is not on the npm registry. The GitHub repo rename to `exterior` is a follow-up in `docs/open-work.md`; the preview URLs in this repo already point at the new repo name. Trademark registries were not searched.
