import { expect, test } from "vitest";
import type { RelayView } from "./api";
import { relayHost, relayStatus } from "./relay-status";

const base: RelayView = { relayUrl: "https://relay.example", phase: "running", state: null, error: null, retryAt: null };
const state = (status: "connecting" | "connected" | "waiting", agents: string[] = []) =>
  ({ relayUrl: base.relayUrl, status, since: 0, agents });

test("a connected daemon names the agents it offers", () => {
  expect(relayStatus({ ...base, state: state("connected", ["work", "home"]) }, 0)).toEqual({
    tone: "ok", label: "Connected", detail: "Offering work, home.",
  });
  expect(relayStatus({ ...base, state: state("connected") }, 0).detail).toBe("Offering no agents yet.");
});

test("a rejected sign-in asks for a new one and shows the daemon's reason", () => {
  const status = relayStatus({ ...base, phase: "signInRequired", error: "Relay rejected this device (HTTP 403)." }, 0);
  expect(status).toMatchObject({ tone: "attention", label: "Sign in again", action: "sign-in" });
  expect(status.detail).toBe("Relay rejected this device (HTTP 403).");
});

test("a restart counts down, and connecting is not reported as connected", () => {
  expect(relayStatus({ ...base, phase: "restarting", retryAt: 9_100 }, 1_000).label).toBe("Restarting in 9s");
  expect(relayStatus({ ...base, state: state("connecting") }, 0)).toMatchObject({ tone: "busy", label: "Connecting" });
  expect(relayStatus({ ...base, state: state("waiting") }, 0)).toMatchObject({ tone: "busy", label: "Reconnecting" });
  expect(relayStatus({ ...base, phase: "stopped" }, 0)).toMatchObject({ label: "Stopped", action: "start" });
});

test("a relay is shown by its host", () => {
  expect(relayHost("https://relay.apps.example.win")).toBe("relay.apps.example.win");
  expect(relayHost("http://127.0.0.1:8787")).toBe("127.0.0.1:8787");
});
