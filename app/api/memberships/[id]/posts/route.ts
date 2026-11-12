import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { viewerMembership } from "@/lib/memberships/access"
import { feedPosts } from "@/lib/memberships/library"
import { grantsAccess } from "@/lib/memberships/state"
import { requestViewer } from "@/lib/memberships/viewer"
import { NOT_SET_UP } from "@/lib/memberships/server"
import { signedOutOrRetry } from "@/lib/auth/route-user"

export const runtime = "nodejs"

/**
 * GET /api/memberships/<id>/posts?before=<ISO date>
 *
 * The next page of a membership's posts, older than `before`, for "Show
 * older posts". The same rule as the page: text, pictures and files only
 * while the member has access (lib/memberships/library.ts feedPosts).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await requestViewer()
  if (!viewer) return signedOutOrRetry(NextResponse.json({ error: "Sign in first." }, { status: 401 }), { fresh: true })
  const before = new URL(request.url).searchParams.get("before")
  if (before && !Number.isFinite(Date.parse(before))) return NextResponse.json({ error: "Bad date" }, { status: 400 })
  const admin = createAdminClient()
  const read = await viewerMembership(admin, viewer, id)
  if (!read.ok) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
  if (!read.value) return NextResponse.json({ error: "That membership could not be found." }, { status: 404 })
  const feed = await feedPosts(admin, viewer, read.value, { before, access: grantsAccess(read.value) })
  return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } })
}
