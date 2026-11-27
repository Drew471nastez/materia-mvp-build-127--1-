/**
 * ===========================================================================
 *  THE WHOLE SITE: EVERY PAGE AND EVERY TEMPLATE, PLANNED AND THEN CHECKED
 * ===========================================================================
 * Round N (N3). A new website used to be "home and a page or two": the
 * product page, the shop, the collection page, search, the cart and the 404
 * page were whatever the platform generated, so a visitor who clicked a
 * product left the AI's design for a stock layout. Here the templates are
 * pages the agent designs like any other:
 *
 *   PLAN    report_progress phase "plan" carries `pages`: every page and
 *           every template with the sections it will hold (or a reason it
 *           has fewer). readSitePlan checks it; a new website's writes wait
 *           for it, as they wait for the concept.
 *
 *   BUILD   list_pages lists the templates even before they are stored;
 *           set_page_sections places components on them (the row is made on
 *           the first placement). A product template's components read the
 *           product (`product.*`, `page.product.settings.variants`), a
 *           collection's read `products` and `collection`.
 *
 *   FINISH  completenessIssues: home has at least MIN_HOME_SECTIONS of the
 *           AI's own sections, every other page at least MIN_PAGE_SECTIONS
 *           or a reason in the plan, the product and collection templates
 *           designed, every template the plan gave sections to designed,
 *           the header and footer the site's own (free mode), every page
 *           reachable from the header or footer. Finish refuses with the
 *           exact list; the repair budget (maxVerifyCycles) still bounds it,
 *           and a budget hit ends the job partial, saying what is missing.
 *
 * WHAT A VISITOR SEES ON A TEMPLATE NOBODY DESIGNED YET: the platform's
 * functional section (the product with its buy button, the product grid,
 * search, the 404 line) drawn in the site's OWN tokens and inside the site's
 * own header and footer (universal chrome), never Foundation's preset
 * settings or sections: a free start stores no template rows at all
 * (create-website.ts). It is a working fallback, not a design, which is why
 * finish insists on the two a shop cannot do without.
 *
 * Pure: everything it reads is handed to it.
 */
import { pagePath, isPageKey, RESERVED_PAGE_KEYS } from "@/lib/website-builder/site-pages"
import { POLICY_PAGE_KEYS } from "@/lib/website-builder/policy-pages"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { drawsTheProduct } from "@/lib/website-builder/storelib-runtime"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { RuntimeCapabilities } from "../runtime-contract"
import { isAiComponentType, type GenerationMode, type ValidationIssue } from "../types"
import { isMateriaType } from "@/lib/storelib-ai/materia/catalogue"
/* Round O (O5): the site story per business and the generic-skeleton check (lib/storelib-ai/layout). */
import { layoutStoryFor, planSkeletonIssue, type StoryBrief } from "@/lib/storelib-ai/layout"

/** The AI's own sections a home page needs, header and footer not counted. */
export const MIN_HOME_SECTIONS = 10
/** Of those, at least this many different components: ten copies of one strip is not a home page. */
export const MIN_HOME_DISTINCT = 6
/** Every other main page, unless the plan says why it has fewer. */
export const MIN_PAGE_SECTIONS = 6
/** A reason is a sentence, not a word. */
const MIN_REASON = 12

/**
 * The templates the agent may design: stored under these page keys and drawn
 * by the live routes (/products/<slug>, /collections/<handle>, /products,
 * /cart, /search, any missing address, /contact, /blogs/<handle>,
 * /blogs/<handle>/<post>).
 */
export interface TemplateInfo {
  key: string
  title: string
  /** Where a visitor meets it. */
  url: string
  /** What its sections can read besides their settings. */
  reads: string
  /** Whether finish insists on it being designed (when the store sells): product, collection, the shop and search. */
  required: boolean
}

const TEMPLATES: TemplateInfo[] = [
  { key: "product", title: "Product page", url: "/products/<slug>", required: true, reads: "product.id, product.title, product.price, product.compare_price, product.description_html (| raw), product.images, product.url; page.product.settings.variants (id, name, price, available, checkout_url), page.product.settings.checkout_url, page.product.settings.available. Text settings may default to {{ product.title }}." },
  { key: "collection", title: "Collection page", url: "/collections/<handle>", required: true, reads: "collection.title, collection.description, collection.image, collection.url; products (this collection's products, each with .id and .settings.title, .settings.price, .settings.url, .settings.image, .settings.checkout_url); page.pagination" },
  { key: "products", title: "Shop (all products)", url: "/products", required: true, reads: "products (every product, same fields as on the collection page); page.filters, page.pagination" },
  { key: "search", title: "Search results", url: "/search", required: true, reads: "page.query (what was searched), products (the results)" },
  { key: "cart", title: "Cart page", url: "/cart", required: false, reads: "your sections are drawn under the cart itself (the lines, totals and checkout are the platform's, in your tokens); use them for reassurance, delivery notes, suggestions" },
  { key: "404", title: "Page not found", url: "(any missing address)", required: false, reads: "nothing special: say the page is not here and offer a way on" },
  { key: "contact", title: "Contact", url: "/contact", required: false, reads: "a published form through a form_picker, or links (mailto:, tel:, social)" },
  { key: "blogs", title: "Blog (list of posts)", url: "/blogs/<handle>", required: false, reads: "blog.title, blog.description, {% for article in blog.articles %} (article.title, .url, .excerpt, .image, .image_alt)" },
  { key: "article", title: "Blog post", url: "/blogs/<handle>/<post>", required: false, reads: "article.title, article.content | raw, article.image, article.image_alt, article.related, article.previous, article.next, blog.title" },
]

const TEMPLATE_KEYS = new Set(TEMPLATES.map((t) => t.key))

export function isTemplateKey(key: string): boolean {
  return TEMPLATE_KEYS.has(key)
}

/** Whether the store sells: then the product and collection templates must be designed. */
export function storeSells(caps: RuntimeCapabilities | null): boolean {
  return (caps?.products?.length ?? 0) > 0
}

function hasBlog(caps: RuntimeCapabilities | null): boolean {
  return (caps?.blog?.posts ?? 0) > 0 || (caps?.features ?? []).includes("blog")
}

/** The templates this site has: the blog's two only with a blog, and product and collection required only when the store sells. */
export function templatesFor(caps: RuntimeCapabilities | null): TemplateInfo[] {
  const sells = storeSells(caps)
  return TEMPLATES.filter((t) => hasBlog(caps) || (t.key !== "blogs" && t.key !== "article")).map((t) => ({ ...t, required: t.required && sells }))
}

/** A main page: one a visitor navigates to, that is not home, a template or a policy page. */
export function isMainPage(key: string): boolean {
  return key !== "home" && !isTemplateKey(key) && !POLICY_PAGE_KEYS.includes(key) && !RESERVED_PAGE_KEYS.has(key)
}

/* ── the plan ─────────────────────────────────────────────────────────── */

export interface SitePlanPage {
  key: string
  /** One short line per section, in order: what it is for ("ai_hero: the promise and the first program"). */
  sections: string[]
  /** Why a page has fewer sections than the rule (or a template none). */
  reason?: string
}

export interface SitePlan {
  pages: SitePlanPage[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

/**
 * The plan as given, or every problem with it. Pure.
 *
 * With `brief` (the creator's words and category), a home page planned as the
 * generic Hero, Features, Pricing, FAQ, CTA skeleton is refused for a business
 * that is not software, with the business's own site story as the way forward
 * (round O, O5, lib/storelib-ai/layout/stories.ts planSkeletonIssue).
 */
export function readSitePlan(raw: unknown, caps: RuntimeCapabilities | null, brief?: StoryBrief | null): { ok: true; plan: SitePlan } | { ok: false; missing: string[] } {
  if (!Array.isArray(raw)) return { ok: false, missing: ["pages: a list of every page and template, each { key, sections: [one line per section], reason? }"] }
  const missing: string[] = []
  const pages: SitePlanPage[] = []
  const seen = new Set<string>()
  for (const [i, p] of raw.slice(0, 40).entries()) {
    if (!isObj(p) || typeof p.key !== "string") {
      missing.push(`pages[${i}]: needs a key`)
      continue
    }
    const key = p.key.trim().toLowerCase()
    if (key !== "home" && !isTemplateKey(key) && (!isPageKey(key) || RESERVED_PAGE_KEYS.has(key))) {
      missing.push(`pages[${i}]: "${key}" is not a page key (lowercase letters, digits, dashes) or a template (${TEMPLATES.map((t) => t.key).join(", ")})`)
      continue
    }
    if (seen.has(key)) {
      missing.push(`pages: "${key}" is listed twice`)
      continue
    }
    seen.add(key)
    const sections = Array.isArray(p.sections) ? p.sections.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim().slice(0, 160)).slice(0, 30) : []
    const reason = typeof p.reason === "string" && p.reason.trim().length >= MIN_REASON ? p.reason.trim().slice(0, 300) : undefined
    pages.push({ key, sections, ...(reason ? { reason } : {}) })
  }
  const byKey = new Map(pages.map((p) => [p.key, p]))
  const home = byKey.get("home")
  if (!home) missing.push(`home: list it with its sections (at least ${MIN_HOME_SECTIONS} of your own, header and footer not counted)`)
  else if (home.sections.length < MIN_HOME_SECTIONS) missing.push(`home: ${home.sections.length} section${home.sections.length === 1 ? "" : "s"} planned; a home page has at least ${MIN_HOME_SECTIONS} of your own (header and footer not counted)`)
  if (home && brief) {
    const generic = planSkeletonIssue(home.sections, brief)
    if (generic) missing.push(generic)
  }
  for (const t of templatesFor(caps)) {
    const entry = byKey.get(t.key)
    if (!entry) missing.push(`${t.key} (${t.title}, ${t.url}): list it with its sections${t.required ? "" : ", or a reason it keeps the platform's working layout"}`)
    else if (!entry.sections.length && (t.required || !entry.reason)) missing.push(`${t.key} (${t.title}): ${t.required ? "the store sells, so plan its sections" : "plan its sections or give a reason"}`)
  }
  for (const p of pages) {
    if (p.key === "home" || isTemplateKey(p.key)) continue
    if (p.sections.length < MIN_PAGE_SECTIONS && !p.reason) missing.push(`${p.key}: ${p.sections.length} section${p.sections.length === 1 ? "" : "s"} planned; a page has at least ${MIN_PAGE_SECTIONS}, or say why it needs fewer in reason`)
  }
  if (missing.length) return { ok: false, missing }
  return { ok: true, plan: { pages } }
}

/** The site story the plan is checked against, for the plan's notes and the brief (round O, O5). */
export function sitePlanStory(brief: StoryBrief): string {
  return layoutStoryFor(brief).text
}

/** The plan as lines for the model and the progress view. */
export function describeSitePlan(plan: SitePlan): string {
  return plan.pages.map((p) => `${p.key}: ${p.sections.length ? p.sections.join(" | ") : `(none: ${p.reason ?? ""})`}`).join("\n")
}

/* ── finish: is the whole site there ──────────────────────────────────── */

export interface CompletenessInput {
  pages: { key: string; sections: SectionInstance[] }[]
  sources: Record<string, string>
  settings: Record<string, unknown>
  caps: RuntimeCapabilities | null
  mode: GenerationMode
  plan: SitePlan | null
  /**
   * Round 26: the website is one of Storelib's templates on Materia (Start with AI from a template). Its Materia
   * sections count as the site's own; its product, collection, shop and search pages are the template's (they draw
   * the store's real products); its pages are reached through the store's menus (/pages/<key>), not settings.menus.
   */
  materia?: boolean
  /**
   * Round 69: from scratch on Materia. The free bar (its own header and footer, every page reachable, its own
   * templates) with Materia's sections counting as the site's own on its pages.
   */
  placesMateria?: boolean
}

const CHROME = new Set(["header", "footer", "overlay"])
const body = (sections: SectionInstance[]) => sections.filter((s) => !s.hidden && !CHROME.has(String(s.group ?? "")) && s.type !== "header" && s.type !== "footer")

function templateOf(type: string, sources: Record<string, string>): string {
  const text = sources[`sections/${type}.storelib`] ?? ""
  return /<template>([\s\S]*?)<\/template>/.exec(text)?.[1] ?? ""
}

/** A section of a collection or shop template that lists the real products. */
export function listsProducts(type: string, sources: Record<string, string>): boolean {
  return /\{%-?\s*for\s+\w+\s+in\s+(?:products|collection\.products)\b/.test(templateOf(type, sources))
}

/** Every internal address the header and footer link to: their menus, their url settings, the links typed in their templates. */
export function chromeLinks(home: SectionInstance[], sources: Record<string, string>, settings: Record<string, unknown>): Set<string> {
  const out = new Set<string>()
  const add = (href: unknown) => {
    if (typeof href !== "string") return
    const h = href.trim()
    if (!h.startsWith("/") || h.startsWith("//")) return
    out.add(h.split(/[?#]/)[0].replace(/\/+$/, "") || "/")
  }
  const menus = isObj(settings.menus) ? (settings.menus as Record<string, { links?: { url?: string; links?: unknown[] }[] }>) : {}
  const walk = (links: { url?: string; links?: unknown[] }[] | undefined) => {
    for (const l of links ?? []) {
      add(l?.url)
      walk(l?.links as never)
    }
  }
  for (const s of home) {
    const group = String(s.group ?? "")
    if (group !== "header" && group !== "footer" && s.type !== "header" && s.type !== "footer") continue
    if (s.hidden) continue
    const text = sources[`sections/${s.type}.storelib`]
    const compiled = text ? compileSection(text, { file: `sections/${s.type}.storelib` }) : null
    const schema = compiled && compiled.ok ? (compiled.value.schema as unknown as { settings?: { id?: string; type?: string; default?: unknown }[]; blocks?: { type?: string; settings?: { id?: string; type?: string; default?: unknown }[] }[] }) : null
    const read = (fields: { id?: string; type?: string; default?: unknown }[] | undefined, values: Record<string, unknown> | undefined) => {
      for (const f of fields ?? []) {
        if (!f?.id) continue
        const v = values?.[f.id] ?? f.default
        if (f.type === "link_list" && typeof v === "string") walk(menus[v]?.links)
        else if (f.type === "url") add(v)
      }
    }
    if (schema) {
      read(schema.settings, s.settings)
      for (const b of s.blocks ?? []) read(schema.blocks?.find((d) => d.type === b.type)?.settings, b.settings)
    } else {
      /* A built-in header or footer (theme mode): its menu settings and the main and footer menus it draws. */
      for (const v of Object.values(s.settings ?? {})) if (typeof v === "string" && menus[v]) walk(menus[v].links)
      if (s.type === "header") walk(menus["main-menu"]?.links)
      if (s.type === "footer") walk(menus.footer?.links)
    }
    for (const m of templateOf(s.type, sources).matchAll(/href\s*=\s*["'](\/[^"'{}\s]*)["']/g)) add(m[1])
  }
  return out
}

/**
 * What is still missing from a new website, each with what to do about it.
 * Errors (they block finish). Code `site.*`.
 */
export function completenessIssues(input: CompletenessInput): ValidationIssue[] {
  if (input.materia) return materiaCompleteness(input)
  /* Round 69: on a from scratch Materia site, a placed Materia section is the site's own as an ai_ component is. */
  const own = (sections: SectionInstance[]) => body(sections).filter((s) => isAiComponentType(s.type) || (!!input.placesMateria && isMateriaType(s.type)))
  const issues: ValidationIssue[] = []
  const err = (code: string, message: string) => issues.push({ severity: "error", code, message })
  const byKey = new Map(input.pages.map((p) => [p.key, p.sections]))
  const planned = new Map((input.plan?.pages ?? []).map((p) => [p.key, p]))

  if (!input.plan) err("site.plan_missing", "There is no site plan. Send report_progress phase \"plan\" with pages: every page and template with its sections.")

  /* Home: ten of the AI's own, six of them different. */
  const home = byKey.get("home") ?? []
  const homeOwn = own(home)
  const distinct = new Set(homeOwn.map((s) => s.type)).size
  if (homeOwn.length < MIN_HOME_SECTIONS) err("site.home_sections", `home has ${homeOwn.length} section${homeOwn.length === 1 ? "" : "s"} of your own; it needs at least ${MIN_HOME_SECTIONS} (header and footer not counted). Write and place ${MIN_HOME_SECTIONS - homeOwn.length} more with set_page_sections, each with its own job on the page.`)
  else if (distinct < MIN_HOME_DISTINCT) err("site.home_variety", `home repeats ${distinct} component${distinct === 1 ? "" : "s"} across ${homeOwn.length} sections; use at least ${MIN_HOME_DISTINCT} different ones.`)

  /* Every other main page: six, or the plan's reason. */
  for (const p of input.pages) {
    if (!isMainPage(p.key)) continue
    const n = own(p.sections).length
    const reason = planned.get(p.key)?.reason
    if (n < MIN_PAGE_SECTIONS && !reason) err("site.page_sections", `${p.key} has ${n} section${n === 1 ? "" : "s"} of your own; a page needs at least ${MIN_PAGE_SECTIONS}. Add sections, or give the page a reason in the plan (report_progress phase "plan" with pages).`)
  }

  /* The templates: product and collection when the store sells, and every one the plan gave sections. */
  for (const t of templatesFor(input.caps)) {
    const stored = byKey.get(t.key)
    const mine = stored ? own(stored) : []
    const plannedSections = (planned.get(t.key)?.sections.length ?? 0) > 0
    if (t.key === "product" && t.required) {
      /* Round BA: a product section of its own beside the theme's built-in one draws the product twice. */
      if (mine.some((s) => drawsTheProduct(s.type, input.sources)) && (stored ?? []).some((s) => s.type === "product" && !s.hidden)) err("site.product_twice", `The product page draws the product twice: your own product section and Storelib's built-in one (type "product"). Take the built-in one off page "product" with set_page_sections, keeping yours.`)
      if (!mine.some((s) => drawsTheProduct(s.type, input.sources))) err("site.template_product", `The product page (${t.url}) is not designed: place a component of yours on page "product" that draws the product (product.title, product.price, product.images, page.product.settings.variants) with an add to cart button data-storelib-add-to-cart="{{ product.id }}".`)
      continue
    }
    if (t.key === "collection" && t.required) {
      if (!mine.some((s) => listsProducts(s.type, input.sources))) err("site.template_collection", `The collection page (${t.url}) is not designed: place a component of yours on page "collection" that loops {% for product in products %} and shows collection.title.`)
      continue
    }
    /* The shop and the search results list the store too: a free site's own, not the platform's grid. */
    if ((t.key === "products" || t.key === "search") && t.required) {
      if (!mine.some((s) => listsProducts(s.type, input.sources))) err(`site.template_${t.key === "products" ? "shop" : "search"}`, `The ${t.key === "products" ? "shop" : "search results page"} (${t.url}) is not designed: place a component of yours on page "${t.key}" that loops {% for product in products %}${t.key === "search" ? " and says what was searched ({{ page.query }})" : ""}.`)
      continue
    }
    if (plannedSections && !mine.length) err("site.template_missing", `The plan gives ${t.key} (${t.title}) sections but it has none of yours yet. Place them with set_page_sections page "${t.key}", or change the plan.`)
  }

  /* Pages the plan promised. */
  for (const p of input.plan?.pages ?? []) {
    if (p.key === "home" || isTemplateKey(p.key)) continue
    if (!byKey.has(p.key)) err("site.plan_page_missing", `The plan has a page "${p.key}" that does not exist. Make it with add_page and place its sections, or take it out of the plan.`)
  }

  /* Free mode: the frame is the site's own. */
  if (input.mode === "blank") {
    const has = (g: "header" | "footer") => home.some((s) => !s.hidden && s.group === g && isAiComponentType(s.type))
    if (!has("header")) err("site.header_own", "The site has no header of its own. Write one (schema \"kind\": \"header\") and place it on home with group \"header\".")
    if (!has("footer")) err("site.footer_own", "The site has no footer of its own. Write one (schema \"kind\": \"footer\") and place it on home with group \"footer\".")
  }

  /* Reachable: every main page linked from the header or the footer. */
  const links = chromeLinks(home, input.sources, input.settings)
  for (const p of input.pages) {
    if (!isMainPage(p.key)) continue
    if (!links.has(pagePath(p.key))) err("site.unreachable", `${p.key} (${pagePath(p.key)}) is not linked from the header or the footer. Link it from the menu your header or footer reads, or a link in either.`)
  }
  return issues
}

/**
 * A website on a Materia template: the same bar, read for a site whose sections are Materia's. Home has ten body
 * sections (Materia's or the AI's), six of them different; every other main page has sections (the template's own pages
 * are shorter by design) or the plan's reason; every
 * page the plan promised exists. The store's templates draw from the template's own pages, and the header and
 * footer are Materia's, linked through the store's menus.
 */
function materiaCompleteness(input: CompletenessInput): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const err = (code: string, message: string) => issues.push({ severity: "error", code, message })
  const byKey = new Map(input.pages.map((p) => [p.key, p.sections]))
  const planned = new Map((input.plan?.pages ?? []).map((p) => [p.key, p]))
  if (!input.plan) err("site.plan_missing", "There is no site plan. Send report_progress phase \"plan\" with pages: every page and template with its sections.")
  const home = body(byKey.get("home") ?? [])
  const distinct = new Set(home.map((s) => s.type)).size
  if (home.length < MIN_HOME_SECTIONS) err("site.home_sections", `home has ${home.length} section${home.length === 1 ? "" : "s"}; it needs at least ${MIN_HOME_SECTIONS} (header and footer not counted). Add Materia sections (or one of your own for the edge) with set_page_sections, each with its own job.`)
  else if (distinct < MIN_HOME_DISTINCT) err("site.home_variety", `home repeats ${distinct} section type${distinct === 1 ? "" : "s"} across ${home.length} sections; use at least ${MIN_HOME_DISTINCT} different ones.`)
  for (const p of input.pages) {
    if (!isMainPage(p.key)) continue
    const n = body(p.sections).length
    if (n === 0 && !planned.get(p.key)?.reason) err("site.page_sections", `${p.key} has no sections. Place Materia sections on it, or give the page a reason in the plan.`)
  }
  for (const p of input.plan?.pages ?? []) {
    if (p.key === "home" || isTemplateKey(p.key)) continue
    if (!byKey.has(p.key)) err("site.plan_page_missing", `The plan has a page "${p.key}" that does not exist. Make it with add_page and place its sections, or take it out of the plan.`)
  }
  return issues
}

/* ── the agent's instructions for pages and templates ─────────────────── */

/** The block of the system prompt about pages and templates (N3's; prompts.ts appends it). */
export const PAGES_AND_TEMPLATES = `PAGES AND TEMPLATES (the whole site is yours; checked at finish)
- The plan: with the concept, report_progress phase "plan" takes pages: every page and every template, each { key, sections: [one line per section, in order], reason? }. Writes wait for it. Home lists at least ${MIN_HOME_SECTIONS} sections of your own (header and footer not counted), at least ${MIN_HOME_DISTINCT} different components; every other page at least ${MIN_PAGE_SECTIONS}, or a reason it needs fewer.
- Templates are pages you design with set_page_sections, by key: ${TEMPLATES.map((t) => `${t.key} (${t.title}, ${t.url})`).join(", ")}. list_pages shows them, with what each can read. A template you leave out keeps the platform's plain working layout in your tokens, so plan a reason for each one you skip.
- When the store sells, the product, collection, shop (products) and search templates are required; the shop and search loop {% for product in products %} (search shows {{ page.query }}). The product template's component reads the product the visitor opened: {{ product.title }}, {{ product.price }}, {{ product.compare_price }}, {{ product.description_html | raw }}, {% for image in product.images %}, {% for v in page.product.settings.variants %} (v.id, v.name, v.price, v.available), an add to cart button data-storelib-add-to-cart="{{ product.id }}" (data-variant-id="{{ v.id }}" for an option), Buy now = {{ page.product.settings.checkout_url }}, and its offers with <div data-storelib-island data-storelib-offers="{{ product.id }}" data-title="{{ product.title }}" data-url="{{ product.url }}"></div>. The collection template loops {% for product in products %} (product.id, product.settings.title, .price, .url, .image) under {{ collection.title }}.
- Free mode: the header and footer are your components (group "header"/"footer"). Every page you add is linked from your header or footer (add_page puts it in the Main menu; your header must read that menu).`
