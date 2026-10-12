import type { ReactNode } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import type { AccountPage as AccountPageData, DashboardData, SetupGuideData } from "../../shared/account-web.js";
import { AccountPage, accountPageTitle } from "../../web/pages/account.js";
import type { WebAssets } from "./assets.js";

export type PageRenderer = {
  account(page: AccountPageData): string;
  dashboard(data: DashboardData, guide: SetupGuideData): string;
};

// Account pages are complete HTML forms on their own. Their script only hydrates them for the code field, tabs,
// copy buttons, and pending states, so approving still works when it fails to load.
export function createPageRenderer(assets: WebAssets): PageRenderer {
  function document(title: string, root: ReactNode, props: unknown, script: string | undefined): string {
    return "<!doctype html>" + renderToStaticMarkup(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{title}</title>
          {assets.stylesheets.map((href) => <link key={href} rel="stylesheet" href={href} />)}
        </head>
        <body>
          {root}
          <script id="props" type="application/json" dangerouslySetInnerHTML={{ __html: escapeJson(props) }} />
          {assets.devClient ? <script type="module" src={assets.devClient} /> : null}
          {script ? <script type="module" src={script} /> : null}
        </body>
      </html>,
    );
  }
  return {
    account: (page) => document(
      `${accountPageTitle(page)} · Mukae`,
      <div id="root" dangerouslySetInnerHTML={{ __html: renderToString(<AccountPage page={page} />) }} />,
      page,
      assets.accountScript,
    ),
    dashboard: (data, guide) => document("Devices · Mukae", <div id="root" />, { data, guide }, assets.dashboardScript),
  };
}

function escapeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
