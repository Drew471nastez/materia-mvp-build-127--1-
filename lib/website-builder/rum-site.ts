import "server-only"

/**
 * ===========================================================================
 *  WHICH WEBSITE A SPEED BEACON CAME FROM, DECIDED BY THE HOST ALONE
 * ===========================================================================
 * A beacon is posted to the page's own host (SITE_BEACON_PATH), so the host
 * the request arrived on is the website: `<name>.storelib.com` or a
 * connected domain. The body never names a site, and nothing in it could
 * move a page view to somebody else's: the host goes through the same rule
 * a visitor's sign in does (lib/site-accounts/hosts siteOwnerOfHost, which
 * refuses storelib.com itself, previews, *.vercel.app, localhost, an
 * unverified domain, an AI-built site and a banned creator), and then to the
 * creator's live install, chosen the way the published site chooses it
 * (lib/website-builder/published-site.ts: published, first by sort order).
 *
 * Remembered per server instance: five minutes for a site, one for a host
 * that is not one, so a busy site costs one lookup per instance every five
 * minutes rather than one per page view.
 */

import { siteOwnerOfHost, type HostRules } from "@/lib/site-accounts/hosts"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface RumSite {
  installId: string
  creatorId: string
}

const FOUND_MS = 5 * 60_000
const MISSING_MS = 60_000
const MAX_ENTRIES = 5000
const cache = new Map<string, { site: RumSite | null; until: number }>()

export function forgetRumSites() {
  cache.clear()
}

export async function rumSiteOfHost(db: Db, rawHost: string | null | undefined, now = Date.now(), rules?: HostRules): Promise<RumSite | null> {
  const host = (rawHost ?? "").trim().toLowerCase()
  if (!host) return null
  const seen = cache.get(host)
  if (seen && seen.until > now) return seen.site
  let site: RumSite | null = null
  try {
    const owner = await siteOwnerOfHost(db, host, rules)
    if (owner) {
      const { data } = await db
        .from("store_theme_installs")
        .select("id")
        .eq("creator_id", owner.creatorId)
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle()
      const id = (data as { id?: string } | null)?.id
      if (id) site = { installId: id, creatorId: owner.creatorId }
    }
  } catch {
    site = null
  }
  if (cache.size >= MAX_ENTRIES) cache.clear()
  cache.set(host, { site, until: now + (site ? FOUND_MS : MISSING_MS) })
  return site
}
