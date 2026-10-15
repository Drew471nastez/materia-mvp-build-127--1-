import "server-only"

/**
 * A COMMUNITY'S DOMAIN, READ ON THE SERVER (round 31).
 *
 * communityDomainHost is what the community's pages name as their
 * canonical once the domain is live: cached for five minutes under
 * communityDomainTag, which every route that connects, checks, moves or
 * removes a community's domain empties. Any failure, and a database before
 * part 185, reads as "no domain": the storelib.com address, a link that works.
 *
 * ownedCommunities is the list Settings › Domains offers (nothing while
 * communities are switched off): only communities
 * the signed in creator owns (communities.creator_id), never one they help
 * run as an admin. Whose domain it is and whose community it is are the
 * same account, or nothing is connected.
 */
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { communitiesEnabled } from "@/lib/communities/flag"
import { servingHost } from "./hostname"
import { COMMUNITY_TARGET, communityDomainTag, communityServable } from "./community"

type Admin = ReturnType<typeof createAdminClient>

export interface OwnedCommunity {
  id: string
  name: string
  slug: string
}

/** The communities this creator owns, newest first, for the destination list. Empty when communities are not there. */
export async function ownedCommunities(admin: Admin, creatorId: string): Promise<OwnedCommunity[]> {
  try {
    /* Communities switched off (/admin/communities): nothing to connect a domain to. */
    if (!(await communitiesEnabled())) return []
    const { data, error } = await admin
      .from("communities")
      .select("id, name, slug")
      .eq("creator_id", creatorId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) return []
    return ((data ?? []) as OwnedCommunity[]).filter((c) => c.id && c.slug)
  } catch {
    return []
  }
}

/** One community, only when this creator owns it and it is not deleted. */
export async function ownedCommunity(admin: Admin, creatorId: string, communityId: unknown): Promise<OwnedCommunity | null> {
  if (typeof communityId !== "string" || !/^[0-9a-f-]{36}$/i.test(communityId)) return null
  if (!(await communitiesEnabled().catch(() => false))) return null
  const { data } = await admin.from("communities").select("id, name, slug, creator_id, deleted_at").eq("id", communityId).maybeSingle()
  const row = data as (OwnedCommunity & { creator_id: string | null; deleted_at: string | null }) | null
  if (!row || !communityServable({ creator_id: creatorId }, row)) return null
  return { id: row.id, name: row.name, slug: row.slug }
}

/** The host a community is served at for good: its domain, once it is connected with HTTPS. */
export async function communityDomainHost(communityId: string | null | undefined): Promise<string | null> {
  if (!communityId) return null
  return unstable_cache(
    async () => {
      try {
        const admin = createAdminClient()
        const { data, error } = await admin
          .from("custom_domains")
          .select("domain, creator_id, status")
          .eq("purpose", "community")
          .eq("target_type", COMMUNITY_TARGET)
          .eq("target_id", communityId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle()
        if (error || !data) return null
        const row = data as { domain: string; creator_id: string }
        const { data: community } = await admin.from("communities").select("slug, creator_id, deleted_at").eq("id", communityId).maybeSingle()
        if (!communityServable(row, community as { slug: string; creator_id: string | null; deleted_at: string | null } | null)) return null
        return servingHost(row.domain)
      } catch {
        return null
      }
    },
    ["community-domain-host", communityId],
    { tags: [communityDomainTag(communityId)], revalidate: 300 },
  )()
}

/** `https://<host>` for a community on its own domain, or null. */
export async function communityDomainOrigin(communityId: string | null | undefined): Promise<string | null> {
  const host = await communityDomainHost(communityId)
  return host ? `https://${host}` : null
}
