export function accountPaths(pageOrigin: string, base: string): { redirectUri: string; returnTo: string } {
  const root = new URL(base, pageOrigin);
  return {
    redirectUri: new URL("oauth/callback", root).href,
    returnTo: root.pathname,
  };
}
