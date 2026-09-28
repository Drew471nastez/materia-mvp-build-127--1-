import { NextResponse } from "next/server"
import { isResponse, requireCreator, noStore, UUID } from "@/lib/email-campaigns/route-auth"
import { ownedMembership } from "@/lib/memberships/creator"

export const runtime = "nodejs"

/**
 * DELETE /api/app/memberships/<productId>/posts/<postId>
 *
 * Takes an update down: gone from every member's page, and any of its
 * emails not sent yet are not sent. Kept in the table with deleted_at (and a
 * copy in deleted_rows if it is ever removed for good), so it can be put
 * back.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ productId: string; postId: string }> }) {
  const { productId, postId } = await params
  if (!UUID.test(productId) || !UUID.test(postId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const product = await ownedMembership(ctx.admin, ctx.creatorId, productId)
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const { data, error } = await ctx.admin.from("membership_posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId).eq("product_id", productId).select("id")
  if (error) return NextResponse.json({ error: "The update could not be removed. Try again." }, { status: 500, headers: noStore })
  if (!data || data.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore })
  await ctx.admin.from("membership_post_emails").update({ status: "skipped", last_error: "post removed" }).eq("post_id", postId).eq("status", "pending")
  return NextResponse.json({ removed: true }, { headers: noStore })
}
