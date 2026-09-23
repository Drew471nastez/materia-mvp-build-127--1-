/**
 * The text of storelib.com/llms.txt, in the llms.txt format (llmstxt.org).
 * Here rather than in the route because a Next route file may only export
 * its handlers and its config, and the tests want to read this directly.
 */
import { DEV_PAGES, FRAMEWORK_NAME, HUB_NAME, SITE_ORIGIN, devPath } from "./pages"

export function llmsTxt(): string {
  const link = (slug: string) => `${SITE_ORIGIN}${devPath(slug)}`
  const line = (slug: string) => {
    const p = DEV_PAGES.find((x) => x.slug === slug)
    return p ? `- [${p.title}](${link(slug)}): ${p.description}` : ""
  }
  return [
    `# ${HUB_NAME}`,
    "",
    `> Storelib is a platform where creators sell digital products and build their own website. Every section of every Storelib website is written in the ${FRAMEWORK_NAME}: one .storelib file per section, holding a <template>, a scoped <style>, an optional <script> and a JSON <schema>. These pages are its complete reference.`,
    "",
    "Before writing a section, read the AI guide. Two facts matter more than any other: the template language is not Vue, React, JSX or Liquid, and section scripts are checked when saved but not run on the page yet, so every interaction is built with HTML and CSS.",
    "",
    "## Start",
    "",
    line(""),
    line("builder"),
    line("ai"),
    "",
    `## ${FRAMEWORK_NAME}`,
    "",
    line("sections"),
    line("blocks"),
    line("schema"),
    line("styling"),
    line("javascript"),
    "",
    "## Examples",
    "",
    line("examples"),
    "",
    "## Optional",
    "",
    line("changelog"),
    `- [Everything in one file](${SITE_ORIGIN}/llms-full.txt): every page above as plain markdown, with every reference table filled in.`,
    "",
  ].join("\n")
}
