/**
 * ===========================================================================
 *  THE STORELIB DEVELOPER HUB, AS ONE LIST
 * ===========================================================================
 * Every page of storelib.com/developers, in reading order. The sidebar, the
 * previous and next links, the page titles and descriptions, the sitemap,
 * /llms.txt and /llms-full.txt all read this list, so a page added here is
 * added everywhere at once and a page left out of it exists nowhere.
 *
 * The words of each page are in content/developers/<slug>.md, bundled into
 * lib/developers/content.generated.ts by scripts/emit-developer-docs.ts.
 * They are bundled rather than read from disk because the marketing layout
 * reads cookies, which makes every page under it render per request, and a
 * file Next never traced into the serverless bundle does not exist there.
 * lib/storelib-ai/knowledge.ts has the same note, for the same reason.
 */

export const HUB_NAME = "Storelib Developer Hub"
export const FRAMEWORK_NAME = "Storelib Builder Framework"
export const HUB_BASE = "/developers"
export const SITE_ORIGIN = "https://storelib.com"

export interface DevPage {
  /** "" for the hub's front page. */
  slug: string
  /** The <title> and the page's own heading. */
  title: string
  /** What the sidebar calls it, when shorter than the title. */
  nav: string
  /** One sentence for search results, link previews and llms.txt. */
  description: string
  group: "Start" | "Framework" | "Build" | "Reference"
}

export const DEV_PAGES: readonly DevPage[] = [
  {
    slug: "",
    title: "Storelib Developer Hub",
    nav: "Overview",
    description:
      "The complete reference for the Storelib Builder Framework, the language every section on every Storelib site is written in, and a guide to the website builder that runs it.",
    group: "Start",
  },
  {
    slug: "builder",
    title: "How the builder works",
    nav: "How the builder works",
    description:
      "Themes, pages, sections and blocks in the Storelib website builder: what is stored where, drafts and publishing, and what happens between saving a section file and a visitor seeing it.",
    group: "Start",
  },
  {
    slug: "website-builder",
    title: "Using the website builder",
    nav: "Using the builder",
    description:
      "Every part of the Storelib website builder: the top bar, the sidebar, each section setting and control, every theme setting with its default, the canvas, Ask AI, the code editor, Website settings and publishing.",
    group: "Start",
  },
  {
    slug: "sections",
    title: "Sections",
    nav: "Sections",
    description:
      "The .storelib section file and the Storelib template language: output, conditions, loops, filters, what a template can read, and what the compiler refuses.",
    group: "Framework",
  },
  {
    slug: "blocks",
    title: "Blocks",
    nav: "Blocks",
    description:
      "Repeatable content inside a Storelib section: declaring block types, rendering them, limits, presets, and how blocks are stored.",
    group: "Framework",
  },
  {
    slug: "schema",
    title: "Schema",
    nav: "Schema",
    description:
      "Every setting type and schema key in the Storelib Builder Framework, the order a value is resolved in, assets, and how to change a section without losing content.",
    group: "Framework",
  },
  {
    slug: "styling",
    title: "Styling",
    nav: "Styling",
    description:
      "How Storelib scopes a section's CSS, container queries for responsive layout, colour schemes, the theme's type scale, and the layout conventions the library follows.",
    group: "Framework",
  },
  {
    slug: "javascript",
    title: "JavaScript and forms",
    nav: "JavaScript and forms",
    description:
      "Interaction without script, email capture forms that collect for the creator, player embeds, and the Storelib section scripting API with its capabilities.",
    group: "Framework",
  },
  {
    slug: "selling",
    title: "Selling: products, checkout and payments",
    nav: "Selling",
    description:
      "How a section shows the creator's products and sends a buyer to Storelib checkout: the product fields, the checkout link, the cart, what checkout does with the money, and what a section may never do with payments.",
    group: "Build",
  },
  {
    slug: "examples",
    title: "Examples",
    nav: "Examples",
    description:
      "Complete, working Storelib sections, each compiled and quality checked by the test suite on every change: a sign-up card, an FAQ, a logo strip, a video, product cards, tabs and a navigation bar.",
    group: "Build",
  },
  {
    slug: "rules",
    title: "Rules before you ship",
    nav: "Rules for agents",
    description:
      "What every AI agent must follow before writing code on a Storelib site: what it may change, editable links and menus, copying a page from a screenshot, menus and sheets, motion, phones and iOS, and the checks before calling it done.",
    group: "Build",
  },
  {
    slug: "ai",
    title: "Building with AI agents",
    nav: "AI agents",
    description:
      "Connecting Claude Code or Codex to a Storelib site through GitHub or directly, and instructions for any AI agent writing Storelib sections, including the exact brief the builder's own AI is given.",
    group: "Build",
  },
  {
    slug: "changelog",
    title: "Changelog",
    nav: "Changelog",
    description: "Changes to the Storelib Builder Framework, and the versions of the engine, the section schema and the theme package format.",
    group: "Reference",
  },
]

export const DEV_GROUPS: readonly DevPage["group"][] = ["Start", "Framework", "Build", "Reference"]

export function devPath(slug: string): string {
  return slug ? `${HUB_BASE}/${slug}` : HUB_BASE
}

export function devPage(slug: string): DevPage | undefined {
  return DEV_PAGES.find((p) => p.slug === slug)
}

/** The page before and after, in reading order, for the links at the foot of each page. */
export function devNeighbours(slug: string): { prev?: DevPage; next?: DevPage } {
  const i = DEV_PAGES.findIndex((p) => p.slug === slug)
  if (i < 0) return {}
  return { prev: DEV_PAGES[i - 1], next: DEV_PAGES[i + 1] }
}
