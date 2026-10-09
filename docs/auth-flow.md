# Auth flow

```mermaid
sequenceDiagram
  participant U as Browser
  participant W as Web app
  participant I as IdP
  participant G as OAuth gateway
  participant A as Local ACP agent

  U->>W: Open embedded agent
  W->>I: OAuth sign-in
  I-->>W: Access token
  W->>G: Open ACP connection (Bearer)
  G->>G: Validate token, check permissions
  alt Unauthorized
    G-->>W: 401 and sign-in hint
  else Authorized
    G->>A: Relay ACP session
    A-->>G: Streamed replies and tool calls
    G-->>W: Forward to web app
  end
```

## Rules

- Tokens are validated at the gateway. They are never forwarded into the ACP session or into model context.
- Browsers cannot set WebSocket headers. Prefer a short-lived, single-use connection ticket over putting the long-lived token in the URL.
- ACP URL-mode elicitation (for out-of-band OAuth the agent itself needs) is separate from user-to-gateway auth.
