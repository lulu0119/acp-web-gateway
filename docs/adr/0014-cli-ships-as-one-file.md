# The CLI ships as one file

`mukae` is published as a single bundled `dist/bin/mukae.js` with no dependencies. Every runtime package, including `@mukae/client` and `@mukae/contract`, is a devDependency that tsdown inlines. Before the npm release a machine installs the CLI from a pkg.pr.new address. Workspace dependencies published there become address dependencies, and pnpm 11 refuses an address dependency inside another package. A file with no dependencies installs the same way under npx and every pnpm version, and it never resolves a different version of a dependency than the one that was tested.

## Consequences

- A runtime import must be listed in `deps.onlyBundle` in `tsdown.config.ts`, or the build stops.
- `@mukae/client` is a library for web apps and keeps ordinary dependencies.
