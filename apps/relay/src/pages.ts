export function signInPage(input: { query: string; configured: boolean }): string {
  const continuation = hidden("query", input.query);
  const github = input.configured
    ? `<form method="post" action="/sign-in/github">${continuation}<button type="submit">Sign in with GitHub</button></form>`
    : `<p>Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, then start Mukae again.</p>`;
  return layout("Sign in", `<h1>Mukae</h1><p>Sign in to approve a web app or a machine.</p>${github}`);
}

export function consentPage(input: { query: string; clientId: string; scope: string }): string {
  const fields = `${hidden("query", input.query)}`;
  return layout(
    "Approve",
    `<h1>Approve this web app</h1>
     <p>Client ${escapeHtml(input.clientId)} is asking for ${escapeHtml(input.scope || "access")}.</p>
     <p>Approving lets that site see your online machines and open an agent on one of them.</p>
     <form method="post" action="/consent">${fields}<button name="accept" value="yes" type="submit">Approve</button></form>
     <form method="post" action="/consent">${fields}<button name="accept" value="no" type="submit">Deny</button></form>`,
  );
}

export function devicePage(input: { userCode: string }): string {
  const code = hidden("userCode", input.userCode);
  return layout(
    "Approve machine",
    `<h1>Approve this machine</h1>
     <p>Code ${escapeHtml(input.userCode)}</p>
     <p>Approving lets this computer run agents for your account. Approve only a code you just requested.</p>
     <form method="post" action="/device">${code}<button name="decision" value="approve" type="submit">Approve</button></form>
     <form method="post" action="/device">${code}<button name="decision" value="deny" type="submit">Deny</button></form>`,
  );
}

export function deviceCodePage(): string {
  return layout(
    "Approve machine",
    `<h1>Approve a machine</h1>
     <form method="get" action="/device">
       <label>Code <input name="user_code" autocomplete="one-time-code" required></label>
       <button type="submit">Continue</button>
     </form>`,
  );
}

export function messagePage(title: string, message: string): string {
  return layout(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`);
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font: 16px/1.5 system-ui, sans-serif; margin: 4rem auto; max-width: 32rem; padding: 0 1rem; }
    button { font: inherit; margin-right: 0.5rem; }
    input { font: inherit; }
  </style>
</head>
<body>${body}</body>
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
