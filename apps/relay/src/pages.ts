import { webStylesheet } from "./web.js";

const primaryButton =
  "inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/80";
const outlineButton =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium transition hover:bg-muted";
const textInput =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring";

export function signInPage(input: { query: string; configured: boolean }): string {
  const continuation = hidden("query", input.query);
  const github = input.configured
    ? `<form method="post" action="/sign-in/github">${continuation}<button type="submit" class="${primaryButton}">Sign in with GitHub</button></form>`
    : `<p class="text-sm text-muted-foreground">Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, then start Mukae again.</p>`;
  return layout(
    "Sign in",
    `<p class="text-sm text-muted-foreground">mukae</p>
     <h1 class="text-4xl font-semibold tracking-tight">Sign in to Mukae</h1>
     <p class="text-lg leading-relaxed text-muted-foreground">A web app reaches an agent on a machine you own through this account. Sign in to approve a web app or a machine.</p>
     ${github}`,
  );
}

export function consentPage(input: { query: string; clientId: string; clientName: string; redirectUri: string; scope: string }): string {
  const fields = `${hidden("query", input.query)}`;
  const callback = input.redirectUri
    ? `<p class="mt-3 font-mono text-xs break-all text-muted-foreground">${escapeHtml(input.redirectUri)}</p>`
    : "";
  const heading = input.clientName === input.clientId ? "Approve this web app" : `Approve ${escapeHtml(input.clientName)}`;
  return layout(
    "Approve",
    `<p class="text-sm text-muted-foreground">mukae</p>
     <h1 class="text-4xl font-semibold tracking-tight">${heading}</h1>
     <div class="rounded-xl border border-border bg-card p-5">
       <p class="font-mono text-sm">${escapeHtml(input.clientId)}</p>
       <p class="mt-1 text-sm text-muted-foreground">is asking for ${escapeHtml(input.scope || "access")}.</p>
       <p class="mt-3 text-sm">Approving lets that site see your online machines and open an agent on one of them.</p>${callback}
     </div>
     <div class="flex gap-3">
       <form method="post" action="/consent">${fields}<button name="accept" value="yes" type="submit" class="${primaryButton}">Approve</button></form>
       <form method="post" action="/consent">${fields}<button name="accept" value="no" type="submit" class="${outlineButton}">Deny</button></form>
     </div>`,
  );
}

export function devicePage(input: { userCode: string }): string {
  const code = hidden("userCode", input.userCode);
  return layout(
    "Approve machine",
    `<p class="text-sm text-muted-foreground">mukae</p>
     <h1 class="text-4xl font-semibold tracking-tight">Approve this machine</h1>
     <div class="rounded-xl border border-border bg-card p-5">
       <p class="font-mono text-sm">Code ${escapeHtml(input.userCode)}</p>
       <p class="mt-3 text-sm">Approving lets this computer run agents for your account. Approve only a code you just requested.</p>
     </div>
     <div class="flex gap-3">
       <form method="post" action="/device">${code}<button name="decision" value="approve" type="submit" class="${primaryButton}">Approve</button></form>
       <form method="post" action="/device">${code}<button name="decision" value="deny" type="submit" class="${outlineButton}">Deny</button></form>
     </div>`,
  );
}

export function deviceCodePage(): string {
  return layout(
    "Approve machine",
    `<p class="text-sm text-muted-foreground">mukae</p>
     <h1 class="text-4xl font-semibold tracking-tight">Approve a machine</h1>
     <p class="text-lg leading-relaxed text-muted-foreground">Enter the code the machine printed after <span class="font-mono text-base">mukae login</span>.</p>
     <form method="get" action="/device" class="flex max-w-sm flex-col gap-3">
       <label class="flex flex-col gap-2 text-sm">Code<input name="user_code" autocomplete="one-time-code" required class="${textInput}"></label>
       <button type="submit" class="${primaryButton} self-start">Continue</button>
     </form>`,
  );
}

export function messagePage(title: string, message: string): string {
  return layout(
    title,
    `<p class="text-sm text-muted-foreground">mukae</p>
     <h1 class="text-4xl font-semibold tracking-tight">${escapeHtml(title)}</h1>
     <p class="text-lg leading-relaxed text-muted-foreground">${escapeHtml(message)}</p>
     <p><a href="/" class="text-sm underline underline-offset-4">Back to Mukae</a></p>`,
  );
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Mukae</title>${webStylesheet()}
</head>
<body class="bg-background font-sans antialiased">
  <main class="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-6 pt-20 pb-24">${body}</main>
</body>
</html>`;
}

function hidden(name: string, value: string): string {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}
