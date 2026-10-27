# A command is an argument array, never a line Exterior splits

Status: accepted. Amends [0009](0009-acp-registry-launch.md).

An agent outside the ACP Registry used to be added as one string, `exterior agent-config create --command "my-agent --stdio"`. The person's shell split the line once and handed the CLI one argument. Exterior then split that argument again with its own quote rules and stored the pieces as `command` and `args`. The second split was the problem. It had no escapes, so `"say \"hi\""` ended early. It could not keep a whole argument together the way the person's shell had. A wrapper such as `sh -c '…'`, `pnpm exec`, or `docker exec` expects one argument that holds a full command line, and that took quotes inside quotes. The desktop list joined the array back with spaces, so an argument with a space in it looked like two.

Now the program and its arguments follow `--`, and each one is stored exactly as the shell delivered it:

```sh
exterior agent create --name mine --env KEY=1 -- my-agent --stdio
exterior agent create --name box -- sh -c "my-agent --name 'work box'"
```

The second stores `["sh", "-c", "my-agent --name 'work box'"]`. Exterior's own options go before `--`; after it, `--help` and `-v` belong to the agent. The desktop window has a Program field and one row per argument, sends the array, and lists an agent's command one argument per chip. Exterior has no code that splits a command line.

Launching did not change. The configuration file already held `command` and `args`, the daemon already spawns that array without a shell, and the cmd.exe rules of [0016](0016-resolve-commands-and-device-working-directory.md) still apply to a `.cmd` or `.bat`.

## Considered Options

- **Keep one string and split it like a POSIX shell, with escapes and a matching formatter** (Lody's `parseCustomAcpCommandLine` and `formatCustomAcpCommandLine`). Rejected. The person's shell has already split the line, so this is a second split with different rules, and on Windows those rules are not the ones `cmd.exe` or PowerShell used. It still needs quotes inside quotes for `sh -c`.
- **Run the string through a shell.** Rejected, as in 0016. Every `|`, `>`, and `$VAR` in the line would run.
- **`--command` for the program and a repeatable `--arg` for each argument.** Rejected. An argument that starts with `-` reads as an option to Exterior, and nothing else on the command line is written that way.
- **`--` before the command.** Chosen. `claude mcp add <name> -- <command> [args...]`, `kubectl exec POD -- cmd args`, and `docker run IMAGE cmd args` take a command the same way, and Zed, JetBrains' `acp.json`, acpx, and Docker Compose store it as an array.

## Consequences

- A command agent needs `--name`. There is no default name to collide with.
- Any quoting is the shell's job, before Exterior sees the arguments.
