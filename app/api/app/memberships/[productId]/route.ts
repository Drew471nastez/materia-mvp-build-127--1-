import { NextResponse } from "next/server"
import { isResponse, readJson, requireCreator, noStore, UUID } from "@/lib/email-campaigns/route-auth"
import { ownedMembership, saveMembership } from "@/lib/memberships/creator"
import { checkPlan, ownImageUrl } from "@/lib/memberships/plan"
import { queueProductFanout } from "@/lib/notifications/fanout"

export const runtime = "nodejs"

/**
 * PUT /api/app/memberships/<productId>
 *   { title, description, thumbnailUrl, plan: { monthlyPriceCents, yearlyPriceCents,
 *     trialDays, benefits, includedProductIds }, publish?: boolean }
 *
 * Saves a membership: its page (name, description, picture), its prices and
 * trial, what members get and the products included. `publish` true puts it
 * on sale (a price is required then), false takes it off, absent keeps it
 * as it is. Existing members keep the price they joined at. Answers
 * { status, slug }.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  if (!UUID.test(productId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const product = await ownedMembership(ctx.admin, ctx.creatorId, productId)
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const body = await readJson(request)
  const publish = body.publish === true ? true : body.publish === false ? false : null
  const plan = checkPlan(body.plan, { publishing: publish === true || (publish === null && product.status === "published") })
  if (!plan.ok) return NextResponse.json({ error: plan.error, field: plan.field }, { status: 400, headers: noStore })
  const title = typeof body.title === "string" ? body.title : product.title
  if (!title.trim()) return NextResponse.json({ error: "Give the membership a name.", field: "title" }, { status: 400, headers: noStore })
  const description = typeof body.description === "string" ? body.description.slice(0, 20_000) : ""
  const storageHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname
    } catch {
      return null
    }
  })()
  const thumbnailUrl = body.thumbnailUrl === null ? null : ownImageUrl(body.thumbnailUrl, storageHost) ?? product.thumbnail_url
  const saved = await saveMembership(ctx.admin, ctx.creatorId, product, { title, description, thumbnailUrl, plan: plan.value, publish })
  if (!saved.ok) return NextResponse.json({ error: saved.error, field: saved.field }, { status: saved.status, headers: noStore })
  /* On sale: the creator's followers and past buyers hear about it once (lib/notifications/fanout.ts). Never fails the save. */
  if (saved.status === "published") {
    try {
      await queueProductFanout(ctx.admin, { productId, creatorId: ctx.creatorId })
    } catch (e) {
      console.error("[memberships] followers not queued:", e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ status: saved.status, slug: saved.slug }, { headers: noStore })
}
