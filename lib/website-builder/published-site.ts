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
import { sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import { pageWithLiveLinks } from "@/lib/website-builder/live-links"
import { applyUniversalChrome } from "@/lib/website-builder/universal-chrome"
import { unstable_cache, revalidateTag, revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorIdByHandle, websiteHandleOf } from "@/lib/website-builder/site-address-data"
import { isBanned } from "@/lib/seo/bans"
import { renderWithSources, sectionSources } from "@/lib/website-builder/storefront-render"
import { shopProducts, type ProductCard } from "@/lib/website-builder/shop-products"
import { pageSections, themeSettings as themeSettingsOf } from "@/lib/website-builder/preview-link"
import { NOT_FOUND_PAGE_KEY, pageTitleFromKey, templateForPage } from "@/lib/website-builder/site-pages"
import { notFoundSections } from "@/lib/website-builder/shop-page"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { schemaFor } from "@/lib/website-builder/storelib-schemas"
import {
  dynamicContext,
  mergeCatalog,
  missingReferences,
  productReferences,
  siteMenus,
  storefrontData,
  withDynamicSources,
  type CreatorFacts,
  communityReferences,
} from "@/lib/website-builder/storefront-data"
import { creatorFacts, pickedProducts, publishedProductCount } from "@/lib/website-builder/storefront-data-server"
import { schemaLookupFrom } from "@/lib/website-builder/custom-schemas"
import type { RenderedSection } from "@/components/website-builder/sections/storelib-sources"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { StorefrontData } from "@/lib/storelib-theme/types"

/** The product a product page is about, as a section reads it. */
type StorefrontProduct = StorefrontData["product"]

/**
 * What a page needs from whoever owns it to be dressed: the published site
 * has all of it, and a preview or a cover builds it with ownerOf below.
 */
export type PageOwner = Pick<PublishedSite, "creatorId" | "displayName" | "themeSettings" | "sources" | "profile">

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
  /**
   * What the creator's own Storelib page shows anybody: their name,
   * headline, bio and photo. A section reads it as `creator`, and a
   * dynamic source fills a setting from it (lib/storelib-theme/dynamic.ts).
   * Named fields, public ones, and nothing else from the rows they come from.
   */
  profile: CreatorFacts
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
  /** The creator's slug, which a site's default title names. Optional: an entry cached before it was added has none. */
  slug?: string | null
}

/**
 * A name to a creator: profile username first, then creator slug. Both are
 * lowercased on the way in, because both are stored lowercased and a visitor
 * types whatever they like.
 *
 * A BANNED CREATOR IS NO CREATOR HERE. A ban unpublished their products and
 * closed their storefront, and their website went on answering, indexed and
 * in the sitemap. The creator rows are read whole (`*`) so the ban is seen
 * where the column exists and nothing fails where it does not
 * (lib/seo/bans.ts), and a banned creator's name answers as no site at all,
 * which every route on the site turns into a 404. Lifting the ban brings it
 * back within the minute this is held for.
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
      .select("*")
      .eq("user_id", (profile as { id: string }).id)
      .maybeSingle()
    if (creator) {
      if (isBanned(creator as { banned_at?: string | null })) return null
      const p = profile as { display_name?: string | null; username?: string | null }
      const c = creator as { id: string; slug?: string | null; display_name?: string | null }
      /* The profile's name first: `creators.display_name` is a copy written
         when the account was made and edited by nothing since, so it held
         the name a renamed creator no longer uses (lib/account/identity). */
      return { creatorId: c.id, displayName: p.display_name || c.display_name || p.username || name, slug: c.slug ?? null }
    }
  }

  const { data: bySlug } = await admin
    .from("creators")
    .select("*")
    .eq("slug", lower)
    .maybeSingle()
  if (bySlug) {
    if (isBanned(bySlug as { banned_at?: string | null })) return null
    const c = bySlug as { id: string; slug?: string | null; display_name?: string | null }
    return { creatorId: c.id, displayName: c.display_name || c.slug || name, slug: c.slug ?? null }
  }

  /*
    A NAME THE WEBSITE WAS GIVEN, apart from its creator's username
    (Website Settings › Domains, lib/website-builder/site-address). Asked
    last, so a username always answers for its own creator; the name was
    checked free of usernames when it was chosen. A name the website used to
    have still answers, so links already given out arrive.
  */
  const byHandle = await creatorIdByHandle(lower, admin)
  if (byHandle) {
    const { data: creator } = await admin.from("creators").select("*").eq("id", byHandle).maybeSingle()
    if (creator) {
      if (isBanned(creator as { banned_at?: string | null })) return null
      const c = creator as { id: string; slug?: string | null; display_name?: string | null }
      return { creatorId: c.id, displayName: c.display_name || c.slug || name, slug: c.slug ?? null }
    }
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

/**
 * Where a name that no longer exists went, if anywhere.
 *
 * `ilike` for case, with the name taken literally. The name is whatever was
 * typed into an address, and to LIKE a `%` is any name at all: `/w/%25`
 * answered with a redirect to whichever creator had changed their username
 * most recently.
 */
async function renamedTo(name: string): Promise<string | null> {
  const admin = createAdminClient()
  const literal = name.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data } = await admin
    .from("username_history")
    .select("new_username")
    .ilike("old_username", literal)
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

  /**
   * `false` is the whole point: published values only, never the drafts.
   *
   * And cleaned, for the same reason the sections below are. A few theme
   * settings are drawn as markup rather than as text, and a theme's own
   * `.storelib` files may emit any of them through the template language's
   * `raw` filter. An imported theme brings both with it.
   */
  const themeSettings = sanitizeThemeSettings(
    (themeSettingsOf(settingsRow as never, false) ?? {}) as ThemeSettingsValues,
  )

  /* The saved section files first: a creator's own section is cleaned by
     the schema its file declares, below, not only by the built-in ones. */
  const [sources, profile] = await Promise.all([
    sectionSources(admin as never, row.id),
    creatorFacts(admin as never, creatorId),
  ])
  const ownSchemas = schemaLookupFrom(sources)

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
    pages[r.page_key] = sanitizeSections(published, ownSchemas)
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

  const sections = pages.home ?? []

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
      profile: { name: profile.name ?? displayName, headline: profile.headline ?? "", bio: profile.bio ?? "", avatar: profile.avatar ?? "" },
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
  const { site, products, productCount } = found

  const stored = site.pages[pageKey] ?? (pageKey === "home" ? site.sections : undefined)
  if (!stored) return { kind: "missing" }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  EVERY LINK IN THE CHROME POINTS AT AN ADDRESS THIS SITE ANSWERS
   * ═══════════════════════════════════════════════════════════════════════
   * lib/website-builder/live-links has done this since it was written, but
   * only where the EDITOR runs it: on load, writing the repair back to the
   * database. A site published before that existed keeps its broken links
   * until its creator happens to open the builder again, and measured on a
   * live site that is exactly what had happened — /shop, /about and /contact
   * all answering 404 from the nav of a published site.
   *
   * OUTSIDE THE CACHE, DELIBERATELY. The first version of this ran inside
   * `siteByName`, which is wrapped in `unstable_cache` with a one-hour TTL
   * and an entry that survives a deployment. The fix shipped and the live
   * site did not change: it was being served a cached copy made before the
   * fix existed. Here it runs on whatever the cache returns, so it is right
   * on the first request after a deploy rather than an hour later.
   *
   * It is cheap enough to do per request: a pure pass over the sections that
   * are about to be drawn anyway, idempotent, and a no-op for a site whose
   * links are already right. A creator's own /blog stays a link because
   * their page key is in this set.
   */
  const linked = pageWithLiveLinks(stored, new Set(Object.keys(site.pages)))

  // "index" for the front page, `page.<key>` for the rest: the name a
  // section reads as `page.template` and writes `allowed_templates` against.
  const template = templateForPage(pageKey)
  const { sections, data } = await dressPage(site, linked, products, productCount, template, pageTitleFromKey(pageKey))
  /* `shop.name` falls back to the creator's public name when the store has
     none set: lib/storelib-theme/globals.ts. Nothing per visitor here. */
  /* The page's title rides on `page` too, for the Breadcrumbs section's trail. */
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, template, products, { title: pageTitleFromKey(pageKey) }, data, {
    shop: { name: site.displayName },
  })
  return { kind: "site", site: { ...site, sections, prerendered } }
}

/**
 * ===========================================================================
 *  A PAGE'S OWN FACTS, PUT IN BEFORE IT IS DRAWN
 * ===========================================================================
 * Per request and outside the cache, like the live-links pass above, and
 * for the same reason: it reads the shop, which changes on its own clock.
 *
 *   1. Any product a picker names that the shop's newest list does not
 *      hold is read, by id or slug, this creator's and published only.
 *   2. Every placeholder in a setting is filled from the shop, the creator
 *      and the page (lib/website-builder/storefront-data.ts), for both
 *      kinds of section, so neither ever draws `{{ shop.name }}`.
 *   3. The menus and the catalogue go to the engine with the facts, for
 *      `link_list`, `product_picker`, `product_list` and the `shop`,
 *      `creator` and `product` roots.
 *
 * A page with no pickers and no placeholders makes no read here and gets
 * its own sections back unchanged.
 */
export async function dressPage(
  site: PageOwner,
  sections: SectionInstance[],
  products: ProductCard[],
  productCount: number | null,
  template: string,
  pageTitle: string,
  product?: StorefrontProduct,
  /**
   * A preview or a cover is one person looking at unpublished work, never
   * held in a cache anybody else reads, so its picked products are read
   * directly. Everything published is cached with the shop.
   */
  opts: { cached: boolean } = { cached: true },
): Promise<{ sections: SectionInstance[]; data: StorefrontData }> {
  const schemaOf = (type: string) => schemaFor(type, site.sources, SECTION_SCHEMAS)
  const missing = missingReferences(productReferences(sections, schemaOf), products)
  const read = () => pickedProducts(createAdminClient() as never, site.creatorId, missing)
  const picked = missing.ids.length || missing.slugs.length
    ? opts.cached
      ? await unstable_cache(
          read,
          ["picked-products", site.creatorId, [...missing.ids].sort().join(","), [...missing.slugs].sort().join(",")],
          { tags: [creatorShopTag(site.creatorId)], revalidate: SHOP_TTL },
        )()
      : await read()
    : []
  const { siteOrigin } = await import("@/lib/website-builder/site-seo-data")
  const siteUrl = await siteOrigin(site.creatorId, site.displayName).catch(() => "")
  const dynamic = dynamicContext({
    theme: site.themeSettings,
    creator: site.profile,
    siteUrl,
    productCount,
    product: product ?? null,
    pageTitle,
    template,
  })
  const filled = withDynamicSources(sections, schemaOf, dynamic)
  /* The communities a community_picker names: the creator's own, published and public, while communities are on. A minute in the cache, like the shop. */
  const communityIds = communityReferences(sections, schemaOf)
  const communities = communityIds.length
    ? await (async () => {
        const { communityCardsFor } = await import("@/lib/communities/server/blocks")
        const read = () => communityCardsFor(createAdminClient() as never, site.creatorId, communityIds)
        return opts.cached
          ? unstable_cache(read, ["community-cards", site.creatorId, [...communityIds].sort().join(",")], { revalidate: SHOP_TTL })()
          : read()
      })().catch(() => ({}))
    : undefined
  const data = storefrontData({
    dynamic,
    catalog: mergeCatalog(products, picked),
    menus: siteMenus(site.themeSettings, filled),
    communities,
  })
  return { sections: filled, data }
}

/**
 * ===========================================================================
 *  THE SITE'S OWN 404 PAGE, DRAWN FOR AN ADDRESS IT DOES NOT HAVE
 * ===========================================================================
 * What the creator arranged on their 404 page, or the generated one (their
 * header and footer around the `not_found` section) until they do. Drawn
 * the way every other page is: live links, placeholders, picked products.
 *
 * Handed to app/(site)/w/[username]/not_found, which the 404 answer fetches
 * on the visitor's side: Next draws a missing page with the one root 404,
 * which cannot know whose site it is on, so the status stays a real 404 and
 * the page inside it becomes the creator's. See app/not-found.tsx.
 */
export interface NotFoundPage {
  template: string
  title: string
  theme: ThemeSettingsValues
  sections: SectionInstance[]
  prerendered: Record<string, RenderedSection>
  storefront: { creatorId: string; installId: string }
}

export async function publishedNotFoundPage(name: string): Promise<NotFoundPage | null> {
  const found = await resolveSite(name)
  if (found.kind !== "site") return null
  const { site, products, productCount } = found
  const stored = site.pages[NOT_FOUND_PAGE_KEY]
  const arranged = stored && stored.length > 0 ? stored : notFoundSections(site.pages.home ?? site.sections)
  const linked = pageWithLiveLinks(arranged, new Set(Object.keys(site.pages)))
  const template = templateForPage(NOT_FOUND_PAGE_KEY)
  const title = pageTitleFromKey(NOT_FOUND_PAGE_KEY)
  const { sections, data } = await dressPage(site, linked, products, productCount, template, title)
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, template, products, undefined, data, { shop: { name: site.displayName } })
  const brand = typeof site.themeSettings.brand_name === "string" ? site.themeSettings.brand_name.trim() : ""
  return {
    template,
    title: `${title} | ${brand || site.displayName}`,
    theme: site.themeSettings,
    sections,
    prerendered,
    storefront: { creatorId: site.creatorId, installId: site.installId },
  }
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
  | { kind: "site"; site: PublishedSite; products: ProductCard[]; productCount: number | null }
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
  const [products, productCount] = await Promise.all([
    unstable_cache(
      () => shopProducts(createAdminClient() as never, match.creatorId),
      ["shop-products", match.creatorId],
      { tags: [creatorShopTag(match.creatorId)], revalidate: SHOP_TTL },
    )(),
    /* How many there are in all, for `shop.product_count`: the list above stops at 24. */
    unstable_cache(
      () => publishedProductCount(createAdminClient() as never, match.creatorId),
      ["shop-count", match.creatorId],
      { tags: [creatorShopTag(match.creatorId)], revalidate: SHOP_TTL },
    )(),
  ])

  return { kind: "site", site: found.site, products, productCount }
}

/**
 * The same cached catalogue, for a route that already knows whose it is: the
 * product page, so a product list placed on it draws the shop there too.
 * Same key and tag as above, so the two share one entry and one purge.
 */
export async function cachedShopProducts(creatorId: string): Promise<ProductCard[]> {
  if (!creatorId) return []
  return unstable_cache(
    () => shopProducts(createAdminClient() as never, creatorId),
    ["shop-products", creatorId],
    { tags: [creatorShopTag(creatorId)], revalidate: SHOP_TTL },
  )()
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
  for (const name of await siteNames(creatorId)) revalidatePath(`/w/${name}`, "layout")
}

/**
 * Every name a creator's site is served under, the names `lookUpName`
 * answers to: the profile's username, the creator's slug, and the name the
 * website was given in Website Settings.
 *
 * This used to ask `profiles` for the row whose id was the CREATOR's id. A
 * profile's id is the user's, so it found nothing, then asked `creators` for
 * a `username` column it does not have, found nothing again, and no publish
 * ever purged a rendered page: a creator pressed Publish and watched the old
 * site until the minute ran out, which is the thing this purge exists to stop.
 */
async function siteNames(creatorId: string): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data: creator } = await admin
      .from("creators")
      .select("user_id, slug")
      .eq("id", creatorId)
      .maybeSingle()
    const row = creator as { user_id?: string | null; slug?: string | null } | null
    const [profile, handle] = await Promise.all([
      row?.user_id
        ? admin.from("profiles").select("username").eq("id", row.user_id).maybeSingle().then((r) => (r.data as { username?: string | null } | null)?.username ?? null)
        : Promise.resolve(null),
      websiteHandleOf(creatorId, admin).catch(() => null),
    ])
    const names = [profile, row?.slug ?? null, handle]
      .filter((n): n is string => typeof n === "string" && n.trim() !== "")
      .map((n) => n.trim().toLowerCase())
    return [...new Set(names)]
  } catch {
    // A purge that cannot find the name is better than a publish that fails.
    return []
  }
}

/**
 * ===========================================================================
 *  THE OWNER OF A PAGE THAT IS NOT THE CACHED PUBLISHED SITE
 * ===========================================================================
 * A product page, a preview link or a cover render reads its own install,
 * so it builds the same facts the published site carries: the saved
 * section files, the creator's public profile, the shop's newest products
 * and how many there are.
 *
 * `cached` is for the live product page, which every visitor opens: the
 * shop is held under the same keys and tags as the published site's, so a
 * price change reaches both together, and the profile under the site's
 * tag, so it changes when somebody publishes. A preview or a cover is one
 * person's view of unpublished work and reads everything directly.
 */
export async function ownerOf(
  creatorId: string,
  installId: string,
  themeSettings: ThemeSettingsValues,
  opts: { cached: boolean } = { cached: false },
): Promise<{ owner: PageOwner; products: ProductCard[]; productCount: number | null }> {
  const admin = createAdminClient()
  const readProfile = () => creatorFacts(createAdminClient() as never, creatorId)
  const readProducts = () => shopProducts(createAdminClient() as never, creatorId)
  const readCount = () => publishedProductCount(createAdminClient() as never, creatorId)
  const [sources, profile, products, productCount] = await Promise.all([
    sectionSources(admin as never, installId),
    opts.cached
      ? unstable_cache(readProfile, ["creator-facts", creatorId], { tags: [creatorSiteTag(creatorId)], revalidate: SITE_TTL })()
      : readProfile(),
    opts.cached
      ? unstable_cache(readProducts, ["shop-products", creatorId], { tags: [creatorShopTag(creatorId)], revalidate: SHOP_TTL })()
      : readProducts(),
    opts.cached
      ? unstable_cache(readCount, ["shop-count", creatorId], { tags: [creatorShopTag(creatorId)], revalidate: SHOP_TTL })()
      : readCount(),
  ])
  const name = profile.name ?? ""
  return {
    owner: {
      creatorId,
      displayName: name,
      themeSettings,
      sources,
      profile: { name, headline: profile.headline ?? "", bio: profile.bio ?? "", avatar: profile.avatar ?? "" },
    },
    products,
    productCount,
  }
}
