import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeDefaultConfigIfMissing } from "./config.js";

export function applicationBundlePath(applicationSupportDirectory: string): string {
  return join(applicationSupportDirectory, "Mukae.app");
}

export function launcherSource(input: { nodePath: string; cliPath: string }): string {
  const nodePath = objectiveCString(input.nodePath);
  const cliPath = objectiveCString(input.cliPath);
  return `#import <Cocoa/Cocoa.h>
#include <string.h>
#include <unistd.h>

static NSString *nodePath = @"${nodePath}";
static NSString *cliPath = @"${cliPath}";

static void execOpen(NSString *url) {
  execl(nodePath.UTF8String, nodePath.UTF8String, cliPath.UTF8String, "open", url.UTF8String, (char *)NULL);
  perror("mukae");
  exit(1);
}

@interface LaunchHandler : NSObject
- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)reply;
@end

@implementation LaunchHandler
- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)reply {
  NSString *url = [[event paramDescriptorForKeyword:keyDirectObject] stringValue];
  if (url.length == 0) exit(1);
  execOpen(url);
}
@end

int main(int argc, char **argv) {
  @autoreleasepool {
    for (int index = 1; index < argc; index += 1) {
      if (strncmp(argv[index], "mukae:", 6) == 0) {
        execOpen([NSString stringWithUTF8String:argv[index]]);
      }
    }
  }
  LaunchHandler *handler = [LaunchHandler new];
  NSApplication *app = [NSApplication sharedApplication];
  [app setActivationPolicy:NSApplicationActivationPolicyProhibited];
  [[NSAppleEventManager sharedAppleEventManager] setEventHandler:handler
                                                      andSelector:@selector(handleGetURLEvent:withReplyEvent:)
                                                    forEventClass:kInternetEventClass
                                                       andEventID:kAEGetURL];
  [app run];
  return 0;
}
`;
}

function objectiveCString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\r", "\\r").replaceAll("\n", "\\n");
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
  platform: NodeJS.Platform;
  registerApplication?: (applicationPath: string) => Promise<void>;
  compileLauncher?: (input: { sourcePath: string; executablePath: string }) => Promise<void>;
  inform?: (message: string) => void;
  warn?: (message: string) => void;
}): Promise<void> {
  await writeDefaultConfigIfMissing(input.homeDirectory);
  if (input.platform !== "darwin") {
    input.warn?.("URL handler registration is implemented for macOS. The config file was written.");
    input.inform?.(registrationFollowUp());
    return;
  }
  if (!input.compileLauncher) throw new Error("Registering the macOS URL handler needs a launcher compiler.");
  const bundlePath = applicationBundlePath(input.applicationSupportDirectory);
  const macosDirectory = join(bundlePath, "Contents", "MacOS");
  await mkdir(macosDirectory, { recursive: true });
  await writeFile(join(bundlePath, "Contents", "Info.plist"), infoPlist(), "utf8");
  const executablePath = join(macosDirectory, "launcher");
  const sourceDirectory = await mkdtemp(join(tmpdir(), "mukae-launcher-"));
  const sourcePath = join(sourceDirectory, "launcher.m");
  try {
    await writeFile(sourcePath, launcherSource({ nodePath: input.nodePath, cliPath: input.cliPath }), "utf8");
    await input.compileLauncher({ sourcePath, executablePath });
    await chmod(executablePath, 0o755);
  } finally {
    await rm(sourceDirectory, { recursive: true, force: true });
  }
  await input.registerApplication?.(bundlePath);
  input.inform?.(registrationFollowUp());
}
