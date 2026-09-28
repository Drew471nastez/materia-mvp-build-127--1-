import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { canReadMembership, viewerMembership } from "@/lib/memberships/access"
import { requestViewer } from "@/lib/memberships/viewer"
import { NOT_SET_UP, UUID } from "@/lib/memberships/server"

export const runtime = "nodejs"

/**
 * POST /api/memberships/<id>/read  { postIds }
 *
 * The posts a member has now seen, so their dot goes out here and the
 * count on the library's list goes down. Only posts of this membership's
 * product, only while the member can read them, at most 50 at a time; a
 * post read twice is one row.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await requestViewer()
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  let body: { postIds?: unknown }
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const ids = [...new Set((Array.isArray(body.postIds) ? body.postIds : []).filter((p): p is string => typeof p === "string" && UUID.test(p)))].slice(0, 50)
  if (ids.length === 0) return NextResponse.json({ read: 0 })

  const admin = createAdminClient()
  const read = await viewerMembership(admin, viewer, id)
  if (!read.ok) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
  const row = read.value
  if (!row?.product_id) return NextResponse.json({ error: "That membership could not be found." }, { status: 404 })
  const access = await canReadMembership(admin, viewer, row.product_id)
  if (!access.allowed) return NextResponse.json({ read: 0 })

  const { data: posts } = await admin.from("membership_posts").select("id").eq("product_id", row.product_id).is("deleted_at", null).in("id", ids)
  const valid = ((posts as { id: string }[] | null) ?? []).map((p) => ({ user_id: viewer.id, post_id: p.id }))
  if (valid.length === 0) return NextResponse.json({ read: 0 })
  const { error } = await admin.from("membership_post_reads").upsert(valid, { onConflict: "user_id,post_id", ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: "Not saved." }, { status: 500 })
  return NextResponse.json({ read: valid.length })
}
