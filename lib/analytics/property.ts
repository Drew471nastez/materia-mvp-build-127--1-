import "server-only"

import { classifySiteHost, siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { normalizePath, type PropertyType } from "./events"

/**
 * ===========================================================================
 *  WHICH OF A CREATOR'S PROPERTIES A PAGE IS
 * ===========================================================================
 * Every event names the property it happened on: the creator page, the
 * OnePage, or one website (its store_theme_installs id). The page never says
 * which. The server works it out from the address the page is at and the
 * host the request arrived on, and checks that the property is the claimed
 * creator's; anything it cannot place is not recorded.
 *
 *   storelib.com (and www., localhost, *.vercel.app, where the app runs)
 *     /<handle>, /u/<handle>              creator page
 *     /<handle>/<slug>, /p/<slug>         creator page (a product on it)
 *     /<handle>/links, /l/<slug>          the creator's OnePage
 *     /w/<name>/...                       the website <name> (how the site
 *                                         routes are reached without a
 *                                         subdomain, in development)
 *     anything else (/app, /checkout, /onepage-preview, the front page)
 *                                         not a property: dropped
 *
 *   <name>.storelib.com, or a domain the creator connected
 *     /links                              the creator's OnePage
 *     anything else                       their published website, when the
 *                                         host is that website's
 *                                         (lib/site-accounts/hosts, the same
 *                                         check website sign in makes); else
 *                                         their creator page, when the host
 *                                         is a domain they connected for it
 *
 *   /preview/..., ?preview=, ?embedded=   the builder's previews and frames:
 *                                         dropped
 *
 * A website's id is the install the published site is drawn from, found the
 * way lib/website-builder/published-site.ts finds it (published, first by
 * sort order), so the id on the event is the site the visitor saw.
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ResolvedProperty {
  type: PropertyType
  id: string | null
  path: string
}

export type PropertyDrop =
  | "bad_url"
  | "host_mismatch"
  | "preview"
  | "not_a_property_page"
  | "foreign_host"
  | "no_onepage"
  | "no_website"

export type PropertyResolution = { ok: true; property: ResolvedProperty; reason?: undefined } | { ok: false; reason: PropertyDrop; property?: undefined }

export interface ResolveInput {
  /** The Host the request arrived on, as the browser sent it. */
  requestHost: string | null
  /** The address of the page the event happened on (location.href). */
  href: unknown
  creatorId: string
  /** The creator's auth user, for finding a OnePage kept by its owner. */
  creatorUserId?: string | null
  mainDomain: string
}

/* ─── Small answers, kept a minute ──────────────────────────────────── */

/**
 * A page view asks the same questions a thousand times an hour ("is this
 * host this creator's website, and which install is it"), and the answers
 * change when a creator publishes or connects a domain, which is rare.
 * Kept for a minute per server instance; a miss is asked again.
 */
const CACHE_MS = 60_000
const CACHE_MAX = 5_000
const cache = new Map<string, { at: number; value: unknown }>()

async function remember<T>(key: string, now: number, ask: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.value as T
  const value = await ask()
  if (cache.size >= CACHE_MAX) cache.clear()
  cache.set(key, { at: now, value })
  return value
}

/** For tests: forget every kept answer. */
export function clearPropertyCache(): void {
  cache.clear()
}

async function one(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await query
    if (error || !data) return null
    if (Array.isArray(data)) return (data[0] as Record<string, unknown>) ?? null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

/** The install the creator's published website is drawn from, or null. */
export async function publishedInstallOf(db: Db, creatorId: string): Promise<string | null> {
  const row = await one(
    db.from("store_theme_installs").select("id").eq("creator_id", creatorId).eq("status", "published").order("sort_order", { ascending: true }).limit(1),
  )
  return typeof row?.id === "string" ? row.id : null
}

/** The creator's OnePage: by seller, then creator, then its owner's login, as app/(marketing)/l/[slug] resolves it. */
export async function onePageOf(db: Db, creatorId: string, creatorUserId?: string | null): Promise<string | null> {
  for (const [column, value] of [["seller_id", creatorId], ["creator_id", creatorId], ["owner_id", creatorUserId]] as const) {
    if (!value) continue
    const row = await one(db.from("onepages").select("id").eq(column, value).limit(1))
    if (typeof row?.id === "string") return row.id
  }
  return null
}

/** Every status in which a connected domain is served (proxy.ts resolveCustomDomain). */
const SERVED = ["active", "ssl_provisioning", "pending", "verifying"]

/** The creator a connected domain belongs to, whatever its purpose. */
async function creatorOfConnectedDomain(db: Db, domain: string): Promise<string | null> {
  const row = await one(db.from("custom_domains").select("creator_id").eq("domain", domain).in("status", SERVED).limit(1))
  return typeof row?.creator_id === "string" ? row.creator_id : null
}

/* ─── The address ────────────────────────────────────────────────────── */

function bareHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "").split(":")[0]
}

function isPlatformHost(bare: string, mainDomain: string): boolean {
  const main = mainDomain.toLowerCase().replace(/^www\./, "")
  return bare === main || bare === `www.${main}` || bare === "localhost" || bare === "127.0.0.1" || bare.endsWith(".vercel.app")
}

/** A builder preview, a frame of the workspace, or a draft: never a visit. */
function isPreviewAddress(url: URL): boolean {
  for (const key of ["preview", "embedded", "draft", "_preview", "sl_preview"]) if (url.searchParams.has(key)) return true
  return false
}

type Place =
  | { kind: "creator_page"; path: string }
  | { kind: "onepage"; path: string }
  | { kind: "website_name"; name: string; path: string }
  | { kind: "drop"; reason: PropertyDrop }

/** What a path on storelib.com itself is. */
function platformPlace(path: string): Place {
  const segs = path.split("/").filter(Boolean)
  const first = segs[0] ?? ""
  if (first === "w" && segs[1]) {
    if (segs[2] === "preview") return { kind: "drop", reason: "preview" }
    return { kind: "website_name", name: segs[1], path: `/${segs.slice(2).join("/")}` }
  }
  if (segs.length === 2 && first === "l") return { kind: "onepage", path }
  if (segs.length === 2 && (first === "u" || first === "p")) return { kind: "creator_page", path }
  if (!first || isReservedRootSegment(first)) return { kind: "drop", reason: "not_a_property_page" }
  if (segs.length === 2 && segs[1] === "links") return { kind: "onepage", path }
  if (segs.length <= 2) return { kind: "creator_page", path }
  return { kind: "drop", reason: "not_a_property_page" }
}

/**
 * THE PROPERTY OF THE PAGE AT `href`, for `creatorId`, or why there is none.
 * Nothing the page sends besides its own address is read.
 */
export async function resolveProperty(db: Db, input: ResolveInput, now = Date.now()): Promise<PropertyResolution> {
  if (typeof input.href !== "string" || input.href.length > 2000) return { ok: false, reason: "bad_url" }
  let url: URL
  try {
    url = new URL(input.href)
  } catch {
    return { ok: false, reason: "bad_url" }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "bad_url" }

  /* The page and the request are on one host: the tracker posts to its own origin. */
  const pageHost = bareHost(url.host)
  if (input.requestHost && bareHost(input.requestHost) !== pageHost) return { ok: false, reason: "host_mismatch" }
  if (isPreviewAddress(url)) return { ok: false, reason: "preview" }

  const path = normalizePath(url.pathname) ?? "/"
  const website = async (id: string | null, sitePath: string): Promise<PropertyResolution> =>
    id ? { ok: true, property: { type: "website", id, path: normalizePath(sitePath) ?? "/" } } : { ok: false, reason: "no_website" }
  const onePage = async (p: string): Promise<PropertyResolution> => {
    const id = await remember(`onepage|${input.creatorId}`, now, () => onePageOf(db, input.creatorId, input.creatorUserId))
    return id ? { ok: true, property: { type: "onepage", id, path: p } } : { ok: false, reason: "no_onepage" }
  }

  if (isPlatformHost(pageHost, input.mainDomain)) {
    const place = platformPlace(path)
    if (place.kind === "drop") return { ok: false, reason: place.reason }
    if (place.kind === "creator_page") return { ok: true, property: { type: "creator_page", id: null, path } }
    if (place.kind === "onepage") return onePage(path)
    /* /w/<name>: the same host rule a subdomain gets, asked for <name>. */
    const sitesDomain = (process.env.NEXT_PUBLIC_SITES_HOST || input.mainDomain).toLowerCase()
    const owner = await remember(`site|${place.name}.${sitesDomain}`, now, () => siteOwnerOfHost(db, `${place.name}.${sitesDomain}`))
    if (!owner || owner.creatorId !== input.creatorId) return { ok: false, reason: "foreign_host" }
    return website(await remember(`install|${input.creatorId}`, now, () => publishedInstallOf(db, input.creatorId)), place.path)
  }

  /* A creator's own host: a website under the sites domain, or a connected domain. */
  const site = classifySiteHost(url.host)
  if (!site) return { ok: false, reason: "foreign_host" }
  if (path === "/preview" || path.startsWith("/preview/")) return { ok: false, reason: "preview" }

  const owner = await remember(`site|${site.host}`, now, () => siteOwnerOfHost(db, site.host))
  const connectedTo =
    owner?.creatorId === input.creatorId || site.kind !== "custom"
      ? null
      : await remember(`domain|${site.domain}`, now, () => creatorOfConnectedDomain(db, site.domain))
  const ours = owner?.creatorId === input.creatorId || connectedTo === input.creatorId
  if (!ours) return { ok: false, reason: "foreign_host" }

  /* /links on a creator's own host is their OnePage (proxy.ts rewrites it to /l/<handle>). */
  if (path === "/links") return onePage(path)
  if (owner?.creatorId === input.creatorId) return website(await remember(`install|${input.creatorId}`, now, () => publishedInstallOf(db, input.creatorId)), path)
  /* A connected domain with no published website serves the creator page (proxy.ts). */
  return { ok: true, property: { type: "creator_page", id: null, path } }
}
