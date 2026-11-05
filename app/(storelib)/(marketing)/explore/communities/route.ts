import { NextResponse } from "next/server"
import { communitiesEnabled } from "@/lib/communities/flag"
import { legacyCommunitiesTarget } from "@/lib/explore/communities-mode"

export const dynamic = "force-dynamic"

/**
 * storelib.com/explore/communities is Explore now: /explore?type=communities,
 * with the same pills, search and filters as the products (components/
 * explore/explore-communities-results.tsx). A permanent redirect that keeps
 * the search word and the order (?q=, ?sort= as this page wrote them), so
 * every link and bookmark to the old page lands on the same list. A 404
 * while communities are switched off, as before; the switch is read per
 * request.
 *
 * A ROUTE, NOT A PAGE, so the answer is a real 308. As a page it sat under
 * Explore's loading screen, which had already started streaming a 200 when
 * the redirect was thrown, and crawlers never saw the move.
 */
export async function GET(request: Request) {
  if (!(await communitiesEnabled())) return new NextResponse("Not found", { status: 404 })
  const params = new URL(request.url).searchParams
  const target = legacyCommunitiesTarget({ q: params.get("q"), sort: params.get("sort") })
  return NextResponse.redirect(new URL(target, request.url), 308)
}
