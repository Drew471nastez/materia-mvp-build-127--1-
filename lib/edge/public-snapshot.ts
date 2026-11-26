/**
 * ===========================================================================
 *  A PUBLIC PAGE'S STORED COPY, SERVED WHEN THE DATABASE IS AWAY (round 49)
 * ===========================================================================
 * A published website's pages, a OnePage and a community's public page are
 * the same for every stranger. After each publish (and as their pages are
 * drawn, at most hourly per server) Storelib asks for them as a stranger
 * would, with no cookie, and keeps the HTML outside the database
 * (./snapshot-store.ts), keyed by host and path. When the database does not
 * answer, the proxy serves that copy instead of "One moment"
 * (proxy.ts, servedFromSnapshot), and the imported theme's handler does the
 * same where it used to answer 503.
 *
 * WHAT IS NEVER KEPT. Only a 200 page of HTML that set no cookie and is not
 * itself a stored copy, asked for with no cookie at all, so nothing in it
 * can be anybody's: no cart, no session, no customer. Never a cart,
 * checkout, account, search, password, preview, receipt or API address
 * (snapshotPath). A copy is served to everybody during an outage, a signed
 * in member or a buyer with a cart included: they see the stranger's page,
 * never somebody else's.
 *
 * WHAT IS SERVED. Only while the database is down (./db-health.ts) or where
 * the page would otherwise have been a 503; `private, no-store`, so no cache
 * keeps the outage's copy past the outage; `X-Storelib-Snapshot` says when
 * it was taken. A page's query is not part of its key: a sorted shop is
 * served unsorted during an outage.
 *
 * NEVER LONGER THAN THE SITE. Unpublish and a take down ask the pages again
 * (lib/edge/snapshot-capture.ts): a page that answers 404 or 410 is deleted,
 * and a site whose front page answers so loses every copy and its index.
 */
import type { SnapshotStore } from "./snapshot-store"

export const SNAPSHOT_HEADER = "X-Storelib-Snapshot"
export const SNAPSHOT_CACHE = "private, no-store"
/** The biggest page kept, in characters. A Shopify theme's page is 200 to 600 KB. */
export const SNAPSHOT_MAX = 1_500_000
/** How long a server believes what it read from the store (a copy, or that there is none) while the store answers. */
export const HOLD_MS = 60_000
const HOLD_MAX = 300

export type SnapshotKind = "site" | "onepage" | "community"

export interface PageRecord {
  v: 1
  host: string
  path: string
  kind: SnapshotKind
  html: string
  contentType: string
  capturedAt: string
}

/** A host as kept: lower case, no port, letters, digits, dots and hyphens only. */
export function snapshotHost(host: string | null | undefined): string | null {
  const h = (host ?? "").split(":")[0].trim().toLowerCase().replace(/\.$/, "")
  return /^[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z0-9-]{1,63}$/.test(h) ? h : null
}

/** Addresses that are one visitor's, carry what they typed, or are not a page at all. */
const NEVER = /^\/(?:api|_next|media|cart|checkout|account|search|password|preview|receipt|order-help|review|wishlist|localization|challenge|discount|apps|tools|services|admin|app|dashboard|login|signup|auth)(?:[/?#.]|$)/i

/** The path a copy is kept under, or null for an address that never has one. */
export function snapshotPath(pathname: string): string | null {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("/~") || NEVER.test(pathname)) return null
  if (/\.[a-z0-9]{1,8}$/i.test(pathname)) return null
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/"
  return p.length <= 512 ? p || "/" : null
}

/** Whether a request may be answered from a copy: a page asked for as a page, by GET or HEAD. */
export function snapshotRequest(r: { method: string; pathname: string; accept?: string | null; fetchDest?: string | null; requestedWith?: string | null }): boolean {
  if (r.method !== "GET" && r.method !== "HEAD") return false
  if (r.requestedWith === "XMLHttpRequest") return false
  if (r.fetchDest && r.fetchDest !== "document" && r.fetchDest !== "iframe" && r.fetchDest !== "empty") return false
  const accept = (r.accept ?? "").toLowerCase()
  if (accept && !accept.includes("text/html") && !accept.includes("*/*")) return false
  if (accept.includes("application/json") && !accept.includes("text/html")) return false
  return snapshotPath(r.pathname) !== null
}

async function sha(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32)
}

/** The store key of a page's copy: by host, then a digest of the path. */
export async function pageKey(host: string, path: string): Promise<string | null> {
  const h = snapshotHost(host)
  const p = snapshotPath(path)
  return h && p ? `v1/p/${h}/${await sha(p)}.json` : null
}

/** The store key of a host's record (which site it is, for a connected domain with no database). */
export function hostKey(host: string): string | null {
  const h = snapshotHost(host)
  return h ? `v1/h/${h}.json` : null
}

/** The store key of a scope's index (the pages one site, OnePage or community has kept). */
export function indexKey(scope: string): string | null {
  return /^(?:site|onepage|community)-[a-z0-9_-]{1,100}$/.test(scope) ? `v1/i/${scope}.json` : null
}

/**
 * Whether an answer may be kept as everybody's copy (see the top of this
 * file). `askedWithCookie` is whether the request that got it carried one.
 */
export function capturable(r: { status: number; headers: Headers }, askedWithCookie: boolean): boolean {
  if (askedWithCookie || r.status !== 200) return false
  if (!/^text\/html\b/i.test(r.headers.get("content-type") ?? "")) return false
  if (r.headers.has("set-cookie") || r.headers.has(SNAPSHOT_HEADER)) return false
  /*
    A PAGE DRAWN WITHOUT SOMETHING (X-Storelib-Partial, app/api/site-theme/
    site): a part that did not answer in time, or the copy of the website
    from before the latest Publish (round 29). It is one visitor's page; kept
    as the stored copy it would be served in the site's place later.
  */
  if (r.headers.has("x-storelib-partial")) return false
  /*
    Not judged by Cache-Control: every page Next draws per request says
    "private, no-cache, no-store" (a OnePage, a community page), and what
    makes a page somebody's here is a cookie, which this request did not
    carry. A page let in with a password pass needs the pass cookie, so it
    is never what comes back.
  */
  return true
}

export function pageRecord(host: string, path: string, kind: SnapshotKind, html: string, contentType: string, now = new Date()): PageRecord | null {
  const h = snapshotHost(host)
  const p = snapshotPath(path)
  if (!h || !p || html.length === 0 || html.length > SNAPSHOT_MAX) return null
  return { v: 1, host: h, path: p, kind, html, contentType: contentType || "text/html; charset=utf-8", capturedAt: now.toISOString() }
}

function validRecord(v: unknown, host: string, path: string): v is PageRecord {
  const r = v as Partial<PageRecord> | null
  return !!r && r.v === 1 && r.host === host && r.path === path && typeof r.html === "string" && typeof r.capturedAt === "string"
}

/* ── Read through a hold, per server ─────────────────────────────────────── */

const held = new Map<string, { at: number; value: PageRecord | null }>()

function hold(key: string, value: PageRecord | null, now: number) {
  held.delete(key)
  held.set(key, { at: now, value })
  while (held.size > HOLD_MAX) {
    const oldest = held.keys().next().value
    if (oldest === undefined) break
    held.delete(oldest)
  }
}

/**
 * The copy of a page, or null. What was read is believed for HOLD_MS; past
 * that it is read again, and if the store does not answer the copy already
 * held is kept (an outage of the store during an outage of the database
 * still serves what this server has).
 */
export async function readSnapshot(store: SnapshotStore, host: string, pathname: string, now = Date.now()): Promise<PageRecord | null> {
  const h = snapshotHost(host)
  const p = snapshotPath(pathname)
  if (!h || !p) return null
  const key = await pageKey(h, p)
  if (!key) return null
  const was = held.get(key)
  if (was && now - was.at < HOLD_MS) return was.value && servable(was.value, now) ? was.value : null
  const got = await store.get<PageRecord>(key)
  if (got === "failed") return was?.value && servable(was.value, now) ? was.value : null
  const value = validRecord(got, h, p) ? got : null
  hold(key, value, now)
  return value && servable(value, now) ? value : null
}

/** A OnePage's or a community's copy is kept fresh by its visitors and its saves; one nobody has refreshed for a week (a page deleted, say) is not served. A site's follows its publishes and never ages out. */
export const PAGE_COPY_MAX_AGE_MS = 7 * 24 * 60 * 60_000

export function servable(record: PageRecord, now = Date.now(), deployment: string | null = currentDeployment()): boolean {
  if (!drawableNow(record.html, deployment)) return false
  if (record.kind === "site") return true
  const at = Date.parse(record.capturedAt)
  return Number.isFinite(at) && now - at < PAGE_COPY_MAX_AGE_MS
}

/*
  ===========================================================================
   NEVER A COPY WHOSE OWN FILES ARE GONE (round AQ)
  ===========================================================================
  A Storelib theme's page, a OnePage and a community page are Next pages:
  their stylesheets and scripts are this deployment's files
  (/_next/static/…?dpl=<deployment>). A site's copy is taken at its Publish
  and kept until the next one, so after a deploy it names files the site no
  longer has. Measured on asgardshop.storelib.com on Nov 9: a proxy that had
  just seen one database read fail served the copy taken on Nov 4, every one
  of its stylesheets and 53 scripts answered 404, and the visitor got the
  page unstyled with nothing on it working: every link a full reload
  (scratchpad ap/aq1/snapshot-probe-asgard.txt). Such a copy is not served;
  the request goes on as if there were none (the live page, its CDN copy,
  or "One moment"). An imported theme's copy names no deployment (its files
  are at /api/site-theme/assets, which no deploy moves) and is served as
  before, and so is every copy where the running deployment is not known.
*/
const COPY_DEPLOYMENT = /\/_next\/static\/[^"'\s?]+\?dpl=(dpl_[A-Za-z0-9]+)/

/** The deployment whose files a copy names, or null when it names none. */
export function copyDeployment(html: string): string | null {
  return COPY_DEPLOYMENT.exec(html)?.[1] ?? null
}

/** The deployment this server is, when the platform says. */
export function currentDeployment(env: Record<string, string | undefined> = process.env): string | null {
  return env.VERCEL_DEPLOYMENT_ID || env.NEXT_DEPLOYMENT_ID || null
}

/** Whether a browser can still draw a copy: it names no deployment's files, or this one's, or this deployment is not known. */
export function drawableNow(html: string, deployment: string | null): boolean {
  if (!deployment) return true
  const named = copyDeployment(html)
  return named === null || named === deployment
}

/** Forget what this server holds for a page (after it was written or deleted here). */
export function forgetHeldSnapshot(key: string): void {
  held.delete(key)
}

/** For the tests. */
export function resetSnapshotHold(): void {
  held.clear()
}

/** The answer made from a copy. */
export function snapshotResponse(record: PageRecord, method = "GET"): Response {
  return new Response(method === "HEAD" ? null : record.html, {
    status: 200,
    headers: {
      "Content-Type": record.contentType,
      "Cache-Control": SNAPSHOT_CACHE,
      [SNAPSHOT_HEADER]: record.capturedAt,
    },
  })
}

/* ── A connected domain, without the database ────────────────────────────── */

export interface HostRecord {
  v: 1
  host: string
  /** The site's name (its subdomain). */
  name: string
  purpose: "website"
  /** Which renderer draws it, when known when it was kept. */
  kind?: "native" | "compat" | "ai"
  /** No password asked, when it was kept. Absent when unknown: never routed from. */
  open?: boolean
  /** The site's own address (its connected domain), when this host only sends visitors there. */
  canonical?: string
  capturedAt: string
}

const hostHeld = new Map<string, { at: number; value: HostRecord | null }>()

/** Which site a host is, from the store, through the same kind of hold as pages. */
export async function readHostRecord(store: SnapshotStore, host: string, now = Date.now()): Promise<HostRecord | null> {
  const h = snapshotHost(host)
  const key = h ? hostKey(h) : null
  if (!h || !key) return null
  const was = hostHeld.get(key)
  if (was && now - was.at < HOLD_MS) return was.value
  const got = await store.get<HostRecord>(key)
  if (got === "failed") return was?.value ?? null
  const r = got as Partial<HostRecord> | null
  const value = r && r.v === 1 && r.host === h && typeof r.name === "string" && /^[a-z0-9_-]{1,64}$/i.test(r.name) && (r.canonical === undefined || snapshotHost(r.canonical) === r.canonical) ? (r as HostRecord) : null
  hostHeld.delete(key)
  hostHeld.set(key, { at: now, value })
  while (hostHeld.size > 5000) {
    const oldest = hostHeld.keys().next().value
    if (oldest === undefined) break
    hostHeld.delete(oldest)
  }
  return value
}

export function resetHostHold(): void {
  hostHeld.clear()
}
