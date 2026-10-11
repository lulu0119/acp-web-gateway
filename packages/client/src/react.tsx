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

export function useAccount(relayUrl: string, clientId?: string): AccountSession {
  const [account, setAccount] = useState<Account>({ phase: "checking" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const store = window.sessionStorage;
    const redirectUri = new URL(browserCallbackPath, window.location.origin).href;
    const returning = window.location.pathname === browserCallbackPath;
    const token = returning
      ? finishBrowserSignIn({ relayUrl, clientId, redirectUri, callbackUrl: window.location.href, store }).then((tokens) => {
          window.history.replaceState({}, "", "/");
          return tokens.accessToken;
        })
      : storedAccessToken({ relayUrl, clientId, store });
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
  }, [relayUrl, clientId]);

  const signIn = useCallback(() => {
    setBusy(true);
    setError("");
    const redirectUri = new URL(browserCallbackPath, window.location.origin).href;
    void beginBrowserSignIn({ relayUrl, clientId, redirectUri, store: window.sessionStorage })
      .then((url) => {
        window.location.assign(url);
      })
      .catch((error: unknown) => {
        setError(error instanceof Error ? error.message : "Mukae did not answer.");
        setBusy(false);
      });
  }, [relayUrl, clientId]);

  const signOut = useCallback(() => {
    clearBrowserSignIn(window.sessionStorage);
    setAccount({ phase: "signed-out" });
    setError("");
  }, []);

  return { account, busy, error, signIn, signOut };
}
