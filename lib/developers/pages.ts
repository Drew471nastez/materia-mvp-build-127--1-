/**
 * ===========================================================================
 *  THE STORELIB DEVELOPER HUB, AS ONE LIST
 * ===========================================================================
 * Every page of storelib.com/developers, in reading order. The sidebar, the
 * previous and next links, the page titles and descriptions, the front
 * page's map of the hub, the sitemap, /llms.txt and /llms-full.txt all read
 * this list, so a page added here is added everywhere at once and a page
 * left out of it exists nowhere.
 *
 * The words of each page are in content/developers/<slug>.md, bundled into
 * lib/developers/content.generated.ts by scripts/emit-developer-docs.ts.
 * They are bundled rather than read from disk because the marketing layout
 * reads cookies, which makes every page under it render per request, and a
 * file Next never traced into the serverless bundle does not exist there.
 * lib/storelib-ai/knowledge.ts has the same note, for the same reason.
 *
 * SLUGS ARE ADDRESSES, AND ADDRESSES ARE KEPT. Search engines and agents
 * have indexed every one of them. A page can move to another group or get a
 * new name in the sidebar; its slug does not change.
 */

export const HUB_NAME = "Storelib Developer Hub"
export const FRAMEWORK_NAME = "Storelib Builder Framework"
export const HUB_BASE = "/developers"
export const SITE_ORIGIN = "https://storelib.com"

/** The hub's categories, in the order the sidebar and the front page show them. */
export const DEV_GROUPS = ["Get started", "Themes", "Sections", "Data and logic", "Tools and AI", "Reference"] as const
export type DevGroup = (typeof DEV_GROUPS)[number]

/** What each category is for, in a sentence. The front page's map of the hub reads these. */
export const DEV_GROUP_INFO: Record<DevGroup, string> = {
  "Get started": "What the builder is made of, and how to work in the editor.",
  Themes: "A website as a whole: its settings, colour schemes and fonts, its pages, how it goes live and how it is shared.",
  Sections: "The .storelib file: markup, schema, blocks, CSS and script, with complete examples.",
  "Data and logic": "What a template can read: settings, blocks, the page, the theme, the creator's products, and the filters that shape them.",
  "Tools and AI": "Connecting Claude Code, Codex or any MCP client, and the rules an agent follows on a Storelib site.",
  Reference: "The tables behind the builder, and what changed when.",
}

export interface DevPage {
  /** "" for the hub's front page. */
  slug: string
  /** The <title> and the page's own heading. */
  title: string
  /** What the sidebar calls it, when shorter than the title. */
  nav: string
  /** A line on the front page's map of the hub, under the name. */
  summary: string
  /** One sentence for search results, link previews and llms.txt. */
  description: string
  group: DevGroup
}

export const DEV_PAGES: readonly DevPage[] = [
  {
    slug: "",
    title: "Storelib Developer Hub",
    nav: "Overview",
    summary: "Where to start: the map of the hub and a first section.",
    description:
      "The complete reference for the Storelib Builder Framework, the language every section on every Storelib site is written in, and a guide to the website builder that runs it.",
    group: "Get started",
  },
  {
    slug: "builder",
    title: "How the builder works",
    nav: "How the builder works",
    summary: "Themes, pages, sections and blocks, and where each is kept.",
    description:
      "Themes, pages, sections and blocks in the Storelib website builder: what is stored where, drafts and publishing, and what happens between saving a section file and a visitor seeing it.",
    group: "Get started",
  },
  {
    slug: "website-builder",
    title: "Using the website builder",
    nav: "Using the editor",
    summary: "The editor, panel by panel: sections, pages, theme settings, code.",
    description:
      "Every part of the Storelib website builder: the top bar, the Sections, Pages and Theme panels, a section's settings and blocks, undo, the preview, autosave, publishing, backups, the code editor, Ask AI and Website settings.",
    group: "Get started",
  },
  {
    slug: "themes",
    title: "Themes",
    nav: "Themes",
    summary: "Theme settings, colour schemes, fonts and the package format.",
    description:
      "What a Storelib theme is made of: its settings, colour schemes and fonts, the package format with theme.json, manifest.json and templates, the website library, and versions.",
    group: "Themes",
  },
  {
    slug: "pages",
    title: "Pages and page settings",
    nav: "Pages",
    summary: "Page keys, the built-in pages, and each page's search settings.",
    description:
      "The pages of a Storelib website: page keys and addresses, the names a page cannot take, the shop, search and policy pages, what a page stores, and each page's own search settings.",
    group: "Themes",
  },
  {
    slug: "header-and-footer",
    title: "The header and footer",
    nav: "Header and footer",
    summary: "One of each on every site: what they do and every setting.",
    description:
      "The one header and one footer every Storelib website has: the cart drawer, search, menus, sticky and transparent modes, every setting they take, how to change them from the editor, Ask AI or an agent, and why a section file can never be another one.",
    group: "Themes",
  },
  {
    slug: "sharing-themes",
    title: "Sharing themes",
    nav: "Sharing themes",
    summary: "Theme files in and out, preview links and duplicates.",
    description:
      "Exporting a Storelib theme as a file, importing one, private preview links and duplicates: what travels, what does not, the size limits, and editing a package by hand.",
    group: "Themes",
  },
  {
    slug: "publishing",
    title: "Publishing and checks",
    nav: "Publishing and checks",
    summary: "Drafts, what Publish does, what is checked, and the limits.",
    description:
      "Drafts and the live site, what Publish does step by step, what is checked when a file is saved, a page is saved, an agent writes and a theme is imported, the limits, and what drops a section at render.",
    group: "Themes",
  },
  {
    slug: "sections",
    title: "Sections",
    nav: "Section files",
    summary: "The .storelib file and the template language.",
    description:
      "The .storelib section file and the Storelib template language: output, conditions, loops, filters, what a template can read, and what the compiler refuses.",
    group: "Sections",
  },
  {
    slug: "schema",
    title: "Schema",
    nav: "Schema and settings",
    summary: "Every setting type and schema key, with a complete example.",
    description:
      "Every setting type and schema key in the Storelib Builder Framework, a complete schema from the library, the order a value is resolved in, media, and how to change a section without losing content.",
    group: "Sections",
  },
  {
    slug: "blocks",
    title: "Blocks",
    nav: "Blocks",
    summary: "Repeatable content inside a section.",
    description:
      "Repeatable content inside a Storelib section: declaring block types, rendering them, limits, presets, and how blocks are stored.",
    group: "Sections",
  },
  {
    slug: "styling",
    title: "Styling",
    nav: "Styling",
    summary: "Scoped CSS, container queries, colour schemes and type.",
    description:
      "How Storelib scopes a section's CSS, container queries for responsive layout, colour schemes, the theme's type scale, and the layout conventions the library follows.",
    group: "Sections",
  },
  {
    slug: "javascript",
    title: "JavaScript and forms",
    nav: "JavaScript and forms",
    summary: "Forms, player embeds and the section script API.",
    description:
      "Interaction without script, email capture forms that collect for the creator, player embeds, and the Storelib section scripting API with its capabilities.",
    group: "Sections",
  },
  {
    slug: "examples",
    title: "Examples",
    nav: "Examples",
    summary: "Complete sections, compiled by the test suite on every change.",
    description:
      "Complete, working Storelib sections, each compiled and quality checked by the test suite on every change: a sign-up card, an FAQ, a logo strip, a video, product cards, tabs and a navigation bar.",
    group: "Sections",
  },
  {
    slug: "dynamic-values",
    title: "Dynamic values",
    nav: "Dynamic values",
    summary: "Every value a template can read, and every filter.",
    description:
      "Everything a Storelib template can read, field by field: settings, blocks, section, page, scheme, theme, products and forloop, how each value is resolved, every filter with examples, and what the language does not have.",
    group: "Data and logic",
  },
  {
    slug: "selling",
    title: "Selling: products, checkout and payments",
    nav: "Products and checkout",
    summary: "Product fields, the checkout link, and what checkout does.",
    description:
      "How a section shows the creator's products and sends a buyer to Storelib checkout: the product fields, the checkout link, the cart, what checkout does with the money, and what a section may never do with payments.",
    group: "Data and logic",
  },
  {
    slug: "ai",
    title: "Building with AI agents",
    nav: "AI agents",
    summary: "Connecting Claude Code, Codex or any MCP client.",
    description:
      "Connecting Claude Code or Codex to a Storelib site through GitHub or directly, and instructions for any AI agent writing Storelib sections, including the exact brief the builder's own AI is given.",
    group: "Tools and AI",
  },
  {
    slug: "rules",
    title: "Rules before you ship",
    nav: "Rules for agents",
    summary: "What an agent must follow before it ships code.",
    description:
      "What every AI agent must follow before writing code on a Storelib site: what it may change, editable links and menus, copying a page from a screenshot, menus and sheets, motion, phones and iOS, and the checks before calling it done.",
    group: "Tools and AI",
  },
  {
    slug: "data-model",
    title: "Data model",
    nav: "Data model",
    summary: "The tables behind a website, and what each row holds.",
    description:
      "The tables behind a Storelib website as the builder sees them: installs, theme settings, pages, section files and their versions, backups, publish history, preview links and agent connections.",
    group: "Reference",
  },
  {
    slug: "shopify",
    title: "Coming from Shopify",
    nav: "Coming from Shopify",
    summary: "Shopify's theme structure, mapped to Storelib's.",
    description:
      "How Shopify's theme structure maps to the Storelib Builder Framework: setting types, schema keys, templates and pages, sections, menus and dynamic sources, and what Storelib does not have and why.",
    group: "Reference",
  },
  {
    slug: "changelog",
    title: "Changelog",
    nav: "Changelog",
    summary: "What changed in the framework, and when.",
    description: "Changes to the Storelib Builder Framework, and the versions of the engine, the section schema and the theme package format.",
    group: "Reference",
  },
]

export function devPath(slug: string): string {
  return slug ? `${HUB_BASE}/${slug}` : HUB_BASE
}

export function devPage(slug: string): DevPage | undefined {
  return DEV_PAGES.find((p) => p.slug === slug)
}

/** The pages of one category, in reading order. */
export function devPagesIn(group: DevGroup): DevPage[] {
  return DEV_PAGES.filter((p) => p.group === group)
}

/** The page before and after, in reading order, for the links at the foot of each page. */
export function devNeighbours(slug: string): { prev?: DevPage; next?: DevPage } {
  const i = DEV_PAGES.findIndex((p) => p.slug === slug)
  if (i < 0) return {}
  return { prev: DEV_PAGES[i - 1], next: DEV_PAGES[i + 1] }
}
