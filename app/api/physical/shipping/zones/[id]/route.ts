import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { countryList, loadProfiles, text } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const { data: zone } = await c.db.from("shipping_zones").select("id, rest_of_world").eq("id", id).eq("creator_id", c.creatorId).maybeSingle()
  if (!zone) return physicalJson({ error: "Not found." }, 404)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ("name" in body) patch.name = text(body.name, 80) ?? "Zone"
  if ("countries" in body && !zone.rest_of_world) {
    const countries = countryList(body.countries)
    if (countries.length === 0) return physicalJson({ error: "Choose at least one country." }, 400)
    patch.countries = countries
  }
  await c.db.from("shipping_zones").update(patch).eq("id", id).eq("creator_id", c.creatorId)
  return physicalJson({ profiles: await loadProfiles(c.db, c.creatorId) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  await c.db.from("shipping_zones").delete().eq("id", id).eq("creator_id", c.creatorId)
  return physicalJson({ profiles: await loadProfiles(c.db, c.creatorId) })
}
