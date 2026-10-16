# Relay pages share React UI

The relay's sign-in, consent, and machine-approval pages use React server rendering, while its dashboard uses React in the browser. Page markup, UI modules, layout, and CSS live together under `apps/relay/src/web`; the stylesheet is an independent build entry, so an account page does not depend on the dashboard's JavaScript bundle.

Keeping HTML-string templates alongside React meant maintaining two button and layout implementations.

## Update: account pages hydrate

Account pages now load a small script of their own that hydrates the server-rendered markup. It adds the segmented device-code field, tabs, copy buttons, and pending states on buttons. Code blocks are highlighted with Shiki on the server, so no page ships a highlighter.

## Update: the components are a package

The desktop app's window uses the same components, so they moved to `packages/ui` (`@exterior/ui`, private): the primitives, the Exterior mark, the theme, and the palette. Pages and components that read relay data stay in `apps/relay/src/web`. The package compiles to `dist` because the relay renders account pages on Node from its build; a `development` export condition lets Vite serve the source. Example is not a consumer: it stands for someone else's web app, and `@exterior/client` stays without UI for the same reason.
