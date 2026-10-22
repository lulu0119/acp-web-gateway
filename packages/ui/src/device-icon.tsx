import type { DevicePlatform } from "@exterioragentprotocol/sdk";
import { cn } from "cn";

// Full class names, so Tailwind finds each icon in this file.
const platformIcons: Record<DevicePlatform, string> = {
  macos: "icon-[mingcute--apple-fill]",
  windows: "icon-[mingcute--windows-fill]",
  linux: "icon-[mingcute--linux-fill]",
};

const platformNames: Record<DevicePlatform, string> = { macos: "macOS", windows: "Windows", linux: "Linux" };

/** A device's operating system. Sized by font size. */
export function DeviceIcon({ platform, className }: { platform: DevicePlatform; className?: string }) {
  return <span className={cn(platformIcons[platform], "shrink-0", className)} aria-hidden />;
}

export function platformName(platform: DevicePlatform): string {
  return platformNames[platform];
}
