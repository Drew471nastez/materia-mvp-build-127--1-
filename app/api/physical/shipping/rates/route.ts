import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadProfiles, readRate } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body || !isUuid(body.zoneId)) return physicalJson({ error: "Choose a zone." }, 400)
  const { data: zone } = await c.db.from("shipping_zones").select("id").eq("id", body.zoneId).eq("creator_id", c.creatorId).maybeSingle()
  if (!zone) return physicalJson({ error: "Not found." }, 404)
  const read = readRate(body)
  if (read.ok === false) return physicalJson({ error: read.error }, 400)
  const { count } = await c.db.from("shipping_rates").select("id", { count: "exact", head: true }).eq("zone_id", zone.id)
  if ((count ?? 0) >= 30) return physicalJson({ error: "A zone can have up to 30 rates." }, 400)
  const { error } = await c.db.from("shipping_rates").insert({ ...read.row, zone_id: zone.id, creator_id: c.creatorId, position: count ?? 0 })
  if (error) return physicalJson({ error: "The rate could not be saved." }, 500)
  return physicalJson({ profiles: await loadProfiles(c.db, c.creatorId) })
}
