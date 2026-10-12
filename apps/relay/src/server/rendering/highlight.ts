import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import markdown from "shiki/langs/markdown.mjs";
import shellscript from "shiki/langs/shellscript.mjs";
import githubDark from "shiki/themes/github-dark-default.mjs";
import githubLight from "shiki/themes/github-light-default.mjs";
import type { HighlightedCode } from "../../shared/account-web.js";

export type CodeLanguage = "markdown" | "shellscript";

let highlighter: ReturnType<typeof createHighlighterCoreSync> | undefined;

/** Highlights on the server. Both themes are emitted as CSS variables so the page follows the color scheme. */
export function highlight(code: string, lang: CodeLanguage): HighlightedCode {
  highlighter ??= createHighlighterCoreSync({
    themes: [githubLight, githubDark],
    langs: [markdown, shellscript],
    engine: createJavaScriptRegexEngine(),
  });
  const html = highlighter.codeToHtml(code, {
    lang,
    themes: { light: "github-light-default", dark: "github-dark-default" },
    defaultColor: "light",
  });
  return { code, html };
}
