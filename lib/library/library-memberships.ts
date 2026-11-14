import "server-only"

import { loadLibraryMemberships } from "@/lib/memberships/library"
import { viewerOf, type Db } from "@/lib/memberships/server"
import { provenViewer } from "@/lib/memberships/viewer"
import type { MembershipCard } from "@/lib/memberships/view-types"

/**
 * ===========================================================================
 *  THE MEMBERSHIPS THE LIBRARY'S PRODUCTS LIST CARRIES
 * ===========================================================================
 * The owner: memberships are communities. So the library has no Memberships
 * pill any more, and a membership somebody pays for is found where the rest
 * of what they bought is: a row of Products, labelled Membership
 * (components/library/library-memberships.tsx), that opens its page at
 * /account/library/memberships/<id> as it always did.
 *
 * WHICH ONES. A membership bought on its own, always. A paid community's
 * membership (its product has a community_id) is the community's, found
 * under Communities, so it is left out while communities are switched on.
 * With them off the Communities page is a 404, so it is listed here too:
 * nobody is left without the way to their billing.
 *
 * Read only: the same reads /account/library/memberships makes
 * (lib/memberships/library.ts), plus one for which products sell a
 * community. Before the communities part has run there is no community_id
 * column; then every membership is one on its own.
 */
export async function libraryMemberships(
  db: Db,
  user: Parameters<typeof viewerOf>[0],
  opts: { communities: boolean },
): Promise<MembershipCard[]> {
  const viewer = await provenViewer(viewerOf(user))
  if (!viewer) return []
  const list = await loadLibraryMemberships(db, viewer).catch(() => ({ available: false as const }))
  if (!list.available) return []
  const cards = [...list.current, ...list.ended]
  if (!opts.communities || cards.length === 0) return cards
  const ids = [...new Set(cards.map((c) => c.productId).filter((p): p is string => !!p))]
  if (ids.length === 0) return cards
  const { data, error } = await db.from("products").select("id, community_id").in("id", ids)
  if (error) return cards
  const community = new Set(((data as { id: string; community_id: string | null }[] | null) ?? []).filter((p) => p.community_id).map((p) => p.id))
  return cards.filter((c) => !c.productId || !community.has(c.productId))
}
