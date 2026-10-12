import type { AccountPage as AccountPageData } from "../../shared/account-web.js";
import { PageLayout } from "../components/page-layout.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";

export function accountPageTitle(page: AccountPageData): string {
  switch (page.kind) {
    case "sign-in": return "Sign in";
    case "consent": return "Approve";
    case "device":
    case "device-code": return "Approve machine";
    case "message": return page.title;
  }
}

export function AccountPage({ page }: { page: AccountPageData }) {
  return (
    <PageLayout>
      <p className="text-sm text-muted-foreground">mukae</p>
      <AccountContent page={page} />
    </PageLayout>
  );
}

function AccountContent({ page }: { page: AccountPageData }) {
  switch (page.kind) {
    case "sign-in":
      return (
        <>
          <h1 className="text-4xl font-semibold tracking-tight">Sign in to Mukae</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            A web app reaches an agent on a machine you own through this account. Sign in to approve a web app or a machine.
          </p>
          {page.configured ? (
            <form method="post" action="/sign-in/github">
              <input type="hidden" name="query" value={page.query} />
              <Button type="submit" size="lg">Sign in with GitHub</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, then start Mukae again.</p>
          )}
        </>
      );
    case "consent":
      return (
        <>
          <h1 className="text-4xl font-semibold tracking-tight">
            {page.clientName === page.clientId ? "Approve this web app" : `Approve ${page.clientName}`}
          </h1>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="font-mono text-sm">{page.clientId}</p>
            <p className="mt-1 text-sm text-muted-foreground">is asking for {page.scope || "access"}.</p>
            <p className="mt-3 text-sm">Approving lets that site see your online machines and open an agent on one of them.</p>
            {page.redirectUri ? <p className="mt-3 font-mono text-xs break-all text-muted-foreground">{page.redirectUri}</p> : null}
          </div>
          <div className="flex gap-3">
            <form method="post" action="/consent">
              <input type="hidden" name="query" value={page.query} />
              <Button name="accept" value="yes" type="submit" size="lg">Approve</Button>
            </form>
            <form method="post" action="/consent">
              <input type="hidden" name="query" value={page.query} />
              <Button name="accept" value="no" type="submit" variant="outline" size="lg">Deny</Button>
            </form>
          </div>
        </>
      );
    case "device":
      return (
        <>
          <h1 className="text-4xl font-semibold tracking-tight">Approve this machine</h1>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="font-mono text-sm">Code {page.userCode}</p>
            <p className="mt-3 text-sm">Approving lets this computer run agents for your account. Approve only a code you just requested.</p>
          </div>
          <div className="flex gap-3">
            <form method="post" action="/device">
              <input type="hidden" name="userCode" value={page.userCode} />
              <Button name="decision" value="approve" type="submit" size="lg">Approve</Button>
            </form>
            <form method="post" action="/device">
              <input type="hidden" name="userCode" value={page.userCode} />
              <Button name="decision" value="deny" type="submit" variant="outline" size="lg">Deny</Button>
            </form>
          </div>
        </>
      );
    case "device-code":
      return (
        <>
          <h1 className="text-4xl font-semibold tracking-tight">Approve a machine</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Enter the code the machine printed after <span className="font-mono text-base">mukae login</span>.
          </p>
          <form method="get" action="/device" className="flex max-w-sm flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm">
              Code<Input name="user_code" autoComplete="one-time-code" required />
            </label>
            <Button type="submit" size="lg" className="self-start">Continue</Button>
          </form>
        </>
      );
    case "message":
      return (
        <>
          <h1 className="text-4xl font-semibold tracking-tight">{page.title}</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">{page.message}</p>
          <p><a href="/" className="text-sm underline underline-offset-4">Back to Mukae</a></p>
        </>
      );
  }
}
