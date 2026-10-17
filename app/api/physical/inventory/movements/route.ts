import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson } from "@/lib/physical/auth"
import { movements } from "@/lib/physical/inventory-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE = 50

/**
 * The stock history, newest first, fifty at a time (`before`: the last id
 * shown), for one variant and one location or all of them. Each line says
 * who made a manual change: You, the store owner, or the team member's
 * email; checkout, shipments, returns and partners are named by their source.
 */
export async function GET(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const url = new URL(request.url)
  const variantId = url.searchParams.get("variantId")
  const locationId = url.searchParams.get("locationId")
  const before = Number(url.searchParams.get("before"))
  const list = await movements(c.db, c.creatorId, {
    variantId: isUuid(variantId) ? variantId : undefined,
    locationId: isUuid(locationId) ? locationId : undefined,
    before: Number.isInteger(before) && before > 0 ? before : undefined,
    limit: PAGE + 1,
  })
  const page = list.slice(0, PAGE)
  const people = [...new Set(page.map((m) => m.actorUserId).filter((u): u is string => !!u && u !== c.userId))]
  const names = new Map<string, string>()
  if (people.length) {
    const [{ data: owner }, { data: team }] = await Promise.all([
      c.db.from("creators").select("user_id").eq("id", c.creatorId).maybeSingle(),
      c.db.from("store_team_members").select("user_id, email").eq("creator_id", c.creatorId).in("user_id", people),
    ])
    for (const m of (team ?? []) as { user_id: string; email: string }[]) if (m.user_id && m.email) names.set(m.user_id, m.email)
    if (owner?.user_id && people.includes(owner.user_id)) names.set(owner.user_id, "Store owner")
  }
  return physicalJson({
    movements: page.map((m) => ({ ...m, by: m.actorUserId ? (m.actorUserId === c.userId ? "You" : (names.get(m.actorUserId) ?? "Team member")) : null })),
    more: list.length > PAGE,
  })
}
