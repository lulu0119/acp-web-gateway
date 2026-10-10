# npx installs a stable copy

`npx mukae` is the installer. It copies the gateway into ~/Library/Application Support/mukae, writes a pointer file, and registers a macOS handler that contains no paths. Each browser connection still starts its own gateway process from that copy. A checkout can point the same pointer at its own `dist/cli.js`.

## Considered Options

- **Run npx on every click.** The handler would never store a path, but each connection would wait on npm and could change version between clicks.
- **Point the handler at the npx cache.** That directory is replaced or deleted, and the next click exits immediately.
- **A global install.** Puts `mukae` on PATH, which this installer avoids.
