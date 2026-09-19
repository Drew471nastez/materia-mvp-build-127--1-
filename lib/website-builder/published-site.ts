/**
 * ===========================================================================
 *  THE PUBLISHED SITE, RESOLVED ONCE AND CACHED
 * ===========================================================================
 * Every visitor to a creator's site used to pay for the whole thing: resolve
 * the name to a creator, find the published install, read its settings, read
 * the home page's sections, read every .storelib file the creator has saved,
 * then compile and render each section. Eight sequential round trips to the
 * database before a byte of HTML, on every hit, for a page that changes when
 * somebody presses Publish and at no other time.
 *
 * So it is computed once and held until Publish says otherwise.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHAT MAY GO IN A SHARED CACHE
 * ═══════════════════════════════════════════════════════════════════════════
 * This cache is read by anybody on the internet who visits the address, so
 * the only thing allowed in it is what anybody on the internet may see: the
 * published sections, the published theme settings, and the creator's public
 * name. Not drafts. Not the preview token. Not anything belonging to the
 * person signed in, because the person signed in is not part of the key.
 *
 * `PublishedSite` is therefore a deliberately narrow shape rather than the
 * database rows, and `tests/published-site.test.ts` holds it to that. A
 * preview request does not come through here at all: a preview is by
 * definition one person's view of unpublished work, and putting it in a
 * cache keyed by the address would hand it to the next visitor.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  TWO LAYERS, BECAUSE THEY GO STALE FOR DIFFERENT REASONS
 * ═══════════════════════════════════════════════════════════════════════════
 * The name → creator map changes when somebody signs up or renames, which
 * nothing here can be told about, so it is held for a minute and no longer.
 * The published site changes when somebody publishes, which is a thing we
 * are told about exactly, so it is held until told and tagged by creator.
 *
 * Keeping them apart is also what stops a new creator being cached as "no
 * such site" for an hour because somebody guessed their address early.
 */
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { pageWithLiveLinks } from "@/lib/website-builder/live-links"
import { applyUniversalChrome } from "@/lib/website-builder/universal-chrome"
import { unstable_cache, revalidateTag, revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { renderWithSources, sectionSources } from "@/lib/website-builder/storefront-render"
import { shopProducts, type ProductCard } from "@/lib/website-builder/shop-products"
import { pageSections, themeSettings as themeSettingsOf } from "@/lib/website-builder/preview-link"
import { templateForPage } from "@/lib/website-builder/site-pages"
import type { RenderedSection } from "@/components/website-builder/sections/storelib-sources"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

/** What Publish invalidates. One creator, every address they answer on. */
export const creatorSiteTag = (creatorId: string) => `published-site:${creatorId}`
/** The shop half, held apart because it goes stale for its own reasons. */
export const creatorShopTag = (creatorId: string) => `shop-products:${creatorId}`

/** Held until Publish says otherwise; the hour is only a backstop. */
const SITE_TTL = 3600
/** The name map: short, because nothing announces a signup or a rename. */
const NAME_TTL = 60
/**
 * The shop: short, for the same reason. A price is edited from the app's own
 * screens, straight to the database, with no route in between to tell this
 * cache about it.
 */
const SHOP_TTL = 60

export interface PublishedSite {
  creatorId: string
  /** The public display name. Nothing else about the person. */
  displayName: string
  installId: string
  installName: string
  themeSettings: ThemeSettingsValues
  /** The page that was asked for. Home unless a path said otherwise. */
  sections: SectionInstance[]
  /**
   * EVERY PUBLISHED PAGE, by key. The builder has always let somebody make
   * an About page, a Contact page and pages of their own, and only the home
   * page was ever served: the other keys were read by nothing, so the work
   * was invisible to visitors and the header's own "About" link, which
   * ships pointing at /about, was a 404 on every site.
   *
   * Held together in one cache entry because they are published together
   * and invalidated together.
   */
  pages: Record<string, SectionInstance[]>
  /**
   * The creator's saved .storelib files. Cached with the rest, because they
   * change when somebody publishes. The render happens per request from
   * these, which is arithmetic and costs nothing.
   */
  sources: Record<string, string>
}

/** A site, with its sections drawn. What a page actually needs. */
export interface DrawnSite extends PublishedSite {
  prerendered: Record<string, RenderedSection>
}

export type SiteLookup =
  | { kind: "site"; site: DrawnSite }
  /** A creator, but nothing published yet. */
  | { kind: "unpublished"; displayName: string }
  /** The name was renamed; here is where it went. */
  | { kind: "renamed"; to: string }
  | { kind: "missing" }

interface NameMatch {
  creatorId: string
  displayName: string
}

/**
 * A name to a creator: profile username first, then creator slug. Both are
 * lowercased on the way in, because both are stored lowercased and a visitor
 * types whatever they like.
 */
async function lookUpName(name: string): Promise<NameMatch | null> {
  const admin = createAdminClient()
  const lower = name.toLowerCase()

  const { data: profile } = await admin
    .from("profiles")
    .select("id, display_name, username")
    .eq("username", lower)
    .maybeSingle()

  if (profile) {
    const { data: creator } = await admin
      .from("creators")
      .select("id, slug, display_name")
      .eq("user_id", (profile as { id: string }).id)
      .maybeSingle()
    if (creator) {
      const p = profile as { display_name?: string | null; username?: string | null }
      const c = creator as { id: string; display_name?: string | null }
      return { creatorId: c.id, displayName: c.display_name || p.display_name || p.username || name }
    }
  }

  const { data: bySlug } = await admin
    .from("creators")
    .select("id, slug, display_name")
    .eq("slug", lower)
    .maybeSingle()
  if (bySlug) {
    const c = bySlug as { id: string; slug?: string | null; display_name?: string | null }
    return { creatorId: c.id, displayName: c.display_name || c.slug || name }
  }
  return null
}

/**
 * A name to the creator behind it, cached for a minute like the lookup
 * above. The product page on a site needs only this: the address claims an
 * owner and the product either belongs to them or does not.
 */
export async function creatorByName(name: string): Promise<NameMatch | null> {
  const lower = name.toLowerCase()
  return unstable_cache(() => lookUpName(lower), ["site-name", lower], { revalidate: NAME_TTL })()
}

/** Where a name that no longer exists went, if anywhere. */
async function renamedTo(name: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("username_history")
    .select("new_username")
    .ilike("old_username", name)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { new_username?: string } | null)?.new_username ?? null
}

/**
 * Everything the published site is, for one creator. Published only: this
 * never looks at a draft, so there is no shape of this value that leaks one.
 */
/**
 * What the cached half returns: a site with its inputs, not yet drawn. The
 * drawing happens outside the cache, with the products.
 */
type BuiltLookup = { kind: "site"; site: PublishedSite } | Exclude<SiteLookup, { kind: "site" }>

async function buildSite(creatorId: string, displayName: string): Promise<BuiltLookup> {
  const admin = createAdminClient()

  const { data: install } = await admin
    .from("store_theme_installs")
    .select("id, name, status, store_theme_settings ( settings, draft_settings )")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!install) return { kind: "unpublished", displayName }

  const row = install as { id: string; name?: string | null; store_theme_settings?: unknown }
  const settingsRow = Array.isArray(row.store_theme_settings)
    ? (row.store_theme_settings[0] ?? null)
    : (row.store_theme_settings ?? null)

  // `false` is the whole point: published values only, never the drafts.
  const themeSettings = (themeSettingsOf(settingsRow as never, false) ?? {}) as ThemeSettingsValues

  const { data: pageRows } = await admin
    .from("store_theme_pages")
    .select("page_key, sections, draft_sections")
    .eq("install_id", row.id)

  /**
   * And again on the way out. The database already holds rich text saved
   * before anything sanitised it, and rows can arrive from an import. The
   * save path is the authority; this covers what is already there.
   */
  const pages: Record<string, SectionInstance[]> = {}
  for (const r of (pageRows ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]) {
    const published = pageSections<SectionInstance[]>(r as never, false)
    // A page that has never been published is not a page a visitor can see.
    if (!published || published.length === 0) continue
    pages[r.page_key] = sanitizeSections(published)
  }
  /**
   * ONE HEADER AND ONE FOOTER, at render, whatever the rows hold.
   *
   * Each page row carries its own copy, the editor syncs them on save, and a
   * sync is not a guarantee: a page written before it existed, an imported
   * theme, a restored backup. The editor already merged home's chrome over
   * whatever a page stored and the published site did not, so the live site
   * was the only place the drift showed. See lib/website-builder/
   * universal-chrome.
   */
  const dressed = applyUniversalChrome(pages)
  for (const key of Object.keys(dressed)) pages[key] = dressed[key]

  /**
   * AND EVERY LINK IN THAT CHROME POINTS AT AN ADDRESS THIS SITE ANSWERS.
   *
   * lib/website-builder/live-links has done this since it was written, but
   * only where the editor runs it: on load, writing the repair back to the
   * database. A site published before that existed keeps the broken links
   * until its creator happens to open the builder and publish again, and
   * measured on a live site that is exactly what had happened — /shop, /about
   * and /contact all answering 404 in the nav of a published site.
   *
   * So it runs here too, on the way out, against the page keys this site
   * actually has. The function is pure and idempotent, which is what makes
   * that safe: a site whose stored links are already right is unchanged, and
   * a creator's own /blog stays a link because their page is in this set.
   */
  const pageKeys = new Set(Object.keys(pages))
  for (const key of Object.keys(pages)) pages[key] = pageWithLiveLinks(pages[key], pageKeys)

  const sections = pages.home ?? []
  const sources = await sectionSources(admin as never, row.id)

  return {
    kind: "site",
    site: {
      creatorId,
      displayName,
      installId: row.id,
      installName: row.name ?? "",
      themeSettings,
      sections,
      pages,
      sources,
    },
  }
}

/**
 * The whole lookup, cached in two layers.
 *
 * The inner cache is created per creator so its tag can name that creator:
 * a tag is fixed when the cached function is made, so a function that serves
 * every creator could only ever carry one tag for all of them, and one
 * publish would throw away everybody's.
 */
/**
 * `pageKey` is which page of the site to draw. "home" is the site's front
 * page; "about", "contact" and any key the creator made are the rest. A key
 * the site has not published comes back as `missing`, so the route can 404
 * rather than quietly serving the home page under another address.
 */
export async function publishedSiteByName(name: string, pageKey = "home"): Promise<SiteLookup> {
  const found = await resolveSite(name)
  if (found.kind !== "site") return found
  const { site, products } = found

  const sections = site.pages[pageKey] ?? (pageKey === "home" ? site.sections : undefined)
  if (!sections) return { kind: "missing" }

  // "index" for the front page, `page.<key>` for the rest: the name a
  // section reads as `page.template` and writes `allowed_templates` against.
  const template = templateForPage(pageKey)
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, template, products)
  return { kind: "site", site: { ...site, sections, prerendered } }
}

/**
 * The same site and the same shop, handed back undrawn.
 *
 * The shop index (`/products`) is not a page in the database: it is the
 * creator's header and footer around every product they sell, so it needs
 * the pieces rather than a drawn page. Everything it uses is already cached
 * by the lookup above, so this costs no extra round trips.
 */
export type ShopLookup =
  | { kind: "site"; site: PublishedSite; products: ProductCard[] }
  | Exclude<SiteLookup, { kind: "site" }>

export async function publishedShopByName(name: string): Promise<ShopLookup> {
  return resolveSite(name)
}

/**
 * Name to creator to published site to shop, each layer cached as described
 * at the top of this file. Everything that serves a built site goes through
 * here, so a visitor pays for the lookup once however they arrived.
 */
async function resolveSite(name: string): Promise<ShopLookup> {
  const lower = name.toLowerCase()

  const match = await unstable_cache(
    () => lookUpName(lower),
    ["site-name", lower],
    { revalidate: NAME_TTL },
  )()

  if (!match) {
    const to = await unstable_cache(() => renamedTo(lower), ["site-renamed", lower], { revalidate: NAME_TTL })()
    return to ? { kind: "renamed", to } : { kind: "missing" }
  }

  const found = await unstable_cache(
    () => buildSite(match.creatorId, match.displayName),
    ["published-site", match.creatorId],
    { tags: [creatorSiteTag(match.creatorId)], revalidate: SITE_TTL },
  )()
  if (found.kind !== "site") return found

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  PRODUCTS ARE THE PART THAT IS ACTUALLY DYNAMIC
   * ═════════════════════════════════════════════════════════════════════════
   * The page changes when somebody presses Publish. The shop changes when
   * somebody edits a price, adds a product or sells the last one, and those
   * writes happen from the app's own screens with no server route to hang an
   * invalidation on. Holding them for an hour alongside the page would mean
   * a corrected price sitting wrong on a live site for an hour.
   *
   * So they are cached apart and briefly, and the page is drawn per request
   * from the two. Drawing is arithmetic — no database, and the compiler
   * keeps its own cache of the files — so this costs single-digit
   * milliseconds and buys a shop that is never more than a minute behind.
   */
  const products = await unstable_cache(
    () => shopProducts(createAdminClient() as never, match.creatorId),
    ["shop-products", match.creatorId],
    { tags: [creatorShopTag(match.creatorId)], revalidate: SHOP_TTL },
  )()

  return { kind: "site", site: found.site, products }
}

/**
 * Publish and unpublish both call this. Unpublish matters as much: a site
 * taken down that stays in a cache is still up.
 */
export async function revalidatePublishedSite(creatorId: string): Promise<void> {
  /**
   * The second argument is how long the purge itself is remembered, and it
   * has to outlive the entries it is purging or a stale one could survive
   * its own invalidation. It is `SITE_TTL` exactly, which is what those
   * entries are held for.
   */
  revalidateTag(creatorSiteTag(creatorId), { expire: SITE_TTL })

  /**
   * AND THE RENDERED PAGE, which is a second cache and was not being told.
   *
   * The public routes are held at the edge for a minute now. Purging the data
   * underneath them does nothing to a page already rendered from it, so
   * without this a creator pressed Publish and watched the old site for up to
   * sixty seconds — the exact complaint the caching was meant to avoid
   * causing.
   *
   * `"layout"` rather than `"page"`: it takes the front page and every page
   * below it, which is what a publish changes.
   */
  const name = await creatorUsername(creatorId)
  if (name) revalidatePath(`/w/${name}`, "layout")
}

/**
 * The name a creator's site is served under. Profile username first, then the
 * creator slug, which is the same order `findCreator` resolves a name in.
 */
async function creatorUsername(creatorId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from("profiles")
      .select("username")
      .eq("id", creatorId)
      .maybeSingle()
    const fromProfile = (profile as { username?: string | null } | null)?.username
    if (fromProfile) return fromProfile
    const { data: creator } = await admin
      .from("creators")
      .select("username")
      .eq("id", creatorId)
      .maybeSingle()
    return (creator as { username?: string | null } | null)?.username ?? null
  } catch {
    // A purge that cannot find the name is better than a publish that fails.
    return null
  }
}
