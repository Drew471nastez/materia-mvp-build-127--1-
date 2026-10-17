import "server-only"

/**
 * ===========================================================================
 *  "VISIT STORE": THE LIVE WEBSITE AN ORDER WAS PLACED ON
 * ===========================================================================
 * Every link from a physical order back to the shop (the buyer's order page,
 * order help, and every order, shipping, pickup and return email) goes to
 * the creator's live website, the one built in the website builder, and
 * never to their creator page (storelib.com/<username>) or storelib.com.
 *
 * Which address, in this order, the first one that serves the creator's
 * published website right now (lib/checkout/site-checkout-server
 * servingSiteOrigin):
 *
 *   1. the website's primary connected domain, once it is active: the
 *      address a <name>.storelib.com visit is redirected to anyway
 *      (lib/custom-domains/subdomain-redirect.ts)
 *   2. the host the order was placed on (commerce_checkouts.origin.site)
 *   3. any other verified domain of the creator's website
 *   4. the website's <name>.storelib.com address: its own name (Website
 *      settings › Domains) before the username and older names
 *
 * None serving (no published website, a banned store, a lookup that failed)
 * is the empty string: the caller leaves the link out. A creator has one
 * website, so the creator decides the answer; the order only says which of
 * its addresses the buyer saw.
 *
 * The pure half (ordering the candidates, building the link) is exported for
 * tests/emails27.test.ts; the database half is orderStoreUrl.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { siteHostsFor } from "@/lib/checkout/site-hosts"
import { servingSiteOrigin } from "@/lib/checkout/site-checkout-server"
import { listCreatorDomains, primaryHostOf } from "@/lib/custom-domains/store"
import { websiteHandleOf } from "@/lib/website-builder/site-address-data"
import { originSiteHost } from "./order-link"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** How many addresses are asked before giving up: each is a few reads. */
const MAX_CANDIDATES = 8

const HOST = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::\d{1,5})?$/

function bareHost(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "")
  return HOST.test(host) && host.includes(".") ? host : null
}

/** Whether a host is the platform itself (storelib.com, www.storelib.com), where only the creator page could answer. */
export function isPlatformHost(host: string, mainDomain: string): boolean {
  const h = host.split(":")[0].toLowerCase()
  const main = mainDomain.toLowerCase()
  return h === main || h === `www.${main}`
}

/**
 * The hosts to try, best first and each once (see the order above). The
 * platform's own host is never one: a creator page is not a website.
 */
export function storeHostCandidates(input: { primary?: string | null; placed?: string | null; handle?: string | null; hosts?: readonly string[]; mainDomain: string }): string[] {
  const main = input.mainDomain.toLowerCase()
  const onPlatform = (h: string) => h.split(":")[0].endsWith(`.${main}`)
  const hosts = (input.hosts ?? []).map(bareHost).filter((h): h is string => !!h)
  const placed = bareHost(input.placed)
  const handle = typeof input.handle === "string" && /^[a-z0-9-]{1,63}$/.test(input.handle.trim().toLowerCase()) ? `${input.handle.trim().toLowerCase()}.${main}` : null
  const ordered = [
    bareHost(input.primary),
    placed && !onPlatform(placed) ? placed : null,
    ...hosts.filter((h) => !onPlatform(h)),
    placed,
    handle,
    ...hosts.filter(onPlatform),
  ]
  const out: string[] = []
  for (const h of ordered) {
    if (!h || isPlatformHost(h, main) || out.includes(h)) continue
    out.push(h)
  }
  return out
}

/**
 * The link to a path on a website origin ("/" when none is given), or "" for
 * an origin that is not a website: storelib.com itself, anything not http(s).
 * A path is only ever a path, so data cannot point the link elsewhere.
 */
export function storeLinkOf(origin: string | null | undefined, path: string | null | undefined, mainDomain: string): string {
  if (!origin) return ""
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return ""
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return ""
  if (isPlatformHost(url.host, mainDomain)) return ""
  const p = typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : "/"
  return `${url.origin}${p === "/" ? "" : p}`
}

/**
 * What a caller passes: the order row it already holds (commerce_checkouts,
 * with creator_id and origin), or just the creator and the host it was
 * placed on. Any other fields on the row are ignored.
 */
export type StoreLinkOrder = {
  creator_id?: string | null
  creatorId?: string | null
  /** commerce_checkouts.origin: { surface: "website", site: "<host>" } when it came from a website. */
  origin?: unknown
  /** The host the order was placed on, when the caller has it without an origin. */
  site?: string | null
} & Record<string, unknown>

/** The creator's website primary domain at the host it is served at, once active; null otherwise. */
async function primaryWebsiteHost(db: Db, creatorId: string): Promise<string | null> {
  try {
    const { rows, schema } = await listCreatorDomains(db, creatorId)
    return primaryHostOf(rows, "website", schema)
  } catch {
    return null
  }
}

/**
 * https://<the live website the order was placed on><path>, or "" when the
 * creator has no live website (leave the link out). Never the creator page,
 * never storelib.com. Never throws.
 */
export async function orderStoreUrl(order: StoreLinkOrder, opts: { db?: Db; path?: string } = {}): Promise<string> {
  const creatorId = String(order.creator_id ?? order.creatorId ?? "")
  if (!creatorId) return ""
  const mainDomain = getMainDomain()
  try {
    const db = opts.db ?? createAdminClient()
    const [primary, handle, hosts] = await Promise.all([
      primaryWebsiteHost(db, creatorId),
      websiteHandleOf(creatorId, db).catch(() => null),
      siteHostsFor(creatorId, db).catch(() => [] as string[]),
    ])
    const placed = originSiteHost(order.origin) ?? bareHost(order.site)
    for (const host of storeHostCandidates({ primary, placed, handle, hosts, mainDomain }).slice(0, MAX_CANDIDATES)) {
      const served = await servingSiteOrigin(db, creatorId, `https://${host}`).catch(() => null)
      const link = storeLinkOf(served, opts.path, mainDomain)
      if (link) return link
    }
  } catch {
    /* No link below. */
  }
  return ""
}
