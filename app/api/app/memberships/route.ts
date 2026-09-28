import { NextResponse } from "next/server"
import { isResponse, readJson, requireCreator, noStore } from "@/lib/email-campaigns/route-auth"
import { createMembershipProduct } from "@/lib/memberships/creator"

export const runtime = "nodejs"

/**
 * POST /api/app/memberships  { title? }
 *
 * A new membership, as a draft: the product (type "membership") and its
 * empty plan. The screen then opens it to set the price and what members
 * get. Answers { productId }.
 */
export async function POST(request: Request) {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const body = await readJson(request)
  const made = await createMembershipProduct(ctx.admin, ctx.creatorId, typeof body.title === "string" ? body.title : "")
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status, headers: noStore })
  return NextResponse.json({ productId: made.productId }, { headers: noStore })
}
