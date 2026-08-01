import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSessionUserId } from "@/lib/auth/current-user"

/**
 * GET /api/follows/feed → { items: Product[] }
 *
 * Listings from everyone the caller follows, newest first — the Following tab.
 *
 * Shaped to match the For You feed exactly (creator + profile embedded,
 * saves_count filled in) so the tab can hand the results straight to the same
 * card component with no mapping.
 *
 * Fails soft: an empty list is a perfectly good Following tab, and it must never
 * take the feed down.
 */

const LIMIT = 100

export async function GET() {
  try {
    const supabase = await createClient()
    // Same shape as the people list: the follows read runs on the caller's own
    // client under RLS, and everything the admin client fetches afterwards is
    // keyed off the ids that read returned rather than off this id. A locally
    // read session therefore cannot reach anyone else's feed.
    const userId = await getSessionUserId(supabase)
    if (!userId) return NextResponse.json({ items: [], reason: "auth_required" })

    const { data: followRows } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId)
      .limit(5000)

    const followedUserIds = (followRows || []).map((r: any) => r.following_id).filter(Boolean)
    if (followedUserIds.length === 0) return NextResponse.json({ items: [] })

    const admin = createAdminClient()

    // A follow points at a person; listings hang off their creator row.
    const { data: creators } = await admin
      .from("creators")
      .select("id, user_id, slug, niche_tags")
      .in("user_id", followedUserIds)

    const creatorIds = (creators || []).map((c: any) => c.id).filter(Boolean)
    if (creatorIds.length === 0) return NextResponse.json({ items: [] })

    const BASE_COLS =
      "id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, type, category, creator_id, created_at, sales_count, reviews_count, reviews_average"

    // Resale attributes only exist after 20260730_marketplace_physical_attributes;
    // fall back so the tab still works if that hasn't run.
    let products: any[] | null = null
    {
      const withAttrs = await admin
        .from("products")
        .select(`${BASE_COLS}, size, size_system, condition, brand`)
        .eq("status", "published")
        .in("creator_id", creatorIds)
        .order("created_at", { ascending: false })
        .limit(LIMIT)
      if (withAttrs.error) {
        const base = await admin
          .from("products")
          .select(BASE_COLS)
          .eq("status", "published")
          .in("creator_id", creatorIds)
          .order("created_at", { ascending: false })
          .limit(LIMIT)
        products = base.data
      } else {
        products = withAttrs.data
      }
    }

    if (!products || products.length === 0) return NextResponse.json({ items: [] })

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name, avatar_url, username")
      .in("id", followedUserIds)

    // Total saves per listing, for the count pill — same shape the main feed uses.
    const saves = new Map<string, number>()
    try {
      const { data: saveRows } = await admin
        .from("wishlist_items")
        .select("product_id")
        .in("product_id", products.map((p) => p.id))
        .limit(50000)
      for (const row of saveRows || []) {
        const pid = (row as any).product_id
        if (pid) saves.set(pid, (saves.get(pid) || 0) + 1)
      }
    } catch {
      /* counts are optional */
    }

    const items = products.map((product) => {
      const creator = (creators || []).find((c: any) => c.id === product.creator_id)
      const profile = creator ? (profiles || []).find((p: any) => p.id === creator.user_id) : null
      return {
        ...product,
        creator: creator ? { ...creator, profile } : null,
        categories: [],
        categoryName: product.category || null,
        saves_count: saves.get(product.id) || 0,
      }
    })

    return NextResponse.json({ items })
  } catch (e: any) {
    console.error("[follows/feed] failed:", e?.message || e)
    return NextResponse.json({ items: [] })
  }
}
