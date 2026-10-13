#!/usr/bin/env node
// Uploads local files to GitHub user-attachments storage and prints one
// https://github.com/user-attachments/assets/... URL per file.
// The endpoint is undocumented; see SKILL.md.

import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

const endpoint = "https://uploads.github.com/user-attachments/assets";

// GitHub validates both the extension and the MIME type against an allowlist.
// Images and video are accepted; text, Markdown, JSON, and archives answer 422.
const contentTypes = new Map(
  Object.entries({
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".mov": "video/quicktime",
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webm": "video/webm",
    ".webp": "image/webp",
  }),
);

function usage(stream) {
  stream.write("Usage: upload-github-attachment.mjs [--repo OWNER/REPO] [--content-type MIME] FILE...\n");
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function gh(args, options = {}) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

const files = [];
let repository = "";
let contentType = "";

const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];
  if (argument === "--help" || argument === "-h") {
    usage(process.stdout);
    process.exit(0);
  }
  if (argument === "--repo" || argument === "--content-type") {
    const value = argv[index + 1];
    if (!value) fail(`${argument} needs a value.`);
    if (argument === "--repo") repository = value;
    else contentType = value;
    index += 1;
    continue;
  }
  if (argument.startsWith("--")) {
    usage(process.stderr);
    fail(`Unknown option: ${argument}`);
  }
  files.push(argument);
}

if (files.length === 0) {
  usage(process.stderr);
  fail("Provide at least one existing local file.");
}

try {
  gh(["--version"]);
} catch {
  fail("GitHub CLI (gh) is required. Install it, then run gh auth login or set GH_TOKEN/GITHUB_TOKEN.");
}

for (const file of files) {
  const absolute = resolve(file);
  const info = await stat(absolute).catch(() => undefined);
  if (!info?.isFile()) fail(`Not an existing local file: ${file}`);
}

if (!repository) {
  repository = (() => {
    try {
      return gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
    } catch {
      return "";
    }
  })();
}
if (!repository) {
  fail("Could not resolve a GitHub repository. Run inside a checkout or pass --repo OWNER/REPO.");
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || (() => {
  try {
    return gh(["auth", "token"]);
  } catch {
    return "";
  }
})();
if (!token) {
  fail("GitHub authentication is required. Run gh auth login or set GH_TOKEN/GITHUB_TOKEN.");
}

let repositoryId;
try {
  repositoryId = gh(["api", `repos/${repository}`, "--jq", ".id"], { env: { ...process.env, GH_TOKEN: token } });
} catch {
  fail(`Could not read repository ${repository}. Check the name and that the account can see it.`);
}

for (const file of files) {
  const absolute = resolve(file);
  const type = contentType || contentTypes.get(extname(absolute).toLowerCase());
  if (!type) {
    fail(`Unsupported file type: ${file}. GitHub accepts images (png, jpg, gif, webp, avif, svg) and video (mp4, mov, webm); pass --content-type only for a format you know it accepts.`);
  }
  const name = basename(absolute);
  const query = new URLSearchParams({ name, content_type: type, repository_id: repositoryId });

  const response = await fetch(`${endpoint}?${query}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": type,
      "Content-Length": String((await stat(absolute)).size),
    },
    body: createReadStream(absolute),
    duplex: "half",
  });

  if (!response.ok) {
    fail(`Upload failed for ${name}: HTTP ${response.status}. ${(await response.text()).slice(0, 400)}`);
  }

  const payload = await response.json().catch(() => undefined);
  const url = typeof payload?.url === "string" ? payload.url : "";
  if (!url.startsWith("https://github.com/user-attachments/")) {
    fail(`GitHub did not return a user-attachment URL for ${name}.`);
  }
  process.stdout.write(`${url}\n`);
}
