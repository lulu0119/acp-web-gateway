# A command is an argument array, never a line the CLI splits

Status: accepted. Amends [0009](0009-acp-registry-launch.md).

An agent outside the ACP Registry used to be added as one string, `exterior agent-config create --command "my-agent --stdio"`. The person's shell split the line once, and Exterior split the argument it received a second time with its own quote rules. That second split had no escapes, so a wrapper such as `sh -c '…'`, which expects one argument holding a full command line, needed quotes inside quotes and often came out wrong.

Now the program and its arguments follow `--`, and each one is stored exactly as the shell delivered it, the way `claude mcp add <name> -- <command> [args...]` and `kubectl exec POD -- cmd args` take a command:

```sh
exterior agent add --name claude --env ANTHROPIC_API_KEY=… -- pnpm dlx @agentclientprotocol/claude-agent-acp
exterior agent add --name claude-logged -- sh -c "pnpm dlx @agentclientprotocol/claude-agent-acp 2>> 'claude acp.log'"
```

Exterior's own options go before `--`; after it, `--help` and `-v` belong to the agent. The desktop window has no shell in front of it, so it splits a pasted line itself: spaces separate arguments, quotes keep spaces together, and a backslash is an ordinary character so a Windows path survives. An unclosed quote blocks saving. Launching did not change: the configuration already held `command` and `args`, and the daemon spawns that array without a shell.

## Considered Options

- **Keep one string and split it like a POSIX shell, with escapes** (Lody's `parseCustomAcpCommandLine`). Rejected. It is still a second split after the person's shell, and on Windows its rules are not the ones `cmd.exe` or PowerShell used.
- **Run the string through a shell.** Rejected, as in [0016](0016-resolve-commands-and-device-working-directory.md). Every `|`, `>`, and `$VAR` in the line would run.
- **`--command` for the program and a repeatable `--arg` for each argument.** Rejected. An argument that starts with `-` reads as an option to Exterior.

## Consequences

- A command agent needs `--name`. There is no default name to collide with.
