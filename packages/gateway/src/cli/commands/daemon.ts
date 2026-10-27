import { hostname } from "node:os";
import { acpRegistryCachePath, loadAcpRegistry } from "../../acp-registry.js";
import { configuredWorkingDirectory, readGatewayConfig, watchGatewayConfig, type StoredAgent } from "../../config.js";
import { daemonStateReporter, readDaemonState } from "../../daemon-state.js";
import { runDaemon } from "../../daemon.js";
import { readDeviceKey } from "../../device-keys.js";
import { DaemonLoginRequiredError, loginAgain, usableSignIn } from "../../login.js";
import { loginShellPath } from "../../shell-path.js";
import { defineCommand } from "../command.js";
import { relayOption, resolveRelay } from "../relay.js";

/** Exit codes the desktop app acts on: it starts the daemon again after any other failure. */
export const daemonExit = { signInRequired: 3, alreadyRunning: 4 } as const;

export const daemon = defineCommand({
  name: "daemon",
  description: "Keep this device connected to a relay and run its agents",
  help: [
    "Keep an outbound connection to one relay and start an agent for each connection a web app opens. Connection, refresh, and retry messages go to stderr.",
    "One daemon serves one relay. Run a second daemon to serve a second relay. A second daemon for the same relay exits with 4.",
    "A change to the agents reaches the relay while the daemon runs. Agents already running keep running, also while the daemon reconnects.",
    `When the relay rejects this device's sign-in, the daemon exits with ${daemonExit.signInRequired}. --json prints each state change as one JSON line on stdout.`,
    "--stop-when-stdin-closes is for a program that runs the daemon, such as the desktop app: closing the pipe stops it cleanly on every system, and so does that program exiting.",
  ].join("\n\n"),
  options: [
    relayOption,
    { flags: "--json", description: "Print each state change as a JSON line" },
    { flags: "--stop-when-stdin-closes", description: "Stop, and stop its agents, when stdin closes" },
  ],
  examples: ["exterior daemon", "exterior daemon --relay relay.example.com"],
  async action(context, options) {
    const { io } = context;
    const chosen = await resolveRelay(context, options, "daemon");
    if (!chosen.ok) {
      io.stderr.write(`${chosen.message}\n`);
      return 1;
    }
    const { relayUrl } = chosen;
    const inform = (line: string) => io.stderr.write(`${new Date().toISOString()} [exterior] ${line}\n`);
    const running = await readDaemonState(relayUrl, io.homeDirectory);
    if (running && running.status !== "stopped" && running.pid !== process.pid) {
      io.stderr.write(`A daemon for ${relayUrl} is already running (process ${running.pid}).\n`);
      return daemonExit.alreadyRunning;
    }
    const config = await readGatewayConfig(io.homeDirectory);
    if (config.warning) {
      io.stderr.write(`${config.warning}\n`);
      return 1;
    }
    // The daemon stays up without agents: one added later reaches the relay without a restart.
    if (config.agents.length === 0) {
      io.stderr.write("No agents yet.\nNext: exterior agent create opencode\n");
    }
    const registry = await loadAcpRegistry({ cachePath: acpRegistryCachePath(io.homeDirectory) });
    if (!registry.ok) io.stderr.write(`${registry.message}\n`);
    const names = (agents: readonly StoredAgent[]) => agents.map((agent) => agent.name);
    const state = daemonStateReporter({
      relayUrl,
      agents: names(config.agents),
      homeDirectory: io.homeDirectory,
      onState: options.json ? (current) => io.stdout.write(`${JSON.stringify(current)}\n`) : undefined,
    });
    // Command lookup and agents read process.env.PATH, which an app started at login gets minimal.
    const shellPath = await loginShellPath({ env: process.env });
    if (shellPath) process.env.PATH = shellPath;
    const lifeline = options.stopWhenStdinCloses ? stdinLifeline(context.signal) : undefined;
    const workingDirectory = configuredWorkingDirectory(config, io.homeDirectory);
    try {
      const deviceKey = await readDeviceKey(relayUrl, io.homeDirectory);
      if (!deviceKey) throw new DaemonLoginRequiredError(`This device has no key for ${relayUrl}. ${loginAgain(relayUrl)}`);
      await runDaemon({
        deviceKey,
        relayUrl,
        getAccessToken: async (forceRefresh, signal) =>
          (await usableSignIn({ relayUrl, homeDirectory: io.homeDirectory, forceRefresh, signal })).accessToken,
        inform,
        onStatus: state.status,
        hostname: hostname(),
        config: { ...config, workingDirectory },
        configUpdates: (listener) =>
          watchGatewayConfig({
            homeDirectory: io.homeDirectory,
            config: { ...config, workingDirectory },
            onChange(next) {
              const directory = configuredWorkingDirectory(next, io.homeDirectory);
              inform(`Configuration changed: ${names(next.agents).join(", ") || "no agents"}. Sessions work in ${directory}.`);
              state.agents(names(next.agents));
              listener({ ...next, workingDirectory: directory });
            },
            onWarning: inform,
          }),
        signal: lifeline?.signal ?? context.signal,
        catalog: registry.ok ? registry.agents : [],
      });
      await state.stopped("The daemon was stopped.");
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The daemon stopped.";
      inform(message);
      await state.stopped(message);
      return error instanceof DaemonLoginRequiredError ? daemonExit.signInRequired : 1;
    } finally {
      lifeline?.release();
    }
  },
});

/** A signal that also aborts when stdin closes. `release` stops reading stdin so the process can exit. */
function stdinLifeline(signal: AbortSignal | undefined) {
  const controller = new AbortController();
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const stop = () => controller.abort();
  process.stdin.on("end", stop).on("error", stop).resume();
  return {
    signal: controller.signal,
    release() {
      process.stdin.off("end", stop).off("error", stop).pause();
      process.stdin.unref?.();
    },
  };
}
