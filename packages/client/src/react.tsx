import { beginBrowserSignIn, browserCallbackPath, clearBrowserSignIn, finishBrowserSignIn, storedAccessToken } from "./oauth.js";
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
  init?: { redirectUri?: string; returnTo?: string; clientName?: string; logo?: string },
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
      ? finishBrowserSignIn({ relayUrl, redirectUri, callbackUrl: window.location.href, store }).then((tokens) => {
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
    void beginBrowserSignIn({ relayUrl, redirectUri, store: window.sessionStorage, clientName: init?.clientName, logo: init?.logo })
      .then((url) => {
        window.location.assign(url);
      })
      .catch((error: unknown) => {
        setError(error instanceof Error ? error.message : "Exterior did not answer.");
        setBusy(false);
      });
  }, [relayUrl, redirectUri, init?.clientName, init?.logo]);

  const signOut = useCallback(() => {
    clearBrowserSignIn(window.sessionStorage);
    setAccount({ phase: "signed-out" });
    setError("");
  }, []);

  return { account, busy, error, signIn, signOut };
}
