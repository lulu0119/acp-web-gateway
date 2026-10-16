import { createHash } from "node:crypto";

/** The largest icon an app may send, decoded. */
export const maxIconBytes = 64 * 1024;

export type AppIcon = { type: string; bytes: Buffer };

/**
 * The raster formats an app may send as its icon, told apart by their first bytes. SVG is left out:
 * it can carry script and fetch other addresses.
 */
const formats: { type: string; matches: (bytes: Buffer) => boolean }[] = [
  { type: "image/png", matches: (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { type: "image/jpeg", matches: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]) },
  { type: "image/gif", matches: (bytes) => bytes.subarray(0, 4).toString("latin1") === "GIF8" },
  {
    type: "image/webp",
    matches: (bytes) => bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

export const iconRule = `The logo must be a PNG, JPEG, GIF, or WebP data URI of at most ${maxIconBytes / 1024} KB.`;

/**
 * Reads an icon an app sent as a `data:` URI. Its bytes have to be the format it declares, so the
 * relay never serves something a browser would read as another type.
 */
export function parseAppIcon(value: string): AppIcon | undefined {
  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return undefined;
  const [, type, data] = match;
  if (data.length > Math.ceil(maxIconBytes / 3) * 4) return undefined;
  const bytes = Buffer.from(data, "base64");
  if (bytes.length === 0 || bytes.length > maxIconBytes) return undefined;
  const format = formats.find((candidate) => candidate.matches(bytes));
  if (format?.type !== type) return undefined;
  return { type, bytes };
}

/** Where the relay serves a client's icon. The version changes with the icon, so it can be cached for good. */
export function appIconPath(clientId: string, icon: string | null | undefined): string | undefined {
  if (!icon || !parseAppIcon(icon)) return undefined;
  const version = createHash("sha256").update(icon).digest("hex").slice(0, 16);
  return `/api/client-icons/${encodeURIComponent(clientId)}?v=${version}`;
}

function startsWith(bytes: Buffer, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}
