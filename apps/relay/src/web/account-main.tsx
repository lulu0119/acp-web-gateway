import "@vitejs/plugin-react/preamble";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import type { AccountPage as AccountPageData } from "../shared/account-web.js";
import { readProps } from "@exterior/ui/props";
import { AccountPage } from "./pages/account";

const root = document.querySelector("#root");
const page = readProps<AccountPageData | undefined>(undefined);
if (root && page) {
  hydrateRoot(root, (
    <StrictMode>
      <AccountPage page={page} />
    </StrictMode>
  ));
}
