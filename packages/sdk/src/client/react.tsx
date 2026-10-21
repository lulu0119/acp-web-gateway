import { beginBrowserSignIn, browserCallbackPath, clearBrowserSignIn, finishBrowserSignIn, storedAccessToken, type BrowserStore } from "./oauth.js";
import { useCallback, useEffect, useState } from "react";

export type Account = { phase: "checking" } | { phase: "signed-out" } | { phase: "signed-in"; accessToken: string };

export type AccountSession = {
  account: Account;
  busy: boolean;
  error: string;
  signIn: () => void;
  signOut: () => void;
};

export function useAccount(
  relayUrl: string,
  init?: {
    redirectUri?: string;
    returnTo?: string;
    /** A client an account registered, or the https address of the app's Client ID Metadata Document. */
    clientId?: string;
    /** For an app that registers itself: the name and logo the relay shows for it. */
    clientName?: string;
    logoUri?: string;
  },
): AccountSession {
  const [account, setAccount] = useState<Account>({ phase: "checking" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const redirectUri = init?.redirectUri ?? new URL(browserCallbackPath, window.location.origin).href;
  const returnTo = init?.returnTo ?? "/";

  useEffect(() => {
    const store = window.sessionStorage;
    const returning = window.location.pathname === new URL(redirectUri).pathname;
    const token = returning
      ? finishBrowserSignIn({ relayUrl, redirectUri, callbackUrl: window.location.href, store, registrations: browserRegistrations() }).then((tokens) => {
          window.history.replaceState({}, "", returnTo);
          return tokens.accessToken;
        })
      : storedAccessToken({ relayUrl, store });
    let cancelled = false;
    void token
      .then((current) => {
        if (cancelled) return;
        setAccount(current ? { phase: "signed-in", accessToken: current } : { phase: "signed-out" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setAccount({ phase: "signed-out" });
        setError(error instanceof Error ? error.message : "Sign in again.");
      });
    return () => {
      cancelled = true;
    };
  }, [relayUrl, redirectUri, returnTo]);

  const signIn = useCallback(() => {
    setBusy(true);
    setError("");
    void beginBrowserSignIn({
      relayUrl,
      redirectUri,
      store: window.sessionStorage,
      registrations: browserRegistrations(),
      clientId: init?.clientId,
      clientName: init?.clientName,
      logoUri: init?.logoUri,
    })
      .then((url) => {
        window.location.assign(url);
      })
      .catch((error: unknown) => {
        setError(error instanceof Error ? error.message : "Exterior did not answer.");
        setBusy(false);
      });
  }, [relayUrl, redirectUri, init?.clientId, init?.clientName, init?.logoUri]);

  const signOut = useCallback(() => {
    clearBrowserSignIn(window.sessionStorage);
    setAccount({ phase: "signed-out" });
    setError("");
  }, []);

  return { account, busy, error, signIn, signOut };
}

/** `localStorage`, when the browser allows it: a private window or blocked storage registers on every sign-in. */
function browserRegistrations(): BrowserStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
