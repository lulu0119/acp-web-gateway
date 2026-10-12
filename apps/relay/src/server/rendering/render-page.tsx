import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AccountPage as AccountPageData, DashboardData } from "../../shared/account-web.js";
import { AccountPage, accountPageTitle } from "../../web/pages/account.js";
import type { WebAssets } from "./assets.js";

export type PageRenderer = {
  account(page: AccountPageData): string;
  dashboard(data: DashboardData): string;
};

export function createPageRenderer(assets: WebAssets): PageRenderer {
  function document(title: string, content: ReactNode, dashboard?: DashboardData): string {
    return "<!doctype html>" + renderToStaticMarkup(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{title}</title>
          {assets.stylesheets.map((href) => <link key={href} rel="stylesheet" href={href} />)}
        </head>
        <body>
          {content}
          {dashboard ? <script id="props" type="application/json" dangerouslySetInnerHTML={{ __html: escapeJson(dashboard) }} /> : null}
          {assets.devClient ? <script type="module" src={assets.devClient} /> : null}
          {dashboard && assets.dashboardScript ? <script type="module" src={assets.dashboardScript} /> : null}
        </body>
      </html>,
    );
  }
  return {
    account: (page) => document(`${accountPageTitle(page)} · Mukae`, <AccountPage page={page} />),
    dashboard: (data) => document("Mukae", <div id="root" />, data),
  };
}

function escapeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
