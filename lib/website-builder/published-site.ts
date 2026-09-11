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
import { unstable_cache, revalidateTag } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { renderWithSources, sectionSources } from "@/lib/website-builder/storefront-render"
import { shopProducts } from "@/lib/website-builder/shop-products"
import { pageSections, themeSettings as themeSettingsOf } from "@/lib/website-builder/preview-link"
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
  sections: SectionInstance[]
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

  const { data: pageData } = await admin
    .from("store_theme_pages")
    .select("sections, draft_sections")
    .eq("install_id", row.id)
    .eq("page_key", "home")
    .maybeSingle()

  const sections = pageSections<SectionInstance[]>(pageData as never, false) ?? []
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
export async function publishedSiteByName(name: string): Promise<SiteLookup> {
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

  const prerendered = renderWithSources(found.site.sources, found.site.sections, found.site.themeSettings, "index", products)
  return { kind: "site", site: { ...found.site, prerendered } }
}

/**
 * Publish and unpublish both call this. Unpublish matters as much: a site
 * taken down that stays in a cache is still up.
 */
export function revalidatePublishedSite(creatorId: string): void {
  /**
   * The second argument is how long the purge itself is remembered, and it
   * has to outlive the entries it is purging or a stale one could survive
   * its own invalidation. It is `SITE_TTL` exactly, which is what those
   * entries are held for.
   */
  revalidateTag(creatorSiteTag(creatorId), { expire: SITE_TTL })
}
