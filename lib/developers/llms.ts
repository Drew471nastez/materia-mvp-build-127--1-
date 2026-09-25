/**
 * The text of storelib.com/llms.txt, in the llms.txt format (llmstxt.org).
 * Here rather than in the route because a Next route file may only export
 * its handlers and its config, and the tests want to read this directly.
 *
 * The pages are listed by hand, not looped over, because the order is for an
 * agent rather than for the sidebar: the rules and the AI guide come before
 * everything else, whatever category the site files them under.
 * tests/developer-hub.test.ts fails when a page of the hub is missing here.
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
    "Before writing a section, read the AI guide. Two facts matter more than any other: the template language is not Vue, React, JSX or Liquid, and a section's script runs in a sandbox against a copy of its own markup, so it can toggle classes, styles and text but cannot add elements, measure layout or reach the page.",
    "",
    `Before writing any code on a Storelib site, an agent reads and follows ${SITE_ORIGIN}/developers/rules: it writes section files only, never changes a built-in section, and makes every link, button and menu editable. A creator can connect an agent to one of their sites from Website Settings › Connections, in two ways. Through GitHub: the site's section files live in a repository, and every push to the linked branch is compiled and saved to the site as a draft (${SITE_ORIGIN}/developers/ai#connect-through-github); this is also how ChatGPT's Codex connects. Or directly: the site is an MCP server at https://mcp.storelib.com, with tools to read the project, its pages and the section the creator has selected, search the section library, create and edit sections, change settings and styles, create pages, apply several changes as one safe patch with a restore point, run tests and preview drafts; the rules and the skills for the task arrive with the connection (${SITE_ORIGIN}/developers/ai#connect-an-agent-directly).`,
    "",
    "A section never takes a payment. It shows the creator's products and links to their page or to Storelib checkout; see the Selling page.",
    "",
    "## Start here",
    "",
    line(""),
    line("rules"),
    line("ai"),
    line("builder"),
    line("website-builder"),
    "",
    "## Themes",
    "",
    line("themes"),
    line("pages"),
    line("sharing-themes"),
    line("publishing"),
    "",
    `## Sections: the ${FRAMEWORK_NAME}`,
    "",
    line("sections"),
    line("schema"),
    line("blocks"),
    line("styling"),
    line("javascript"),
    line("examples"),
    "",
    "## Data and logic",
    "",
    line("dynamic-values"),
    line("selling"),
    "",
    "## Reference",
    "",
    line("data-model"),
    "",
    "## Optional",
    "",
    line("changelog"),
    `- [Everything in one file](${SITE_ORIGIN}/llms-full.txt): every page above as plain markdown, with every reference table filled in.`,
    "",
  ].join("\n")
}
