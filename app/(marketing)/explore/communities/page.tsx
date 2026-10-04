import { notFound, permanentRedirect } from "next/navigation"
import { connection } from "next/server"
import { communitiesEnabled } from "@/lib/communities/flag"
import { legacyCommunitiesTarget } from "@/lib/explore/communities-mode"

/**
 * storelib.com/explore/communities is Explore now: /explore?type=communities,
 * with the same pills, search and filters as the products (components/
 * explore/explore-communities-results.tsx). A permanent redirect that keeps
 * the search word and the order (?q=, ?sort= as this page wrote them), so
 * every link and bookmark to the old page lands on the same list. A 404
 * while communities are switched off, as before; the switch is read per
 * request.
 */
export default async function ExploreCommunitiesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; sort?: string | string[] }> }) {
  await connection()
  if (!(await communitiesEnabled())) notFound()
  const params = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null
  permanentRedirect(legacyCommunitiesTarget({ q: one(params.q), sort: one(params.sort) }))
}
