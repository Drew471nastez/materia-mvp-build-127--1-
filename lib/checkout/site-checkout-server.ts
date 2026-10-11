import "server-only"

/**
 * ===========================================================================
 *  THE WEBSITE A CHECKOUT IS ON, AND WHO IS BUYING THERE
 * ===========================================================================
 * The checkout at https://<site host>/checkout (app/checkout/site) and its
 * route (app/api/checkout/site) never take the shop from the link: the shop
 * is whoever the HOST belongs to, read from the database the way a website
 * sign in reads it (lib/site-accounts/hosts siteOwnerOfHost): a published
 * website at <name>.storelib.com, or a verified domain connected for it.
 * Any other host (storelib.com itself, a vercel.app preview, localhost) has
 * no website checkout at all.
 *
 * The buyer is the website's own customer account when they are signed in
 * there (lib/site-accounts/session, the host-only cookie), and a guest
 * otherwise. Never a Storelib login: the creator's site does not get
 * storelib.com's session, and storelib.com never gets the site's.
 */
import { siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { cookieFrom, sessionCookieName, visitorFrom } from "@/lib/site-accounts/session"
import { customerById } from "@/lib/site-accounts/customers"
import type { SiteBuyer } from "./site-checkout"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface SiteOfCheckout {
  creatorId: string
  /** As the browser sent it, port and all. */
  host: string
  /** https://<host>, or http:// on a local host. */
  origin: string
  kind: "subdomain" | "custom"
}

function originOfHost(host: string): string {
  const bare = host.split(":")[0]
  return `${bare === "localhost" || bare === "127.0.0.1" ? "http" : "https"}://${host}`
}

/** The website this host serves, or null when it is not one. */
export async function siteOfHost(db: Db, rawHost: string | null | undefined): Promise<SiteOfCheckout | null> {
  const host = (rawHost ?? "").trim().toLowerCase()
  if (!host) return null
  const owner = await siteOwnerOfHost(db, host)
  if (!owner) return null
  return { creatorId: owner.creatorId, host: owner.host, origin: originOfHost(owner.host), kind: owner.kind }
}

export async function siteOfRequest(db: Db, request: Request): Promise<SiteOfCheckout | null> {
  return siteOfHost(db, request.headers.get("host"))
}

/** The website's signed in customer, from the session cookie's value on this host, for this creator only. */
export async function siteBuyerFrom(db: Db, input: { host: string; cookieValue: string | null | undefined; creatorId: string }): Promise<(SiteBuyer & { customerId: string }) | null> {
  const visitor = visitorFrom(input.cookieValue, input.host, { creatorId: input.creatorId })
  if (!visitor) return null
  const customer = await customerById(db, { customerId: visitor.customerId, creatorId: input.creatorId })
  if (!customer?.email) return null
  return { customerId: customer.id, email: customer.email.toLowerCase(), name: customer.name ?? null }
}

export async function siteBuyerOfRequest(db: Db, request: Request, creatorId: string): Promise<(SiteBuyer & { customerId: string }) | null> {
  const host = (request.headers.get("host") || "").trim().toLowerCase()
  return siteBuyerFrom(db, { host, cookieValue: cookieFrom(request, sessionCookieName(host)), creatorId })
}

export { sessionCookieName }

/**
 * The origin, when this creator's PUBLISHED website answers there with its
 * own checkout (siteOfHost: published, not a live AI site, not a creator
 * page domain, not banned), else null. Every link to a website's checkout is
 * decided with this first: a preview of a site not published yet, an AI
 * site or an old address would otherwise send the buyer to a host that has
 * no checkout, and the platform's own checkout is kept for those.
 */
export async function servingSiteOrigin(db: Db, creatorId: string, origin: string | null | undefined): Promise<string | null> {
  if (!origin) return null
  let host: string
  try {
    host = new URL(origin).host
  } catch {
    return null
  }
  const site = await siteOfHost(db, host)
  return site && site.creatorId === creatorId ? site.origin : null
}

/** The first of this creator's addresses (a connected domain before a subdomain) whose published website serves its checkout. */
export async function firstServingSite(db: Db, creatorId: string, hosts: string[]): Promise<string | null> {
  const ordered = [...hosts].sort((a, b) => Number(a.endsWith(".storelib.com")) - Number(b.endsWith(".storelib.com")))
  for (const h of ordered.slice(0, 12)) {
    const served = await servingSiteOrigin(db, creatorId, `https://${h}`)
    if (served) return served
  }
  return null
}
