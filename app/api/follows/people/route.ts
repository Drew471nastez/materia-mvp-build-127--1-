import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/follows/people → { people: [...] }
 *
 * The people you follow — not their listings. Returns enough to render a row
 * without a second request per person: name, avatar, when they joined, how many
 * listings they have, and when they were last seen.
 *
 * Fails soft: an empty list is a perfectly good Following tab.
 */

/** Seen within this many minutes counts as online. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id
    if (!userId) return NextResponse.json({ people: [] })

    const { data: followRows } = await supabase
      .from("follows")
      .select("following_id, created_at")
      .eq("follower_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000)

    const ids = (followRows || []).map((r: any) => r.following_id).filter(Boolean)
    if (ids.length === 0) return NextResponse.json({ people: [] })

    const admin = createAdminClient()

    // last_seen_at only exists after 20260731_presence.sql — fall back so the
    // list still renders (without dots) if that hasn't been applied yet.
    let profiles: any[] | null = null
    const withPresence = await admin
      .from("profiles")
      .select("id, username, display_name, avatar_url, created_at, last_seen_at")
      .in("id", ids)
    if (withPresence.error) {
      const base = await admin
        .from("profiles")
        .select("id, username, display_name, avatar_url, created_at")
        .in("id", ids)
      profiles = base.data
    } else {
      profiles = withPresence.data
    }
    if (!profiles) return NextResponse.json({ people: [] })

    // Listing counts, in one pass rather than a query per person.
    const listings = new Map<string, number>()
    try {
      const { data: creators } = await admin.from("creators").select("id, user_id").in("user_id", ids)
      const creatorToUser = new Map<string, string>()
      for (const c of creators || []) creatorToUser.set((c as any).id, (c as any).user_id)
      const creatorIds = [...creatorToUser.keys()]
      if (creatorIds.length) {
        const { data: rows } = await admin
          .from("products")
          .select("creator_id")
          .eq("status", "published")
          .in("creator_id", creatorIds)
          .limit(50000)
        for (const r of rows || []) {
          const uid = creatorToUser.get((r as any).creator_id)
          if (uid) listings.set(uid, (listings.get(uid) || 0) + 1)
        }
      }
    } catch {
      /* counts are optional */
    }

    const now = Date.now()
    // Preserve follow recency: most recently followed first.
    const order = new Map<string, number>()
    ;(followRows || []).forEach((r: any, i: number) => order.set(r.following_id, i))

    const people = profiles
      .map((p: any) => {
        const seen = p.last_seen_at ? Date.parse(p.last_seen_at) : NaN
        return {
          id: p.id,
          username: p.username || null,
          displayName: p.display_name || null,
          avatarUrl: p.avatar_url || null,
          joinedAt: p.created_at || null,
          listings: listings.get(p.id) || 0,
          online: Number.isFinite(seen) ? now - seen < ONLINE_WINDOW_MS : false,
        }
      })
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

    return NextResponse.json({ people })
  } catch (e: any) {
    console.error("[follows/people] failed:", e?.message || e)
    return NextResponse.json({ people: [] })
  }
}
