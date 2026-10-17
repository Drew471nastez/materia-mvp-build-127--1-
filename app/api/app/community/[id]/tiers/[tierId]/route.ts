import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { archiveTier, moveTier, setDefaultTier, updateTier, type TierPatch } from "@/lib/communities/server/tiers"
import { checkBenefits, checkPrice, isUuid } from "@/components/community/creator/logic"
import { LENGTHS, TRIAL_MAX_DAYS, TRIAL_MIN_DAYS } from "@/lib/communities/limits"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PATCH /api/app/community/<id>/tiers/<tierId>
 *   { name?, description?, benefits?, monthlyPrice?, yearlyPrice?, price?, trialDays?, archived?, makeDefault?, move?: "up" | "down" }
 * A recurring price is saved through the memberships engine (saveMembership:
 * a new Stripe price; members keep what they joined at); a one time price is
 * the product's. An empty monthly or yearly price ("") removes that one.
 * The owner only.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; tierId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, tierId } = await params
  if (!isUuid(tierId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_pricing")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const db = gate.ctx.admin
  const bad = (error: string, field: string) => NextResponse.json({ error, field }, { status: 400, headers: noStore })

  if (typeof body.archived === "boolean") {
    const done = await archiveTier(db, { community: gate.community, tierId, actorId: gate.ctx.userId, archived: body.archived })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
    return NextResponse.json({ ok: true }, { headers: noStore })
  }
  if (body.move === "up" || body.move === "down") {
    const done = await moveTier(db, { community: gate.community, tierId, direction: body.move, actorId: gate.ctx.userId })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
    return NextResponse.json({ ok: true }, { headers: noStore })
  }
  if (body.makeDefault === true) {
    const done = await setDefaultTier(db, { community: gate.community, tierId, actorId: gate.ctx.userId })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
    return NextResponse.json({ ok: true }, { headers: noStore })
  }

  const patch: TierPatch = {}
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : ""
    if (!name || name.length > LENGTHS.tierName.max) return bad(`A tier name is 1 to ${LENGTHS.tierName.max} characters.`, "name")
    patch.name = name
  }
  if (body.description !== undefined) patch.description = typeof body.description === "string" ? body.description.trim().slice(0, LENGTHS.tierDescription.max) || null : null
  if (body.benefits !== undefined) {
    const b = checkBenefits(body.benefits)
    if (!b.ok) return bad(b.error, b.field)
    patch.benefits = b.value
  }
  for (const [key, interval, field] of [["monthlyPrice", "month", "monthlyCents"], ["yearlyPrice", "year", "yearlyCents"]] as const) {
    if (body[key] === undefined) continue
    if (body[key] === null || body[key] === "") patch[field] = null
    else {
      const p = checkPrice(body[key], interval)
      if (!p.ok) return bad(p.error, key)
      patch[field] = p.value.cents
    }
  }
  if (body.trialDays !== undefined) {
    const days = body.trialDays === null || body.trialDays === "" ? 0 : Number(body.trialDays)
    if (!Number.isInteger(days) || days < 0 || days > TRIAL_MAX_DAYS || (days > 0 && days < TRIAL_MIN_DAYS)) return bad(`A free trial is ${TRIAL_MIN_DAYS} to ${TRIAL_MAX_DAYS} days, or none.`, "trialDays")
    patch.trialDays = days
  }
  if (body.price !== undefined) {
    const p = checkPrice(body.price, "once")
    if (!p.ok) return bad(p.error, "price")
    patch.priceCents = p.value.cents
  }
  const done = await updateTier(db, { creatorId: gate.ctx.creatorId, community: gate.community, tierId, patch, actorId: gate.ctx.userId })
  if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
