/**
 * ===========================================================================
 *  THE LIVE SITE OF AN IMPORTED SHOPIFY THEME: WHAT IT IS DRAWN FROM
 * ===========================================================================
 * The creator's published install (its files, its theme settings, its
 * pages) and their shop (products, collections, menus), read here and handed
 * to lib/storelib-theme/compat/site.ts, which answers the request. The proxy
 * sends a site's addresses here when its published install is an imported
 * theme (proxy.ts, compatSiteFor).
 *
 * THE FILES ARE HELD IN MEMORY, per install and per publish. A theme is a
 * few megabytes of text, read once after each publish rather than per
 * visitor; the parsed templates are held with them (CompatTheme's own cache),
 * so a page is drawn without parsing anything. A preview reads the drafts
 * and holds nothing.
 */
import { creatorAvatar, siteOrigin } from "./site-seo-data"
import { compatSearchHead } from "./compat-search"
import { imagesOnPage, siteSameAs } from "./site-seo"
import { pageSeoForSite } from "@/lib/website-builder/page-seo"
import { unstable_cache } from "next/cache"
import { SiteReadError, siteRead } from "@/lib/website-builder/site-read"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorByName, creatorShopTag, creatorSiteTag, siteCatalogue } from "@/lib/website-builder/published-site"
import { catalogCards } from "@/lib/website-builder/shop-products"
import { siteCollections } from "@/lib/website-builder/storefront-collections-server"
import { readStoreMenus, storeMenusOrNull } from "@/lib/website-builder/store-menus-server"
import { mayPreview, pageSections, themeSettings as themeSettingsOf } from "@/lib/website-builder/preview-link"
import { sanitizeRichText } from "@/lib/website-builder/sanitize"
import { assetAddresses, compatOf } from "@/lib/storelib-theme/compat/install"
import { assetVersion, themeDigest } from "@/lib/storelib-theme/compat/asset-version"
import { drawPage, themeOfInstall, type StoredSection } from "@/lib/storelib-theme/compat/page"
import { POLICY_HANDLES, type CartStock, type SiteData } from "@/lib/storelib-theme/compat/site"
import { isBlankHtml, policyBodyOf } from "@/lib/website-builder/policy-editing"
import { POLICY_PAGES, SHIPPING_POLICY } from "@/lib/website-builder/policy-pages"

const POLICY_TITLES: Record<string, string> = Object.fromEntries([...POLICY_PAGES, SHIPPING_POLICY].map((p) => [p.key, p.title]))
import type { CompatTheme } from "@/lib/storelib-theme/compat/theme"
import type { CollectionLike } from "@/lib/storelib-theme/compat/objects"
import { compatMenus } from "@/lib/storelib-theme/compat/menus"
import { liveNavigationEnd, liveNavigationMarkup } from "./live-navigation"
import { siteVitalsScript } from "@/lib/perf/site-vitals-inline"
import { storeIdentity } from "@/lib/store/identity-server"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { liveVariant, physicalStock, type StockVariant } from "@/lib/physical/storefront-stock"
import { orderLimits } from "@/lib/physical/order-limit"
import { returnFactsHtml, returnsLine, siteCommerce } from "./site-commerce"
import { shopFacts } from "@/lib/physical/storefront-facts"
import { productFaqs } from "@/lib/products/product-section-data"
import { withPageFacts } from "@/lib/storelib-theme/compat/product-facts"
import { pageFactsFor } from "@/lib/storelib-theme/compat/product-facts-server"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import { moneyFormatFor } from "@/lib/markets/pricing"
import { liveRelease, releaseFiles } from "./site-releases-server"
import { pageRowsOf, settingsRowOf } from "./site-releases"
import { siteIconUrl } from "./site-icon"

/** Theme settings › Branding's store name, when the website has one of its own. */
const brandOf = (settings: unknown): string => {
  const v = (settings as { brand_name?: unknown } | null)?.brand_name
  return typeof v === "string" ? v.trim() : ""
}

type Admin = ReturnType<typeof createAdminClient>
type Row = { path: string; content: string | null; draft_content?: string | null }

/** Where a theme's own files are served from, on the site and in the builder alike. */
export function themeAssetUrl(installId: string, version: string, name: string): string {
  return `/api/site-theme/assets/${installId}/${encodeURIComponent(version)}/${encodeURIComponent(name)}`
}

/** Every file of an install: the live half, or for a preview and the builder, the draft where there is one. */
export async function installFiles(admin: Admin, installId: string, draft: boolean): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const page = 1000
  for (let from = 0; from < 20_000; from += page) {
    const table = () => admin.from("store_theme_custom_files")
    let res: { data: unknown; error: unknown } = draft
      ? await table().select("path, content, draft_content").eq("install_id", installId).order("path").range(from, from + page - 1)
      : await table().select("path, content").eq("install_id", installId).order("path").range(from, from + page - 1)
    /* Before the file drafts SQL there is no draft column: the live half. */
    if (res.error && draft) res = await table().select("path, content").eq("install_id", installId).order("path").range(from, from + page - 1)
    /* A page of files that did not come is not a theme without them: thrown, so a half-read theme is never held as the theme (site-read.ts). */
    if (res.error) throw new SiteReadError("theme files", (res.error as { message?: string }).message ?? "the read failed")
    const rows = (res.data ?? []) as Row[]
    for (const r of rows) {
      const text = draft ? (r.draft_content ?? r.content) : r.content
      if (typeof text === "string" && text !== "") out[r.path] = text
    }
    if (rows.length < page) break
  }
  return out
}

function shopImage(media: Record<string, string>, v: string): string {
  const name = v.match(/^shopify:\/\/shop_images\/([^?#]+)/)?.[1]
  if (!name) return ""
  try {
    return media[decodeURIComponent(name)] ?? ""
  } catch {
    return ""
  }
}

/**
 * The theme an install draws, with its assets where they are served from.
 *
 * A live file's address is versioned by what it is drawn from, not by the
 * publish (lib/storelib-theme/compat/asset-version.ts): a setting saved
 * without Publish moves the address of a `.css.liquid` file, and a Publish
 * that left a file alone leaves its address, and the visitor's cached copy,
 * alone. Worked out once per file per theme; the theme is held per publish
 * and settings (holdTheme). A draft keeps its own version, which the route
 * never caches.
 */
export function compatThemeFor(installId: string, version: string, rows: Record<string, string>, settings: unknown): CompatTheme {
  const media = assetAddresses(rows)
  const draft = version === "edit" || version.startsWith("draft")
  const versions = new Map<string, string>()
  let digest: string | null = null
  const versionOf = (name: string): string => {
    if (draft) return version
    let v = versions.get(name)
    if (v === undefined) {
      v = assetVersion(rows, name, settings, () => (digest ??= themeDigest(rows))) ?? version
      versions.set(name, v)
    }
    return v
  }
  return themeOfInstall(rows, settings, {
    assetUrl: (name) => media[name] ?? themeAssetUrl(installId, versionOf(name), name),
    assetText: (name) => rows[`shopify/assets/${name}`] ?? null,
    /* "shopify://shop_images/logo.png" is a file of the store the theme came from: the theme's own picture of that name where it brought one. */
    imageUrl: (v) => (/^https?:\/\//.test(v) || v.startsWith("/") ? v : shopImage(media, v)),
  })
}

interface Held {
  version: string
  rows: Record<string, string>
  theme: CompatTheme
}
const held = new Map<string, Held>()
const HELD_MAX = 12

/*
  BY WHAT THE SETTINGS SAY, NOT HOW LONG THEY ARE. The key was the length of
  the settings' JSON, so a live setting saved without a publish that kept the
  length (one colour for another, #111111 to #222222) found the theme held
  for the old one, and the site kept drawing the old colour on this server
  until the theme was pushed out. A hash of the whole text tells them apart.
*/
function settingsKey(settings: unknown): string {
  const text = JSON.stringify(settings) ?? ""
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${text.length}.${h.toString(36)}`
}

/* `drawnFrom` names what the files were read from: a release by its id, or the rows ("rows"), so a theme drawn from one is never handed out for the other. */
function holdTheme(installId: string, version: string, rows: Record<string, string>, settings: unknown, drawnFrom = "rows"): CompatTheme {
  const key = `${installId}:${version}:${settingsKey(settings)}`
  const slot = `${drawnFrom}|${key}`
  const hit = held.get(slot)
  if (hit) return hit.theme
  const theme = compatThemeFor(installId, version, rows, settings)
  if (held.size >= HELD_MAX) held.delete(held.keys().next().value as string)
  held.set(slot, { version, rows, theme })
  return theme
}

const rowsHeld = new Map<string, Record<string, string>>()
/*
  ONE READ OF A THEME'S FILES AT A TIME. Pages arriving together on a cold
  server each read every file of the theme from the database, all at once:
  enough of them and the reads timed out, for every store on Storelib. They
  now wait on the read already under way. A failed read is let go, so the
  next page tries again.
*/
const rowsReading = new Map<string, Promise<Record<string, string>>>()
function liveFiles(admin: Admin, installId: string, key: string): Promise<Record<string, string>> {
  const going = rowsReading.get(key)
  if (going) return going
  const p = installFiles(admin, installId, false).finally(() => rowsReading.delete(key))
  rowsReading.set(key, p)
  return p
}

const collectionsOf = (creatorId: string) =>
  unstable_cache(
    async (): Promise<CollectionLike[]> => {
      const { collections } = await siteCollections(createAdminClient(), creatorId)
      return Object.values(collections).map((c) => ({ id: c.id, title: c.title, handle: c.handle, description: c.description, image: c.image, url: c.url, products_count: c.products_count, products: c.products }))
    },
    ["compat-collections", creatorId],
    { tags: [creatorShopTag(creatorId)], revalidate: 60 },
  )()

/*
  WHO THE STORE IS, FOR shop.name AND shop.email: Settings › Store details'
  store name and contact email (lib/store/identity-server.ts, the same read
  receipts and checkout sign with). The live site said the person's display
  name whatever the store was called, and never had an email for a theme's
  contact line. Cached with the shop and cleared when Store details is saved.
*/
const storeOf = async (creatorId: string): Promise<{ name: string | null; email: string | null }> => {
  try {
    return await unstable_cache(
    async (): Promise<{ name: string | null; email: string | null }> => {
      const admin = createAdminClient()
      const [{ data }, identity] = await Promise.all([
        Promise.resolve(admin.from("store_settings").select("store_name").eq("creator_id", creatorId).maybeSingle()).then((r) => r, () => ({ data: null })),
        storeIdentity(admin, creatorId).catch(() => null),
      ])
      const name = typeof (data as { store_name?: unknown } | null)?.store_name === "string" ? String((data as { store_name: string }).store_name).trim() : ""
      return { name: name || null, email: identity?.email ?? null }
    },
    ["compat-store", creatorId],
    { tags: [creatorShopTag(creatorId)], revalidate: 60 },
  )()
  } catch {
    return { name: null, email: null }
  }
}

/*
  ═══════════════════════════════════════════════════════════════════════
   EVERY PAGE OF A LIVE SITE WAS FIVE READS OF THE DATABASE, ONE AFTER THE OTHER
  ═══════════════════════════════════════════════════════════════════════
  The published install, its pages, the store's menus, the catalogue a
  featured product is picked from and, on a product page, its description
  were read again for every page a visitor opened: two round trips before
  a page could start, three more beside it, on each click. They change only
  when the creator publishes, saves a live setting or a menu (each purges
  creatorSiteTag, lib/website-builder/published-site.ts
  revalidatePublishedSite) or changes a product (creatorShopTag), so they
  are held under those tags, as the published site's other data already
  is. A preview reads everything fresh. A read that failed is never held:
  it is read again on the next page (heldUnless).
*/
const SITE_HOLD_S = 3600
const SHOP_HOLD_S = 60
const NOT_HELD = Symbol("not held")

/** `read`, held under `tags`, unless what it answered is `skip(value)` (a failed or empty read), which is passed on and read again next time. */
async function heldUnless<T>(key: string[], tags: string[], seconds: number, read: () => Promise<T>, skip: (v: T) => boolean): Promise<T> {
  let passed: { v: T } | null = null
  try {
    return await unstable_cache(async () => {
      const v = await read()
      if (skip(v)) {
        passed = { v }
        throw NOT_HELD
      }
      return v
    }, key, { tags, revalidate: seconds })()
  } catch (e) {
    if (e === NOT_HELD && passed) return (passed as { v: T }).v
    throw e
  }
}

/** A promise started ahead of where it is awaited: a rejection is still thrown there, never reported as unhandled when an earlier step returns first. */
function quiet<T>(p: Promise<T>): Promise<T> {
  p.catch(() => {})
  return p
}

type InstallRow = { id: string; published_at?: string | null; preview_token?: string | null; store_theme_settings?: unknown }

function readInstall(admin: Admin, creatorId: string): Promise<InstallRow | null> {
  return siteRead("published install", (signal) => admin
    .from("store_theme_installs")
    .select("id, published_at, preview_token, store_theme_settings ( settings, draft_settings )")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle()) as Promise<InstallRow | null>
}

export type CompatLookup = { kind: "site"; site: SiteData } | { kind: "missing" }

/**
 * The site for a name, when its published install is an imported theme.
 * `previewToken` reads the drafts, when it is the install's own token.
 */
/**
 * THE LAST GOOD SITE OF EACH NAME, kept by this server: a read that throws
 * (the database did not answer) serves the site as it last was. A preview
 * is never kept or served from here.
 */
const lastGoodSite = new Map<string, SiteData>()

export async function compatSiteByName(name: string, host: string, previewToken: string | null = null): Promise<CompatLookup> {
  const key = name.toLowerCase()
  try {
    const found = await compatSiteFresh(name, host, previewToken)
    if (found.kind === "site" && previewToken === null) {
      if (lastGoodSite.size >= 200 && !lastGoodSite.has(key)) lastGoodSite.delete(lastGoodSite.keys().next().value as string)
      lastGoodSite.set(key, found.site)
    }
    return found
  } catch (e) {
    const held = previewToken === null ? lastGoodSite.get(key) : undefined
    if (held) {
      console.error(`[compat-site] served the last good copy of ${key}:`, e instanceof Error ? e.message : e)
      return { kind: "site", site: { ...held, host } }
    }
    throw e
  }
}

async function compatSiteFresh(name: string, host: string, previewToken: string | null): Promise<CompatLookup> {
  const creator = await creatorByName(name)
  if (!creator) return { kind: "missing" }
  const admin = createAdminClient()
  const siteTags = [creatorSiteTag(creator.creatorId)]
  /*
    EVERYTHING THAT NEEDS ONLY THE CREATOR, ASKED AT ONCE. The live release,
    whether physical goods are on, the store's currency and the website's
    own address were each asked after the one before had answered, about
    ten round trips in a row before a page's first byte on a cold draw.
    They are started here, beside the install, and awaited where each is
    needed; the answers and what they decide are the same.
  */
  const live = previewToken === null
  const releaseAsked = live ? quiet(liveRelease(creator.creatorId, null, siteTags)) : null
  const physicalAsked = quiet(isPhysicalCommerceEnabled().catch(() => false))
  /* The store's return settings, for the refund policy's closing line, as soon as physical goods are known to be on. */
  const returnFactsAsked = quiet(physicalAsked.then((on) => (on ? storeReturnFacts(admin, creator.creatorId) : "")))
  const currencyAsked = quiet(cachedStoreCurrency(creator.creatorId))
  /* Its own address (its primary domain), for the canonical and the languages: a page reached at its storelib.com name still names the domain. */
  const originAsked = live ? quiet(siteOrigin(creator.creatorId, name).catch(() => null)) : Promise.resolve(null)
  /* The creator's photo, the share card's last resort (compatShareImage): held five minutes, asked beside the rest so it is never a round trip in a row. */
  const avatarAsked = live ? quiet(creatorAvatar(creator.creatorId, creator.userId).catch(() => null)) : Promise.resolve(null)
  /* A preview link holds nothing: it is the person checking their unpublished work. */
  const install = previewToken !== null
    ? await readInstall(admin, creator.creatorId)
    : await heldUnless(["compat-install", creator.creatorId], siteTags, SITE_HOLD_S, () => readInstall(admin, creator.creatorId), (v) => v === null)
  if (!install) return { kind: "missing" }
  const row = install
  const draft = previewToken !== null && mayPreview(row.preview_token, previewToken)
  /*
    THE LIVE RELEASE, when Publish has written one (lib/website-builder/
    site-releases-server.ts, SQL part 180): the settings, the pages and the
    files as they were published, read through caches that never go stale,
    because a release never changes. Without one (an install published
    before releases, part 180 not run, a live file edited since) the rows,
    exactly as before. A preview always reads the rows. Only a release of
    the install published now.
  */
  const asked = draft ? null : await (releaseAsked ?? liveRelease(creator.creatorId, row.id, siteTags))
  const release = asked && asked.installId === row.id ? asked : null
  const settingsRow = release ? settingsRowOf(release.manifest) : Array.isArray(row.store_theme_settings) ? (row.store_theme_settings[0] ?? null) : (row.store_theme_settings ?? null)
  const settings = themeSettingsOf(settingsRow as never, draft) ?? {}
  if (!compatOf(settings)) return { kind: "missing" }

  const version = draft ? `draft-${Date.now()}` : String(row.published_at ?? "1").replace(/[^0-9A-Za-z]/g, "")
  const rowsKey = `${row.id}:${version}`
  /* Held on this server by what they were read from: the release's id, or the publish when they come from the rows. */
  const heldKey = release ? `${row.id}:release:${release.id}` : rowsKey
  let rows = draft ? null : rowsHeld.get(heldKey) ?? null
  const readFiles = async (): Promise<Record<string, string>> => (release ? await releaseFiles(release.manifest) : null) ?? liveFiles(admin, row.id, rowsKey)
  const readPages = release
    ? async () => pageRowsOf(release.manifest)
    : () => siteRead("pages", (signal) => admin.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", row.id).abortSignal(signal))
  const readCatalog = () => catalogCards(admin as never, creator.creatorId).catch(() => [])
  const [pageRows, products, catalog, collections, menus, , store] = await Promise.all([
    (draft || release ? readPages() : heldUnless(["compat-pages", row.id, version], siteTags, SITE_HOLD_S, readPages, (v) => v === null)).then((data) => ({ data })),
    siteCatalogue(creator.creatorId, { cached: !draft }),
    /* What a featured product may be picked from, as in the builder: memberships and tiers too. */
    draft ? readCatalog() : heldUnless(["compat-catalog", creator.creatorId], [creatorShopTag(creator.creatorId)], SHOP_HOLD_S, readCatalog, (v) => v.length === 0),
    collectionsOf(creator.creatorId),
    draft
      ? storeMenusOrNull(admin, creator.creatorId)
      : heldUnless(["compat-menus", creator.creatorId], siteTags, SITE_HOLD_S, () => readStoreMenus(admin, creator.creatorId).catch(() => ({ kind: "unavailable" as const })), (v) => v.kind === "unavailable").then((r) => (r.kind === "stored" ? r.menus : null)),
    rows ? Promise.resolve() : (draft ? installFiles(admin, row.id, true) : readFiles()).then((r) => { rows = r }),
    storeOf(creator.creatorId),
  ])
  const physical = await physicalAsked
  if (!rows) return { kind: "missing" }
  if (!draft) {
    if (rowsHeld.size >= HELD_MAX) rowsHeld.delete(rowsHeld.keys().next().value as string)
    rowsHeld.set(heldKey, rows)
  }
  const pages: Record<string, StoredSection[]> = {}
  for (const p of (pageRows.data ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]) {
    const list = pageSections<StoredSection[]>(p as never, draft)
    if (Array.isArray(list) && list.length) pages[p.page_key] = list
  }
  /* Website settings › Commerce: the free shipping banner and the cart's returns line, put on the theme's own pages (lib/storelib-theme/compat/site-commerce-markup.ts). Read only when one is on. */
  const onSite = siteCommerce(settings as Record<string, unknown>)
  const readFacts = () => shopFacts(admin, creator.creatorId)
  /* Settings › Taxes, prices include tax: Shopify's cart.taxes_included, which a theme's cart words its tax line by. */
  const readTaxesIncluded = async (): Promise<boolean> => {
    const { data } = await admin.from("commerce_settings").select("tax_mode, prices_include_tax").eq("creator_id", creator.creatorId).maybeSingle()
    const row = data as { tax_mode?: string | null; prices_include_tax?: boolean | null } | null
    return !!row && (row.tax_mode ?? "none") !== "none" && row.prices_include_tax === true
  }
  /* The refund policy closes with what the store's return settings say today (Settings › Returns and refunds); both read together. */
  const [returnFacts, facts, taxesIncluded] = await Promise.all([
    returnFactsAsked,
    physical && (onSite.freeShippingBar || onSite.cartReturnsNote)
      ? (draft ? readFacts() : heldUnless(["compat-shop-facts", creator.creatorId], [creatorShopTag(creator.creatorId)], SHOP_HOLD_S, readFacts, () => false))
      : null,
    physical
      ? (draft ? readTaxesIncluded() : heldUnless(["compat-taxes-included", creator.creatorId], [creatorShopTag(creator.creatorId)], SHOP_HOLD_S, readTaxesIncluded, () => false)).catch(() => false)
      : false,
  ])
  /* The creator's policies (Website settings), as the theme's shop.policies and /policies/<handle> (lib/storelib-theme/compat/site.ts). */
  const policies = POLICY_HANDLES.flatMap((handle) => {
    const body = policyBodyOf((pages[handle] ?? []) as never)
    if (isBlankHtml(body)) return []
    return [{ handle, title: POLICY_TITLES[handle] ?? handle, body: handle === "refund-policy" && returnFacts ? `${body}${returnFacts}` : body }]
  })
  const theme = draft ? compatThemeFor(row.id, version, rows, settings) : holdTheme(row.id, version, rows, settings, release ? `release:${release.id}` : "rows")

  /* The store's own currency (Settings › Country & Currency): the theme writes its prices, cart and money format in it. */
  const currency = await currencyAsked
  const origin = await originAsked
  const shareImage = compatShareImage(settings as Record<string, unknown>, pages.home ?? [], await avatarAsked)
  const storeName = brandOf(settings) || store.name || creator.displayName
  const site: SiteData = {
    creatorId: creator.creatorId,
    theme,
    pages,
    products,
    pickable: catalog,
    collections,
    menus: compatMenus(menus as never, Object.keys(pages)),
    /* The website's own brand name, else Store details' store name, else the person's (lib/website-builder/storefront-data dynamicContext, the same order). */
    shop: { name: brandOf(settings) || store.name || creator.displayName, email: store.email ?? undefined, currency, moneyFormat: moneyFormatFor(currency), policies, ...(taxesIncluded ? { taxesIncluded: true } : {}) },
    host,
    ...(origin ? { canonicalHost: new URL(origin).host } : {}),
    designMode: false,
    /* SEO & Social and each page's own search result (Website settings), read by the theme's own head (lib/website-builder/page-seo.ts). */
    seo: (key) => pageSeoForSite(settings as Record<string, unknown>, key),
    /*
      What the theme's own head leaves out (lib/website-builder/compat-search.ts):
      a description, a share picture, structured data and noindex where a page
      is not a result. On the live site only: a preview is never indexed.
    */
    searchHead: origin
      ? (page, path) =>
          compatSearchHead(
            {
              origin,
              storeName,
              siteDescription: typeof (settings as { seo_description?: unknown }).seo_description === "string" ? String((settings as { seo_description?: unknown }).seo_description).trim() || undefined : undefined,
              shareImage,
              logo: fullLogo(settings as Record<string, unknown>),
              sameAs: siteSameAs(settings as Record<string, unknown>),
              currency,
              pageSeo: (key) => pageSeoForSite(settings as Record<string, unknown>, key),
              keyOf: (path) => (path === "/" ? "home" : (path.match(/^\/(?:pages\/)?([a-z0-9][a-z0-9-]*)$/)?.[1] ?? null)),
            },
            page,
            path,
          )
      : undefined,
    product: async (handle) => {
      const card = products.find((p) => p.settings.slug === handle || p.id === handle) ?? catalog.find((p) => p.settings.slug === handle || p.id === handle)
      if (!card) return null
      /* The description, and the product's own questions for `product.metafields.storelib.faqs` (lib/storelib-theme/compat/objects.ts); the description alone on a database without them. */
      const readDescription = async () => {
        const read = (cols: string) => admin.from("products").select(cols).eq("id", card.id).eq("creator_id", creator.creatorId).eq("status", "published").maybeSingle()
        /* Its SEO title too: an imported theme's page_title and the tab say it, as a Storelib theme's product page does (lib/website-builder/tab-title.ts). */
        let { data, error } = await read("description, faqs, seo_title")
        if (error) ({ data, error } = await read("description, faqs"))
        if (error) ({ data, error } = await read("description"))
        const seoTitle = (data as { seo_title?: unknown } | null)?.seo_title
        return error ? null : { text: (data as { description?: string | null } | null)?.description ?? "", faqs: productFaqs((data as { faqs?: unknown } | null)?.faqs), seoTitle: typeof seoTitle === "string" ? seoTitle.trim().replace(/ \| Storelib$/i, "") : "" }
      }
      /* The description and what is true now about each variant (below) are read together: neither needs the other. */
      const readPageFacts = () => (physical || card.settings.kind !== "physical" ? pageFactsFor(admin, creator.creatorId, card.id, siteCommerce(settings as Record<string, unknown>).showStockLeft) : Promise.resolve(null))
      const [found, pageFacts] = await Promise.all([
        draft ? readDescription() : heldUnless(["compat-description", creator.creatorId, card.id], [creatorShopTag(creator.creatorId)], SHOP_HOLD_S, readDescription, (v) => v === null),
        readPageFacts(),
      ])
      const raw = found?.text ?? ""
      const descriptionHtml = /<[a-z][\s\S]*>/i.test(raw) ? sanitizeRichText(raw) : raw.split(/\n{2,}/).filter(Boolean).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`).join("")
      /*
        WHAT IS TRUE NOW ABOUT EACH VARIANT, read for this page by the rule
        Storelib's own product section reads (lib/products/product-section-
        data.ts): the variants on sale with their option values, sold out,
        "Only N left" (Website settings › Commerce can hide it, at the store's
        low stock line), Limit sales, a download's sales limit, Continue
        selling, the SKU and where each can be picked up. Every picker of the
        theme's page reads this one card (lib/storelib-theme/compat/
        product-facts.ts).
      */
      const withStock = withPageFacts(card, pageFacts)
      return { ...withStock, descriptionHtml, settings: { ...withStock.settings, faqs: found?.faqs ?? [], ...(found?.seoTitle ? { seo_title: found.seoTitle } : {}) } }
    },
    /* Storelib Reviews: the shop's reviews and the product's, held a minute (lib/reviews/storefront-server.ts). */
    reviews: async (p) => (await import("@/lib/reviews/storefront-server")).storefrontReviews(creator.creatorId, p) as unknown as Promise<Record<string, unknown>>,
    /* What one cart may hold of a product that ships: its stock and Limit sales, as the checkout counts them (cart/add refuses more, cart/change brings it down). */
    commerce: facts
      ? {
          freeShippingFromCents: onSite.freeShippingBar ? (onSite.freeShippingAmount !== null ? Math.round(onSite.freeShippingAmount * 100) : facts.freeShippingFromCents) : null,
          returnsLine: onSite.cartReturnsNote ? returnsLine(facts.returns) : null,
        }
      : undefined,
    stock: physical ? (productId) => cartStock(admin, creator.creatorId, products.find((p) => p.id === productId) ?? null) : undefined,
    /* A live page's links are fetched ahead and its pages cross-fade (lib/website-builder/live-navigation.ts). */
    /* A live page also measures its own speed for Published websites (lib/perf/site-vitals-inline.ts); a preview never does. */
    extraHead: draft ? undefined : liveNavigationMarkup() + siteVitalsScript(),
    /* The favicon (Website settings, Branding and the theme's own Logos & Favicon are one value), or the logo: drawn when the theme's layout draws no icon (./site-icon.ts). */
    icon: siteIconUrl(settings as Record<string, unknown>) || undefined,
    extraBodyEnd: draft ? `<div style="position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#1a1a2e;color:#fff;font:600 12px/1 Inter,system-ui,sans-serif;padding:8px 10px;border-radius:8px">Preview: changes not yet published</div>` : liveNavigationEnd(),
  }
  return { kind: "site", site }
}

/** The site's logo as a share card can use it: a full address, and not an SVG (the networks that draw cards draw none). */
function fullLogo(settings: Record<string, unknown>): string | undefined {
  const v = typeof settings.logo_url === "string" ? settings.logo_url.trim() : ""
  return /^https?:\/\//i.test(v) && !/\.svg(?:\?|$)/i.test(v) ? v : undefined
}

/**
 * THE SHARE PICTURE OF A PAGE WITH NONE OF ITS OWN, as a Storelib theme's
 * site chooses it (app/(site)/w/[username]/render-site.tsx): the logo, else
 * the first picture the front page opens with, else the creator's photo.
 * The site's share image from SEO & Social is the page's own and comes
 * first (pageSeoForSite), so it is not asked here.
 */
export function compatShareImage(settings: Record<string, unknown>, home: StoredSection[], avatar: string | null | undefined): string | undefined {
  const logo = fullLogo(settings)
  if (logo) return logo
  /* The page's own sections, in order, past its header: the first picture in the first few is what the page opens with. */
  const opening = home.filter((s) => !s.group && !s.hidden).slice(0, 3)
  const first = imagesOnPage(opening as never, 20).find((i) => !/\.svg(?:\?|$)/i.test(i.loc))?.loc
  if (first) return first
  return avatar && /^https?:\/\//i.test(avatar) ? avatar : undefined
}

/** Whether an install is an imported theme, by its draft settings or its live ones. For callers that hold only its id. */
export async function isCompatInstall(installId: string): Promise<boolean> {
  try {
    const { data } = await createAdminClient().from("store_theme_settings").select("live:settings->compat->>kind, draft:draft_settings->compat->>kind").eq("install_id", installId).maybeSingle()
    const row = data as { live?: string | null; draft?: string | null } | null
    return row?.live === "shopify" || row?.draft === "shopify"
  } catch {
    return false
  }
}

/**
 * The home page of an install as it stands in the builder (drafts first),
 * drawn whole with the theme's scripts: what the website's cover picture is
 * photographed from (app/api/site-theme/cover/[pass]).
 */
export async function compatDraftHome(installId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: install } = await admin
    .from("store_theme_installs")
    .select("id, creator_id, name, store_theme_settings ( settings, draft_settings )")
    .eq("id", installId)
    .maybeSingle()
  if (!install) return null
  const row = install as { id: string; creator_id: string; name?: string | null; store_theme_settings?: unknown }
  const settingsRow = Array.isArray(row.store_theme_settings) ? (row.store_theme_settings[0] ?? null) : (row.store_theme_settings ?? null)
  const settings = themeSettingsOf(settingsRow as never, true) ?? {}
  if (!compatOf(settings)) return null
  const [rows, pageRow, products, collections, menus] = await Promise.all([
    installFiles(admin, row.id, true),
    admin.from("store_theme_pages").select("sections, draft_sections").eq("install_id", row.id).eq("page_key", "home").maybeSingle(),
    siteCatalogue(row.creator_id, { cached: false }),
    collectionsOf(row.creator_id),
    storeMenusOrNull(admin, row.creator_id),
  ])
  const sections = pageSections<StoredSection[]>(pageRow.data as never, true) ?? []
  const theme = compatThemeFor(row.id, "edit", rows, settings)
  const currency = await cachedStoreCurrency(row.creator_id)
  return drawPage(theme, {
    template: "index",
    path: "/",
    designMode: false,
    products,
    collections,
    menus: compatMenus(menus as never, ["home"]),
    shop: { name: row.name ?? "", currency, moneyFormat: moneyFormatFor(currency) },
  }, sections, { scripts: true }).html
}

/** The refund policy's closing paragraph, from the store's return settings; "" when it never set them. */
async function storeReturnFacts(admin: ReturnType<typeof createAdminClient>, creatorId: string): Promise<string> {
  try {
    const { data } = await admin.from("commerce_settings").select("returns_enabled, return_window_days").eq("creator_id", creatorId).maybeSingle()
    return data ? returnFactsHtml({ enabled: data.returns_enabled !== false, windowDays: Number(data.return_window_days ?? 30) }) : ""
  } catch {
    return ""
  }
}

/** A published product's live variants and their stock, by the one rule the buy box reads (lib/physical/storefront-stock.ts); null when it has none. */
async function readStock(admin: ReturnType<typeof createAdminClient>, creatorId: string, productId: string) {
  /* Both at once: each needs only the product's id, and an add to cart waits for them. */
  const [{ data: product }, { data: variants }] = await Promise.all([
    admin.from("products").select("id, track_inventory, continue_selling, low_stock_threshold").eq("id", productId).eq("creator_id", creatorId).eq("status", "published").maybeSingle(),
    admin.from("product_variants").select("id, name, active, track_inventory, inventory_policy").eq("product_id", productId),
  ])
  const list = ((variants ?? []) as StockVariant[]).filter(liveVariant)
  if (!product || list.length === 0) return null
  /* With the product's id, so Limit sales holds each option's most too (lib/physical/order-limit.ts). */
  const stock = await physicalStock(admin, { creator_id: creatorId, ...(product as Record<string, unknown>), id: productId }, list)
  return { list, stock }
}

/**
 * What one cart may hold of a product that ships, for the theme's cart
 * (lib/storelib-theme/compat/site.ts roomFor): each option's most, a
 * product with one option's by its own id too, and Limit sales in all.
 * Null for anything else, or when it cannot be read: the checkout still
 * counts it again before taking payment.
 */
async function cartStock(admin: ReturnType<typeof createAdminClient>, creatorId: string, card: { id: string; settings: Record<string, unknown> } | null): Promise<CartStock | null> {
  if (!card || card.settings.kind !== "physical") return null
  try {
    const [read, limits] = await Promise.all([readStock(admin, creatorId, card.id), orderLimits(admin, [card.id])])
    const perOrder = limits.get(card.id) ?? null
    if (!read) return perOrder === null ? null : { variants: {}, perOrder }
    const variants: Record<string, number> = {}
    for (const [id, s] of read.stock) if (s.maxQuantity < 999) variants[id] = s.soldOut ? 0 : s.maxQuantity
    if (read.list.length === 1 && read.list[0].id in variants) variants[card.id] = variants[read.list[0].id]
    return { variants, perOrder }
  } catch {
    return null
  }
}
