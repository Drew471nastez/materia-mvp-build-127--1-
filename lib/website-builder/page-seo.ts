/**
 * ===========================================================================
 *  EACH PAGE'S OWN SEARCH RESULT
 * ===========================================================================
 * The site has one title and one description (Website Settings › SEO &
 * Social), and every other page took a title made from its name and the
 * site's description. So About, Contact and a creator's own pages all said
 * the same thing to a search engine, and none could be kept out of search
 * on its own: a thank-you page was as findable as the home page.
 *
 * Each page other than home can now carry its own title, description, and
 * "keep out of search engines". They live in the theme settings under
 * `page_seo`, keyed by page, so they are part of the draft: undone with it,
 * saved with it, and live when the creator publishes. The home page's are
 * the site's own, in SEO & Social.
 *
 * Read by Website Settings › Pages & Navigation, the live page's metadata
 * (app/(site)/w/[username]/render-site.tsx) and the sitemap
 * (lib/website-builder/site-seo-data.ts). Pure.
 */

export interface PageSeo {
  title?: string
  description?: string
  /** The picture a shared link to this page shows (og:image), over the site's own (round R6). */
  image?: string
  /** Kept out of search engines: `noindex` on the page, and not in the sitemap. */
  hidden?: boolean
}

/** What a search result shows before it cuts a line. */
export const PAGE_TITLE_MAX = 70
export const PAGE_DESCRIPTION_MAX = 160
/** What is stored, at most: a little over what is shown, never an essay. */
const STORE_TITLE_MAX = 120
const STORE_DESCRIPTION_MAX = 320

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const t = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
  return t ? t.slice(0, max) : undefined
}

/** A picture address a crawler can fetch: https, or a path on the site. */
function picture(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const t = value.trim()
  return t.length <= 1000 && /^(https:\/\/|\/(?!\/))\S+$/i.test(t) ? t : undefined
}

function map(settings: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const raw = settings?.page_seo
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

/** One page's settings, cleaned. Empty for home: its are the site's. */
export function pageSeoOf(settings: Record<string, unknown> | null | undefined, pageKey: string): PageSeo {
  if (pageKey === "home") return {}
  const raw = map(settings)[pageKey]
  if (!raw || typeof raw !== "object") return {}
  const r = raw as Record<string, unknown>
  const out: PageSeo = {}
  const title = text(r.title, STORE_TITLE_MAX)
  const description = text(r.description, STORE_DESCRIPTION_MAX)
  if (title) out.title = title
  if (description) out.description = description
  const image = picture(r.image)
  if (image) out.image = image
  if (r.hidden === true) out.hidden = true
  return out
}

/**
 * The whole `page_seo` value with one page changed, for the settings write.
 * A page left with nothing set is dropped, so the value only ever holds
 * what somebody chose.
 */
export function withPageSeo(
  settings: Record<string, unknown> | null | undefined,
  pageKey: string,
  patch: PageSeo,
): Record<string, PageSeo> {
  const next: Record<string, PageSeo> = {}
  for (const key of Object.keys(map(settings))) {
    const seo = pageSeoOf(settings, key)
    if (Object.keys(seo).length) next[key] = seo
  }
  if (pageKey === "home") return next
  const merged = { ...pageSeoOf(settings, pageKey), ...patch }
  const clean: PageSeo = {}
  /* A field set to "" is cleared, not stored as nothing. */
  if (typeof merged.title === "string" && merged.title.trim()) clean.title = merged.title.slice(0, STORE_TITLE_MAX)
  if (typeof merged.description === "string" && merged.description.trim()) clean.description = merged.description.slice(0, STORE_DESCRIPTION_MAX)
  const image = picture(merged.image)
  if (image) clean.image = image
  if (merged.hidden === true) clean.hidden = true
  if (Object.keys(clean).length) next[pageKey] = clean
  else delete next[pageKey]
  return next
}

/** The pages a creator has kept out of search. */
export function hiddenPages(settings: Record<string, unknown> | null | undefined): Set<string> {
  return new Set(Object.keys(map(settings)).filter((k) => pageSeoOf(settings, k).hidden))
}

/** What the fields hold as typed, for the inputs: not trimmed, so a space being typed stays. */
export function typedPageSeo(settings: Record<string, unknown> | null | undefined, pageKey: string): { title: string; description: string; image: string; hidden: boolean } {
  const raw = map(settings)[pageKey]
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    title: typeof r.title === "string" ? r.title : "",
    description: typeof r.description === "string" ? r.description : "",
    image: typeof r.image === "string" ? r.image : "",
    hidden: r.hidden === true,
  }
}

/** Pages whose title is the thing they show (a product, a collection, a search), not one the creator names. */
const DRAWN_TITLES = new Set(["product", "collection", "search", "cart"])

/**
 * ===========================================================================
 *  WHAT ONE PAGE TELLS A SEARCH ENGINE, FOR A THEME THAT DRAWS ITS OWN HEAD
 * ===========================================================================
 * Storelib's own pages take their title, description and share picture from
 * Next's metadata (app/(site)/w/[username]/render-site.tsx). A theme
 * imported from Shopify draws its own <head> from `page_title` and
 * `page_description`, and read neither the site's SEO & Social nor a page's
 * own: every page of an imported site said the theme's defaults (round R6,
 * the owner: "editing SEO for specific pages must actually work").
 *
 * This is the same reading for that route (lib/website-builder/compat-site.ts):
 * the page's own title and description when it has them (home's are the
 * site's), the site's description and share picture otherwise, and whether
 * it is kept out of search, by the page or by the whole site. A product's
 * or a collection's title stays its own.
 */
export function pageSeoForSite(settings: Record<string, unknown> | null | undefined, pageKey: string): { title?: string; description?: string; image?: string; noindex: boolean } {
  const s = settings ?? {}
  const own = pageSeoOf(s, pageKey)
  const siteTitle = text(s.seo_title, STORE_TITLE_MAX)
  const siteDescription = text(s.seo_description, STORE_DESCRIPTION_MAX)
  const robots = s.seo_robots
  const siteHidden = robots === false || (typeof robots === "string" && /noindex/i.test(robots))
  return {
    title: DRAWN_TITLES.has(pageKey) ? undefined : pageKey === "home" ? siteTitle : own.title,
    description: own.description ?? siteDescription,
    image: own.image ?? picture(s.seo_og_image),
    noindex: siteHidden || own.hidden === true,
  }
}
