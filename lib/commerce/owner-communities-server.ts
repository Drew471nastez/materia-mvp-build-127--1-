import "server-only"

import { communityPath } from "@/components/community/public/paths"
import { createAdminClient } from "@/lib/supabase/admin"
import { MORE_FROM_CREATOR_COLUMNS, type CachedProductRow } from "@/lib/commerce/product-page-cache"

/**
 * THE SAME PERSON'S COMMUNITIES IN MORE FROM. The cached list
 * (product-page-cache cachedMoreFromCreator) finds communities by the
 * store's id. A person with several stores (Settings > Businesses) often
 * made their community under another one, and More from showed only
 * products. This adds, outside the public cache, the public published
 * communities the same person owns, each as one card (its cheapest plan's
 * price, or free to join), before the products, keeping four cards at most.
 * Public columns only; nothing private reaches the page.
 */
export async function withOwnersCommunities(cards: CachedProductRow[], ownerUserId: string | null | undefined, creatorId: string, excludeProductId: string): Promise<CachedProductRow[]> {
  if (!ownerUserId || cards.filter((c) => c.kind === "community").length >= 2) return cards
  try {
    const db = createAdminClient()
    const { data: communities, error } = await db
      .from("communities")
      .select("id, slug, name, tagline, cover_url, logo_url, creator_id")
      .eq("owner_user_id", ownerUserId)
      .eq("status", "published")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .is("suspended_at", null)
      .is("archived_at", null)
      .limit(3)
    if (error || !communities?.length) return cards
    const shown = new Set(cards.filter((c) => c.kind === "community").map((c) => String(c.title ?? "").toLowerCase()))
    const fresh = (communities as Array<{ id: string; slug: string | null; name: string | null; tagline: string | null; cover_url: string | null; logo_url: string | null; creator_id: string | null }>).filter(
      (c) => c.creator_id !== creatorId && c.slug && !shown.has(String(c.name ?? "").toLowerCase()),
    )
    if (!fresh.length) return cards
    const { data: planRows } = await db
      .from("products")
      .select(`${MORE_FROM_CREATOR_COLUMNS}, community_id`)
      .in("community_id", fresh.map((c) => c.id))
      .eq("status", "published")
      .neq("id", excludeProductId)
    const plans = ((planRows ?? []) as unknown as Array<CachedProductRow & { community_id: string }>).filter((p) => !!p.slug)
    const added: CachedProductRow[] = []
    for (const c of fresh) {
      const mine = plans.filter((p) => p.community_id === c.id)
      const paid = mine.filter((p) => (p.price_cents ?? 0) > 0).sort((a, b) => (a.price_cents ?? 0) - (b.price_cents ?? 0))
      const pick = paid[0] ?? mine[0]
      added.push(
        pick
          ? { ...pick, title: c.name || pick.title, thumbnail_url: c.cover_url || c.logo_url || pick.thumbnail_url, description: c.tagline ?? pick.description, compare_at_cents: null, kind: "community" }
          : { id: `community:${c.id}`, slug: null, href: communityPath(c.slug as string), title: c.name || "", thumbnail_url: c.cover_url || c.logo_url, price_cents: 0, compare_at_cents: null, sales_count: null, description: c.tagline, kind: "community", type: "community" },
      )
    }
    const communitiesFirst = [...cards.filter((c) => c.kind === "community"), ...added]
    return [...communitiesFirst, ...cards.filter((c) => c.kind !== "community")].slice(0, 4)
  } catch {
    return cards
  }
}
