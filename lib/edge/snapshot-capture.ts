import "server-only"

/**
 * ===========================================================================
 *  TAKING THE STORED COPIES (round 49, edge): see ./public-snapshot.ts
 * ===========================================================================
 * A page is asked for at its public address exactly as a stranger's browser
 * asks (GET, no cookie), through the CDN and the proxy, so what is kept is
 * what a stranger is shown. That makes the copy honest and keeps this code
 * out of every renderer: a Storelib theme, an imported Shopify theme, a
 * OnePage and a community page are all kept the same way.
 *
 *   refreshSiteSnapshot(creatorId)  after Publish, Unpublish, a take down and
 *                                   a product save (published-site.ts), and
 *                                   for sites without copies in the warm cron
 *   keepPageFresh(host, path, kind) from a page drawn for a stranger: at most
 *                                   once an hour per page per server
 *   refreshOnePageSnapshot(names)   after a OnePage change
 *
 * A page that answers 404 or 410 loses its copy; any other failure keeps the
 * copy it had (an outage must never delete what the outage needs).
 */
import { request as httpRequest } from "node:http"
import { after } from "next/server"
import { capturable, currentDeployment, drawableNow, forgetHeldSnapshot, hostKey, indexKey, pageKey, pageRecord, snapshotHost, snapshotPath, type HostRecord, type PageRecord, type SnapshotKind } from "./public-snapshot"
import { storeConfig, supabaseSnapshotStore, type SnapshotStore } from "./snapshot-store"

/** Pages kept per site: the same list Publish draws ahead (warm-sites.ts publishWarmList). */
export const SITE_PAGES_MAX = 24
const EACH_MS = 15_000
const AT_ONCE = 3
/** A page drawn for a stranger asks for a fresh copy at most this often, per server. */
export const KEEP_EVERY_MS = 60 * 60_000

export interface Fetched {
  status: number
  headers: Headers
  text: string
  /** Whether the request carried a cookie (never, from here; said so the rule is checked, not assumed). */
  withCookie: boolean
}

export type StrangerFetch = (host: string, path: string) => Promise<Fetched | null>

const UA = "StorelibSnapshot/1.0"

/**
 * A page asked for as a stranger. On Vercel, at https://<host><path>. With
 * SNAPSHOT_FETCH_ORIGIN set (a local production build: hosts that do not
 * resolve), at that origin with the host in the Host header.
 */
export const strangerFetch: StrangerFetch = async (host, path) => {
  const origin = process.env.SNAPSHOT_FETCH_ORIGIN?.replace(/\/+$/, "")
  if (origin && /^http:\/\//.test(origin)) {
    const u = new URL(path, origin)
    return new Promise((resolve) => {
      const req = httpRequest(
        { hostname: u.hostname, port: u.port, path: `${u.pathname}${u.search}`, method: "GET", headers: { host, accept: "text/html", "user-agent": UA, "sec-fetch-dest": "document" }, timeout: EACH_MS },
        (res) => {
          const chunks: Buffer[] = []
          res.on("data", (c: Buffer) => chunks.push(c))
          res.on("end", () => {
            const headers = new Headers()
            for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : String(v))
            resolve({ status: res.statusCode ?? 0, headers, text: Buffer.concat(chunks).toString("utf8"), withCookie: false })
          })
          res.on("error", () => resolve(null))
        },
      )
      req.on("timeout", () => req.destroy())
      req.on("error", () => resolve(null))
      req.end()
    })
  }
  try {
    const r = await fetch(`https://${host}${path}`, { headers: { accept: "text/html", "user-agent": UA, "sec-fetch-dest": "document" }, redirect: "manual", signal: AbortSignal.timeout(EACH_MS), cache: "no-store" })
    return { status: r.status, headers: r.headers, text: await r.text(), withCookie: false }
  } catch {
    return null
  }
}

export interface PageAsk {
  host: string
  path: string
  kind: SnapshotKind
}

interface IndexDoc {
  v: 1
  pages: { host: string; path: string }[]
  updatedAt: string
}

/** Ask each page, keep or delete its copy, and write the scope's index. Never throws. */
export async function capturePages(scope: string, pages: PageAsk[], opts: { store?: SnapshotStore; fetcher?: StrangerFetch; hosts?: HostRecord[]; onlyThese?: boolean; until?: number } = {}): Promise<{ kept: number; gone: number; left: number }> {
  const store = opts.store ?? supabaseSnapshotStore()
  const fetcher = opts.fetcher ?? strangerFetch
  const out = { kept: 0, gone: 0, left: 0 }
  const iKey = indexKey(scope)
  if (!iKey) return out
  const before = await store.get<IndexDoc>(iKey)
  const known = new Map<string, { host: string; path: string }>()
  if (before && before !== "failed" && Array.isArray(before.pages)) for (const p of before.pages) known.set(`${p.host}${p.path}`, p)
  /* Every page the index already names is asked again too, so a page dropped from the site is found gone. */
  const asks = new Map<string, PageAsk>()
  for (const p of pages) {
    const h = snapshotHost(p.host)
    const path = snapshotPath(p.path)
    if (h && path) asks.set(`${h}${path}`, { host: h, path, kind: p.kind })
  }
  const kindOf = pages[0]?.kind ?? "site"
  if (!opts.onlyThese) for (const [k, p] of known) if (!asks.has(k)) asks.set(k, { host: p.host, path: p.path, kind: kindOf })
  const list = [...asks.values()]
  const goneFronts = new Set<string>()
  let next = 0
  const lane = async () => {
    while (next < list.length && Date.now() < (opts.until ?? Number.POSITIVE_INFINITY)) {
      const p = list[next++]
      const key = await pageKey(p.host, p.path)
      if (!key) continue
      const r = await fetcher(p.host, p.path).catch(() => null)
      if (r && capturable(r, r.withCookie)) {
        const rec = pageRecord(p.host, p.path, p.kind, r.text, r.headers.get("content-type") ?? "")
        if (rec && (await store.put(key, rec))) {
          known.set(`${p.host}${p.path}`, { host: p.host, path: p.path })
          forgetHeldSnapshot(key)
          out.kept++
          continue
        }
        out.left++
      } else if (r && (r.status === 404 || r.status === 410)) {
        await store.remove([key])
        known.delete(`${p.host}${p.path}`)
        if (p.path === "/") goneFronts.add(p.host)
        forgetHeldSnapshot(key)
        out.gone++
      } else out.left++
    }
  }
  await Promise.all(Array.from({ length: AT_ONCE }, lane))
  /*
    A HOST WHOSE FRONT PAGE IS GONE loses every copy under it, named in the
    index or not (two pages kept at once can each write an index without
    the other's page): a site taken down is never served from a copy.
  */
  for (const host of goneFronts) {
    const folder = `v1/p/${host}`
    const all = await store.list(folder)
    if (all !== "failed" && all.length > 0) await store.remove(all)
    for (const [k, p] of known) if (p.host === host) known.delete(k)
  }
  if (known.size === 0) await store.remove([iKey])
  else await store.put(iKey, { v: 1, pages: [...known.values()], updatedAt: new Date().toISOString() } satisfies IndexDoc)
  /* The hosts of a site that has copies, so a connected domain is known with no database (proxy.ts). A site with none left loses them. */
  for (const h of opts.hosts ?? []) {
    const k = hostKey(h.host)
    if (!k) continue
    if (known.size > 0) await store.put(k, h)
    else await store.remove([k])
  }
  return out
}

/** The pages of a site worth a copy, from its sitemap's addresses (warm-sites.ts publishWarmList's order and cap). */
export function sitePagePaths(addresses: string[]): string[] {
  const paths: string[] = []
  for (const a of addresses) {
    let u: URL
    try {
      u = new URL(a)
    } catch {
      continue
    }
    const p = snapshotPath(u.pathname)
    if (p && !paths.includes(p)) paths.push(p)
  }
  return paths.slice(0, SITE_PAGES_MAX)
}

/**
 * A site's copies after it changed: every page Publish draws ahead, on its
 * canonical host and on its Storelib subdomain. With nothing published (an
 * Unpublish, a take down) only the pages already kept are asked, and each
 * one that now answers 404 goes.
 */
export async function refreshSiteSnapshot(creatorId: string, opts: { store?: SnapshotStore; fetcher?: StrangerFetch } = {}): Promise<{ kept: number; gone: number; left: number } | null> {
  if (!creatorId || (!opts.store && !storeConfig())) return null
  try {
    const [{ websiteAddresses }, { publishWarmList }, { siteNamesOf }] = await Promise.all([import("@/lib/seo/announce"), import("@/lib/website-builder/warm-sites"), import("@/lib/website-builder/published-site")])
    const names = await siteNamesOf(creatorId)
    const name = names[0]
    if (!name || !/^[a-z0-9_-]{1,64}$/.test(name)) return null
    const sitesDomain = process.env.NEXT_PUBLIC_SITES_HOST || process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
    const sub = snapshotHost(`${name}.${sitesDomain}`)
    const addresses = publishWarmList(await websiteAddresses(creatorId))
    const paths = sitePagePaths(addresses)
    /* The front page always: it is how a taken down site is found gone (capturePages). */
    if (!paths.includes("/")) paths.unshift("/")
    let origin: string | null = null
    try {
      origin = addresses[0] ? snapshotHost(new URL(addresses[0]).host) : null
    } catch {
      origin = null
    }
    const hosts = [...new Set([origin, sub].filter((h): h is string => !!h))]
    const pages: PageAsk[] = hosts.flatMap((host) => paths.map((path) => ({ host, path, kind: "site" as const })))
    const at = new Date().toISOString()
    const shape = await siteShape(creatorId, name)
    const recordHosts = [...hosts]
    /* www.<apex> and <apex> are one domain: both named, so either host finds the site. */
    if (origin && origin !== sub && origin.startsWith("www.")) recordHosts.push(origin.slice(4))
    /* The subdomain of a site with its own domain only sends visitors there (proxy.ts sendsToDomain): its record says where. */
    const records: HostRecord[] = recordHosts.map((host) => ({ v: 1, host, name, purpose: "website", ...shape, ...(origin && origin !== sub && host === sub ? { canonical: origin } : {}), capturedAt: at }))
    return await capturePages(`site-${name}`, pages, { ...opts, hosts: records })
  } catch (e) {
    console.warn("[snapshot] the site's copies were not refreshed:", e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Which renderer draws the site and whether it is open to everybody, read
 * now, for its host records. Any read that fails leaves both out, and the
 * proxy then never routes from the record (proxy.ts nativeFromRecord).
 */
async function siteShape(creatorId: string, name: string): Promise<{ kind?: HostRecord["kind"]; open?: boolean }> {
  try {
    const [{ createAdminClient }, { siteFactsFor }] = await Promise.all([import("@/lib/supabase/admin"), import("@/lib/website-builder/route-facts")])
    const db = createAdminClient()
    const [facts, ai, access] = await Promise.all([
      siteFactsFor(db as never, name),
      db.from("site_deployments").select("storage_prefix").eq("is_live", true).eq("slug", name).maybeSingle(),
      db.from("site_access").select("password_enabled").eq("creator_id", creatorId).maybeSingle(),
    ])
    /* site_access missing (the part not run) is a site with no password: the proxy's gate reads it the same way. */
    const accessMissing = !!access.error && /site_access|42P01|PGRST205/.test(`${access.error.code ?? ""} ${access.error.message ?? ""}`)
    if (facts.failed || ai.error || (access.error && !accessMissing) || !facts.facts.published) return {}
    const kind: HostRecord["kind"] = (ai.data as { storage_prefix?: string | null } | null)?.storage_prefix ? "ai" : facts.facts.compat ? "compat" : "native"
    const open = !(access.data as { password_enabled?: boolean } | null)?.password_enabled
    return { kind, open }
  } catch {
    return {}
  }
}

/** After a OnePage change: its page at storelib.me/<name>, for each name it answers to. */
export async function refreshOnePageSnapshot(names: string[], opts: { store?: SnapshotStore; fetcher?: StrangerFetch } = {}): Promise<void> {
  if (!opts.store && !storeConfig()) return
  const host = snapshotHost(process.env.NEXT_PUBLIC_ONEPAGE_HOST || "storelib.me")
  if (!host) return
  for (const n of [...new Set(names.map((x) => x.trim().toLowerCase()))]) {
    if (!/^[a-z0-9_-]{1,64}$/.test(n)) continue
    await capturePages(`onepage-${n}`, [{ host, path: `/${n}`, kind: "onepage" }], opts).catch(() => null)
  }
}

/* ── From a page drawn for a stranger: kept fresh, at most hourly ────────── */

const lastAsked = new Map<string, number>()

/** Whether this server should ask for a fresh copy of the page now (and notes that it did). Exported for the tests. */
export function dueForCopy(host: string, path: string, now = Date.now()): boolean {
  const k = `${host}${path}`
  const at = lastAsked.get(k)
  if (at !== undefined && now - at < KEEP_EVERY_MS) return false
  lastAsked.delete(k)
  lastAsked.set(k, now)
  while (lastAsked.size > 5000) {
    const oldest = lastAsked.keys().next().value
    if (oldest === undefined) break
    lastAsked.delete(oldest)
  }
  return true
}

/** Run after the answer when there is one to run after; otherwise in the background. Never in a visitor's way. */
export function later(work: () => Promise<unknown>): void {
  const run = () => work().catch(() => undefined)
  try {
    after(run)
  } catch {
    void run()
  }
}

/**
 * A page was just drawn for a stranger: keep a copy of it, at most once an
 * hour per page on this server. `scope` names the index it belongs to.
 */
export function keepPageFresh(scope: string, host: string | null | undefined, pathname: string, kind: SnapshotKind): void {
  if (!storeConfig()) return
  const h = snapshotHost(host)
  const p = snapshotPath(pathname)
  if (!h || !p || !indexKey(scope) || !dueForCopy(h, p)) return
  later(() => capturePages(scope, [{ host: h, path: p, kind }], { onlyThese: true }))
}

/* ── A site's refresh, one at a time per creator per server ──────────────── */

const siteRuns = new Map<string, { again: boolean }>()

/*
  A PUBLISH'S RELEASE FIRST (round 66, lib/website-builder/after-publish.ts).
  Publish clears the site's caches and asks for this refresh before its
  release is written; drawn then, every page read the whole theme from its
  rows, beside the release reading it too. A publish names what to wait for
  (its release, for a stated time at most) and the refresh starts after it.
*/
const refreshGates = new Map<string, Promise<unknown>>()
export function refreshAfter(creatorId: string, gate: Promise<unknown>): void {
  if (!creatorId) return
  refreshGates.set(creatorId, gate)
  void gate.catch(() => undefined).then(() => {
    if (refreshGates.get(creatorId) === gate) refreshGates.delete(creatorId)
  })
}

/**
 * refreshSiteSnapshot after the answer, coalesced: a publish revalidates
 * the site from several writers in a row (sections, settings, menus), and
 * each asked for every page again. While one refresh runs, any number of
 * further asks make exactly one more after it.
 */
export function refreshSiteSoon(creatorId: string): void {
  if (!creatorId || !storeConfig()) return
  const running = siteRuns.get(creatorId)
  if (running) {
    running.again = true
    return
  }
  const state = { again: false }
  siteRuns.set(creatorId, state)
  later(async () => {
    try {
      await refreshGates.get(creatorId)?.catch(() => undefined)
      do {
        state.again = false
        await refreshSiteSnapshot(creatorId)
      } while (state.again)
    } finally {
      siteRuns.delete(creatorId)
    }
  })
}

/**
 * A site with no copies yet gets them in the warm run after a deploy
 * (lib/website-builder/warm-sites.ts): the pages it just warmed, asked again
 * as a stranger (each a CDN hit by now). Only when the site has no index, so
 * a deploy does not ask every site's pages twice. `until`: nothing started
 * after it. Exported for the tests.
 */
export async function backfillSiteCopies(origin: string, urls: string[], until: number, opts: { store?: SnapshotStore; fetcher?: StrangerFetch; mainDomain?: string } = {}): Promise<boolean> {
  const store = opts.store ?? (storeConfig() ? supabaseSnapshotStore() : null)
  if (!store) return false
  let host: string | null = null
  try {
    host = snapshotHost(new URL(origin).host)
  } catch {
    return false
  }
  if (!host) return false
  const main = (opts.mainDomain ?? process.env.NEXT_PUBLIC_SITES_HOST ?? process.env.NEXT_PUBLIC_MAIN_DOMAIN ?? "storelib.com").toLowerCase()
  const scope = host.endsWith(`.${main}`) && host.split(".").length === main.split(".").length + 1 ? `site-${host.slice(0, host.indexOf("."))}` : `site-d-${host.replace(/\./g, "_")}`.slice(0, 105)
  const iKey = indexKey(scope)
  if (!iKey) return false
  const had = await store.get(iKey)
  /*
    A site that has copies keeps them, unless its front page's copy names
    another deployment's files (./public-snapshot.ts drawableNow): taken
    again in the first warm after a deploy, so its copy can be served if
    the database goes away (round AQ). One read of the store a site.
  */
  if (had === "failed") return false
  if (had !== null) {
    const deployment = currentDeployment()
    if (!deployment) return false
    const front = await pageKey(host, "/")
    const copy = front ? await store.get<PageRecord>(front) : null
    if (!copy || copy === "failed" || typeof copy.html !== "string" || drawableNow(copy.html, deployment)) return false
  }
  const paths = sitePagePaths(urls)
  if (!paths.includes("/")) paths.unshift("/")
  /*
    ONLY THE PAGES JUST WARMED, AFTER A DEPLOY (round 54, Vercel cost). A site
    that already has copies used to have every page in its index asked again
    (up to 24), each a render and an ISR write on the new deployment, on every
    deploy (10 to 20 a day): the largest steady source of ISR writes found.
    The front page and the pages warmed are taken again; the rest are taken
    again when they are opened (keepPageFresh) or the site is saved.
  */
  const r = await capturePages(scope, paths.map((path) => ({ host: host as string, path, kind: "site" as const })), { store, fetcher: opts.fetcher, until, onlyThese: had !== null })
  return r.kept > 0
}
