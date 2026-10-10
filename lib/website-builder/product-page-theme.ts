/**
 * ===========================================================================
 *  THE THEME A LIVE PRODUCT PAGE IS DRAWN IN, HELD WITH THE SITE
 * ===========================================================================
 * A product page on a creator's website (`<name>.storelib.com/products/<slug>`
 * and the same on a connected domain) is rendered for every visitor, on
 * purpose: the price, the stock and the options are read fresh each time
 * (components/website-builder/theme/render-product.tsx says why).
 *
 * The theme around them is not like that. The published install, its
 * published settings and the published sections of the product and home
 * pages change when the creator presses Publish and at no other time, and
 * they were read again for every visitor: three round trips in a row before
 * the product could be drawn.
 *
 * So they are held here under the site's own tag (`creatorSiteTag`), with
 * everything else the published site holds, and cleared by the same calls
 * that clear it: publish, unpublish, a settings save, menus, the website's
 * address (`revalidatePublishedSite`). The hour is only a backstop.
 *
 * PUBLISHED ONLY, as the rest of that cache: no draft sections, no draft
 * settings, no preview token. A preview link reads its own install directly,
 * as before, because a preview is one person's view of unpublished work.
 */
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorSiteTag } from "@/lib/website-builder/published-site"
import type { SectionInstance } from "@/lib/website-builder/types"

const SITE_TTL = 3600

export interface ProductPageTheme {
  /** The published install, in the shape the page reads it: its id and its published settings. */
  install: { id: string; store_theme_settings: { settings: unknown } | null }
  /** The product page's published sections, as `pageSections(row, false)` reads them. */
  product: { sections: SectionInstance[] | null } | null
  /** The home page's, for the header and footer the product page borrows. */
  home: { sections: SectionInstance[] | null } | null
}

async function readTheme(creatorId: string): Promise<ProductPageTheme | null> {
  const admin = createAdminClient()
  const { data: install, error } = await admin
    .from("store_theme_installs")
    .select("id, store_theme_settings ( settings )")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()
  /* Thrown, so a database that did not answer is never held for an hour as "no website". */
  if (error) throw new Error(`product page theme: ${error.message}`)
  if (!install) return null
  const row = install as { id: string; store_theme_settings?: { settings?: unknown } | { settings?: unknown }[] | null }
  const settingsRow = Array.isArray(row.store_theme_settings) ? (row.store_theme_settings[0] ?? null) : (row.store_theme_settings ?? null)

  const { data: pages, error: pagesError } = await admin
    .from("store_theme_pages")
    .select("page_key, sections")
    .eq("install_id", row.id)
    .in("page_key", ["product", "home"])
  if (pagesError) throw new Error(`product page theme: ${pagesError.message}`)
  const byKey = new Map(((pages ?? []) as { page_key: string; sections: SectionInstance[] | null }[]).map((p) => [p.page_key, { sections: p.sections }]))

  return {
    install: { id: row.id, store_theme_settings: settingsRow ? { settings: settingsRow.settings ?? null } : null },
    product: byKey.get("product") ?? null,
    home: byKey.get("home") ?? null,
  }
}

/**
 * The published theme for one creator's live product pages. Keyed and
 * tagged by creator: one creator's publish clears their entry and nobody
 * else's, and no entry holds more than one creator's rows.
 */
export async function publishedProductTheme(creatorId: string): Promise<ProductPageTheme | null> {
  if (!creatorId) return null
  return unstable_cache(() => readTheme(creatorId), ["product-page-theme", creatorId], {
    tags: [creatorSiteTag(creatorId)],
    revalidate: SITE_TTL,
  })()
}
