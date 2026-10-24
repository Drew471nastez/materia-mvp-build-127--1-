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
import { kindLookup } from "@/lib/storelib-theme/section-groups"
import { siteRead } from "@/lib/website-builder/site-read"
import { cache } from "react"
import { unstable_cache, revalidateTag, revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorIdByHandle, websiteHandleOf } from "@/lib/website-builder/site-address-data"
import { isBanned } from "@/lib/seo/bans"
import { renderWithSources, sectionSources, sourcesFromFiles } from "@/lib/website-builder/storefront-render"
import { livePointer, releaseFiles, releaseManifest, type LivePointer } from "@/lib/website-builder/site-releases-server"
import { pageRowsOf, settingsRowOf } from "@/lib/website-builder/site-releases"
import { siteLocalizer, type Localizer } from "@/lib/markets/live"
import { shopCatalogue, shopProducts, type ProductCard } from "@/lib/website-builder/shop-products"
import { pageSections, themeSettings as themeSettingsOf } from "@/lib/website-builder/preview-link"
import { storeMenusOrNull, withStoreMenus } from "@/lib/website-builder/store-menus-server"
import { withThemeBreadcrumbs } from "@/lib/website-builder/theme-breadcrumbs"
import { NOT_FOUND_PAGE_KEY, pageTitleFromKey, templateForPage } from "@/lib/website-builder/site-pages"
import { notFoundSections, searchListsTheShop } from "@/lib/website-builder/shop-page"
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
  pageWantsCollections,
  pageWantsReviews,
} from "@/lib/website-builder/storefront-data"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"
import { creatorFacts, pickedProducts, publishedProductCount } from "@/lib/website-builder/storefront-data-server"
import { schemaLookupFrom } from "@/lib/website-builder/custom-schemas"
import type { RenderedSection } from "@/components/website-builder/sections/storelib-sources"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { StorefrontCollection, StorefrontData } from "@/lib/storelib-theme/types"
import { siteStoreName, siteTabTitle } from "./tab-title"

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
  /** The creator's account (creators.user_id), so a read that needs it does not ask for it again. Optional, as above. */
  userId?: string | null
}

const userIdOf = (c: { user_id?: unknown }) => (typeof c.user_id === "string" && c.user_id ? c.user_id : null)

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

  /* A failed read throws (lib/website-builder/site-read.ts): never "no such site" because the database blinked. */
  const profile = await siteRead("profile", (signal) => admin
    .from("profiles")
    .select("id, display_name, username")
    .eq("username", lower)
    .abortSignal(signal)
    .maybeSingle())

  if (profile) {
    const creator = await siteRead("creator", (signal) => admin
      .from("creators")
      .select("*")
      .eq("user_id", (profile as { id: string }).id)
      .abortSignal(signal)
      .maybeSingle())
    if (creator) {
      if (isBanned(creator as { banned_at?: string | null })) return null
      const p = profile as { display_name?: string | null; username?: string | null }
      const c = creator as { id: string; slug?: string | null; display_name?: string | null }
      /* The profile's name first: `creators.display_name` is a copy written
         when the account was made and edited by nothing since, so it held
         the name a renamed creator no longer uses (lib/account/identity). */
      return { creatorId: c.id, displayName: p.display_name || c.display_name || p.username || name, slug: c.slug ?? null, userId: userIdOf(creator as { user_id?: unknown }) }
    }
  }

  const bySlug = await siteRead("creator by slug", (signal) => admin
    .from("creators")
    .select("*")
    .eq("slug", lower)
    .abortSignal(signal)
    .maybeSingle())
  if (bySlug) {
    if (isBanned(bySlug as { banned_at?: string | null })) return null
    const c = bySlug as { id: string; slug?: string | null; display_name?: string | null }
    return { creatorId: c.id, displayName: c.display_name || c.slug || name, slug: c.slug ?? null, userId: userIdOf(bySlug as { user_id?: unknown }) }
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
      return { creatorId: c.id, displayName: c.display_name || c.slug || name, slug: c.slug ?? null, userId: userIdOf(creator as { user_id?: unknown }) }
    }
  }
  return null
}

/**
 * A name to the creator behind it, cached for a minute like the lookup
 * above. The product page on a site needs only this: the address claims an
 * owner and the product either belongs to them or does not.
 */
/* Once per request too (React's cache): a page and its metadata are drawn side by side and both ask first thing. */
export const creatorByName = cache(async function creatorByName(name: string): Promise<NameMatch | null> {
  const lower = name.toLowerCase()
  return unstable_cache(() => lookUpName(lower), ["site-name", lower], { revalidate: NAME_TTL })()
})

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

/**
 * `pointer` names the live release Publish wrote (SQL part 180,
 * lib/website-builder/site-releases-server.ts): when there is one for the
 * published install, its settings, pages and section files are what was
 * published, read through caches that never go stale. Null, or a release
 * that cannot be read: the rows, exactly as before releases.
 */
async function buildSite(creatorId: string, displayName: string, pointer: LivePointer | null = null): Promise<BuiltLookup> {
  const admin = createAdminClient()

  /*
    WHAT NEEDS ONLY THE CREATOR, OR ONLY THE RELEASE, IS ASKED WITH THE
    INSTALL: the creator's public facts, and the live release's manifest
    (the pointer was read from the same published install). Each used to
    wait for the read before it.
  */
  const profilePromise = creatorFacts(admin as never, creatorId)
  const manifestPromise = pointer ? releaseManifest(pointer.releaseId) : Promise.resolve(null)

  /* Thrown, not "unpublished", when the database did not answer: that was cached for an hour as "Coming soon". */
  const install = await siteRead("published install", (signal) => admin
    .from("store_theme_installs")
    .select("id, name, status, store_theme_settings ( settings, draft_settings )")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle())

  if (!install) return { kind: "unpublished", displayName }

  const row = install as { id: string; name?: string | null; store_theme_settings?: unknown }
  /* Menus and the release do not depend on each other. The page rows only need the install. */
  const menusPromise = storeMenusOrNull(admin, creatorId)
  const pagesPromise = siteRead("pages", (signal) => admin
    .from("store_theme_pages")
    .select("page_key, sections, draft_sections")
    .eq("install_id", row.id)
    .abortSignal(signal))
  void pagesPromise.catch(() => {})
  /* Only a release of the install that is published now. Without one, the saved section files are asked for at once. */
  const rowsSources = pointer && pointer.installId === row.id ? null : sectionSources(admin as never, row.id)
  /* Awaited below; a failure is thrown there, never left unhandled while the menus are read. */
  void rowsSources?.catch(() => {})
  const manifest = pointer && pointer.installId === row.id ? await manifestPromise : null
  const releaseSources = manifest ? await releaseFiles(manifest).then((files) => (files ? sourcesFromFiles(files) : null)) : null
  /* Drawn from the release only when all of it could be read. */
  const release = manifest && releaseSources ? manifest : null
  const settingsRow = release
    ? settingsRowOf(release)
    : Array.isArray(row.store_theme_settings)
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
  /* The store's menus over the theme's own, when the store has them (lib/website-builder/store-menus-server.ts). */
  const themeSettings = sanitizeThemeSettings(
    withStoreMenus((themeSettingsOf(settingsRow as never, false) ?? {}) as ThemeSettingsValues, await menusPromise),
  )

  /* The saved section files first: a creator's own section is cleaned by
     the schema its file declares, below, not only by the built-in ones. */
  const [sources, profile] = await Promise.all([
    releaseSources ?? rowsSources ?? sectionSources(admin as never, row.id),
    profilePromise,
  ])
  const ownSchemas = schemaLookupFrom(sources)

  if (release) void pagesPromise.catch(() => {})
  const pageRows = release ? pageRowsOf(release) : await pagesPromise

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
  const dressed = applyUniversalChrome(pages, "home", kindLookup(sources, SECTION_SCHEMAS as never))
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
      profile: { name: profile.name ?? displayName, headline: profile.headline ?? "", bio: profile.bio ?? "", avatar: profile.avatar ?? "", ...(profile.storeName ? { storeName: profile.storeName } : {}) },
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
export async function publishedSiteByName(name: string, pageKey = "home", locale: string | null = null, market: string | null = null): Promise<SiteLookup> {
  const found = await resolveSite(name)
  if (found.kind !== "site") return found
  const { site } = found
  /*
    IN ANOTHER LANGUAGE (/fr/…, lib/markets/live.ts): the store's approved
    translations laid over the page's texts and the products' titles before
    anything is drawn. A language that is not published, or has nothing
    approved yet, draws the page as it is.
  */
  /* The website's default language too (no language in the address): a store whose default is Spanish and whose theme is written in English reads Spanish here (siteLocalizer answers null when there is nothing to lay over). */
  const localizer = await siteLocalizer(site.creatorId, locale, market)
  const products = localizer ? localizer.cards(found.products) : found.products
  const productCount = found.productCount

  const original = site.pages[pageKey] ?? (pageKey === "home" ? site.sections : undefined)
  if (!original) return { kind: "missing" }
  const stored = localizer ? localizer.sections(original, site.sources) : original
  /* Its menus and search engine text too (lib/markets/translate localizeTheme). */
  const themeSettings = localizer ? localizer.theme(site.themeSettings as Record<string, unknown>) as typeof site.themeSettings : site.themeSettings

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
  const { sections, data } = await dressPage({ ...site, themeSettings }, linked, products, productCount, template, pageTitleFromKey(pageKey), undefined, { cached: true, localizer })
  /* `shop.name` falls back to Store details' store name, then the creator's
     public name, when the theme has none set: lib/storelib-theme/globals.ts.
     Nothing per visitor here. */
  /* The page's title rides on `page` too, for the Breadcrumbs section's trail. */
  const prerendered = renderWithSources(site.sources, sections, themeSettings, template, products, { title: pageTitleFromKey(pageKey) }, data, {
    shop: { name: site.profile?.storeName || site.displayName },
  })
  return { kind: "site", site: { ...site, themeSettings, sections, prerendered } }
}

/**
 * The whole shop for a listing page (/products, /collections/<handle>,
 * /search), up to 240 products newest first, for catalogPage to cut into
 * pages. Cached with the shop and cleared with it (creatorShopTag); a
 * preview reads it directly. The sections on every other page keep the
 * newest 24 from the site lookup.
 */
export async function siteCatalogue(creatorId: string, opts: { cached: boolean } = { cached: true }): Promise<ProductCard[]> {
  const read = () => shopCatalogue(createAdminClient() as never, creatorId)
  return opts.cached ? unstable_cache(read, ["shop-catalogue", creatorId], { tags: [creatorShopTag(creatorId)], revalidate: SHOP_TTL })() : read()
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
  opts: { cached: boolean; localizer?: Localizer | null } = { cached: true },
): Promise<{ sections: SectionInstance[]; data: StorefrontData }> {
  const localizer = opts.localizer ?? null
  const schemaOf = (type: string) => schemaFor(type, site.sources, SECTION_SCHEMAS)
  const missing = missingReferences(productReferences(sections, schemaOf), products)
  const read = () => pickedProducts(createAdminClient() as never, site.creatorId, missing)
  const sourceOf = (type: string) => site.sources[`sections/${type}.storelib`] ?? DEFAULT_THEME_SOURCES[`sections/${type}.storelib`]
  const communityIds = communityReferences(sections, schemaOf)
  /* The page's extra reads do not depend on each other. Asking them together is the difference between a slow page and a fast one. */
  const [pickedRead, siteUrl, communities, collectionsRead, reviews] = await Promise.all([
    missing.ids.length || missing.slugs.length
      ? opts.cached
        ? unstable_cache(
            read,
            ["picked-products", site.creatorId, [...missing.ids].sort().join(","), [...missing.slugs].sort().join(",")],
            { tags: [creatorShopTag(site.creatorId)], revalidate: SHOP_TTL },
          )()
        : read()
      : Promise.resolve([] as ProductCard[]),
    import("@/lib/website-builder/site-seo-data").then(({ siteOrigin }) => siteOrigin(site.creatorId, site.displayName).catch(() => "")),
    communityIds.length
      ? import("@/lib/communities/server/blocks").then(({ communityCardsFor }) => {
          const load = () => communityCardsFor(createAdminClient() as never, site.creatorId, communityIds)
          return opts.cached ? unstable_cache(load, ["community-cards", site.creatorId, [...communityIds].sort().join(",")], { revalidate: SHOP_TTL })() : load()
        }).catch(() => ({}))
      : Promise.resolve(undefined),
    pageWantsCollections(sections, schemaOf, sourceOf)
      ? import("@/lib/website-builder/storefront-collections-server").then(({ siteCollections }) => {
          const load = async () => (await siteCollections(createAdminClient(), site.creatorId)).collections
          return opts.cached ? unstable_cache(load, ["site-collections", site.creatorId], { tags: [creatorShopTag(site.creatorId)], revalidate: SHOP_TTL })() : load()
        }).catch(() => undefined)
      : Promise.resolve(undefined),
    pageWantsReviews(sections, sourceOf)
      ? import("@/lib/reviews/storefront-server").then(({ storefrontReviews }) =>
          storefrontReviews(site.creatorId, product?.id ? { id: product.id, title: product.title ?? null } : null, localizer ? { locale: localizer.locale, isDefault: localizer.locale === localizer.defaultLanguage } : null) as unknown as Promise<Record<string, unknown>>,
        ).catch(() => undefined)
      : Promise.resolve(undefined),
  ])
  /* In the page's language and the visitor's currency, as the shop's own cards around them are: a picked product used to show untranslated, in the store's currency, beside converted ones. */
  const picked = opts.localizer && pickedRead.length ? opts.localizer.cards(pickedRead) : pickedRead
  const dynamic = dynamicContext({
    theme: site.themeSettings,
    creator: site.profile,
    siteUrl,
    productCount,
    product: product ?? null,
    pageTitle,
    template,
  })
  /* Theme settings › Breadcrumbs: the bar under the header on every page but home (theme-breadcrumbs.ts). */
  const filled = withDynamicSources(withThemeBreadcrumbs(searchListsTheShop(sections), site.themeSettings, template), schemaOf, dynamic)
  /* In the visitor's language and currency: each collection's title and description (collection:<id>), its products as the page's cards. */
  const collections = localizer && collectionsRead
    ? Object.fromEntries(
        Object.entries(collectionsRead as Record<string, StorefrontCollection>).map(([id, c]) => [id, { ...localizer.collection(c as unknown as Record<string, unknown> & { id: string }), products: localizer.cards(c.products as never) } as unknown as StorefrontCollection]),
      )
    : collectionsRead
  const data = storefrontData({
    dynamic,
    catalog: mergeCatalog(products, picked),
    menus: siteMenus(site.themeSettings, filled),
    communities,
    /* In the page's language: each collection's approved name and description (lib/markets/live.ts collection). */
    collections: collections && opts.localizer ? Object.fromEntries(Object.entries(collections).map(([k, c]) => [k, opts.localizer!.collection(c as never)])) : collections,
    reviews,
    /* The words a section draws itself (Price, Verified buyer), in the page's language: `words` in a template. */
    words: localizer?.words,
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
  storefront: { creatorId: string; installId: string; words?: Record<string, string> }
}

/** `locale`: the page's language (/fr/not_found); null, the website's default, whose translations are laid over too. */
export async function publishedNotFoundPage(name: string, locale: string | null = null): Promise<NotFoundPage | null> {
  const found = await resolveSite(name)
  if (found.kind !== "site") return null
  /* In the visitor's language, as every other page of the site: its texts, menus, products and the shop's own words (lib/markets/live.ts). */
  const localizer = await siteLocalizer(found.site.creatorId, locale).catch(() => null)
  const site = localizer ? { ...found.site, themeSettings: localizer.theme(found.site.themeSettings as Record<string, unknown>) as typeof found.site.themeSettings } : found.site
  const products = localizer ? localizer.cards(found.products) : found.products
  const { productCount } = found
  const stored = site.pages[NOT_FOUND_PAGE_KEY]
  const arranged = stored && stored.length > 0 ? stored : notFoundSections(site.pages.home ?? site.sections)
  const linked = pageWithLiveLinks(localizer ? localizer.sections(arranged, site.sources) : arranged, new Set(Object.keys(site.pages)))
  const template = templateForPage(NOT_FOUND_PAGE_KEY)
  const title = pageTitleFromKey(NOT_FOUND_PAGE_KEY)
  const { sections, data } = await dressPage(site, linked, products, productCount, template, title, undefined, { cached: true, localizer })
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, template, products, undefined, data, { shop: { name: site.profile?.storeName || site.displayName } })
  return {
    template,
    /* "Page not found | <store>", as every page of the site names itself (./tab-title.ts). */
    title: siteTabTitle({ page: { kind: "not-found" }, storeName: siteStoreName({ brandName: site.themeSettings.brand_name, storeName: site.profile?.storeName, displayName: site.displayName }) }),
    theme: site.themeSettings,
    sections,
    prerendered,
    storefront: { creatorId: site.creatorId, installId: site.installId, ...(localizer && Object.keys(localizer.words).length ? { words: localizer.words } : {}) },
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
/**
 * THE LAST GOOD COPY OF EACH SITE, kept by this server. When a read throws
 * (site-read.ts) and the cache has nothing to fall back on (a cold start, a
 * new server), the site is served as it last was rather than not at all.
 */
const lastGood = new Map<string, ShopLookup>()
const LAST_GOOD_MAX = 500

const resolveSite = cache(async function resolveSite(name: string): Promise<ShopLookup> {
  const lower = name.toLowerCase()
  try {
    const found = await resolveSiteFresh(lower)
    if (found.kind === "site") {
      if (lastGood.size >= LAST_GOOD_MAX && !lastGood.has(lower)) lastGood.delete(lastGood.keys().next().value as string)
      lastGood.set(lower, found)
    }
    return found
  } catch (e) {
    const held = lastGood.get(lower)
    if (held) {
      console.error(`[published-site] served the last good copy of ${lower}:`, e instanceof Error ? e.message : e)
      return held
    }
    throw e
  }
})

async function resolveSiteFresh(lower: string): Promise<ShopLookup> {

  /* The name lookup above, shared with the metadata's in the same request. */
  const match = await creatorByName(lower)

  if (!match) {
    const to = await unstable_cache(() => renamedTo(lower), ["site-renamed", lower], { revalidate: NAME_TTL })()
    return to ? { kind: "renamed", to } : { kind: "missing" }
  }

  /*
    WHICH RELEASE IS LIVE, the one read held only for a minute (and purged
    by Publish with the rest of the site). The site itself is then held
    under the release's id: a release never changes, so the key says
    exactly what was drawn. No release: the key of old, and the rows.
  */
  /*
    THE SHOP IS ASKED FOR NOW, beside the site rather than after it. It needs
    only the creator, and its reads (the products, their options, stock and
    stars) took as long again as the whole site did, one after the other.
    Read for nothing only when nothing is published, and then held for its
    minute like any other shop read.
  */
  const shop = Promise.all([
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
  /* Never an unhandled rejection when the site is not there to wait for it. */
  void shop.catch(() => {})

  const pointer = await livePointer(match.creatorId, [creatorSiteTag(match.creatorId)])
  const releaseId = pointer?.releaseId ?? null
  const found = await unstable_cache(
    () => buildSite(match.creatorId, match.displayName, pointer),
    releaseId ? ["published-site", match.creatorId, "release", releaseId] : ["published-site", match.creatorId],
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
   * Asked above, beside the site.
   */
  const [products, productCount] = await shop

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
   * EXPIRED AT ONCE, NOT MARKED STALE. The second argument is when the
   * entries under the tag stop being served at all. With `{ expire: 3600 }`
   * (what this said before) Next 16 marks every entry stale now and keeps
   * serving it for the hour while it is read again behind the visitor
   * (next/dist/server/lib/incremental-cache/tags-manifest.external.js:
   * `stale` now, `expired` an hour on). So the first request after a
   * Publish, on every page Next draws per request (the cart, search, an
   * imported theme's pages, the language and market copies the purge below
   * does not name), read the OLD live release pointer and drew the old
   * theme, and the refresh after it drew the new one: the owner's "back
   * from checkout shows my old theme until I refresh".
   *
   * `expire: 0` is a miss for every entry written before now, in the data
   * cache and in every rendered page that carries the tag, on every server.
   * The next visitor pays one read; nobody is served the previous release.
   */
  revalidateTag(creatorSiteTag(creatorId), { expire: 0 })

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
 * One product's page on the creator's website, after a save. The page is
 * held for a minute like the rest of the site
 * (app/(site)/w/[username]/products/[slug]), and the shop tag a save clears
 * hands the next visitor the old copy while a new one is drawn. Purging the
 * address itself means the creator who saves and presses View sees what
 * they saved. A publish or a take down clears every page instead
 * (revalidatePublishedSite).
 */
/**
 * A creator saved something the website's pages show of the shop: a
 * product's name, price or picture, which channel it is on. Clearing the
 * shop's data (creatorShopTag, which the caller does) is not enough on its
 * own: the front page's Featured products and every product grid were drawn
 * from the old data and are held for their minute as rendered pages. So
 * every rendered page of the site goes too, and the creator who saves and
 * opens their website sees the new price, not the old one for up to a
 * minute. Only for a save a person made; the database's own pings (stock
 * after an order) keep to the tag, so a busy shop is not drawn again on
 * every sale.
 */
export async function revalidatePublishedPages(creatorId: string): Promise<void> {
  if (!creatorId) return
  for (const name of await siteNames(creatorId)) revalidatePath(`/w/${name}`, "layout")
}

export async function revalidatePublishedProduct(creatorId: string, slug: string): Promise<void> {
  if (!creatorId || !slug) return
  for (const name of await siteNames(creatorId)) revalidatePath(`/w/${name}/products/${slug}`)
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
/**
 * The admin client for a read that is about to be cached: a failed read
 * throws rather than coming back empty, so a database that blinked is never
 * held for an hour as "this site has no section files".
 */
function failingLoudly() {
  const admin = createAdminClient()
  return { from: (table: string) => ({ select: (columns: string) => admin.from(table).select(columns).throwOnError() }) }
}

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
    /* The saved section files go live on Publish (theme-file-drafts.ts), so the live page holds them with the site, as buildSite does. */
    opts.cached
      ? unstable_cache(() => sectionSources(failingLoudly() as never, installId), ["section-sources", installId], { tags: [creatorSiteTag(creatorId)], revalidate: SITE_TTL })()
      : sectionSources(admin as never, installId),
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
      profile: { name, headline: profile.headline ?? "", bio: profile.bio ?? "", avatar: profile.avatar ?? "", ...(profile.storeName ? { storeName: profile.storeName } : {}) },
    },
    products,
    productCount,
  }
}
