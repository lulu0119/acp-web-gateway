# Relay pages share React UI

The relay's sign-in, consent, and machine-approval pages use React server rendering, while its dashboard uses React in the browser. Page markup, UI modules, layout, and CSS live together under `apps/relay/src/web`; the stylesheet is an independent build entry, so an account page does not depend on the dashboard's JavaScript bundle.

Keeping HTML-string templates alongside React meant maintaining two button and layout implementations. Making every page a browser application would make OAuth and device approval depend on client-side initialization. Server-rendered forms let those flows keep ordinary HTTP submissions and redirects while sharing the dashboard's UI definitions.

## Update: account pages hydrate

Account pages now load a small script of their own that hydrates the server-rendered markup. It adds the segmented device-code field, tabs, copy buttons, and pending states on buttons. The forms stay ordinary HTML submissions with their values in hidden inputs, so approving still works when the script does not load. Code blocks are highlighted with Shiki on the server, so no page ships a highlighter.
