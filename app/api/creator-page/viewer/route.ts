/**
 * ===========================================================================
 *  GET /api/creator-page/viewer?creator=<id>: WHAT THIS VIEWER MAY SEE (round 49)
 * ===========================================================================
 * storelib.com/<handle> is one HTML for everybody (a CDN holds it), so the
 * three things the page used to decide per visitor on the server are asked
 * here after it loads (components/storefront/creator-page-viewer):
 *
 *   owner         the creator, or a team member with Creator page working
 *                 in this store (lib/team/server teamStoreIdFor), the same
 *                 test the page made; every save re-checks it anyway;
 *   bought        has bought from this creator (the Contact link; the
 *                 address is still answered only by /api/creator-contact);
 *   contactEmail  the owner's own typed address, for their own About form,
 *                 only ever to the owner.
 *
 * Private and never stored: the answer is this person's.
 */
import { NextResponse, type NextRequest } from "next/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { teamStoreIdFor } from "@/lib/team/server"
import { hasBoughtFromCreator } from "@/lib/commerce/has-bought-from-creator"
import { loadTypedContactEmail } from "@/lib/store-builder/public-config"
import { withoutCommunityProducts } from "@/lib/communities/listing"
import { offChannel } from "@/lib/store/channel-filter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PRIVATE = { "Cache-Control": "private, no-store", "Vercel-CDN-Cache-Control": "no-store" }
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOBODY = { owner: false, bought: false, contactEmail: null, totalSales: null }

/**
 * THE SALES FIGURE, FOR THE OWNER'S PREVIEW ONLY (r51). The page leaves it
 * out of its HTML when the creator has hidden it, so turning Sales count back
 * on in Edit profile had no number to show until Save. Summed as the page
 * sums it: published, not shipped, not a community tier, not taken off the
 * Creator page. A failed read is no figure, never an error.
 */
async function ownerTotalSales(creatorId: string): Promise<number | null> {
  try {
    const db = createAdminClient()
    const [{ data, error }, off] = await Promise.all([
      db.from("products").select("id, sales_count, community_id").eq("creator_id", creatorId).eq("status", "published").neq("type", "physical").limit(5000),
      offChannel(db, creatorId, "creator_page"),
    ])
    if (error || !data) return null
    return withoutCommunityProducts(data as Array<{ id: string; sales_count?: number | null; community_id?: string | null }>)
      .filter((p) => !off.has(p.id))
      .reduce((n, p) => n + (p.sales_count || 0), 0)
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const creatorId = request.nextUrl.searchParams.get("creator") ?? ""
  if (!ID.test(creatorId)) return NextResponse.json({ error: "Which creator?" }, { status: 400, headers: PRIVATE })

  const { user } = await currentUserForRequest().catch(() => ({ user: null }))
  if (!user) return NextResponse.json(NOBODY, { headers: PRIVATE })

  const { data: creator } = await createAdminClient().from("creators").select("id, user_id").eq("id", creatorId).maybeSingle()
  const row = creator as { id?: string; user_id?: string | null } | null
  if (!row?.id) return NextResponse.json(NOBODY, { headers: PRIVATE })

  const supabase = await createClient()
  const [teamStore, bought] = await Promise.all([
    row.user_id === user.id ? Promise.resolve(null) : teamStoreIdFor(user.id, "creator_pages").catch(() => null),
    hasBoughtFromCreator(supabase, user.id, row.id),
  ])
  const owner = row.user_id === user.id || teamStore === row.id
  const [contactEmail, totalSales] = owner ? await Promise.all([loadTypedContactEmail(row.id), ownerTotalSales(row.id)]) : [null, null]
  return NextResponse.json({ owner, bought, contactEmail, totalSales }, { headers: PRIVATE })
}
