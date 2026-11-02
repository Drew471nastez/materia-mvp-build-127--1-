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

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PRIVATE = { "Cache-Control": "private, no-store", "Vercel-CDN-Cache-Control": "no-store" }
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOBODY = { owner: false, bought: false, contactEmail: null }

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
  const contactEmail = owner ? await loadTypedContactEmail(row.id) : null
  return NextResponse.json({ owner, bought, contactEmail }, { headers: PRIVATE })
}
