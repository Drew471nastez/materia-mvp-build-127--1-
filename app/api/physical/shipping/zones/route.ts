import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadProfiles, readZonePlaces, text } from "@/lib/physical/config-server"
import { regionLabel } from "@/lib/physical/regions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body || !isUuid(body.profileId)) return physicalJson({ error: "Choose a profile." }, 400)
  const { data: profile } = await c.db.from("shipping_profiles").select("id").eq("id", body.profileId).eq("creator_id", c.creatorId).maybeSingle()
  if (!profile) return physicalJson({ error: "Not found." }, 404)
  const restOfWorld = body.restOfWorld === true
  const places = restOfWorld ? ({ ok: true, countries: [], regions: [] } as const) : readZonePlaces(body)
  if (places.ok === false) return physicalJson({ error: places.error }, 400)
  const { countries, regions } = places
  const name = text(body.name, 80) ?? (restOfWorld ? "Rest of world" : countries.length === 1 && regions.length === 0 ? countries[0] : regions.length === 1 && countries.length === 0 ? regionLabel(regions[0]) : "Zone")
  const { error } = await c.db.from("shipping_zones").insert({ profile_id: profile.id, creator_id: c.creatorId, name, countries, regions, rest_of_world: restOfWorld })
  if (error) return physicalJson({ error: error.code === "23505" ? "This profile already has a Rest of world zone." : "The zone could not be saved." }, 400)
  return physicalJson({ profiles: await loadProfiles(c.db, c.creatorId) })
}
