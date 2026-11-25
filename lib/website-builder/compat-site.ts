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
import { builtSiteIndexable } from "@/lib/seo/indexing"
import { unstable_cache } from "next/cache"
import { SiteReadError, isSiteReadError, siteRead } from "@/lib/website-builder/site-read"
import { keepSharedFiles, sharedFiles } from "./shared-copy"
import { createAdminClient } from "@/lib/supabase/admin"
import { productDescriptions, withDescriptions } from "@/lib/website-builder/product-descriptions"
import { productExtras, withExtras } from "@/lib/website-builder/product-extras"
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
import { creatorSitePlan } from "@/lib/sites/plan-server"
import { siteLimits } from "@/lib/sites/plan"
import { hideAsked } from "@/lib/storelib-theme/compat/powered-by"
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
import { minorUnits } from "@/lib/markets/money"
import { liveRelease, releaseFiles } from "./site-releases-server"
import { pageRowsOf, settingsRowOf } from "./site-releases"
import { siteIconUrl } from "./site-icon"
import { draftAssetPass } from "./draft-asset-pass"
import { LastGood, keyedAs } from "./last-good"
import { StampedMemo } from "./stamped-memo"
import { nameAndStamp, siteStamp } from "./site-stamp"
import { splitAssetVersion, withDraftPass } from "@/lib/storelib-theme/compat/draft-version"
import { ownIconPath } from "./site-favicon"
import { faviconOf } from "./favicon-sync"
import { logEvent } from "@/lib/net/log"
import { blogFor, readLivePost, readPreviewPost, siteBlogRedirect } from "@/lib/site-blog/public-read"
import { readLadder } from "@/lib/supabase/missing-memory"
import { readTwice } from "@/lib/onepage/bounded-read"
import { inTime, inTimeOrThrow } from "@/lib/net/in-time"

/*
  ===========================================================================
   HOW LONG A VISITOR'S PAGE WAITS FOR EACH READ (round AP)
  ===========================================================================
  Every read below had only Supabase's own 20 second deadline. Production
  (Nov 2 to 9) logged it on live pages: "store_offers took longer than 20s"
  20 times, "theme_file_blobs took longer than 20s" then "store_theme_custom_
  files took longer than 20s" one after the other (40 seconds before a
  visitor saw anything), "[store-menus] read failed". So:
    - what the page cannot be drawn without (the install, its pages, its
      files, the store's currency) fails within seconds, and the page is
      drawn from what was kept: the files every server kept, the last good
      site, the stored copy, and only then "One moment";
    - what it can be drawn without (offers, units sold, size charts, the
      blog, the share picture, a product's description) is waited for
      PART_MS and then left out of THIS page, which is then never held,
      shared or kept as the site (SiteData.partial).
*/
export const SITE_PART_MS = 2500
/** The shop's lists a page draws (products, collections, the featured product's catalogue): longer, and still far short of 20 s. */
export const SITE_SHOP_MS = 5000
/** The live files: one try, and a second while the budget leaves room. */
export const LIVE_FILES_BOUND = { attemptMs: 4000, budgetMs: 6500 } as const
/** A release's files, read from the cache that keeps them for good: past this, the rows are read instead. */
export const RELEASE_FILES_MS = 5000

/** Parts a page's layout is made of: without one, the last good whole site is the better page. */
const STRUCTURAL_PARTS: ReadonlySet<string> = new Set(["products", "catalog", "collections", "menus"])

/** A product drawn without one of its own reads (description, stock, offers): never part of a held or shared page (app/api/site-theme/site). */
export const PARTIAL_PRODUCTS = new WeakSet<object>()

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
export async function installFiles(admin: Admin, installId: string, draft: boolean, bound?: { attemptMs: number; budgetMs: number }): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const page = 1000
  /*
    A VISITOR'S PAGE WAITS FOR THESE ONLY SO LONG (round AP, `bound`). The
    read had only Supabase's 20 second deadline (lib/net/deadline.ts), and
    production logged "store_theme_custom_files took longer than 20s" on
    live pages, after the release's blobs had already taken their own 20.
    Bounded, a slow read fails within seconds and the page is drawn from the
    copy every server kept (liveFilesKept) or the last good site.
  */
  type Res = { data: unknown; error: unknown }
  const ask = (q: (signal?: AbortSignal) => PromiseLike<Res>): Promise<Res> =>
    bound ? readTwice((signal) => q(signal) as PromiseLike<{ data: unknown; error: { message?: string } | null }>, bound) : Promise.resolve(q())
  for (let from = 0; from < 20_000; from += page) {
    const table = () => admin.from("store_theme_custom_files")
    const live = (signal?: AbortSignal) => {
      const q = table().select("path, content").eq("install_id", installId).order("path").range(from, from + page - 1)
      return signal ? q.abortSignal(signal) : q
    }
    let res: Res = draft
      ? await ask((signal) => {
          const q = table().select("path, content, draft_content").eq("install_id", installId).order("path").range(from, from + page - 1)
          return signal ? q.abortSignal(signal) : q
        })
      : await ask(live)
    /* Before the file drafts SQL there is no draft column: the live half. */
    if (res.error && draft) res = await ask(live)
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
  const draft = splitAssetVersion(version).draft
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
function liveFiles(admin: Admin, installId: string, key: string, tags: string[]): Promise<Record<string, string>> {
  const going = rowsReading.get(key)
  if (going) return going
  const p = liveFilesKept(admin, installId, key, tags).finally(() => rowsReading.delete(key))
  rowsReading.set(key, p)
  return p
}

/*
  THE FILES EVERY SERVER CAN READ (EVD-1, ./shared-copy.ts). A theme drawn
  from its rows (no release) was held only in this server's memory, so a
  new server read every file from the database, and when that read failed
  its visitors got "One moment". The files read are kept in the data cache,
  in parts, under the install and its publish, tagged with the site (a
  publish or a take down drops them), and a read that failed draws from
  them. Published files only: a preview reads the drafts and never comes here.
*/
const SHARED_FILES = "compat-files:v1"
async function liveFilesKept(admin: Admin, installId: string, key: string, tags: string[]): Promise<Record<string, string>> {
  try {
    const files = await installFiles(admin, installId, false, LIVE_FILES_BOUND)
    await keepSharedFiles(SHARED_FILES, [key], tags, files)
    return files
  } catch (e) {
    if (!isSiteReadError(e)) throw e
    const kept = await sharedFiles(SHARED_FILES, [key], tags)
    if (!kept) throw e
    console.error(`[compat-site] drew the files every server kept for ${installId}:`, e.message)
    return kept
  }
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
/** Each card with its verified units sold (settings.sold_count, and sold_count_24h / _7d / _30d for the last day, week and month), when the count was read whole; the cards as they were otherwise. */
function withSoldCounts<T extends { id: string; settings: Record<string, unknown> }>(cards: T[], sold: Record<string, { all: number; h24: number; d7: number; d30: number }> | null): T[] {
  if (!sold) return cards
  return cards.map((c) => {
    const n = sold[c.id]
    return n && typeof n.all === "number" ? { ...c, settings: { ...c.settings, sold_count: n.all, sold_count_24h: n.h24, sold_count_7d: n.d7, sold_count_30d: n.d30 } } : c
  })
}

/* `stable`: the entry's name for the data cache, kept across deploys (./last-good.ts keyedAs); without one, the function's text, as before. */
async function heldUnless<T>(key: string[], tags: string[], seconds: number, read: () => Promise<T>, skip: (v: T) => boolean, stable?: string): Promise<T> {
  let passed: { v: T } | null = null
  const held = async () => {
    const v = await read()
    if (skip(v)) {
      passed = { v }
      throw NOT_HELD
    }
    return v
  }
  try {
    return await unstable_cache(stable ? keyedAs(stable, held) : held, key, { tags, revalidate: seconds })()
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
const lastGoodSite = new LastGood<SiteData>(200)

/*
  THE LIVE SITE AS THIS SERVER LAST ASSEMBLED IT (round AM, ./site-stamp.ts).
  Assembling it from the shared cache was 339 to 619 ms of "read" on a warm
  server, every answer a hit, about twenty requests to the cache in five
  steps. It is kept here under the site's stamp: one small read beside the
  name's lookup says whether a tag of the site was expired since (Publish,
  a product, a post, a setting), and while it was not, the site is not
  assembled again. Never a preview.
*/
const siteMemo = new StampedMemo<SiteData>(100)

export async function compatSiteByName(name: string, host: string, previewToken: string | null = null, asked?: Awaited<ReturnType<typeof nameAndStamp>>): Promise<CompatLookup> {
  const key = name.toLowerCase()
  /* Asked before the site is read, so a change that lands during the read is a new stamp, and what was read is never kept as the newer site. */
  /* `asked`: the same, already read for this request (the held page's route asks it first): never read twice. */
  const known = previewToken !== null ? null : (asked ?? (await nameAndStamp(name).catch(() => null)))
  const memoKey = known ? `${key}|${known.creatorId}` : ""
  if (known) {
    const kept = siteMemo.get(memoKey, known.stamp)
    if (kept) return { kind: "site", site: { ...kept, host } }
  }
  /*
    A name this server had not seen yet has no stamp: it is asked now, beside
    the read rather than before it, so the first visitor waits for nothing
    more. A change that lands while both are under way can at worst keep
    what was read under the older stamp, which the next visitor no longer
    matches; the shared cache's own entries have the same window.
  */
  const stampBeside = known && known.stamp === null ? siteStamp(known.creatorId) : null
  try {
    const found = await compatSiteFresh(name, host, previewToken, known?.creator)
    /*
      ASSEMBLED WITHOUT A PART THAT DID NOT ANSWER IN TIME (round AP): never
      kept as the site, here or as the last good one. Without the shop's
      lists or menus, the last good whole site this server has is drawn
      instead, when it has one; it is the same site minus what changed since.
    */
    if (found.kind === "site" && found.site.partial?.length) {
      const whole = previewToken === null && found.site.partial.some((p) => STRUCTURAL_PARTS.has(p)) ? lastGoodSite.get(key) : undefined
      if (whole && whole.creatorId === found.site.creatorId) {
        logEvent("warn", "site_last_good_served", { msg: "[compat-site] served the last good copy", site: key, reason: `late: ${found.site.partial.join(",")}` })
        return { kind: "site", site: { ...whole, host } }
      }
      logEvent("warn", "site_partial", { msg: "[compat-site] drawn without what did not answer in time", site: key, parts: found.site.partial.join(",") })
      return found
    }
    if (found.kind === "site" && previewToken === null) {
      lastGoodSite.remember(key, found.site)
      if (known && found.site.creatorId === known.creatorId) siteMemo.set(memoKey, known.stamp ?? (await stampBeside), found.site)
    }
    return found
  } catch (e) {
    const held = previewToken === null ? lastGoodSite.get(key) : undefined
    if (held) {
      /* The visitor got a page: a warning, not an error (the failures that left a visitor with no page stay errors). */
      logEvent("warn", "site_last_good_served", { msg: "[compat-site] served the last good copy", site: key, reason: e instanceof Error ? e.message : String(e) })
      return { kind: "site", site: { ...held, host } }
    }
    throw e
  }
}

async function compatSiteFresh(name: string, host: string, previewToken: string | null, known?: Awaited<ReturnType<typeof creatorByName>>): Promise<CompatLookup> {
  /* The name's creator, when the caller has just looked it up (nameAndStamp): not asked of the cache a second time. */
  const creator = known ?? (await creatorByName(name))
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
  /*
    WHAT THIS COPY WAS ASSEMBLED WITHOUT (round AP, SITE_PART_MS above): a
    live page's optional read waited for only so long, then left out of this
    page, which is then never held, shared or kept (SiteData.partial). A
    preview waits as before: it is the creator checking their own work.
  */
  const partial: string[] = []
  const part = <T,>(name: string, p: Promise<T>, fallback: T, ms: number = SITE_PART_MS): Promise<T> =>
    !live
      ? p
      : inTime(p, ms, fallback).then((r) => {
          if (r.late || r.failed) partial.push(name)
          return r.value
        })
  /* A release that does not come in time is drawn from the rows, as a website without one is: not a part left out. */
  const releaseAsked = live ? quiet(inTime(liveRelease(creator.creatorId, null, siteTags), SITE_SHOP_MS, null).then((r) => r.value)) : null
  const physicalAsked = quiet(part("physical", isPhysicalCommerceEnabled().catch(() => false), false))
  /* The store's return settings, for the refund policy's closing line, as soon as physical goods are known to be on. */
  const returnFactsAsked = quiet(physicalAsked.then((on) => (on ? storeReturnFacts(admin, creator.creatorId) : "")))
  /* What every price is written in: never guessed. Past SITE_SHOP_MS the page is drawn from what was kept instead (compatSiteByName). */
  const currencyAsked = quiet(live ? inTimeOrThrow(cachedStoreCurrency(creator.creatorId), SITE_SHOP_MS, () => new SiteReadError("currency", `no answer in ${SITE_SHOP_MS}ms`)) : cachedStoreCurrency(creator.creatorId))
  /* Its own address (its primary domain), for the canonical and the languages: a page reached at its storelib.com name still names the domain. */
  const originAsked = live ? quiet(part("origin", siteOrigin(creator.creatorId, name).catch(() => null), null)) : Promise.resolve(null)
  /* The creator's photo, the share card's last resort (compatShareImage): held five minutes, asked beside the rest so it is never a round trip in a row. */
  const avatarAsked = live ? quiet(part("avatar", creatorAvatar(creator.creatorId, creator.userId).catch(() => null), null)) : Promise.resolve(null)
  /*
    THE WEBSITE'S BLOG (lib/site-blog): its settings and published posts, held
    under the blog's own tag (siteBlogTag), which Publish, Update and the
    rest expire. Null before SQL part 355, or with no blog: every /blogs
    address is answered as before. A failed read is no blog for this page.
  */
  const blogAsked = quiet(part("blog", blogFor(creator.creatorId).catch(() => null), null))
  /* A preview link holds nothing: it is the person checking their unpublished work. */
  const install = previewToken !== null
    ? await readInstall(admin, creator.creatorId)
    : await heldUnless(["compat-install", creator.creatorId], siteTags, SITE_HOLD_S, () => readInstall(admin, creator.creatorId), (v) => v === null, "compat-install:v1")
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
  /*
    WHETHER THE PLAN MAY HIDE "POWERED BY STORELIB" (lib/sites/plan.ts
    removeBranding, from the owner's subscription as a OnePage's badge reads
    it). Asked only when the theme setting asks for the line to go
    (lib/storelib-theme/compat/powered-by.ts hideAsked): every other page
    keeps the line and makes no read for it. A read that failed or came late
    is null: this page keeps the line and is not held (partial).
  */
  const brandingAsked: Promise<boolean | null> = hideAsked(settings as Record<string, unknown>)
    ? ((read) => quiet(live ? part("plan", read, null) : read.catch(() => null)))(creatorSitePlan(creator.creatorId, admin).then((plan) => siteLimits(plan).removeBranding))
    : Promise.resolve(null)

  /* A preview's draft files with their pass (./draft-asset-pass.ts): this page may show the draft, so its assets may too. */
  const version = draft ? withDraftPass(`draft-${Date.now()}`, draftAssetPass(row.id)) : String(row.published_at ?? "1").replace(/[^0-9A-Za-z]/g, "")
  const rowsKey = `${row.id}:${version}`
  /* Held on this server by what they were read from: the release's id, or the publish when they come from the rows. */
  const heldKey = release ? `${row.id}:release:${release.id}` : rowsKey
  let rows = draft ? null : rowsHeld.get(heldKey) ?? null
  /* A release's files that do not come within RELEASE_FILES_MS are read from the rows (bounded too, LIVE_FILES_BOUND); the blobs' read goes on behind and fills the cache for the next page. */
  const readFiles = async (): Promise<Record<string, string>> => (release ? (await inTime(releaseFiles(release.manifest), RELEASE_FILES_MS, null)).value : null) ?? liveFiles(admin, row.id, rowsKey, siteTags)
  const readPages = release
    ? async () => pageRowsOf(release.manifest)
    : () => siteRead("pages", (signal) => admin.from("store_theme_pages").select((draft ? "page_key, sections, draft_sections" : "page_key, sections") as "page_key, sections, draft_sections").eq("install_id", row.id).abortSignal(signal))
  /* With each product's own description (round 12): a theme's Featured product prints `product.description`, which a card did not carry. */
  /* And its own questions (round 13, ./product-extras.ts): a Featured product's `product.metafields.storelib.faqs`, as on its page. */
  /* Whether this page's catalogue came whole: one read without its offers (late) or that failed is passed on for this page and not held (heldUnless's skip). */
  let catalogShort = false
  const readCatalog = () =>
    catalogCards(admin as never, creator.creatorId)
      .then(async (cards) => {
        /* And what each offers with it (lib/offers/offers-public catalogOffers): a Featured product's Bundles and upsells block and product.metafields.storelib.offers, as on its own page. */
        /* Waited for SITE_PART_MS on a live page: production logged "store_offers took longer than 20s" on live pages (round AP). */
        const readOffers = () => {
          const asked = import("@/lib/offers/offers-public").then((m) => m.catalogOffers(admin, creator.creatorId, cards.map((c) => c.id))).catch(() => ({}))
          return live
            ? inTime(asked, SITE_PART_MS, {} as Awaited<typeof asked>).then((r) => {
                if (r.late) {
                  catalogShort = true
                  partial.push("offers")
                }
                return r.value
              })
            : asked
        }
        const [described, extras, offers, storeCurrency] = await Promise.all([productDescriptions(admin as never, creator.creatorId, { ids: cards.map((c) => c.id) }), productExtras(admin as never, creator.creatorId, cards), readOffers(), currencyAsked])
        const done = withExtras(withDescriptions(cards, described), extras)
        if (Object.keys(offers).length === 0) return done
        const block = await import("@/lib/storelib-theme/compat/offers-app-block")
        return done.map((c) => {
          const mine = (offers as Record<string, unknown>)[c.id]
          if (!mine) return c
          const settings = { ...c.settings, storelib_offers: mine } as Record<string, unknown>
          return { ...c, settings: block.withOffersShown({ id: c.id, settings }, block.cardOptions({ id: c.id, settings }, storeCurrency, minorUnits), { charge: null, currency: storeCurrency, locale: "en" }) } as typeof c
        })
      })
      .catch(() => {
        catalogShort = true
        return []
      })
  /* Every product's size chart, for a featured product and a card: read for this creator only, held under the shop's tag like the catalogue (its own, else its collection's or category's: lib/size-charts/storefront.ts). */
  const readSizeCharts = () => import("@/lib/size-charts/storefront").then((m) => m.sizeChartsForStore(admin as never, creator.creatorId)).catch(() => ({}))
  const [pageRows, products, catalog, collections, menus, , store, sizeCharts] = await Promise.all([
    (draft || release ? readPages() : heldUnless(["compat-pages", row.id, version], siteTags, SITE_HOLD_S, readPages, (v) => v === null, "compat-pages:v1")).then((data) => ({ data })),
    /* A failed read is no longer held as an empty shop (it throws); this page draws [] for this request only, as it did, and says so (partial). */
    live
      ? part("products", siteCatalogue(creator.creatorId, { cached: true }), [] as Awaited<ReturnType<typeof siteCatalogue>>, SITE_SHOP_MS)
      : siteCatalogue(creator.creatorId, { cached: !draft }).catch(() => [] as Awaited<ReturnType<typeof siteCatalogue>>),
    /* What a featured product may be picked from, as in the builder: memberships and tiers too. */
    draft
      ? readCatalog()
      : part("catalog", heldUnless(["compat-catalog", creator.creatorId], [creatorShopTag(creator.creatorId)], SHOP_HOLD_S, readCatalog, (v) => v.length === 0 || catalogShort), [] as Awaited<ReturnType<typeof readCatalog>>, SITE_SHOP_MS).then((v) => {
          if (catalogShort && !partial.includes("catalog") && !partial.includes("offers")) partial.push("catalog")
          return v
        }),
    part("collections", collectionsOf(creator.creatorId), [] as CollectionLike[], SITE_SHOP_MS),
    draft
      ? storeMenusOrNull(admin, creator.creatorId)
      : part(
          "menus",
          heldUnless(["compat-menus", creator.creatorId], siteTags, SITE_HOLD_S, () => readStoreMenus(admin, creator.creatorId).catch(() => ({ kind: "unavailable" as const })), (v) => v.kind === "unavailable").then((r) => {
            if (r.kind === "unavailable") throw new Error("menus unavailable")
            return r.kind === "stored" ? r.menus : null
          }),
          null,
        ),
    rows ? Promise.resolve() : (draft ? installFiles(admin, row.id, true) : readFiles()).then((r) => { rows = r }),
    part("store", storeOf(creator.creatorId), { name: null, email: null }),
    part("size charts", (draft ? readSizeCharts() : heldUnless(["compat-size-charts", creator.creatorId], [creatorShopTag(creator.creatorId)], SHOP_HOLD_S, readSizeCharts, () => false)).catch(() => ({})), {} as Awaited<ReturnType<typeof readSizeCharts>>),
  ])
  /*
    UNITS SOLD, VERIFIED (round 25, lib/products/sold-counts-server.ts): each
    product's count from paid order lines, held a minute under the shop's
    tag, laid on every card as settings.sold_count, which a theme reads as
    product.metafields.custom.sold_count. Not for a preview's draft, which
    reads it fresh. A count that could not be read whole is not given.
  */
  const soldIds = [...new Set([...products, ...catalog].map((c) => c.id))]
  const readSold = () => import("@/lib/products/sold-counts-server").then((m) => m.soldCountsWithWindows(admin as never, soldIds)).then((m) => (m ? Object.fromEntries(m) : null)).catch(() => null)
  const soldAsked = soldIds.length === 0 ? Promise.resolve(null) : draft ? readSold() : part("sold", heldUnless(["compat-sold", creator.creatorId], [creatorShopTag(creator.creatorId)], SHOP_HOLD_S, readSold, (v) => v === null), null)
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
    part("return facts", returnFactsAsked, ""),
    physical && (onSite.freeShippingBar || onSite.cartReturnsNote)
      ? (draft ? readFacts() : part("shop facts", heldUnless(["compat-shop-facts", creator.creatorId], [creatorShopTag(creator.creatorId)], SHOP_HOLD_S, readFacts, () => false), null))
      : null,
    physical
      ? part("taxes", (draft ? readTaxesIncluded() : heldUnless(["compat-taxes-included", creator.creatorId], [creatorShopTag(creator.creatorId)], SHOP_HOLD_S, readTaxesIncluded, () => false)).catch(() => false), false)
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
  /*
    The site's own share picture (SEO & Social) first, on every page, as a
    Storelib theme's pages take it (theme-metadata.ts): it reached only the
    pages with a key of their own, so the blog and a post without a cover
    were shared with no picture at all (round 53, scripts/check-site-seo-r53.mjs).
  */
  const ownShare = (settings as { seo_og_image?: unknown }).seo_og_image
  const shareImage = (typeof ownShare === "string" && /^https:\/\/\S+$/i.test(ownShare.trim()) ? ownShare.trim() : undefined) ?? compatShareImage(settings as Record<string, unknown>, pages.home ?? [], await avatarAsked)
  const storeName = brandOf(settings) || store.name || creator.displayName
  /* The handle alone (the settings' own switch is pageSeoForSite's): the one rule a Storelib theme's pages read. */
  const heldBack = !builtSiteIndexable({}, name)
  const sold = await soldAsked
  const blog = await blogAsked
  const creatorId = creator.creatorId
  const site: SiteData = {
    creatorId: creator.creatorId,
    ...(partial.length ? { partial: [...new Set(partial)] } : {}),
    theme,
    pages,
    products: withSoldCounts(products, sold),
    pickable: withSoldCounts(catalog, sold),
    ...(sizeCharts && Object.keys(sizeCharts).length ? { sizeCharts } : {}),
    collections,
    menus: compatMenus(menus as never, Object.keys(pages)),
    /* The website's own brand name, else Store details' store name, else the person's (lib/website-builder/storefront-data dynamicContext, the same order). */
    shop: { name: brandOf(settings) || store.name || creator.displayName, email: store.email ?? undefined, currency, moneyFormat: moneyFormatFor(currency), policies, ...(taxesIncluded ? { taxesIncluded: true } : {}) },
    host,
    ...(origin ? { canonicalHost: new URL(origin).host } : {}),
    designMode: false,
    /* SEO & Social and each page's own search result (Website settings), read by the theme's own head (lib/website-builder/page-seo.ts). */
    /*
      And noindex on every page under a handle the spam rules hold back, as a
      Storelib theme's pages say and the site's own sitemap already leaves
      out (lib/seo/indexing builtSiteIndexable). The creator's own switch is
      read by pageSeoForSite.
    */
    seo: (key) => {
      const seo = pageSeoForSite(settings as Record<string, unknown>, key)
      return heldBack ? { ...seo, noindex: true } : seo
    },
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
              alternateNames: [store.name, creator.displayName],
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
        /* Each fewer only when a column is missing, and the rung that answered remembered ten minutes (lib/supabase/missing-memory.ts). */
        const { data, error } = await readLadder("products:compat-description", [() => read("description, faqs, seo_title"), () => read("description, faqs"), () => read("description")])
        const seoTitle = (data as { seo_title?: unknown } | null)?.seo_title
        return error ? null : { text: (data as { description?: string | null } | null)?.description ?? "", faqs: productFaqs((data as { faqs?: unknown } | null)?.faqs), seoTitle: typeof seoTitle === "string" ? seoTitle.trim().replace(/ \| Storelib$/i, "") : "" }
      }
      /* The description and what is true now about each variant (below) are read together: neither needs the other. */
      const readPageFacts = () => (physical || card.settings.kind !== "physical" ? pageFactsFor(admin, creator.creatorId, card.id, siteCommerce(settings as Record<string, unknown>).showStockLeft) : Promise.resolve(null))
      /* What the page offers with it (product.metafields.storelib.offers): the same read as GET /api/offers, never failing the page. */
      const readOffers = () => import("@/lib/offers/offers-public").then((m) => m.productOffers(admin, card.id)).catch(() => null)
      /* Each waited for only so long on a live page (round AP): the page is then drawn without it, for this visitor alone (PARTIAL_PRODUCTS). */
      let short = false
      const bounded = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
        draft || !live
          ? p
          : inTime(p, ms, fallback).then((r) => {
              if (r.late || r.failed) short = true
              return r.value
            })
      const [found, pageFacts, offers] = await Promise.all([
        bounded(draft ? readDescription() : heldUnless(["compat-description", creator.creatorId, card.id], [creatorShopTag(creator.creatorId)], SHOP_HOLD_S, readDescription, (v) => v === null), SITE_SHOP_MS, null),
        bounded(readPageFacts(), SITE_SHOP_MS, null),
        /* The site's own offers read already did not come in time: not waited for a second time on the same page. */
        bounded(readOffers(), partial.includes("offers") ? 0 : SITE_PART_MS, null),
      ])
      /* A description that could not be read is not one that is empty. */
      if (live && !draft && found === null) short = true
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
      /* And the Bundles and upsells app block's figures at the store's own prices (lib/storelib-theme/compat/offers-app-block.ts); a market works them out again (lib/markets/compat-prices). */
      const own = { ...withStock.settings, ...(offers ? { storelib_offers: offers } : {}) } as Record<string, unknown>
      const shown = offers ? (await import("@/lib/storelib-theme/compat/offers-app-block").then((m) => m.withOffersShown({ id: card.id, settings: own }, m.cardOptions({ id: card.id, settings: own }, currency, minorUnits), { charge: null, currency, locale: "en" })).catch(() => own)) : own
      const product = { ...withStock, descriptionHtml, settings: { ...shown, faqs: found?.faqs ?? [], ...(found?.seoTitle ? { seo_title: found.seoTitle } : {}) } }
      if (short) PARTIAL_PRODUCTS.add(product)
      return product
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
    removeBranding: await brandingAsked,
    /* The favicon (Website settings, Branding and the theme's own Logos & Favicon are one value), or the logo: drawn when the theme's layout draws no icon (./site-icon.ts). */
    /* At the site's own host, square (./site-favicon.ts, round 41). */
    icon: ownIconPath(siteIconUrl(settings as Record<string, unknown>)) || undefined,
    ownFavicon: !!faviconOf(settings as Record<string, unknown>),
    /* A post's own page reads the post (held per slug under the blog's tag), its preview the draft (never held), and a slug that changed its new one. */
    ...(blog
      ? {
          blog: {
            settings: blog.settings,
            cards: blog.cards,
            post: (slug: string) => readLivePost(creatorId, slug),
            preview: (token: string) => readPreviewPost(creatorId, token),
            redirect: (slug: string) => siteBlogRedirect(creatorId, slug),
          },
        }
      : {}),
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
  /* The cover's page shows the draft (its own pass let it in), and so do its assets. */
  const theme = compatThemeFor(row.id, withDraftPass("edit", draftAssetPass(row.id)), rows, settings)
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
