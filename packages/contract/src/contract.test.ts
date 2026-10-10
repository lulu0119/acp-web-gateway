import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLaunchUrl,
  buildStatusUrl,
  buildWebSocketUrl,
  defaultGatewayPort,
  launchAgentTypes,
  parseLaunchUrl,
  parseStatusBody,
  selectAgentSlots,
} from "./index.js";

test("launch url keeps nonce, origin, and agent type", () => {
  const launchUrl = buildLaunchUrl({
    nonce: "nonce-1234",
    origin: "https://app.example",
    agentType: "opencode",
    port: 47322,
  });
  assert.deepEqual(parseLaunchUrl(launchUrl), {
    nonce: "nonce-1234",
    origin: "https://app.example",
    agentType: "opencode",
    port: 47322,
  });
  assert.equal(launchUrl.includes("name="), false);
});

test("launch url needs a port inside the gateway port range", () => {
  const base = "mukae://connect?nonce=nonce-1234&origin=https%3A%2F%2Fapp.example&agentType=opencode";
  assert.equal(parseLaunchUrl(base), undefined);
  assert.equal(parseLaunchUrl(`${base}&port=9`), undefined);
  assert.equal(parseLaunchUrl(`${base}&port=47341`), undefined);
  assert.equal(parseLaunchUrl(`${base}&port=47321`)?.port, 47321);
});

test("launch url rejects a missing handler command, a non-origin, and a bad agent type", () => {
  assert.equal(parseLaunchUrl("https://app.example/connect?nonce=nonce-1234"), undefined);
  assert.equal(
    parseLaunchUrl(
      "mukae://connect?nonce=nonce-1234&origin=https%3A%2F%2Fapp.example%2Fpath&agentType=opencode",
    ),
    undefined,
  );
  assert.equal(
    parseLaunchUrl("mukae://connect?nonce=nonce-1234&origin=https%3A%2F%2Fapp.example"),
    undefined,
  );
  assert.equal(
    parseLaunchUrl(
      "mukae://connect?nonce=nonce-1234&origin=https%3A%2F%2Fapp.example&agentType=OpenCode",
    ),
    undefined,
  );
});

test("status body accepts only known values and does not treat a name list as status", () => {
  assert.equal(parseStatusBody({ status: "waiting" }), "waiting");
  assert.equal(parseStatusBody({ status: "choosing" }), "choosing");
  assert.equal(parseStatusBody({ status: "unconfigured" }), "unconfigured");
  assert.equal(parseStatusBody({ status: "cancelled" }), "cancelled");
  assert.equal(parseStatusBody({ status: "ready", names: ["work"] }), undefined);
  assert.equal(parseStatusBody(null), undefined);
});

test("one slot is used, several slots of that type are chosen, other types are ignored", () => {
  const slots = [
    { name: "work", agentType: "opencode" },
    { name: "personal", agentType: "opencode" },
    { name: "notes", agentType: "claude" },
  ];
  assert.deepEqual(selectAgentSlots({ agentType: "opencode", slots: slots.slice(0, 1) }), {
    result: "use",
    name: "work",
  });
  assert.deepEqual(selectAgentSlots({ agentType: "opencode", slots }), {
    result: "choose",
    names: ["work", "personal"],
  });
  assert.deepEqual(selectAgentSlots({ agentType: "opencode", slots: [] }), { result: "unconfigured" });
});

test("the launch catalog is the registry ids the gateway can start", () => {
  assert.deepEqual(launchAgentTypes, ["claude-acp", "codex-acp", "gemini", "opencode"]);
});

test("local urls use the default port when asked", () => {
  assert.equal(buildStatusUrl(defaultGatewayPort), "http://127.0.0.1:47321/status");
  assert.equal(
    buildWebSocketUrl({ port: defaultGatewayPort, nonce: "nonce-1234" }),
    "ws://127.0.0.1:47321/acp?nonce=nonce-1234",
  );
});
