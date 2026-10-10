import { constants } from "node:fs";
import { access, chmod, cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeDefaultConfigIfMissing } from "./config.js";
import { writeRuntimePointer } from "./runtime.js";

export function applicationBundlePath(applicationSupportDirectory: string): string {
  return join(applicationSupportDirectory, "Mukae.app");
}

export function infoPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundleIdentifier</key>
  <string>dev.mukae.launcher</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Mukae</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.0.0</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>Mukae</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>mukae</string>
      </array>
    </dict>
  </array>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`;
}

export function registrationFollowUp(): string {
  return "Next, create an agent configuration:\nmukae agent-config create --agent-type opencode";
}

export async function registerLocalGateway(input: {
  homeDirectory: string;
  applicationSupportDirectory: string;
  nodePath: string;
  cliPath: string;
  launcherBinaryPath: string;
  platform: NodeJS.Platform;
  registerApplication?: (applicationPath: string) => Promise<void>;
  signApplication?: (applicationPath: string) => Promise<void>;
  inform?: (message: string) => void;
  warn?: (message: string) => void;
  reportNextStep?: boolean;
}): Promise<void> {
  if (input.platform === "darwin") {
    try {
      await access(input.launcherBinaryPath, constants.R_OK);
    } catch {
      throw new Error(
        `The mukae launcher binary is missing at ${input.launcherBinaryPath}. Rebuild it with: clang -fobjc-arc -framework Cocoa -o launcher/mukae-launcher launcher/launcher.m`,
      );
    }
  }
  await writeDefaultConfigIfMissing(input.homeDirectory);
  await writeRuntimePointer(input.applicationSupportDirectory, {
    nodePath: input.nodePath,
    cliPath: input.cliPath,
  });
  if (input.platform !== "darwin") {
    input.warn?.("URL handler registration is implemented for macOS. The config file was written.");
    if (input.reportNextStep !== false) input.inform?.(registrationFollowUp());
    return;
  }
  const bundlePath = applicationBundlePath(input.applicationSupportDirectory);
  const executablePath = join(bundlePath, "Contents", "MacOS", "launcher");
  await mkdir(join(bundlePath, "Contents", "MacOS"), { recursive: true });
  await writeFile(join(bundlePath, "Contents", "Info.plist"), infoPlist(), "utf8");
  await cp(input.launcherBinaryPath, executablePath);
  await chmod(executablePath, 0o755);
  await input.signApplication?.(bundlePath);
  await input.registerApplication?.(bundlePath);
  if (input.reportNextStep !== false) input.inform?.(registrationFollowUp());
}
