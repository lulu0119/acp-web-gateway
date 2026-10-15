import { expect, test } from "vitest";
import { accountPaths } from "./account-paths";

test("a page at the origin returns to that origin", () => {
  expect(accountPaths("http://127.0.0.1:47100", "/")).toEqual({
    redirectUri: "http://127.0.0.1:47100/oauth/callback",
    returnTo: "/",
  });
});

test("a page under a base returns under that base", () => {
  expect(accountPaths("https://lulu0119.github.io", "/exterior/")).toEqual({
    redirectUri: "https://lulu0119.github.io/exterior/oauth/callback",
    returnTo: "/exterior/",
  });
});
