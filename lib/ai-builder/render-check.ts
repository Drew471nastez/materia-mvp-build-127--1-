/**
 * ===========================================================================
 *  RENDER CHECK: THE PAGE DRAWN ON THE SERVER, READ FOR WHAT IS WRONG
 * ===========================================================================
 * The agent's `render_check` tool (lib/ai-builder/agent-tools.ts). A draft
 * page is drawn with the SAME template interpreter the live site uses
 * (lib/website-builder/storelib-runtime.ts renderStorelibSection): data in,
 * escaped markup out. No section's script runs here, ever: a script is only
 * PARSED (esbuild's parser, which builds a syntax tree and executes nothing)
 * so a syntax error is caught before it reaches a browser. What the page's
 * own sandbox reports at run time arrives separately
 * (lib/ai-builder/preview-errors.ts).
 *
 * Every finding is a ValidationIssue with a code the agent can act on:
 *
 *   render.compile        the file does not compile; the line is given
 *   render.unresolved     `{{ }}` or `{% %}` left in the markup
 *   render.empty          a section that draws no words, no picture, nothing
 *   render.empty_page     a page with no sections at all
 *   render.broken_link    a link to an address this website does not have
 *   render.placeholder    a link to "#", "" or nowhere that is not a hook
 *   render.anchor         a link to #id where nothing on the page has that id
 *   render.dead_button    a <button> with nothing behind it (no hook, no
 *                         form, no script, no control it opens)
 *   binding.empty         a product list or picker that draws empty titles,
 *                         prices or links (bound, but printed from the wrong
 *                         fields)
 *   render.hook_incomplete a panel of the site's own that cannot work (round
 *                         N): a search window with no input or no result
 *                         pattern, a language or currency list with no option
 *                         pattern; a window nothing on the page opens is a
 *                         warning. The patterns themselves (a cart line, a
 *                         search result, a language, a currency) are filled
 *                         in the browser, so a link inside one is not checked
 *                         as a link (lib/website-builder/storefront-hooks.ts).
 *
 * WHAT BLOCKS FINISH (round M). A link that has a job (a call to action: a
 * button-looking link or one whose words ask for something; anything in a
 * <nav> or the site's header/footer; a commerce link) is an ERROR when it is
 * a placeholder, goes to a page that does not exist or to an id that is not
 * on the page: the finish gate sends the agent back to fix it. A decorative
 * link (an ordinary link in running text) with the same problem stays a
 * warning. A script address (javascript:) is always an error. An in-page
 * anchor to an id that exists (#classes, #section-<id>) is fine.
 *   render.overflow       CSS a phone shows sideways (fixed widths, 100vw,
 *                         many columns with no narrow rule)
 *   a11y.img_alt          a picture with no alt
 *   a11y.headings         no h1, two h1, or a heading level skipped
 *   binding.unbound       a commerce or form hook with no id, or an id this
 *                         creator does not have
 *   import.remote         a <script src>, a remote stylesheet or @import
 *   script.syntax         the section's script does not parse
 *   token.undefined       var(--t-name) with no such token and no fallback
 *
 * PURE apart from the optional parser, which is passed in, so the tests drive
 * every rule with a stand in and no database.
 */
import type { ValidationIssue } from "./types"
import type { RuntimeCapabilities } from "./runtime-contract"
import { bindableIds } from "./capabilities"
import { renderStorelibSection, isStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { checkRenderedSection, checkResponsiveStructure } from "@/lib/storelib-ai/structural"
import { customTokenVars } from "@/lib/website-builder/theme-css"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { StorefrontData } from "@/lib/storelib-theme/types"

/** Parses a script and returns its first syntax error, or null. Never runs it. */
export type ScriptParser = (source: string) => Promise<{ message: string; line?: number } | null>

export interface RenderCheckInput {
  /** The page key, for messages. */
  page: string
  /** The page's sections as they will be drawn: header group, body, footer group. */
  sections: SectionInstance[]
  /** Section files by path (the install's saved drafts over the theme's own). */
  sources: Record<string, string>
  theme: ThemeSettingsValues
  /** page.template ("index", "page.about", "product"). */
  template: string
  products?: ProductCard[]
  data?: StorefrontData
  /** What the agent may bind; links and hooks are held to it. Absent: binding rules are skipped. */
  capabilities?: RuntimeCapabilities
  /** Addresses this website answers besides its pages and products (its own blog posts, policies). */
  extraRoutes?: string[]
  parseScript?: ScriptParser
}

export interface RenderCheckResult {
  ok: boolean
  issues: ValidationIssue[]
  htmlBytes: number
  /** Per section, how many bytes it drew; 0 for one that failed. Handy for a progress note. */
  sections: { id: string; type: string; bytes: number }[]
  /**
   * The page as drawn (not in the editor): every section's markup and CSS, for the
   * anti-slop check of what a visitor really reads (round O, lib/ai-builder/slop.ts `rendered`).
   */
  drawn?: { html: string; css: string }
}

/**
 * ===========================================================================
 *  A TEMPLATE IS CHECKED WITH ONE OF THE STORE'S OWN THINGS IN IT
 * ===========================================================================
 * A product template is drawn once per product and a collection template once
 * per collection, so drawn bare it showed nothing: an add to cart with no id,
 * an empty title, every finding about a page nobody will ever see. The check
 * draws it the way the builder's canvas does (storelib-runtime.ts
 * withPageProduct): the store's newest product as `page.product` and as
 * `product` (the same fields the live route hands it), and its first
 * collection as `collection`. Only the check: nothing is stored. A store with
 * no product draws it bare, as before.
 */
const PRODUCT_TEMPLATES = new Set(["product", "page.product"])

export function templateSample(input: Pick<RenderCheckInput, "template" | "products" | "data">): { page: { template: string; [key: string]: unknown }; data: StorefrontData | undefined } {
  const page: { template: string; [key: string]: unknown } = { template: input.template }
  let data = input.data
  if (PRODUCT_TEMPLATES.has(input.template)) {
    const first = input.products?.[0] as (ProductCard & { settings: Record<string, unknown> }) | undefined
    if (first) {
      const s = (first.settings ?? {}) as Record<string, unknown>
      page.product = { ...first, settings: { description: "", ...s } }
      if (!data?.product) {
        const images = Array.isArray(s.images) ? (s.images as unknown[]).filter((x): x is string => typeof x === "string") : typeof s.image === "string" && s.image ? [s.image] : []
        const product = { id: first.id, title: String(s.title ?? ""), price: String(s.price ?? ""), compare_price: String(s.compare_price ?? ""), description: "", description_html: "", image: images[0] ?? "", images, url: String(s.url ?? ""), includes: [], fields: {}, faqs: [], faqs_html: "" }
        data = { ...(data ?? {}), product } as StorefrontData
      }
    }
  }
  if (input.template === "collection" && data && !data.collection) {
    const first = Object.values(data.collections ?? {})[0]
    if (first) data = { ...data, collection: first }
  }
  return { page, data }
}

/** The most findings returned: more than this and the model fixes none of them well. */
export const MAX_RENDER_ISSUES = 40

/** Addresses every Storelib website answers, whatever pages it has (app/(site)/w/[username]). */
const BUILT_IN_ROUTES = [/^\/$/, /^\/products\/?$/, /^\/collections\/?$/, /^\/cart\/?$/, /^\/search\/?$/, /^\/wishlist\/?$/, /^\/account(\/.*)?$/, /^\/blogs(\/.*)?$/, /^\/policies\/[a-z0-9-]+$/, /^\/checkout$/, /^\/password$/, /^\/reviews(\/.*)?$/, /^\/sitemap\.xml$/]
/** Hooks that make a "#" link a real control. */
/* data-line-url and data-result-url: the link inside a cart line or search result pattern, whose href the page writes per line (round N, N4). */
const HOOK_ATTR = /\sdata-storelib-(cart|search|menu|add-to-cart|checkout|cart-close|wishlist|scroll|locale|currency)\b|\sdata-(?:line|result)-url\b|\srole\s*=\s*"button"|\saria-controls\s*=/i
/** Elements copied once per item in the browser: what is inside them is a pattern, filled with real values there. */
const PATTERN_ATTR = /\sdata-storelib-(?:cart-line|search-result|locale-option|currency-option)(?![-\w])/i
/** A class that dresses a link or button as a call to action (btn, button, cta, hero__cta, buy-now...). */
const CTA_CLASS = /(?:^|[\s_-])(?:btn|button|cta|buy|shop|book|order|enrol|enroll|signup|join|checkout|cart)(?:$|[\s_-])/i
/** Words that ask the visitor to do something: a link that says them is a call to action. */
const CTA_WORDS = /^(?:buy|shop|book|order|add to (?:cart|bag|basket)|get (?:started|it|tickets|yours)|start|sign ?up|join|enrol|enroll|subscribe|apply|reserve|register|contact|get in touch|send|download|try|claim|view (?:product|programme|program|plans?|pricing)|see (?:plans?|pricing|programmes|programs)|learn more|find out more|read more)\b/i
/** Attributes that mean a <button> does something without a script of the section's own. The cart line's own buttons (storefront-hooks.ts: data-line-inc, -dec, -remove) are wired by the page too. */
const BUTTON_WIRED = /\sdata-storelib-[a-z-]+|\sdata-line-(?:inc|dec|remove)\b|\saria-(?:controls|expanded|haspopup)\s*=|\spopovertarget\s*=|\scommandfor\s*=|\sform\s*=|\stype\s*=\s*"?(?:submit|reset)\b|\sdisabled\b|\sonclick\s*=/i

/** Where the element at `index` sits inside an element named `tag` (by position in the markup). */
function insideTag(html: string, tag: string, index: number): boolean {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi")
  let depth = 0
  for (const m of html.matchAll(re)) {
    if ((m.index ?? 0) >= index) break
    depth += m[1] ? -1 : 1
    if (depth < 0) depth = 0
  }
  return depth > 0
}

/**
 * Where the runtime patterns are in the markup ([start, end) by index): an
 * element marked data-storelib-cart-line, -search-result, -locale-option or
 * -currency-option, to its closing tag.
 */
export function patternRanges(html: string): [number, number][] {
  const out: [number, number][] = []
  for (const m of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    if (!PATTERN_ATTR.test(m[0])) continue
    const start = m.index ?? 0
    const name = m[1].toLowerCase()
    if (/\/>$/.test(m[0]) || ["img", "input", "br", "hr", "source"].includes(name)) { out.push([start, start + m[0].length]); continue }
    const re = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi")
    re.lastIndex = start + m[0].length
    let depth = 1
    let end = html.length
    for (let t = re.exec(html); t; t = re.exec(html)) {
      depth += t[1] ? -1 : 1
      if (depth === 0) { end = t.index + t[0].length; break }
    }
    out.push([start, end])
  }
  return out
}

/** Panels of the site's own that cannot work (render.hook_incomplete). Pure, per section; `pageHtml` is the whole page, for openers. */
export function hookProblems(html: string, pageHtml: string): { severity: "error" | "warning"; message: string }[] {
  const out: { severity: "error" | "warning"; message: string }[] = []
  const has = (h: string, name: string) => new RegExp(`\\s${name}(?=[\\s=>/])`, "i").test(h)
  if (has(html, "data-storelib-search-panel")) {
    if (!/<input\b[^>]*\sdata-storelib-search-input(?=[\s=>/])/i.test(html)) out.push({ severity: "error", message: "The search window (data-storelib-search-panel) has no <input data-storelib-search-input>: nothing can be typed into it." })
    if (!has(html, "data-storelib-search-results")) out.push({ severity: "error", message: "The search window has no data-storelib-search-results list: what is found has nowhere to go." })
    else if (!has(html, "data-storelib-search-result")) out.push({ severity: "error", message: "The search results list holds no element marked data-storelib-search-result (hidden), the pattern copied once per result." })
    else if (!/<a\b[^>]*\sdata-result-url(?=[\s=>/])/i.test(html)) out.push({ severity: "warning", message: "The search result pattern has no <a data-result-url>: a visitor cannot open what they found." })
    if (!has(html, "data-storelib-search-close")) out.push({ severity: "warning", message: "The search window has no data-storelib-search-close button. Escape shuts it, but a phone has no Escape key." })
    if (!has(pageHtml, "data-storelib-search")) out.push({ severity: "warning", message: "Nothing on the page opens the search window: give a button data-storelib-search." })
  }
  if (has(html, "data-storelib-locale-list") && !has(html, "data-storelib-locale-option")) out.push({ severity: "error", message: "The language list (data-storelib-locale-list) holds no element marked data-storelib-locale-option, the pattern copied once per language." })
  if (has(html, "data-storelib-currency-list") && !has(html, "data-storelib-currency-option")) out.push({ severity: "error", message: "The currency list (data-storelib-currency-list) holds no element marked data-storelib-currency-option, the pattern copied once per currency." })
  return out
}

function classOf(tag: string): string {
  return tag.match(/\sclass\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\sclass\s*=\s*'([^']*)'/i)?.[1] ?? ""
}

/** Every <a> with its opening tag, its href (null when it has none), its words and its place in the markup. */
function anchors(html: string): { tag: string; href: string | null; text: string; index: number }[] {
  const out: { tag: string; href: string | null; text: string; index: number }[] = []
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)(?:<\/a>|(?=<a\b))/gi)) {
    const tag = `<a${m[1]}>`
    const h = m[1].match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    out.push({ tag, href: h ? (h[1] ?? h[2] ?? h[3] ?? "").trim() : null, text: textOf(m[2] ?? ""), index: m.index ?? 0 })
  }
  return out
}

/**
 * What a link is for. "nav": in a <nav> or the site's header/footer. "cta": dressed or worded as a call to
 * action, or a commerce link. "text": an ordinary link. Only "text" links get away with a warning.
 */
export function linkRole(a: { tag: string; text: string; index: number }, html: string, chrome: boolean): "nav" | "cta" | "text" {
  if (chrome || insideTag(html, "nav", a.index)) return "nav"
  if (CTA_CLASS.test(classOf(a.tag)) || /\sdata-storelib-[a-z-]+/i.test(a.tag) || CTA_WORDS.test(a.text.trim())) return "cta"
  return "text"
}

const textOf = (html: string) =>
  html
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim()

function attrValues(html: string, attr: string): { value: string; tag: string }[] {
  const re = new RegExp(`<[a-z][^>]*\\s${attr}(?:\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+)))?[^>]*>`, "gi")
  return [...html.matchAll(re)].map((m) => ({ value: (m[2] ?? m[3] ?? m[4] ?? "").trim(), tag: m[0] }))
}

function decodeHref(v: string): string {
  return v.replace(/&amp;/g, "&").replace(/&#x2F;|&#47;/gi, "/").trim()
}

/** Where a link goes, as the website would answer it; null when it is fine. */
export function linkProblem(
  href: string,
  known: { pages: Set<string>; productSlugs: Set<string>; collectionHandles: Set<string>; communitySlugs: Set<string>; forms: Set<string>; products: Set<string>; extra: Set<string> } | null,
): { code: "render.broken_link" | "render.placeholder" | "render.anchor" | "import.remote"; detail: string } | null {
  const h = decodeHref(href)
  if (h === "" || h === "#") return { code: "render.placeholder", detail: h || "(empty)" }
  if (/^\s*(javascript|vbscript|data):/i.test(h)) return { code: "render.broken_link", detail: "a script address" }
  if (/^(https?:)?\/\//i.test(h) || /^(mailto|tel|sms):/i.test(h)) return null
  if (h.startsWith("#")) return { code: "render.anchor", detail: h }
  if (!h.startsWith("/") || !known) return null
  const [pathPart, query = ""] = h.split("#")[0].split("?")
  /* A language prefix (/fr/about) is the same page in another language. */
  const path = pathPart.replace(/\/+$/, "") || "/"
  if (BUILT_IN_ROUTES.some((r) => r.test(path))) {
    if (path === "/checkout") {
      const id = new URLSearchParams(query).get("productId") ?? ""
      if (!id || !known.products.has(id)) return { code: "render.broken_link", detail: `${h} (not one of this store's products)` }
    }
    return null
  }
  if (known.extra.has(path)) return null
  const m = path.match(/^\/([a-z0-9-]+)$/i)
  if (m && known.pages.has(m[1])) return null
  const product = path.match(/^\/products\/([^/]+)$/)
  if (product) return known.productSlugs.has(decodeURIComponent(product[1])) ? null : { code: "render.broken_link", detail: `${path} (no such product)` }
  const collection = path.match(/^\/collections\/([^/]+)$/)
  if (collection) return known.collectionHandles.has(decodeURIComponent(collection[1]).toLowerCase()) ? null : { code: "render.broken_link", detail: `${path} (no such collection)` }
  const community = path.match(/^\/community\/([^/]+)/)
  if (community) return known.communitySlugs.has(community[1].toLowerCase()) ? null : { code: "render.broken_link", detail: `${path} (no such community)` }
  const form = path.match(/^\/request\/forms\/([^/]+)$/)
  if (form) return known.forms.has(form[1].toLowerCase()) ? null : { code: "render.broken_link", detail: `${path} (not one of this store's forms)` }
  /* A language prefix in front of a page that exists. */
  const lang = path.match(/^\/[a-z]{2}(?:-[a-z]{2})?(\/.*)$/i)
  if (lang) return linkProblem(lang[1], known)
  return { code: "render.broken_link", detail: `${path} (this website has no such page)` }
}

/** CSS a phone shows sideways, beyond what structural.ts already finds. */
export function overflowProne(css: string): string[] {
  const out: string[] = []
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, " ")
  if (/(?:^|[;{\s])(?:min-)?width\s*:\s*100vw\b/i.test(plain)) out.push('"width: 100vw" is wider than the page whenever there is a scrollbar. Use width: 100%.')
  const big = [...plain.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((m) => Number(m[1])).find((n) => n >= 96)
  if (big) out.push(`font-size: ${big}px with no clamp() does not fit a phone. Use clamp(…, …vw, ${big}px).`)
  if (/white-space\s*:\s*nowrap/i.test(plain) && !/overflow(?:-x)?\s*:\s*(hidden|auto|clip|scroll)/i.test(plain) && !/text-overflow/i.test(plain)) out.push('"white-space: nowrap" with nothing to clip it pushes a long line past the screen. Add overflow: hidden and text-overflow: ellipsis, or let it wrap.')
  return out
}

/** var(--t-name) with no fallback, where the theme has no such token. */
function missingTokens(css: string, theme: Record<string, unknown>): string[] {
  const have = new Set(Object.keys(customTokenVars(theme)))
  const missing = new Set<string>()
  for (const m of css.matchAll(/var\(\s*(--t-[a-z0-9-]+)\s*(,)?/gi)) {
    if (!m[2] && !have.has(m[1].toLowerCase())) missing.add(m[1].toLowerCase())
  }
  return [...missing]
}

function knownFrom(input: RenderCheckInput) {
  const caps = input.capabilities
  if (!caps) return null
  const ids = bindableIds(caps)
  const slugOf = (url: string) => (url.match(/^\/products\/([^/?#]+)/)?.[1] ?? "")
  return {
    pages: ids.pages,
    products: ids.products,
    productSlugs: new Set([...caps.products.map((p) => slugOf(p.url)), ...(input.products ?? []).map((p) => p.settings.slug)].filter(Boolean)),
    collectionHandles: new Set(caps.collections.map((c) => (c.url.match(/^\/collections\/([^/?#]+)/)?.[1] ?? "").toLowerCase()).filter(Boolean)),
    communitySlugs: new Set(caps.communities.map((c) => (c.url.match(/^\/community\/([^/?#]+)/)?.[1] ?? "").toLowerCase()).filter(Boolean)),
    forms: ids.forms,
    extra: new Set((input.extraRoutes ?? []).map((r) => r.replace(/\/+$/, "") || "/")),
    ids,
  }
}

/** Whether a section (or one of its blocks) has a setting naming one of this store's products. */
function boundToProducts(section: SectionInstance, products: Set<string>): boolean {
  const names = (v: unknown): boolean => (typeof v === "string" ? products.has(v) : Array.isArray(v) ? v.some(names) : false)
  if (Object.values(section.settings ?? {}).some(names)) return true
  return (section.blocks ?? []).some((b) => Object.values(b.settings ?? {}).some(names))
}

export async function renderCheck(input: RenderCheckInput): Promise<RenderCheckResult> {
  const issues: ValidationIssue[] = []
  const push = (i: ValidationIssue) => {
    if (issues.length < MAX_RENDER_ISSUES && !issues.some((x) => x.code === i.code && x.sectionId === i.sectionId && x.message === i.message)) issues.push(i)
  }
  const visible = input.sections.filter((s) => !s.hidden)
  if (visible.length === 0) push({ severity: "error", code: "render.empty_page", message: `The page "${input.page}" has no sections. Add at least one.` })
  const known = knownFrom(input)
  /* A template is drawn with a real one of the store's own (round N, N3): see templateSample. */
  const sample = templateSample(input)
  const page = sample.page
  input = { ...input, data: sample.data }
  const theme = input.theme as unknown as Record<string, unknown>
  const drawn: { section: SectionInstance; html: string; css: string; script: string | null }[] = []
  const perSection: RenderCheckResult["sections"] = []
  let htmlBytes = 0

  for (const section of visible) {
    const path = `sections/${section.type}.storelib`
    if (!isStorelibSection(section.type, input.sources)) {
      /* A built-in React section: drawn by the page, not by the engine. Nothing to read here. */
      perSection.push({ id: section.id, type: section.type, bytes: 0 })
      continue
    }
    const out = renderStorelibSection(section, input.theme, page, input.sources, input.products, input.data)
    if (out.ok === false) {
      for (const e of out.errors.slice(0, 3)) push({ severity: "error", code: "render.compile", message: e.message, path: e.file ?? path, ...(e.line ? { line: e.line } : {}), sectionId: section.id })
      perSection.push({ id: section.id, type: section.type, bytes: 0 })
      continue
    }
    htmlBytes += out.html.length + out.css.length
    perSection.push({ id: section.id, type: section.type, bytes: out.html.length })
    drawn.push({ section, html: out.html, css: out.css, script: out.script ?? null })
  }

  const pageHtml = drawn.map((d) => d.html).join("\n")
  const ids = new Set([...pageHtml.matchAll(/\sid\s*=\s*"([^"]+)"/gi)].map((m) => m[1]))
  /* Every section is reachable as #section-<key> too (lib/website-builder/section-anchors). */
  for (const s of visible) ids.add(`section-${s.id}`)

  const headings: { level: number; sectionId: string }[] = []
  for (const { section, html, css, script } of drawn) {
    const sid = section.id
    const path = `sections/${section.type}.storelib`
    const at = { path, sectionId: sid }
    const text = textOf(html)

    if (/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/.test(html)) push({ severity: "error", code: "render.unresolved", message: "Template tags are printed as text in the drawn markup. A tag inside an attribute or a string is not evaluated; check quotes and filters.", ...at })
    const hasMedia = /<(img|video|iframe|svg|picture|canvas)\b/i.test(html) || /\sdata-storelib-(native-form|offers|island)\b/i.test(html) || /background(-image)?\s*:[^;]*url\(/i.test(html + css)
    if (!text && !hasMedia) push({ severity: "warning", code: "render.empty", message: "The section draws nothing a visitor can see with its current settings. Give its settings defaults, or remove it.", ...at })

    for (const f of checkRenderedSection({ html, css, theme })) {
      if (f.id === "render-image-alt") push({ severity: "warning", code: "a11y.img_alt", message: f.message, ...at })
      else if (f.id === "render-inline-width") push({ severity: "warning", code: "render.overflow", message: f.message, ...at })
    }
    for (const f of checkResponsiveStructure(css)) push({ severity: f.severity === "error" ? "error" : "warning", code: "render.overflow", message: f.message, ...at })
    for (const m of overflowProne(css)) push({ severity: "warning", code: "render.overflow", message: m, ...at })
    for (const t of missingTokens(css + html, theme)) push({ severity: "warning", code: "token.undefined", message: `var(${t}) is used with no fallback and the site has no such token. Set it with set_tokens, or write var(${t}, <value>).`, ...at })

    for (const m of html.matchAll(/<h([1-6])\b/gi)) headings.push({ level: Number(m[1]), sectionId: sid })

    /* Links: a broken one with a job blocks finish; a decorative one is a warning (see the head of this file). */
    const chrome = section.group === "header" || section.group === "footer" || section.type === "header" || section.type === "footer"
    const patterns = patternRanges(html)
    for (const a of anchors(html)) {
      /* Inside a pattern the browser fills (a cart line, a search result, a language): its link is written there. */
      if (patterns.some(([from, to]) => a.index >= from && a.index < to)) continue
      const role = linkRole(a, html, chrome)
      const job = role !== "text"
      const what = role === "nav" ? "A menu link" : role === "cta" ? `The call to action "${a.text.slice(0, 40) || "(no words)"}"` : "A link"
      if (a.href === null) {
        if (job && !HOOK_ATTR.test(a.tag)) push({ severity: "error", code: "render.placeholder", message: `${what} has no href: it goes nowhere. Give it a url setting with a real default (a page, a product's url, a form's page) and print it with | url, or hide it with {% if %} while it is empty.`, ...at })
        continue
      }
      const problem = linkProblem(a.href, known)
      if (!problem) continue
      if (problem.code === "render.placeholder" && HOOK_ATTR.test(a.tag)) continue
      if (problem.code === "render.anchor") {
        if (ids.has(problem.detail.slice(1))) continue
        push({ severity: job ? "error" : "warning", code: "render.anchor", message: `${what} goes to ${problem.detail}, and nothing on this page has that id. Give the target section that id, or link to a page.`, ...at })
        continue
      }
      if (problem.code === "render.placeholder") {
        push({ severity: job ? "error" : "warning", code: "render.placeholder", message: `${what} goes nowhere (${problem.detail}). ${job ? "A link with a job needs a real destination: " : "Point it at "}a page from list_capabilities, a product's url, or a url setting with a real default; hide it with {% if %} while its setting is empty.`, ...at })
      } else if (/script address/.test(problem.detail)) {
        push({ severity: "error", code: "render.broken_link", message: `${what} is a script address (javascript:). Links go to pages; behaviour goes in the section's <script> or a data-storelib hook.`, ...at })
      } else {
        push({ severity: job ? "error" : "warning", code: "render.broken_link", message: `${what} goes to ${problem.detail}. Use one of list_capabilities' pages, products or collections.`, ...at })
      }
    }

    /* Buttons with nothing behind them: no hook, no form, no control they open, and the section has no script to wire them. */
    if (!script) {
      for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
        const tag = m[1]
        if (BUTTON_WIRED.test(tag) || insideTag(html, "form", m.index ?? 0)) continue
        push({ severity: "error", code: "render.dead_button", message: `The button "${textOf(m[2] ?? "").slice(0, 40) || "(no words)"}" does nothing: it has no data-storelib hook, no form and no script. Make it a link to a real page, or give it its hook (add to cart, cart, menu, checkout).`, ...at })
      }
    }

    /* Panels of the site's own (round N): a search window, a language or currency list that cannot work. */
    for (const p of hookProblems(html, pageHtml)) push({ severity: p.severity, code: "render.hook_incomplete", message: p.message, ...at })

    /* A bound list printed from the wrong fields draws empty titles, prices and links (round M). */
    if (known && boundToProducts(section, known.ids.products)) {
      const emptyHeadings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].filter((m) => !textOf(m[2]) && !/<(img|svg|picture)\b/i.test(m[2])).length
      const emptyPrices = [...html.matchAll(/<([a-z0-9]+)\b[^>]*\sclass\s*=\s*"[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi)].filter((m) => !textOf(m[2])).length
      const emptyData = [...html.matchAll(/\sdata-(title|price)\s*=\s*""/gi)].length
      if (emptyHeadings || emptyPrices || emptyData) {
        push({ severity: "error", code: "binding.empty", message: `This section is bound to products but draws ${[emptyHeadings ? `${emptyHeadings} empty heading${emptyHeadings === 1 ? "" : "s"}` : "", emptyPrices ? `${emptyPrices} empty price${emptyPrices === 1 ? "" : "s"}` : "", emptyData ? `${emptyData} empty data-title/data-price` : ""].filter(Boolean).join(", ")}. A product_list loop gives blocks: print {{ block.settings.title }}, {{ block.settings.price }}, {{ block.settings.url }} and {{ block.id }}; a product_picker gives settings.<id>.title, .price, .url.`, ...at })
      }
    }

    /* Remote code. The engine refuses most of this at compile; this is the belt to that. */
    if (/<script\b[^>]*\ssrc\s*=/i.test(html)) push({ severity: "error", code: "import.remote", message: "A <script src> is in the markup. A section loads no outside script; behaviour goes in its own <script>.", ...at })
    if (/<link\b[^>]*rel\s*=\s*"?stylesheet/i.test(html) || /@import\b/i.test(css)) push({ severity: "error", code: "import.remote", message: "A remote stylesheet or @import is in the section. Fonts come from a font_picker setting or Theme settings; styles stay in <style scoped>.", ...at })
    if (/url\(\s*['"]?https?:\/\/(?!fonts\.(?:gstatic|googleapis)\.com)/i.test(css)) push({ severity: "warning", code: "import.remote", message: "The CSS loads a picture from another website. Use an image_picker setting so it comes from the creator's media.", ...at })

    /* An add to cart that names nothing is broken whatever data there is. */
    if (!known) {
      for (const { value } of attrValues(html, "data-storelib-add-to-cart")) {
        if (!value) push({ severity: "error", code: "binding.unbound", message: "An add to cart button names no product. Print the product's id from a product_picker or product_list setting: data-storelib-add-to-cart=\"{{ block.id }}\".", ...at })
      }
    }
    /* Hooks the page acts on, held to this creator's ids. */
    if (known) {
      for (const { value } of attrValues(html, "data-storelib-add-to-cart")) {
        if (!value) push({ severity: "error", code: "binding.unbound", message: "An add to cart button names no product. Print the product's id from a product_picker or product_list setting: data-storelib-add-to-cart=\"{{ block.id }}\".", ...at })
        else if (!known.ids.products.has(value)) push({ severity: "error", code: "binding.unbound", message: `An add to cart button names ${value}, which is not one of this store's published products.`, ...at })
      }
      for (const { value } of attrValues(html, "data-variant-id")) {
        if (value && !known.ids.variants.has(value)) push({ severity: "warning", code: "binding.unbound", message: `A button names option ${value}, which is not an option of this store's products.`, ...at })
      }
      for (const { value } of attrValues(html, "data-storelib-native-form")) {
        if (!value) push({ severity: "error", code: "binding.unbound", message: "A form mark names no form. Bind a form_picker setting and print settings.form.id.", ...at })
        else if (!known.ids.forms.has(value.toLowerCase())) push({ severity: "error", code: "binding.unbound", message: `A form mark names ${value}, which is not one of this store's published forms.`, ...at })
      }
      for (const { value } of attrValues(html, "data-storelib-offers")) {
        if (!value || !known.ids.products.has(value)) push({ severity: "error", code: "binding.unbound", message: `An offers mark names ${value || "no product"}, which is not one of this store's published products.`, ...at })
      }
    }
    if (/\sdata-storelib-checkout\b/i.test(html) && !/\sdata-storelib-(add-to-cart|cart)\b/i.test(pageHtml)) {
      push({ severity: "warning", code: "binding.unbound", message: "A checkout button is on a page with no add to cart and no cart: it opens an empty checkout. For one product, link its checkout_url (Buy now) instead.", ...at })
    }

    /* The script, parsed and never run. */
    if (script && input.parseScript) {
      const bad = await input.parseScript(script).catch(() => null)
      if (bad) push({ severity: "error", code: "script.syntax", message: `The section's script does not parse${bad.line ? ` (line ${bad.line} of the script)` : ""}: ${bad.message}`, ...at })
    }
  }

  /* Headings, across the page in order. */
  const h1 = headings.filter((h) => h.level === 1)
  if (drawn.length && h1.length === 0) push({ severity: "warning", code: "a11y.headings", message: `The page "${input.page}" has no h1. The main heading of its first section should be the one h1.` })
  if (h1.length > 1) push({ severity: "warning", code: "a11y.headings", message: `The page "${input.page}" has ${h1.length} h1 headings. Keep one; make the others h2.`, sectionId: h1[1].sectionId })
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      push({ severity: "warning", code: "a11y.headings", message: `A heading jumps from h${headings[i - 1].level} to h${headings[i].level}. Use the next level down.`, sectionId: headings[i].sectionId })
      break
    }
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues, htmlBytes, sections: perSection, drawn: { html: pageHtml, css: drawn.map((d) => d.css).join("\n") } }
}

/**
 * A ScriptParser built on esbuild's parser. It is handed the compiled bundle
 * (lib/storelib-theme/storelib/script.ts: `"use strict"`, then the script as
 * the body of a function over the context names, two lines in) and
 * TRANSFORMS it, which parses and prints, nothing more. The line it reports
 * is the line of the script itself. Null when esbuild cannot be loaded here.
 */
export async function esbuildScriptParser(): Promise<ScriptParser | null> {
  try {
    const esbuild = (await import("esbuild")) as { transform: (code: string, opts: Record<string, unknown>) => Promise<unknown> }
    return async (source) => {
      try {
        await esbuild.transform(source, { loader: "js", logLevel: "silent" })
        return null
      } catch (e) {
        const first = (e as { errors?: { text?: string; location?: { line?: number } }[] }).errors?.[0]
        const wrapped = source.startsWith('"use strict";\n(function') ? 2 : 0
        return { message: String(first?.text ?? "syntax error").slice(0, 200), line: first?.location?.line ? Math.max(1, first.location.line - wrapped) : undefined }
      }
    }
  } catch {
    return null
  }
}
