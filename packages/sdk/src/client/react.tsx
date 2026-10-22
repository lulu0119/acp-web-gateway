import { beginBrowserSignIn, browserCallbackPath, clearBrowserSignIn, finishBrowserSignIn, storedAccessToken } from "./oauth.js";
import { useCallback, useEffect, useState } from "react";

export type Account = { phase: "checking" } | { phase: "signed-out" } | { phase: "signed-in" };

export type AccountSession = {
  account: Account;
  busy: boolean;
  error: string;
  signIn: () => void;
  signOut: () => void;
  /**
   * A live access token for each request, refreshed when it is about to expire. Once the sign-in is gone it rejects
   * and the account is signed out.
   */
  accessToken: () => Promise<string>;
};

export function useAccount(
  relayUrl: string,
  init: {
    /** The https address of the app's Client ID Metadata Document, or a client an account registered. */
    clientId: string;
    redirectUri?: string;
    returnTo?: string;
  },
): AccountSession {
  const [account, setAccount] = useState<Account>({ phase: "checking" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { clientId } = init;
  const redirectUri = init.redirectUri ?? new URL(browserCallbackPath, window.location.origin).href;
  const returnTo = init.returnTo ?? "/";

  useEffect(() => {
    const store = window.sessionStorage;
    const returning = window.location.pathname === new URL(redirectUri).pathname;
    const token = returning
      ? finishBrowserSignIn({ relayUrl, redirectUri, callbackUrl: window.location.href, store, clientId }).then((tokens) => {
          window.history.replaceState({}, "", returnTo);
          return tokens.accessToken;
        })
      : storedAccessToken({ relayUrl, store, clientId });
    let cancelled = false;
    void token
      .then((current) => {
        if (cancelled) return;
        setAccount(current ? { phase: "signed-in" } : { phase: "signed-out" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setAccount({ phase: "signed-out" });
        setError(error instanceof Error ? error.message : "Sign in again.");
      });
    return () => {
      cancelled = true;
    };
  }, [relayUrl, clientId, redirectUri, returnTo]);

  const signIn = useCallback(() => {
    setBusy(true);
    setError("");
    void beginBrowserSignIn({ relayUrl, redirectUri, store: window.sessionStorage, clientId })
      .then((url) => {
        window.location.assign(url);
      })
      .catch((error: unknown) => {
        setError(error instanceof Error ? error.message : "The relay did not answer.");
        setBusy(false);
      });
  }, [relayUrl, redirectUri, clientId]);

  const signOut = useCallback(() => {
    clearBrowserSignIn(window.sessionStorage);
    setAccount({ phase: "signed-out" });
    setError("");
  }, []);

  const accessToken = useCallback(async () => {
    const current = await storedAccessToken({ relayUrl, store: window.sessionStorage, clientId });
    if (current) return current;
    setAccount({ phase: "signed-out" });
    throw new Error("Sign in again.");
  }, [relayUrl, clientId]);

  return { account, busy, error, signIn, signOut, accessToken };
}

