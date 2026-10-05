import "server-only"

import { cache } from "react"
import { communitiesEnabled } from "@/lib/communities/flag"
import { loadCommunity } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import type { AccessRuleJson, CommunityRow } from "@/lib/communities/types"
import type { EventFacts } from "./event-seo"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const eventFacts = cache(async (slug: string, eventId: string): Promise<(EventFacts & { communityRow: CommunityRow }) | null> => {
  if (!UUID.test(eventId)) return null
  try {
    if (!(await communitiesEnabled())) return null
    const db = admin()
    const community = await loadCommunity(db, { slug: decodeURIComponent(slug || "").toLowerCase() })
    if (!community) return null
    const { data, error } = await db
      .from("community_events")
      .select("id, title, description, cover_url, starts_at, timezone, location, status, access, updated_at")
      .eq("id", eventId)
      .eq("community_id", community.id)
      .maybeSingle()
    if (error || !data) return null
    const row = data as {
      id: string
      title: string
      description: string | null
      cover_url: string | null
      starts_at: string
      timezone: string
      location: string | null
      status: string
      access: AccessRuleJson | null
      updated_at: string | null
    }
    return {
      communityRow: community,
      community,
      event: {
        id: row.id,
        title: row.title,
        description: row.description,
        coverUrl: row.cover_url,
        startsAt: row.starts_at,
        timezone: row.timezone,
        location: row.location,
        status: row.status,
        access: row.access,
        updatedAt: row.updated_at,
      },
    }
  } catch {
    return null
  }
})
