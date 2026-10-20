# Apps share React UI

Status: accepted

The relay, desktop app, and Example import general React controls and the Exterior mark from `packages/ui` (`@exterior/ui`, private). The controls follow shadcn's composable source pattern over Base UI. One implementation owns each control's interaction, accessibility, and variants; each app owns its pages, layout, and theme tokens.

Example keeps its assistant-ui chat components and ACP integration beside the app. Sharing basic controls keeps the product surfaces consistent without coupling the web app SDK to a UI framework: `@exterior/client` has no UI dependency.

The relay's account pages render on the server and hydrate with their own script; the dashboard renders in the browser. Server-highlighted code uses Shiki without shipping a highlighter to the page. The UI package compiles to `dist` for server rendering and production builds, while a `development` export condition lets Vite serve its source. Apps scan the shared source for Tailwind utilities and resolve one React instance.
