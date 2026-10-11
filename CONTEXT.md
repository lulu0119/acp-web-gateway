# Mukae

An account that lets a web app reach an ACP agent on a machine the person owns.

## Language

**Mukae**:
The product name. Japanese 迎え, going out to meet an arrival and bring them inside.
_Avoid_: ACP Gateway, acp-web-gateway

**Account**:
The person who signs in. One account can have many machines.
_Avoid_: user, workspace, team

**Machine**:
A computer running the daemon for an account.
_Avoid_: gateway, host, device

**Web app**:
A site that redirects the person to Mukae to sign in, then opens an agent.
_Avoid_: Example (Example is one web app in this repo, not the product)

**Connection**:
One live ACP session with one agent on one machine.
_Avoid_: port, nonce, gateway process
