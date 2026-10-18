/**
 * ===========================================================================
 *  WHICH HOSTS ARE A CREATOR'S OWN WEBSITE
 * ===========================================================================
 * A visitor signs in to a creator's website on the website itself
 * (lib/site-accounts/sign-in.ts), and the website they are signing in to is
 * the host the request arrived on. That host is only taken for a website
 * when it is one of the hosts a creator's built website is actually served
 * at:
 *
 *   <name>.storelib.com   a single label under the sites domain, not one of
 *                         the platform's own names, that belongs to a
 *                         creator (username, creator slug, or the website's
 *                         own address), with a published website and no live
 *                         AI-built site answering there instead;
 *
 *   a connected domain    one the creator connected for their website that
 *                         Storelib has seen pointing at it (active, or
 *                         active with its certificate on the way), at the
 *                         host it is served at or its bare name.
 *
 * Anything else, including every storelib.com page, a *.vercel.app host and
 * localhost, is refused: no code is sent from it and no session is made for
 * it. The check is made from the database on the server, never from anything
 * the page claims about itself.
 *
 * The pure half is exported on its own so tests/site-accounts.test.ts can
 * throw the odd shapes at it without a database.
 */

import { MCP_HOST_LABEL } from "@/lib/agent-access/mcp-host"
import { isSitePath } from "./token"
import { creatorOfName } from "./creator-of-name"

/** The platform's own names under storelib.com, which are never a website. */
const PLATFORM_LABELS = new Set(["www", "app", "api", "admin", "dashboard", "localhost", MCP_HOST_LABEL])

export type SiteHost =
  | { kind: "subdomain"; host: string; name: string }
  | { kind: "custom"; host: string; domain: string }

export interface HostRules {
  /** "storelib.com". */
  mainDomain: string
  /** Where websites are published, when not the main domain. */
  sitesDomain?: string
}

function rules(): HostRules {
  const mainDomain = (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com").toLowerCase()
  return { mainDomain, sitesDomain: (process.env.NEXT_PUBLIC_SITES_HOST || mainDomain).toLowerCase() }
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * What kind of website host this is, or null when it is not one. `host` is
 * what the browser sent, port and all; the port is kept in `host` (the
 * exact thing a code is bound to) and left out of everything else.
 */
export function classifySiteHost(rawHost: unknown, r: HostRules = rules()): SiteHost | null {
  if (typeof rawHost !== "string") return null
  const host = rawHost.trim().toLowerCase().replace(/\.$/, "")
  if (!host || host.length > 260 || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return null
  const bare = host.split(":")[0]
  const main = r.mainDomain.toLowerCase()
  const sites = (r.sitesDomain || main).toLowerCase()
  const labels = bare.split(".")
  if (labels.some((l) => !LABEL.test(l))) return null
  if (bare === main || bare === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(bare)) return null
  if (bare.endsWith(".vercel.app")) return null

  if (bare.endsWith(`.${sites}`)) {
    const name = bare.slice(0, -(sites.length + 1))
    if (!name || name.includes(".") || PLATFORM_LABELS.has(name)) return null
    return { kind: "subdomain", host, name }
  }
  /* Any other name under the platform's own domain is the platform's. */
  if (bare.endsWith(`.${main}`)) return null
  if (labels.length < 2) return null
  return { kind: "custom", host, domain: bare.replace(/^www\./, "") }
}

/**
 * A path on the website to land on after signing in, from a query value or
 * a form field. `/account` when it is not one: never the API, and never the
 * sign in or sign out pages themselves, so a link cannot make signing in end
 * in signing out.
 */
export function returnPathOf(raw: unknown, fallback = "/account"): string {
  if (!isSitePath(raw)) return fallback
  if (raw === "/api" || raw.startsWith("/api/") || raw.startsWith("/api?")) return fallback
  const page = raw.split(/[?#]/)[0].replace(/\/+$/, "")
  if (page === "/account/login" || page === "/account/logout") return fallback
  return raw
}

/* ─── The database half ─────────────────────────────────────────────────── */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Every status in which Storelib has seen the domain pointing at it. */
const VERIFIED = ["active", "ssl_provisioning"]

export interface SiteOwner {
  creatorId: string
  host: string
  kind: SiteHost["kind"]
}

async function one(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await query
    if (error || !data) return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

/* A name under the sites domain, to its creator: ./creator-of-name.ts, which the proxy's password gate asks as well. */

/** A connected domain, to its creator, when it is verified and is the website's. */
async function creatorOfDomain(db: Db, domain: string): Promise<string | null> {
  try {
    let { data, error } = await db
      .from("custom_domains")
      .select("creator_id, status, purpose")
      .eq("domain", domain)
      .in("status", VERIFIED)
      .limit(1)
    /* A database from before domains had a purpose: every domain is the website's. */
    if (error && /column|42703|PGRST204/i.test(`${error.code} ${error.message}`)) {
      ;({ data, error } = await db.from("custom_domains").select("creator_id, status").eq("domain", domain).in("status", VERIFIED).limit(1))
    }
    if (error || !Array.isArray(data) || data.length === 0) return null
    const row = data[0] as { creator_id?: string; purpose?: string | null }
    if (row.purpose && row.purpose !== "website") return null
    return typeof row.creator_id === "string" ? row.creator_id : null
  } catch {
    return null
  }
}

async function hasPublishedWebsite(db: Db, creatorId: string): Promise<boolean> {
  const install = await one(
    db.from("store_theme_installs").select("id").eq("creator_id", creatorId).eq("status", "published").limit(1).maybeSingle(),
  )
  return !!install
}

/**
 * A banned creator's website answers as no site (lib/seo/bans.ts), so nobody
 * signs in to it either. Read whole: a database without the ban column has
 * no bans, and a failed read is not taken as one.
 */
async function isBannedCreator(db: Db, creatorId: string): Promise<boolean> {
  const row = await one(db.from("creators").select("*").eq("id", creatorId).maybeSingle())
  return !!(row as { banned_at?: string | null } | null)?.banned_at
}

async function isLiveAiSite(db: Db, name: string): Promise<boolean> {
  const deployment = await one(db.from("site_deployments").select("storage_prefix").eq("is_live", true).eq("slug", name).maybeSingle())
  return !!deployment?.storage_prefix
}

/**
 * The creator whose built website answers at this host, or null. Every
 * lookup failing reads as null: a host we cannot place is not one we follow.
 */
export async function siteOwnerOfHost(db: Db, rawHost: unknown, r: HostRules = rules()): Promise<SiteOwner | null> {
  const site = classifySiteHost(rawHost, r)
  if (!site) return null
  /*
    Side by side, not one after another (a website's checkout asks this
    before anything else, so every round trip here was the buyer's wait):
    the live AI site and the name's owner together, then the published
    website and the ban together. The answer is the same rule as before:
    a live AI site, no owner, nothing published or a ban is no site.
  */
  let creatorId: string | null = null
  if (site.kind === "subdomain") {
    const [ai, owner] = await Promise.all([isLiveAiSite(db, site.name), creatorOfName(db, site.name)])
    if (ai) return null
    creatorId = owner
  } else {
    creatorId = await creatorOfDomain(db, site.domain)
  }
  if (!creatorId) return null
  const [published, banned] = await Promise.all([hasPublishedWebsite(db, creatorId), isBannedCreator(db, creatorId)])
  if (!published || banned) return null
  return { creatorId, host: site.host, kind: site.kind }
}
