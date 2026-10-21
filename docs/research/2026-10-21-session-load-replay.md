# Why opening a conversation waits for the agent

Status: partially applied. [patches/@hafbit__react-acp@0.1.9.patch](../../patches/@hafbit__react-acp@0.1.9.patch) selects the conversation before `session/load` returns, and calls `session/resume` when this page already holds the transcript and the agent advertises resume. An agent without resume still replays on the first open.

Researched 2026-10-21. Measurements are from the local relay on 127.0.0.1:8799 with `EXTERIOR_TRACE=1`.

## What the protocol requires

ACP v1 `session/load` is a full replay. The agent must stream the conversation as `session/update` notifications, and only then respond to the request ([Session Setup, Loading a Session](https://agentclientprotocol.com/protocol/v1/session-setup)). `session/resume` is the other door: the agent must not replay, and returns once the session is ready ([same page, Resuming Sessions](https://agentclientprotocol.com/protocol/v1/session-setup)).

v2 removes `session/load`. `session/resume` without `replayFrom` is the old resume. `replayFrom: { "type": "start" }` is the old load, and the agent still replays every retained update before responding ([Migrating from v1](https://agentclientprotocol.com/protocol/v2/migration)).

## What this client does

`@hafbit/react-acp@0.1.9` `selectSession` awaits `attachSession` and only then dispatches `session.selected`, which is the event that sets `activeSessionId`. `performAttach` dispatches `session.loading` on the target session, then awaits `loadSession`. It uses `session/resume` only when the caller asks, or when the agent advertises resume and does not advertise load. An agent that advertises both always takes the replay path (`chunk-ONH56VKO.js`, `selectSession` and `performAttach`).

Updates that arrive during the load are stored on the session being loaded. The visible thread stays on the previous conversation until the result, and that thread's loading flag is the active session's, so the history skeleton does not show.

## What the runs showed

The relay and the daemon add about a millisecond. The wait is inside the agent, between receiving `session/load` and emitting the replay.

- OpenCode, one local session: first update at 280ms, result at 284ms, 49 updates.
- OpenCode, the hosted click: first update at 606ms, result at 11.2s, 42 updates.
- Cursor, three short turns created here, then a new process loaded that session: first update and the result both at 3.2s, 9 updates (`user_message_chunk`, `agent_thought_chunk`, `agent_message_chunk`, three each). Cursor held the replay and released it at once. OpenCode streamed.

## Who else hit this

The replay-before-response order is what spec-compliant clients rely on. A client using `@agentclientprotocol/sdk` counted notifications only after `loadSession` resolved and saw a full replay from Codex, Claude Code, OpenCode, and Pi, and zero from Hermes, because Hermes fired the replay after the response. Hermes then awaited the replay before responding. The same report quotes Zed registering the thread before awaiting the RPC, so updates that arrive during `session/load` already have a thread ([hermes-agent#26957](https://github.com/NousResearch/hermes-agent/pull/26957)).

Cursor's CLI had the opposite gap: `session/load` returned with no `user_message_chunk` or `agent_message_chunk`. That was reported against 2026.04.17 and fixed in 2026.06.04 ([forum thread](https://forum.cursor.com/t/acp-no-conversation-history-is-restored-when-loading-an-existing-session/158388)).

## What changed

The patch selects the conversation when the click happens, so `session/update` paints as it arrives. The protocol already sends those notifications before the result. Zed attaches the thread first for that reason. A later open, when this page already holds the transcript, calls `session/resume` if the agent advertises it, so the replay is not paid again.

Waiting for OpenCode or Cursor to replay faster does not hold: the same OpenCode binary did 284ms and 11.2s, and Cursor spent 3.2s on three sentences. v2 does not remove the replay; it only makes the no-replay reconnect the default shape of `session/resume`.
