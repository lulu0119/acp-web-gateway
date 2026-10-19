import type { AccountPage } from "../../shared/account-web.js";

// A browser navigation asks for HTML. A program calling this URL still gets the JSON error.
export async function readBrowserAuthorizeError(request: Request, response: Response): Promise<AccountPage | undefined> {
  if (request.method !== "GET" || response.status < 400) return undefined;
  if (!new URL(request.url).pathname.endsWith("/oauth2/authorize")) return undefined;
  if (!request.headers.get("accept")?.includes("text/html")) return undefined;
  if (!(response.headers.get("content-type") ?? "").includes("json")) return undefined;
  try {
    return authorizeErrorPage(request.url, await response.clone().json());
  } catch {
    return undefined;
  }
}

function authorizeErrorPage(requestUrl: string, body: unknown): AccountPage | undefined {
  const failure = explainAuthorizeFailure(body);
  if (!failure) return undefined;
  const retry = failure.retry ? retryAction(requestUrl) : undefined;
  return {
    kind: "message",
    tone: "error",
    title: failure.title,
    message: failure.message,
    ...(retry ? { action: retry } : {}),
  };
}

function explainAuthorizeFailure(body: unknown): { title: string; message: string; retry: boolean } | undefined {
  if (typeof body !== "object" || body === null || !("error" in body) || typeof body.error !== "string") return undefined;
  const description = "error_description" in body && typeof body.error_description === "string" ? body.error_description : "";
  if (description.startsWith("Metadata document fetch timed out")) {
    return {
      title: "Exterior could not reach this app",
      message: "The app's description did not download in time. Try again.",
      retry: true,
    };
  }
  if (description.startsWith("Failed to fetch metadata document")) {
    return {
      title: "Exterior could not reach this app",
      message: "The app's description could not be downloaded. Try again.",
      retry: true,
    };
  }
  return {
    title: "This sign-in could not start",
    message: "Go back to the app and start again.",
    retry: false,
  };
}

function retryAction(requestUrl: string): { label: string; href: string } | undefined {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return undefined;
  }
  if (!url.pathname.endsWith("/oauth2/authorize")) return undefined;
  return { label: "Try again", href: `${url.pathname}${url.search}` };
}
