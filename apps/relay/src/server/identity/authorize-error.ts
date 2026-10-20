import type { AccountPage } from "../../shared/account-web.js";

export function isBrowserAuthorizeRequest(request: Request): boolean {
  if (request.method !== "GET" || new URL(request.url).pathname !== "/api/auth/oauth2/authorize") return false;
  return (request.headers.get("accept") ?? "").split(",").some((range) => {
    const [type, ...parameters] = range.toLowerCase().split(";").map((part) => part.trim());
    const quality = parameters.find((part) => part.startsWith("q="))?.slice(2);
    return type === "text/html" && (quality === undefined || Number(quality) > 0);
  });
}

export async function readBrowserAuthorizeError(request: Request, response: Response): Promise<AccountPage | undefined> {
  if (!isBrowserAuthorizeRequest(request) || response.status < 400) return undefined;
  if (!response.headers.get("content-type")?.includes("json")) return undefined;
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return undefined;
  }
  if (typeof body !== "object" || body === null) return undefined;
  const error = "error" in body && typeof body.error === "string" ? body.error : "";
  const description = "error_description" in body && typeof body.error_description === "string" ? body.error_description
    : "message" in body && typeof body.message === "string" ? body.message : "";
  const failure = explainAuthorizeFailure(error, description, response.status);
  const url = new URL(request.url);
  return {
    kind: "message",
    tone: "error",
    title: failure.title,
    message: failure.message,
    details: [error, description].filter(Boolean).join(": ") || undefined,
    action: failure.retry ? { label: "Try again", href: `${url.pathname}${url.search}` } : undefined,
  };
}

function explainAuthorizeFailure(error: string, description: string, status: number): { title: string; message: string; retry: boolean } {
  if (status === 429) {
    return {
      title: "Too many sign-in attempts",
      message: "Wait a little before trying again.",
      retry: true,
    };
  }
  if (error === "invalid_client" && description.startsWith("Metadata document fetch timed out")) {
    return {
      title: "Exterior could not reach this app",
      message: "The app's description did not download in time. Try again. If it keeps failing, ask the app's developer to check its sign-in setup.",
      retry: true,
    };
  }
  if (error === "invalid_client" && description.startsWith("Failed to fetch metadata document")) {
    return {
      title: "Exterior could not reach this app",
      message: "The app's description could not be downloaded. Try again. If it keeps failing, ask the app's developer to check its sign-in setup.",
      retry: true,
    };
  }
  if (status >= 500 || error === "server_error" || error === "temporarily_unavailable") {
    return {
      title: "Sign-in is temporarily unavailable",
      message: "Exterior could not finish this sign-in. Try again in a moment.",
      retry: true,
    };
  }
  return {
    title: "This sign-in could not start",
    message: "Go back to the app and start again. If it keeps failing, ask the app's developer to check its sign-in setup.",
    retry: false,
  };
}
