# An assistant sets up a web app with one account approval

Status: accepted. Amends 0028.

A new local app has neither a published metadata document nor a client id. Its coding assistant picks a random setup id, hands the person a relay link prefilled with that id, the app's name, and its callback, and polls the relay over plain HTTP for the result. The person signs in and confirms. The relay's existing `POST /api/clients/register` remains the authenticated creation operation and accepts the signed approval form as well as account-authenticated JSON. The assistant holds no account credential, and nothing is registered until the person confirms.

A person registering an app by hand uses Register app on the dashboard, which calls the same JSON operation and shows the relay, client id, and callback to copy. Either way, a public registration with the same name and callback for the same account returns the client it already has.

The setup id only finds a result again, and the result is public: a client id, name, and callback. So the id need not be secret, and anyone who could approve the link could see the link anyway. Polling allocates no state. Only an authenticated decision leaves a result, in memory for ten minutes, with at most ten recent setups per account. The browser's approval is signed, account-bound, and expires in ten minutes. This works when the assistant runs on a different computer from the browser, without a loopback listener or a copied id. A relay restart loses outstanding results; repeating setup returns the same client. Registration and access to devices remain separate approvals.

Registration is the identity for development. A released app names itself by a metadata document on its own site, which every relay can read and no account owns. The docs, app setup, and the dashboard say so; the relay does not enforce it.

The default relay is the hosted relay. Running a relay is an operator task. A published metadata identity remains the way to name an app across relays; a relay-issued id belongs to its issuer. Neither registration nor a metadata document verifies an app's claimed name.

## Considered Options

- **A CLI command that runs the flow.** Rejected. Every step is one HTTP request an assistant can make with `curl`, and an app developer may have no Exterior device software installed.
- **The person registers on the dashboard and copies the client id back to the assistant.** Kept for registering by hand, rejected for assistants: it asks the person to carry an id between windows.
- **A credential that lets the assistant register apps itself.** Rejected. It would hold standing power over the account to make one public record.
- **Accept only loopback callbacks in a registration, so a registered client cannot serve a released app.** Rejected. Guidance is enough, and the rule would block development over an https tunnel for little gain.
- **A shared client that accepts any loopback callback.** Rejected. Every local app would sign in under one name and one grant.
