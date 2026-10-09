/**
 * ===========================================================================
 *  THE SECTION FRAMEWORK, EXACTLY, AND WHAT A GOOD SECTION LOOKS LIKE
 * ===========================================================================
 * "Make sure Ask Storelib knows what good sections look like, understands the
 * Storelib structure, framework and config."
 *
 * The rules (lib/agent-rules) say how to work and the design guardrails
 * (./design.ts) say what to avoid. Neither shows a model a finished section,
 * and a model that has never seen one writes the average section on the
 * internet: its own blue, a heading typed into the markup, a grid of three
 * cards. This is the part that shows it, in three pieces every builder AI
 * composes into its STABLE system prompt, so it is cached with the rest of
 * the prefix and costs a tenth on every request after the first:
 *
 *   FRAMEWORK_REFERENCE   the section format precisely: schema, settings,
 *                         blocks, presets, colour schemes, type tokens, the
 *                         spacing scale, buttons, links, images, products,
 *                         responsive rules. The names are the engine's own:
 *                         the scheme keys are imported from it, and every
 *                         variable named here is one the built-in sections
 *                         use (tests/ai-reference.test.ts reads them there)
 *   QUALITY_CHECKLIST     what makes one good, as a short list to check a
 *                         section against before calling it finished
 *   REFERENCE_SECTIONS    three of Storelib's own built-in sections, whole,
 *                         with their comments taken out and their schema one
 *                         entry per line: the short one with every part of
 *                         the native contract (cta_simple), one built from
 *                         blocks (faq_accordion), and one that shows the
 *                         creator's real products (product_featured)
 *
 * Two compositions. writerReference() is for Code section, which writes
 * whole files: the framework, the checklist and all three. The page
 * assistant (pageAgentReference) also gets the file format and the
 * integration contract, which its prompt did not have, and the first two
 * sections: it sets a product section's source rather than writing one.
 *
 * Read from themes/default/sources.generated.ts, a module rather than the
 * .storelib files, so it is in the serverless bundle. Pure and stable: the
 * same text on every request for the life of a deployment.
 */

import { SCHEME_COLOR_KEYS } from "@/lib/storelib-theme/color-schemes"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { INTEGRATION_CONTRACT } from "./integration"
import { CORE_FORMAT } from "./knowledge"

export const FRAMEWORK_REFERENCE = `THE STORELIB SECTION FRAMEWORK, EXACTLY. Built-in sections follow it and so does every section you write or change; the three at the end of this prompt are real ones.

SCHEMA (the JSON in <schema>): "schema_version": 1, "type" (equal to the file name, sections/<type>.storelib), "name", "category", "description", then "settings" in the order the sidebar shows them, "blocks", "max_blocks" (50 at most) and "presets". A setting is {"type", "id", "label", "default"}: the id is lower case letters, digits and _, and it is the key the creator's content is stored under, so it is never renamed. select and radio take "options": [{"label", "value"}] with the default among them; range takes "min", "max", "step" and "unit". header, paragraph and divider only draw in the sidebar. "responsive": true, where the type allows it, makes the value {desktop, tablet, mobile}, read as settings.columns.desktop and so on.

BLOCKS are the repeated content: each block type is {"type", "name", "limit", "settings"}; the template loops {% for block in blocks %}, reads block.settings.<id> and puts data-block-id="{{ block.id }}" on each block's root so a click on the canvas selects it. {% else %} in the loop is the empty state.

PRESETS are what Add Section offers: {"name", "settings", "blocks": [{"type": "question"}, ...]}. A section with no preset is not offered. A preset arrives filled with real looking content from the defaults, and a second preset is usually the same section on a dark scheme.

COLOUR SCHEME: a color_scheme setting (default "white"; the built-in keys are white, light, dark, black and highlight, named Light, Soft, Dark, Brand and Accent). The section's outermost element carries data-scheme="{{ settings.color_scheme }}" and the scheme as variables in its style: --s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-heading: {{ scheme.heading }}; --s-para: {{ scheme.paragraph }}; --s-border: {{ scheme.border }}; --s-accent: {{ scheme.accent }}; --s-btn: {{ scheme.primary_btn_bg }}; --s-btn-text: {{ scheme.primary_btn_text }}; --s-btn-hover: {{ scheme.primary_btn_hover_bg }}; --s-btn-hover-text: {{ scheme.primary_btn_hover_text }}; --s-btn2: {{ scheme.secondary_btn_bg }}; --s-btn2-text: {{ scheme.secondary_btn_text }}; --s-btn2-border: {{ scheme.secondary_btn_border }}; --s-btn2-hover: {{ scheme.secondary_btn_hover_bg }}; --s-btn2-hover-text: {{ scheme.secondary_btn_hover_text }}. The CSS may paint with var(--s-*). The scheme's semantic keys are ${SCHEME_COLOR_KEYS.join(", ")}.

TYPE TOKENS: a section heading is font-size: var(--section-heading-size, 32px); line-height: var(--section-heading-line-height, 1.15); font-weight: var(--section-heading-weight, 700); letter-spacing: var(--section-heading-tracking, -0.01em); text-transform: var(--section-heading-transform, none); font-family: var(--theme-font-heading, {{ theme.typography.heading }}), ui-sans-serif, system-ui, sans-serif. Body text is var(--section-text-size, 17px) at var(--section-text-line-height, 1.6). An h3 inside a section is a card title at the size the section gives it. Naming a font is allowed.

SPACING: padding_top and padding_bottom are range settings, 0 to 160 px in steps of 4, usually 72; the root sets --s-pt: {{ settings.padding_top }}px; --s-pb: {{ settings.padding_bottom }}px and the inner wrapper pads calc(var(--s-pt) * var(--theme-spacing-scale, 1)) top, var(--theme-padding-x, 24px) at the sides. Content width is a max_width select: narrow 720px, medium 960px, wide var(--theme-page-width, 1280px), full. Inside, gaps sit on the 4px scale (8, 12, 16, 24, 32, 40) and the same kind of gap is the same everywhere.

BUTTONS: a link with its words in a text setting and its address in a url setting beside it. It may be painted from the scheme: background var(--s-btn), color var(--s-btn-text), corners var(--s-radius) (--s-radius: {{ theme.radius.medium }}px on the root), and a :hover from var(--s-btn-hover) and var(--s-btn-hover-text). Its own paint is allowed. A second action is the secondary button (the --s-btn2 keys) or a plain link. data-sl-button on a link lets the theme paint it instead.

LINKS: every href is a url setting through the url filter: href="{{ settings.button_url | default: '#' | url }}". Button words name what happens.

COLOUR PER ELEMENT: a color setting per element drawn, defaulting to the scheme colour it follows (heading_color "scheme.heading", text_color "scheme.text", button_color "scheme.primary_button_background", border_color "scheme.border"), printed on the root: --s-heading: {{ settings.heading_color }}.

IMAGES: an image_picker setting (never text holding an address), printed behind {% if settings.image %} as <img src="{{ settings.image | asset }}" alt="{{ settings.image_alt }}" loading="lazy" decoding="async">, with a width and height or an aspect-ratio, and object-fit: cover where the crop matters. The logo is theme.logo.url.

MENUS: one link_list setting, default "main-menu", looped {% for link in settings.menu.links %}, sub links in link.links. Never link_1_label, link_1_url pairs.

HEADER AND FOOTER: design them freely, with "kind": "header" or "kind": "footer". Keep link_list, link.links, theme.logo and data-storelib-cart, data-storelib-search, data-storelib-menu live.

PRODUCTS are the shop's, never typed: {% for block in products %} is the published products, newest first: block.settings.title, .price and .compare_price (formatted, never computed), .image, .images, .url, .checkout_url, .available, .tag, .variants, .options. A "source" select picks which: "shop" (limit: settings.product_count), "collection" (collection_picker) or "chosen" (product_list); one product is a product_picker. A product page has page.product. {% if products.size == 0 %} is a store with none.

RESPONSIVE: the builder measures the section, not the window, so container-type: inline-size and @container (min-width: 640px) are how a phone layout stays honest. The layout itself is the section's. Motion is the section's own; prefers-reduced-motion is a courtesy.

EDITOR ONLY: a line asking the creator to add something sits behind {% if page.in_editor %} and never reaches a visitor.`

export const QUALITY_CHECKLIST = `A GOOD SECTION, CHECKED BEFORE YOU CALL ONE FINISHED:
1. Hierarchy: one heading that says what the section is about, one supporting line, then the content, sized from the type tokens and never larger to look important.
2. Spacing rhythm: the page's own padding values on padding_top and padding_bottom, gaps on the 4px scale, the same gap between the same kind of thing.
3. One clear action: at most one primary button, its words naming what happens (Buy the preset pack, See the course); anything else is a secondary button or a link.
4. Mobile first: one column that reads top to bottom on a phone, 44px taps, no sideways scroll; wider layouts added with @container.
5. Colours may follow the scheme (var(--s-*)) or be color settings the creator overwrites. A fixed colour is allowed.
6. Real content: the creator's products (products, or the store you are shown), their names, prices and words; no lorem ipsum, no invented review, statistic, logo or customer count.
7. Native: every word, link and picture a setting or a block, a preset that arrives filled, and nothing that breaks when the section is on the page twice.`

/** The built-in sections shown whole, and what each is there to teach. */
export const REFERENCE_SECTION_TYPES: readonly { type: string; teaches: string }[] = [
  {
    type: "cta_simple",
    teaches: "the whole native contract in the fewest lines: scheme variables on the root, type tokens, primary and secondary buttons with hovers, padding and width settings, a preset on a dark scheme",
  },
  {
    type: "faq_accordion",
    teaches: "content in blocks: <details> with no script, the first answer open by a setting, data-block-id, an editor only empty state, motion off under reduced motion",
  },
  {
    type: "product_featured",
    teaches: "the creator's real products: a source select between the shop, a collection and products chosen in the sidebar, a product count, responsive columns read per width, prices printed as given, container queries",
  },
]

/** A JSON value with objects in arrays one to a line: compact, and still readable line by line. */
function compactJson(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value)
  const entries = Object.entries(value as Record<string, unknown>).map(([key, v]) => {
    if (Array.isArray(v) && v.some((item) => item && typeof item === "object")) {
      return `  ${JSON.stringify(key)}: [\n${v.map((item) => `    ${JSON.stringify(item)}`).join(",\n")}\n  ]`
    }
    return `  ${JSON.stringify(key)}: ${JSON.stringify(v)}`
  })
  return `{\n${entries.join(",\n")}\n}`
}

/**
 * CSS with each rule on one line: a declaration block spread over five
 * indented lines reads the same on one and costs a model less to read.
 * Braces inside a rule (an @container or @media block) keep their nesting.
 */
function oneRulePerLine(css: string): string {
  const flat = css.replace(/\s+/g, " ")
  let out = ""
  let depth = 0
  for (let i = 0; i < flat.length; i++) {
    /* A template value in the CSS ({{ theme.typography.heading }}) is copied as it is, braces and all. */
    if (flat.startsWith("{{", i) || flat.startsWith("{%", i)) {
      const close = flat.indexOf(flat[i + 1] === "{" ? "}}" : "%}", i + 2)
      const end = close < 0 ? flat.length : close + 2
      out += flat.slice(i, end)
      i = end - 1
      continue
    }
    const char = flat[i]
    if (char === "{") {
      depth++
      out = `${out.replace(/ $/, "")} {`
    } else if (char === "}") {
      depth = Math.max(0, depth - 1)
      out = `${out.replace(/ $/, "")} }`
      if (depth === 0) out += "\n"
    } else out += char
  }
  const lines = out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  return `\n${lines.join("\n")}\n`
}

/**
 * A built-in section as the prompt carries it: the same file with its
 * comments out ({# #} in the template, /* *\/ in the CSS), each CSS rule on
 * one line and its schema one entry per line. Nothing else changes: it still
 * compiles (tests/ai-reference.test.ts compiles each one).
 */
export function compactSection(source: string): string {
  let out = source.replace(/\{#[\s\S]*?#\}/g, "").replace(/<!--[\s\S]*?-->/g, "")
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/, (_all, open: string, css: string, close: string) => `${open}${oneRulePerLine(css.replace(/\/\*[\s\S]*?\*\//g, ""))}${close}`)
  out = out.replace(/(<schema>)([\s\S]*?)(<\/schema>)/, (all, open: string, json: string, close: string) => {
    try {
      return `${open}\n${compactJson(JSON.parse(json))}\n${close}`
    } catch {
      return all
    }
  })
  return out
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line, i, lines) => line !== "" || (i > 0 && lines[i - 1] !== ""))
    .join("\n")
    .trim()
}

const COUNT = ["", "ONE", "TWO", "THREE"]

/**
 * THE ONE RULE A BUILT-IN MAY BREAK AND AN AGENT MAY NOT. Most built-in
 * sections fade their buttons' colours on hover and do not turn that off
 * for a visitor who asked for less motion, and the check every agent's
 * section passes (lib/storelib-ai/quality.ts) refuses exactly that. An
 * example that teaches it costs a refused file and a repair round. So the
 * copy in the prompt carries the rule: each selector that transitions or
 * animates is set to none inside prefers-reduced-motion. The prompt says it
 * was added.
 */
export function withReducedMotion(source: string): string {
  const style = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/.exec(source)
  if (!style || /prefers-reduced-motion/.test(style[2])) return source
  const moving = [...style[2].matchAll(/(^|\n)([^{}@\n][^{}]*?)\s*\{[^{}]*\b(transition|animation)\s*:/g)].map((m) => m[2].trim())
  if (moving.length === 0) return source
  const rule = `@media (prefers-reduced-motion: reduce) { ${[...new Set(moving)].join(", ")} { transition: none; animation: none; } }`
  return source.replace(style[0], `${style[1]}${style[2].replace(/\s*$/, "")}\n${rule}\n${style[3]}`)
}

/**
 * AND THE ONE BRANCH A BUILT-IN KEEPS THAT AN AGENT MAY NOT WRITE. The
 * product sections still draw cards typed in the sidebar for a section made
 * before the product pickers existed, so nothing a creator saved changes.
 * The save gate refuses exactly that in an agent's file
 * (lib/storelib-ai/integration.ts, integration-product-typed), so the copy
 * in the prompt goes without it: the marked branch, the typed product block
 * and the "by hand" option. What is left still compiles
 * (tests/ai-reference.test.ts compiles it) and passes the agent's checks.
 */
export function withoutHandFilled(source: string): string {
  if (!source.includes("HAND-FILLED")) return source
  let out = source.replace(/\{% else %\}\{# HAND-FILLED[\s\S]*?\{# END HAND-FILLED #\}/g, "")
  out = out.replace(/(<schema>)([\s\S]*?)(<\/schema>)/, (all, open: string, json: string, close: string) => {
    try {
      const d = JSON.parse(json) as { settings?: { id?: string; options?: { value?: string }[]; info?: string }[]; blocks?: unknown; max_blocks?: unknown }
      for (const st of d.settings ?? []) {
        if (st.id === "source" && Array.isArray(st.options)) {
          st.options = st.options.filter((o) => o.value !== "picked")
          ;(st as { default?: string }).default = "shop"
          delete st.info
        }
      }
      delete d.blocks
      delete d.max_blocks
      return `${open}\n${JSON.stringify(d, null, 2)}\n${close}`
    } catch {
      return all
    }
  })
  return out
}

/** A built-in section exactly as a prompt carries it: no hand-filled branch, no comments, compact, and kind to reduced motion. */
export function promptCopy(source: string): string {
  return withReducedMotion(compactSection(withoutHandFilled(source)))
}

function referenceSections(types: readonly string[]): string {
  const shown = REFERENCE_SECTION_TYPES.filter(({ type }) => types.includes(type))
    .map(({ type, teaches }) => {
      const source = DEFAULT_THEME_SOURCES[`sections/${type}.storelib`]
      if (!source) return ""
      return `sections/${type}.storelib, for ${teaches}:\n${promptCopy(source)}`
    })
    .filter(Boolean)
  return [
    `${COUNT[shown.length] ?? shown.length} OF STORELIB'S OWN SECTIONS, WHOLE (comments taken out; a reduced-motion courtesy is added where one was missing). Read them for the shape: how the root takes the scheme, how the head, the content and the action are laid out and spaced, how blocks${types.includes("product_featured") ? " and products are" : " are"} looped, how the schema is ordered and what the presets arrive with. Never copy their words: write about this creator.`,
    ...shown,
  ].join("\n\n")
}

/** All three reference sections, compacted once per process: the same text on every request. */
export const REFERENCE_SECTIONS = referenceSections(REFERENCE_SECTION_TYPES.map((s) => s.type))

/**
 * FOR WRITING A WHOLE SECTION (Code section, lib/website-builder/agent/
 * write-section.ts): the framework, the checklist and all three sections.
 * The writer's own rules already carry the file format and the integration
 * contract, so they are not repeated here. Stable text, cached.
 */
export function writerReference(): string {
  return [FRAMEWORK_REFERENCE, QUALITY_CHECKLIST, REFERENCE_SECTIONS].join("\n\n")
}

/** The page assistant's two: the native shape, and content in blocks. */
const PAGE_AGENT_SECTIONS = referenceSections(["cta_simple", "faq_accordion"])

/**
 * FOR THE PAGE ASSISTANT (lib/website-builder/agent/loop.ts), which mostly
 * sets controls and fills blocks and sometimes rewrites a section's file:
 * the file format (it had none in its prompt), the framework, the
 * integration contract a rewritten file is held to, the checklist, and two
 * sections rather than three. The product one teaches what the writer
 * needs; this assistant sets a product section's source to the shop. Stable
 * text, cached.
 */
export function pageAgentReference(): string {
  return [CORE_FORMAT, FRAMEWORK_REFERENCE, INTEGRATION_CONTRACT, QUALITY_CHECKLIST, PAGE_AGENT_SECTIONS].join("\n\n")
}
