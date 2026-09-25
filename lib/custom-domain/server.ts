import "server-only"

/**
 * ===========================================================================
 *  A CREATOR'S LIVE DOMAIN, FOR THE PAGES THAT NAME THEIR OWN ADDRESS
 * ===========================================================================
 * The website, the creator page, a product and the OnePage each declare a
 * canonical address and an og:url. When a live domain shows that page, the
 * address is the domain's; otherwise it is storelib.com's. This is the one
 * read they all make, held for five minutes under a tag that the domains
 * routes clear whenever a domain is added, removed, goes live or is pointed
 * somewhere else, so a change of target is reflected at once rather than
 * after the cache runs out.
 */
import { revalidateTag, unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { domainOrigin, targetOf, type DomainTarget } from "./targets"

export const customDomainTag = (creatorId: string) => `custom-domain:${creatorId}`

type LiveRow = { domain: string; target: DomainTarget }

/**
 * Every active domain of this creator, oldest first. Before the target
 * column exists the first read fails on it, and the rows are read again
 * without it: each then shows the website, as they always did.
 */
async function readLive(creatorId: string): Promise<LiveRow[]> {
  const admin = createAdminClient()
  const first = await admin
    .from("custom_domains")
    .select("domain, target")
    .eq("creator_id", creatorId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
  if (!first.error) {
    return ((first.data ?? []) as { domain: string; target?: string | null }[]).map((r) => ({ domain: r.domain, target: targetOf(r) }))
  }
  const plain = await admin
    .from("custom_domains")
    .select("domain")
    .eq("creator_id", creatorId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
  return ((plain.data ?? []) as { domain: string }[]).map((r) => ({ domain: r.domain, target: "website" as const }))
}

export async function liveDomains(creatorId: string): Promise<LiveRow[]> {
  try {
    return await unstable_cache(() => readLive(creatorId), ["custom-domain-live", creatorId], {
      tags: [customDomainTag(creatorId)],
      revalidate: 300,
    })()
  } catch {
    return []
  }
}

/** The bare domain showing `target`, or null. */
export async function liveDomainOf(creatorId: string, target: DomainTarget): Promise<string | null> {
  return (await liveDomains(creatorId)).find((r) => r.target === target)?.domain ?? null
}

/** https://www.<domain> for the live domain showing `target`, or null. */
export async function liveOriginOf(creatorId: string, target: DomainTarget): Promise<string | null> {
  const domain = await liveDomainOf(creatorId, target)
  return domain ? domainOrigin(domain) : null
}

/**
 * A domain was added, removed, went live or now shows something else. The
 * cached reads above, and the published website whose canonical and
 * sitemap name the domain, are both read again on the next request.
 */
export async function revalidateCustomDomain(creatorId: string): Promise<void> {
  try {
    /* Expired now, not served stale once more: the next request reads the new target. */
    revalidateTag(customDomainTag(creatorId), { expire: 0 })
    await revalidatePublishedSite(creatorId)
  } catch {
    /* Outside a request (a script, a test) there is nothing to purge. */
  }
}
