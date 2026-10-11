# Coolify hosts Mukae

The relay and Example run from their Dockerfiles on Coolify. Cloudflare Workers is not a deploy target. `mukae`, `@mukae/contract`, and `@mukae/client` stay off npm until the product is ready. Until then a machine installs the CLI from this repository with pkg-pr-new, and a web app does the same for `@mukae/client`.

## Considered Options

- **Keep Example on Workers.** Rejected. Coolify already builds the images.
