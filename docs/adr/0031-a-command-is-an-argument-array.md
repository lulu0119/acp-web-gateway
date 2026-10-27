# A command is an argument array, never a line the CLI splits

Status: accepted. Amends [0009](0009-acp-registry-launch.md).

An agent outside the ACP Registry used to be added as one string, `exterior agent-config create --command "my-agent --stdio"`. The person's shell split the line once and handed the CLI one argument. Exterior then split that argument again with its own quote rules and stored the pieces as `command` and `args`. The second split was the problem. It had no escapes, so `"say \"hi\""` ended early. It could not keep a whole argument together the way the person's shell had. A wrapper such as `sh -c '…'`, `pnpm exec`, or `docker exec` expects one argument that holds a full command line, and that took quotes inside quotes. The desktop list joined the array back with spaces, so an argument with a space in it looked like two.

Now the program and its arguments follow `--`, and each one is stored exactly as the shell delivered it:

```sh
exterior agent create --name mine --env KEY=1 -- my-agent --stdio
exterior agent create --name box -- sh -c "my-agent --name 'work box'"
```

The second stores `["sh", "-c", "my-agent --name 'work box'"]`. Exterior's own options go before `--`; after it, `--help` and `-v` belong to the agent. The CLI never splits a command line.

The desktop window has no shell in front of it, and a person pastes a line written for one, so the window splits it: spaces separate arguments, quotes keep spaces together, and a backslash is an ordinary character so a Windows path survives. The parts show as chips under the box before the agent is added, and the window sends the array. The list shows an agent's command the same way, one argument per chip.

Launching did not change. The configuration file already held `command` and `args`, the daemon already spawns that array without a shell, and the cmd.exe rules of [0016](0016-resolve-commands-and-device-working-directory.md) still apply to a `.cmd` or `.bat`.

## Considered Options

- **Keep one string and split it like a POSIX shell, with escapes and a matching formatter** (Lody's `parseCustomAcpCommandLine` and `formatCustomAcpCommandLine`). Rejected. The person's shell has already split the line, so this is a second split with different rules, and on Windows those rules are not the ones `cmd.exe` or PowerShell used. It still needs quotes inside quotes for `sh -c`.
- **Run the string through a shell.** Rejected, as in 0016. Every `|`, `>`, and `$VAR` in the line would run.
- **`--command` for the program and a repeatable `--arg` for each argument.** Rejected. An argument that starts with `-` reads as an option to Exterior, and nothing else on the command line is written that way.
- **A Program field and one row per argument in the desktop window.** Rejected. A command copied from a README is one line, and typing it back in word by word is slower and easy to get wrong, such as the whole line pasted into Program.
- **`--` before the command.** Chosen. `claude mcp add <name> -- <command> [args...]`, `kubectl exec POD -- cmd args`, and `docker run IMAGE cmd args` take a command the same way, and Zed, JetBrains' `acp.json`, acpx, and Docker Compose store it as an array.

## Consequences

- A command agent needs `--name`. There is no default name to collide with.
- On the CLI, any quoting is the shell's job, before Exterior sees the arguments. In the desktop window the chips show how a line was split before it is saved.
