// Build Example, serve it with `pnpm --filter @exterior/example exec vite preview
// --port 47101`, then run `pnpm --filter @exterior/example test:browser`.
// Relay and ACP traffic use browser fixtures; no account or running device is required.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const url = process.env.EXAMPLE_URL ?? "http://127.0.0.1:47101/";
const relayUrl = process.env.EXAMPLE_RELAY_URL ?? "http://127.0.0.1:8787";
const output = process.env.EXAMPLE_CAPTURE_DIR
  ? resolve(process.env.EXAMPLE_CAPTURE_DIR)
  : resolve("../../.captures/example");
await mkdir(output, { recursive: true });
const devices = [
  {
    id: "device-studio",
    hostname: "Studio Mac",
    platform: "macos",
    workingDirectory: "/Users/ada/projects/exterior",
    agents: [
      { name: "Claude Code", agentType: "claude-acp" },
      { name: "Codex", agentType: "codex-acp" },
    ],
  },
  {
    id: "device-laptop",
    hostname: "Travel laptop",
    platform: "windows",
    workingDirectory: "C:\\Projects",
    agents: [{ name: "OpenCode", agentType: "opencode" }],
  },
];
const browser = await chromium.launch({ headless: true });
const browserErrors = [];
const summary = [];
const probes = {};

async function fixture(viewport, signedIn = true) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const state = {
    devices,
    listStatus: 200,
    listDelay: 0,
    openStatus: 200,
    openDelay: 0,
    opens: 0,
    sessions: [],
    prompts: 0,
    newSessionError: "",
    newSessionDelay: 0,
  };
  if (signedIn)
    await context.addInitScript((relayUrl) => {
      sessionStorage.setItem(`exterior.clientId:${relayUrl}`, "fixture-client");
      sessionStorage.setItem("exterior.accessToken", "fixture-token");
      sessionStorage.setItem("exterior.expiresAt", String(Date.now() + 3_600_000));
    }, relayUrl);
  await page.route("**/api/devices", async (route) => {
    if (state.listDelay) await new Promise((resolve) => setTimeout(resolve, state.listDelay));
    await route.fulfill({ status: state.listStatus, json: { devices: state.devices } });
  });
  await page.route("**/api/connections", async (route) => {
    state.opens++;
    if (state.openDelay) await new Promise((resolve) => setTimeout(resolve, state.openDelay));
    await route.fulfill({
      status: state.openStatus,
      json:
        state.openStatus === 200
          ? { url: "ws://fixture.test/acp", agentType: "claude-acp", agentName: "Claude Code" }
          : { message: "The device went offline. Refresh and try again." },
    });
  });
  await page.routeWebSocket("ws://fixture.test/acp", (socket) => {
    socket.onMessage((raw) => {
      const request = JSON.parse(raw.toString());
      if (request.id === undefined) return;
      const reply = (result) => socket.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
      switch (request.method) {
        case "initialize":
          reply({
            protocolVersion: 1,
            agentCapabilities: { loadSession: true, sessionCapabilities: { list: {} } },
            agentInfo: { name: "Fixture agent", version: "1" },
          });
          break;
        case "session/list":
          reply({ sessions: state.sessions });
          break;
        case "session/new": {
          if (state.newSessionError) {
            socket.send(
              JSON.stringify({
                jsonrpc: "2.0",
                id: request.id,
                error: { code: -32603, message: state.newSessionError },
              }),
            );
            break;
          }
          const sessionId = `session-${state.sessions.length + 1}`;
          state.sessions.push({
            sessionId,
            cwd: request.params.cwd,
            title: state.sessions.length === 0 ? "Project overview" : "Follow-up conversation",
            updatedAt: new Date().toISOString(),
          });
          if (state.newSessionDelay) setTimeout(() => reply({ sessionId }), state.newSessionDelay);
          else reply({ sessionId });
          break;
        }
        case "session/load":
          reply({});
          break;
        case "session/prompt": {
          state.prompts++;
          socket.send(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "session/update",
              params: {
                sessionId: request.params.sessionId,
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: {
                    type: "text",
                    text: "This project connects your browser to agents on your own devices. I can help you explore the code and plan a change.",
                  },
                },
              },
            }),
          );
          reply({ stopReason: "end_turn" });
          break;
        }
        default:
          reply({});
      }
    });
  });
  return { context, page, state };
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  if (name === "chat-empty-desktop") {
    await page
      .locator('[data-slot="sidebar-group"]')
      .filter({ has: page.getByText("Working directories", { exact: true }) })
      .screenshot({ path: resolve(output, "conversation-list.png") });
  }
  if (name === "connected-desktop") {
    const footer = page.locator('[data-slot="sidebar-footer"]');
    const manage = footer.getByRole("link", { name: "Devices & agents" });
    const signOut = footer.getByRole("button", { name: "Sign out", exact: true });
    await footer.screenshot({ path: resolve(output, "sidebar-footer.png") });
    probes["sidebar-footer"] = await footer.evaluate((el) => {
      return [...el.querySelectorAll("a, button")].map((row) => {
        const icon = row.querySelector("svg");
        const textNodes = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        let text;
        while ((text = textNodes.nextNode())) {
          if (text.textContent.trim()) break;
        }
        const range = document.createRange();
        if (text) range.selectNodeContents(text);
        return {
          label: row.textContent.trim(),
          left: row.getBoundingClientRect().left,
          iconLeft: icon?.getBoundingClientRect().left,
          labelLeft: text ? range.getBoundingClientRect().left : undefined,
          height: row.getBoundingClientRect().height,
        };
      });
    });
    await manage.hover();
    await footer.screenshot({ path: resolve(output, "sidebar-footer-hover.png") });
    await manage.focus();
    await page.keyboard.press("Tab");
    await footer.screenshot({ path: resolve(output, "sidebar-footer-focus.png") });
    await signOut.hover();
    await footer.screenshot({ path: resolve(output, "sidebar-footer-sign-out-hover.png") });
    await manage.blur();
    await signOut.blur();
    await page.mouse.move(1000, 100);
  }
  probes[name] = await page.evaluate(() => {
    const sizes = {};
    let total = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
      const text = [...el.childNodes]
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent.trim())
        .join("");
      if (!text) continue;
      const style = getComputedStyle(el);
      const key = `${style.fontSize}/${style.fontWeight}`;
      sizes[key] = (sizes[key] ?? 0) + text.length;
      total += text.length;
    }
    return {
      viewport: `${innerWidth}x${innerHeight}`,
      hierarchy: Object.fromEntries(
        Object.entries(sizes).map(([key, count]) => [key, Math.round((count / total) * 100)]),
      ),
      cursorFailures: [
        ...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="menuitem"], summary'),
      ]
        .filter(
          (el) =>
            el.checkVisibility() &&
            !el.matches(':disabled, [aria-disabled="true"], [data-sidebar="rail"]') &&
            getComputedStyle(el).cursor !== "pointer",
        )
        .map((el) => el.textContent.trim().slice(0, 80)),
    };
  });
}

async function expectVisible(locator) {
  await locator.waitFor({ state: "visible", timeout: 5000 });
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Page overflows horizontally",
  );
}

try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const suffix = viewport.width === 1440 ? "desktop" : "mobile";
    const { context, page } = await fixture(viewport, false);
    await page.goto(url);
    await expectVisible(page.getByRole("button", { name: "Sign in with Exterior", exact: true }));
    await shot(page, `welcome-${suffix}`);
    await noOverflow(page);
    assert.equal(await page.locator('[data-slot="connect-form"]').count(), 1);
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Add a connection" }).count(), 0);
    const cta = await page.getByRole("button", { name: "Sign in with Exterior", exact: true }).boundingBox();
    assert.ok(cta.y + cta.height < viewport.height, "First sign-in action must be visible without scrolling");
    await context.close();
  }

  const { context, page, state } = await fixture({ width: 1440, height: 900 });
  await page.goto(url);
  const connectButton = page.getByRole("button", { name: "Connect agent", exact: true });
  await expectVisible(connectButton);
  await shot(page, "agent-picker-desktop");
  await page.getByRole("radio", { name: "Codex codex-acp" }).check();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expectVisible(page.getByRole("radio", { name: "Codex codex-acp", checked: true }));
  state.listStatus = 503;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expectVisible(page.getByText("Showing the last loaded devices."));
  assert.equal(await page.getByRole("radio").count(), 3);
  await shot(page, "refresh-error");
  state.listStatus = 200;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("alert").waitFor({ state: "hidden" });
  state.openStatus = 409;
  await connectButton.click();
  await expectVisible(page.getByText("The device went offline. Refresh and try again."));
  state.openStatus = 200;
  state.openDelay = 350;
  const before = state.opens;
  await connectButton.click();
  await expectVisible(page.getByRole("button", { name: "Connecting…", disabled: true }));
  await page.getByRole("button", { name: "Connecting…" }).evaluate((button) => button.click());
  await expectVisible(page.getByRole("button", { name: "Start a conversation", exact: true }));
  assert.equal(state.opens - before, 1, "Double activation must open one connection");
  await shot(page, "connected-desktop");
  await page.getByRole("button", { name: "Add a connection", exact: true }).click();
  await expectVisible(page.getByRole("dialog"));
  await shot(page, "add-connection-desktop");
  assert.equal(await page.locator('[data-slot="connect-form"]').count(), 1);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  state.newSessionError = "The agent could not start a session.";
  await page.getByRole("button", { name: "Start a conversation", exact: true }).click();
  await expectVisible(page.getByRole("alert"));
  state.newSessionError = "";
  await page.getByRole("button", { name: "Start a conversation", exact: true }).click();
  await expectVisible(page.getByRole("button", { name: "Explore this project", exact: true }));
  assert.equal(state.sessions[0].cwd, devices[0].workingDirectory);
  await expectVisible(page.getByRole("button", { name: "Untitled conversation", exact: true }));
  await shot(page, "chat-empty-desktop");
  await page.getByRole("button", { name: "Explore this project", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Message input" });
  assert.match(await input.inputValue(), /Explore the project/);
  assert.equal(state.prompts, 0, "A starter fills the composer without sending");
  assert.equal(await input.evaluate((el) => document.activeElement === el), true);
  await page.keyboard.press("Control+b");
  assert.equal(
    await page.locator('[data-slot="sidebar"]').first().getAttribute("data-state"),
    "expanded",
    "Typing shortcut must not toggle sidebar",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expectVisible(page.getByText("This project connects your browser", { exact: false }));
  await shot(page, "chat-populated-desktop");
  await noOverflow(page);
  await page.getByRole("button", { name: "Add a connection", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Add a connection", exact: true });
  await expectVisible(picker.getByRole("button", { name: "Connect agent", exact: true }));
  await picker.getByRole("button", { name: "Connect agent", exact: true }).click();
  await expectVisible(picker.getByRole("button", { name: "Connecting…", disabled: true }));
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "hidden" });
  await page.waitForTimeout(state.openDelay + 100);
  assert.equal(
    await page.locator('[data-slot="sidebar-menu-button"]').count(),
    1,
    "Closing the picker cancels its pending connection",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "chat-populated-mobile");
  await noOverflow(page);
  await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
  await expectVisible(page.getByRole("button", { name: "Add a connection", exact: true }));
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-sidebar="sidebar"][data-mobile="true"]');
    return panel && getComputedStyle(panel).opacity === "1" && Math.abs(panel.getBoundingClientRect().left) < 1;
  });
  await shot(page, "sidebar-mobile");
  await page.getByRole("button", { name: "Add a connection", exact: true }).click();
  await expectVisible(page.getByRole("dialog", { name: "Add a connection", exact: true }));
  await shot(page, "add-connection-mobile");
  assert.equal(await page.getByRole("dialog").count(), 1, "Mobile sidebar must close before the picker opens");
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Add a working directory", exact: true }).click();
  const directory = "/Users/ada/projects/notes";
  await page.getByPlaceholder("/Users/you/project").fill(directory);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const newConversation = page.getByRole("button", { name: "New conversation in notes", exact: true });
  state.newSessionDelay = 1000;
  await newConversation.focus();
  await page.keyboard.press("Enter");
  await expectVisible(page.getByRole("button", { name: "New conversation in notes", exact: true, disabled: true }));
  await shot(page, "conversation-starting");
  await expectVisible(page.getByRole("button", { name: "Follow-up conversation", exact: true }));
  assert.equal(state.sessions.length, 2, "The directory action creates one conversation");
  assert.equal(state.sessions[1].cwd, directory, "The new conversation uses the chosen directory");
  await shot(page, "conversation-navigation-desktop");
  summary.push(
    "single picker; refresh preserves selection/data; failed open; double activation; new session; starter/focus; chat; mobile dialog; keyboard creation in the chosen directory",
  );
  await context.close();

  for (const scenario of ["empty", "no-agents", "failed", "unauthorized", "slow"]) {
    const { context, page, state } = await fixture({ width: 390, height: 844 });
    if (scenario === "empty") state.devices = [];
    if (scenario === "no-agents") state.devices = [{ ...devices[0], agents: [] }];
    if (scenario === "failed") state.listStatus = 503;
    if (scenario === "unauthorized") state.listStatus = 401;
    if (scenario === "slow") state.listDelay = 300;
    await page.goto(url);
    if (scenario === "empty") await expectVisible(page.getByText("No devices online yet"));
    if (scenario === "no-agents")
      await expectVisible(page.getByRole("heading", { name: "Add an agent to your device" }));
    if (scenario === "failed") {
      await expectVisible(page.getByRole("alert"));
      assert.equal(await page.getByText("No devices online yet").count(), 0);
      state.listStatus = 200;
      await page.getByRole("button", { name: "Try again" }).click();
      await expectVisible(page.getByRole("radio").first());
    }
    if (scenario === "unauthorized")
      await expectVisible(page.getByRole("button", { name: "Sign in again", exact: true }));
    if (scenario === "slow") {
      await expectVisible(page.getByRole("status"));
      assert.equal(await page.getByText("No devices online yet").count(), 0);
      await expectVisible(page.getByRole("radio").first());
    }
    await shot(page, `${scenario}-mobile`);
    await noOverflow(page);
    await context.close();
  }
  assert.deepEqual(browserErrors, []);
  await writeFile(resolve(output, "probes.json"), JSON.stringify(probes, null, 2));
  console.log(`PASS: ${summary.join("; ")}; screenshots: ${output}`);
} finally {
  await browser.close();
}
