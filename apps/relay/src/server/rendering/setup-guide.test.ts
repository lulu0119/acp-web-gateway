import assert from "node:assert/strict";
import { test } from "vitest";
import { desktopDownload } from "./setup-guide.js";

const file = (name: string) => `https://github.com/lulu0119/exterior/releases/latest/download/${name}`;

test("the desktop download matches the browser's computer", () => {
  assert.equal(desktopDownload("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15")?.href, file("Exterior-macos-arm64.dmg"));
  assert.equal(desktopDownload("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36")?.href, file("Exterior-windows-x64-setup.exe"));
  assert.equal(desktopDownload("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36")?.href, file("Exterior-linux-x64.AppImage"));
  assert.equal(desktopDownload("Mozilla/5.0 (X11; Linux aarch64; rv:140.0) Gecko/20100101 Firefox/140.0")?.href, file("Exterior-linux-arm64.AppImage"));
});

test("a phone or an unknown browser gets no download", () => {
  assert.equal(desktopDownload("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36"), undefined);
  assert.equal(desktopDownload("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), undefined);
  assert.equal(desktopDownload(""), undefined);
});
