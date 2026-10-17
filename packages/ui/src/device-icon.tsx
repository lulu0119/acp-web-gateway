import type { DevicePlatform } from "@exterior/contract";
import { cn } from "cn";

// Full class names, so Tailwind finds each icon in this file.
const platformIcons: Record<DevicePlatform, string> = {
  macos: "icon-[mingcute--apple-fill]",
  windows: "icon-[mingcute--windows-fill]",
  linux: "icon-[mingcute--linux-fill]",
};

const platformNames: Record<DevicePlatform, string> = { macos: "macOS", windows: "Windows", linux: "Linux" };

/** A device's operating system, or a plain computer when its daemon did not say. Sized by font size. */
export function DeviceIcon({ platform, className }: { platform?: DevicePlatform; className?: string }) {
  return <span className={cn(platform ? platformIcons[platform] : "icon-[mingcute--computer-line]", "shrink-0", className)} aria-hidden />;
}

export function platformName(platform: DevicePlatform | undefined): string | undefined {
  return platform ? platformNames[platform] : undefined;
}
