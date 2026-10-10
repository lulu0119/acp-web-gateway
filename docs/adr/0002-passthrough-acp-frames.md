# The gateway forwards ACP frames

Status: accepted

The gateway forwards ACP. It does not implement, filter, or rewrite methods. It checks this connection and converts frames between the two transports. Tool permission requests are forwarded to the web app unchanged.

## Considered Options

- **The gateway interprets ACP and applies its own policy.** Rejected. Capabilities are whatever the web app and the local agent negotiate. Permission prompts stay with the web app, which is the ACP client.
