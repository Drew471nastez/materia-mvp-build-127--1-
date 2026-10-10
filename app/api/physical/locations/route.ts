import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadLocations, locationFromRow, readLocation } from "@/lib/physical/config-server"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  return physicalJson({ locations: await loadLocations(c.db, c.creatorId) })
}

export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const read = readLocation(body)
  if (read.ok === false) return physicalJson({ error: read.error }, 400)
  const { count } = await c.db.from("inventory_locations").select("id", { count: "exact", head: true }).eq("creator_id", c.creatorId)
  if ((count ?? 0) >= 50) return physicalJson({ error: "A shop can have up to 50 locations." }, 400)
  const { data, error } = await c.db.from("inventory_locations").insert({ ...read.row, creator_id: c.creatorId }).select("*").single()
  if (error || !data) return physicalJson({ error: error?.code === "23505" ? "You already have a location with that name." : "The location could not be saved." }, error?.code === "23505" ? 400 : 500)
  await recordActivity(c.db, c, { action: "location.added", subjectType: "location", subjectId: String(data.id), subjectLabel: String(data.name ?? "") })
  return physicalJson({ location: locationFromRow(data) })
}
