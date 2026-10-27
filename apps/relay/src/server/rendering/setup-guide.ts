import type { DesktopDownload, SetupGuideData } from "../../shared/account-web.js";
import { highlight } from "./highlight.js";

const previewPackage = "https://pkg.pr.new/lulu0119/exterior@main";
const runner = `npx --package=${previewPackage} -- exterior`;
// The release workflow names its files without a version, so these always serve the newest release.
const latestRelease = "https://github.com/lulu0119/exterior/releases/latest";

export function setupGuide(relayUrl: string, userAgent = ""): SetupGuideData {
  return {
    relayUrl,
    download: desktopDownload(userAgent),
    releaseUrl: latestRelease,
    prompt: highlight(agentPrompt(relayUrl), "markdown"),
    commands: highlight(shellSteps(relayUrl), "shellscript"),
    afterLogin: highlight(afterLogin(relayUrl), "shellscript"),
  };
}

/**
 * The installer for the browser's own computer, the usual case for someone setting it up. macOS
 * ships for Apple silicon only, and Windows on Arm reports x64 and runs the x64 installer.
 */
export function desktopDownload(userAgent: string): DesktopDownload | undefined {
  const file = (name: string) => `${latestRelease}/download/${name}`;
  if (/Android|iPhone/.test(userAgent)) return undefined;
  if (/Macintosh/.test(userAgent)) return { platform: "macOS", href: file("Exterior-macos-arm64.dmg") };
  if (/Windows/.test(userAgent)) return { platform: "Windows", href: file("Exterior-windows-x64-setup.exe") };
  if (/Linux/.test(userAgent)) {
    const arm = /aarch64|arm64/i.test(userAgent);
    return { platform: "Linux", href: file(`Exterior-linux-${arm ? "arm64" : "x64"}.AppImage`) };
  }
  return undefined;
}

function agentPrompt(relayUrl: string): string {
  return `Connect this computer to Exterior so my web page can use the ACP agents installed here.

Exterior relay: ${relayUrl}

1. Sign this device in. It prints a link with the code filled in. Ask me to open that link and approve it, then wait for sign-in to finish.

   \`\`\`sh
   ${runner} login --relay ${relayUrl}
   \`\`\`

2. Configure each agent already installed on this computer. Use one id from \`registry search\` per installed agent (for example \`opencode\`).

   \`\`\`sh
   ${runner} registry search
   ${runner} agent create <type>
   ${runner} agent list
   \`\`\`

3. Keep this device online. Keep it running in the foreground so the page sees this device.

   \`\`\`sh
   ${runner} daemon --relay ${relayUrl}
   \`\`\`

Limits:

- Do not use sudo or install anything globally.
- Do not write API keys or tokens into the config. If an agent needs environment variables, ask me first.
- If node (22 or newer) or npx is missing, stop and tell me.

When the daemon is online, tell me which agents were configured and remind me to return to the page.`;
}

function shellSteps(relayUrl: string): string {
  return `# 1. Sign this device in, then approve the code it prints
${runner} login --relay ${relayUrl}

# 2. Configure an agent that is installed here
${runner} registry search
${runner} agent create opencode

# 3. Keep the device online
${runner} daemon --relay ${relayUrl}`;
}

function afterLogin(relayUrl: string): string {
  return `# Configure an agent that is installed here
${runner} registry search
${runner} agent create opencode

# Keep the device online
${runner} daemon --relay ${relayUrl}`;
}
