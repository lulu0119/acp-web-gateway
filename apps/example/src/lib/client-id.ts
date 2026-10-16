/** The metadata document Example names itself by (CIMD), served from the app's own directory. */
const documentPath = "oauth-client.json";

/**
 * The client Example signs in with.
 *
 * Where the app is served over https, it names itself with its Client ID Metadata Document, and the
 * relay reads the name, logo, and redirect address from that file. A page served over http is a
 * development one, whose address the relay cannot fetch, so it gets no client id: `@exterior/client`
 * registers it with the relay instead and keeps that registration in this browser.
 */
export function exampleClientId(pageOrigin: string, base: string): string | undefined {
  const document = new URL(documentPath, new URL(base, pageOrigin));
  return document.protocol === "https:" ? document.href : undefined;
}

/** The logo the relay shows for Example where it registers itself; the metadata document carries it otherwise. */
export function exampleLogoUri(pageOrigin: string, base: string): string {
  return new URL("example-mark.png", new URL(base, pageOrigin)).href;
}
