/**
 * ===========================================================================
 *  WHICH BANK SITE SUITS A BRIEF, AND WHAT OF IT THE BUSINESS CAN USE
 * ===========================================================================
 * The owner: "it doesn't make sense for someone who sets up a coaching
 * website to have ecommerce, so it needs to adapt these very well."
 *
 * wantsOf(brief)       what the business needs, from the brief: a shop (it
 *                      sells, has products, asks for a store), bookings,
 *                      courses, a community, a blog, reviews
 * scoreBankEntry       how well one bank site suits it. A shop site for a
 *                      business that sells is a working store's composition
 *                      whatever it sold (+5); for a business that does not
 *                      sell, a shop-led site is wrong (-8). The industry as
 *                      chooseTemplate scores it, the site's words in the
 *                      prompt, +1 for being the owner's own pick.
 * fitTemplate          the template without what the business cannot fill:
 *                      sections that need a feature it does not have (a
 *                      product grid for a coach without products, a course
 *                      curriculum for a shop), the shop's own pages, the
 *                      picture slots, bindings and menu links that went with
 *                      them. `removed` is recorded on the site so the finish
 *                      gate reads the same template later (refitTemplate).
 *
 * Pure. Browser safe.
 */
import type { CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import type { SiteTemplate, TemplateMenu, TemplateMenuLink } from "@/lib/storelib-ai/templates/types"
import { isShopPage, type BankFeature, type BankProfile } from "./snapshot"

export type BriefLike = Pick<CreativeBrief, "prompt" | "business" | "objective" | "pages" | "assets">

const SHOP_WORDS = /\b(shop|store|storefront|sell|selling|sells|merch|products?|buy|e-?commerce|dropshipping|catalog(ue)?|checkout|cart)\b/i
const BOOK_WORDS = /\b(book(ing)?|appointments?|schedule|calls?|sessions?|consultations?|reservations?)\b/i
const COURSE_WORDS = /\b(courses?|lessons?|class(es)?|curriculum|academy|students?|learn)\b/i
const COMMUNITY_WORDS = /\b(community|members?|membership|discord|circle)\b/i
const BLOG_WORDS = /\b(blog|articles?|posts?|journal|stories)\b/i

/** What the business needs a site to show, from its brief. */
export function wantsOf(brief: BriefLike): Set<BankFeature> {
  const text = `${brief.prompt} ${(brief.pages ?? []).join(" ")}`
  const available = (brief.assets?.available ?? []).join(" ")
  const out = new Set<BankFeature>()
  if (brief.objective === "buy" || /\bproducts?\b/i.test(available) || (brief.pages ?? []).some(isShopPage) || SHOP_WORDS.test(brief.prompt)) out.add("shop")
  if (brief.objective === "book" || BOOK_WORDS.test(text)) out.add("booking")
  if (brief.business.kind === "education" || COURSE_WORDS.test(text) || /\bcourses?\b/i.test(available)) out.add("courses")
  if (brief.objective === "join" || COMMUNITY_WORDS.test(text) || /\bcommunit/i.test(available)) out.add("community")
  if (brief.objective === "read" || BLOG_WORDS.test(text) || /\b(blog|posts?)\b/i.test(available)) out.add("blog")
  if (/\breviews?\b/i.test(available)) out.add("reviews")
  return out
}

/** The listing of a bank entry the chooser needs (no files, no pages). */
export interface BankListing {
  /** The template id (bank-<prefix>). */
  id: string
  name: string
  kind: BankProfile["kind"]
  industries: string[]
  keywords: string[]
  features: BankFeature[]
  /** How many of home's own sections need a shop. */
  homeShop: number
  /** How many home has (header and footer aside). */
  homeTotal: number
}

export function listingOf(id: string, name: string, profile: BankProfile, tags?: { industries?: string[]; keywords?: string[] }): BankListing {
  const home = profile.sections.filter((s) => s.page === "home" && s.role !== "header" && s.role !== "footer" && s.role !== "announcement")
  return {
    id,
    name,
    kind: profile.kind,
    industries: tags?.industries?.length ? tags.industries : profile.industries,
    keywords: [...new Set([...(profile.keywords ?? []), ...(tags?.keywords ?? [])])],
    features: profile.features,
    homeShop: home.filter((s) => s.needs === "shop").length,
    homeTotal: home.length,
  }
}

export const BANK_MIN_SCORE = 5

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim()} `

/** How well one bank site suits a brief, with the reasons. */
export function scoreBankEntry(entry: BankListing, brief: BriefLike, avoid: string[] = []): { score: number; why: string[] } {
  let n = 1
  const why = ["the owner's own pick"]
  const wants = wantsOf(brief)
  const sells = wants.has("shop")
  const shopSite = entry.features.includes("shop")
  const shopLed = entry.homeTotal > 0 && entry.homeShop >= Math.max(2, Math.ceil(entry.homeTotal / 3))
  const at = entry.industries.indexOf(brief.business.kind)
  if (at === 0) { n += 5; why.push(`made for ${brief.business.label}`) }
  else if (at > 0) { n += 4; why.push(`fits ${brief.business.label}`) }
  if (sells && shopSite) { n += 5; why.push("a working store's composition for a business that sells") }
  if (sells && !shopSite) { n -= 2; why.push("has no shop for a business that sells") }
  if (!sells && shopLed) { n -= 8; why.push("led by a shop, and this business does not sell") }
  for (const f of ["booking", "courses", "community"] as BankFeature[]) if (wants.has(f) && entry.features.includes(f)) { n += 1; why.push(`has ${f}`) }
  const text = words(brief.prompt)
  const hits = entry.keywords.filter((k) => k.length > 2 && text.includes(words(k))).slice(0, 3)
  if (hits.length) { n += hits.length; why.push(`the prompt says ${hits.map((h) => `"${h}"`).join(", ")}`) }
  if (avoid.includes(entry.id)) { n -= 2; why.push("used recently") }
  return { score: n, why }
}

/** The bank site that suits a brief best, or null under BANK_MIN_SCORE. Only starting sites are ever poured in. */
export function chooseBankEntry(entries: readonly BankListing[], brief: BriefLike, avoid: string[] = []): { entry: BankListing; score: number; why: string[] } | null {
  const scored = entries
    .filter((e) => e.kind === "starting")
    .map((entry, i) => ({ entry, i, ...scoreBankEntry(entry, brief, avoid) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
  const best = scored[0]
  return best && best.score >= BANK_MIN_SCORE ? { entry: best.entry, score: best.score, why: best.why } : null
}

/** Reference entries (imported themes) worth showing for this brief, best first. */
export function referenceEntries(entries: readonly BankListing[], brief: BriefLike, max = 3): BankListing[] {
  /* Round BB: the owner's references are the standard for every site, so the nearest are always read, however far. */
  return entries
    .filter((e) => e.kind === "reference")
    .map((entry, i) => ({ entry, i, s: scoreBankEntry(entry, brief).score }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max)
    .map((x) => x.entry)
}

/* ── the template, fitted ──────────────────────────────────────────────── */

export interface Removed {
  /** page/sectionId */
  sections: string[]
  pages: string[]
}

export interface Fitted {
  template: SiteTemplate
  removed: Removed
  /** In plain words, for the agent's adaptation notes. */
  notes: string[]
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Pages a menu never links to by name: the shop's own templates and the site's system pages. */
const SYSTEM_PAGE = /^(product|collection|search|cart|404|account|login|register|wishlist|password|checkout)(\b|[-_]|$)/

/** A site's menus from the pages it has: its own pages by title, the shop when it has one. */
export function menusForPages(pages: readonly { key: string; title: string }[]): Record<string, TemplateMenu> {
  const own = pages.filter((p) => p.key !== "home" && !SYSTEM_PAGE.test(p.key) && !isShopPage(p.key)).map((p) => ({ title: p.title, url: `/${p.key}` }))
  const shop = pages.some((p) => isShopPage(p.key)) ? [{ title: "Shop", url: "/products" }] : []
  const main = [...shop, ...own].slice(0, 7)
  return {
    "main-menu": { title: "Main", links: main },
    footer: { title: "Footer", links: [...main, { title: "Search", url: "/search" }] },
  }
}

/** The template with the given sections and pages taken out, and everything that pointed at them. */
export function refitTemplate(template: SiteTemplate, removed: Removed): SiteTemplate {
  const t = clone(template)
  const goneSection = new Set(removed.sections)
  const gonePage = new Set(removed.pages)
  t.pages = t.pages.filter((p) => !gonePage.has(p.key)).map((p) => ({ ...p, sections: p.sections.filter((s) => !goneSection.has(`${p.key}/${s.id}`)) }))
  const alive = (page: string, section: string) => !gonePage.has(page) && !goneSection.has(`${page}/${section}`)
  t.imageSlots = t.imageSlots.map((s) => ({ ...s, targets: s.targets.filter((x) => alive(x.page, x.section)) })).filter((s) => s.targets.length > 0)
  t.bindings = t.bindings.filter((b) => alive(b.page, b.section))
  const pagePath = (url: string) => /^\/(?:pages\/)?([a-z0-9-]+)\/?$/.exec(url)?.[1] ?? (url === "/products" || url.startsWith("/products/") ? "products" : url.startsWith("/collections") ? "collection" : "")
  const keepLink = (l: TemplateMenuLink): TemplateMenuLink | null => {
    const key = pagePath(l.url)
    if (key && (gonePage.has(key) || (removed.pages.length && isShopPage(key) && removed.pages.some(isShopPage)))) return null
    const links = (l.links ?? []).map(keepLink).filter((x): x is TemplateMenuLink => !!x)
    return { ...l, ...(l.links ? { links } : {}) }
  }
  const menus: Record<string, TemplateMenu> = {}
  for (const [h, m] of Object.entries(t.menus)) menus[h] = { ...m, links: m.links.map(keepLink).filter((x): x is TemplateMenuLink => !!x) }
  t.menus = Object.keys(menus).length ? menus : menusForPages(t.pages)
  /* Files no page places any more are not written: a component nothing uses is noise in the code panel. */
  const placed = new Set(t.pages.flatMap((p) => p.sections.map((s) => `sections/${s.type}.storelib`)))
  t.files = Object.fromEntries(Object.entries(t.files).filter(([path]) => placed.has(path)))
  return t
}

/** The template with what this business cannot fill taken out. */
export function fitTemplate(template: SiteTemplate, profile: BankProfile, brief: BriefLike): Fitted {
  const wants = wantsOf(brief)
  const removed: Removed = { sections: [], pages: [] }
  const notes: string[] = []
  const missing = (f: BankFeature | null): f is BankFeature => !!f && !wants.has(f) && f !== "booking"
  if (!wants.has("shop")) {
    removed.pages = template.pages.filter((p) => isShopPage(p.key)).map((p) => p.key)
  }
  let builtInChrome = 0
  for (const s of profile.sections) {
    if (removed.pages.includes(s.page)) continue
    if (missing(s.needs)) removed.sections.push(`${s.page}/${s.id}`)
    /* Storelib's built-in header, footer or announcement never travel: the new site writes its own (the chrome kit), free of the theme's. */
    else if (!s.code && (s.role === "header" || s.role === "footer" || s.role === "announcement")) {
      removed.sections.push(`${s.page}/${s.id}`)
      builtInChrome++
    }
  }
  /* Never empty a home: when everything on it would go, the first and last of its own sections stay to be rewritten. */
  const homeOwn = profile.sections.filter((s) => s.page === "home" && s.role !== "header" && s.role !== "footer" && s.role !== "announcement")
  const homeGone = homeOwn.filter((s) => removed.sections.includes(`home/${s.id}`))
  if (homeOwn.length && homeGone.length === homeOwn.length) {
    for (const keep of [homeOwn[0], homeOwn[homeOwn.length - 1]]) removed.sections = removed.sections.filter((x) => x !== `home/${keep.id}`)
  }
  const byFeature = new Map<BankFeature, number>()
  for (const s of profile.sections) if (removed.sections.includes(`${s.page}/${s.id}`) && s.needs) byFeature.set(s.needs, (byFeature.get(s.needs) ?? 0) + 1)
  for (const [f, n] of byFeature) notes.push(`${n} section${n === 1 ? "" : "s"} that need${n === 1 ? "s" : ""} ${f === "shop" ? "products to sell" : f} were left out: this business has no ${f === "shop" ? "shop" : f}.`)
  if (builtInChrome) notes.push("The library site's header, footer and announcement were Storelib's built-in ones and were left out: write this site's own (the chrome kit: header, menu drawer, cart, search, footer), so nothing depends on the theme's.")
  if (removed.pages.length) notes.push(`The shop's own pages (${removed.pages.join(", ")}) were left out, with their menu links.`)
  if (!wants.has("shop") && profile.sections.some((s) => s.role === "header" && s.code)) notes.push("The header still has the source's bag: take it out (this business does not sell) and keep search only if the site has enough pages for it.")
  return { template: refitTemplate(template, removed), removed, notes }
}
