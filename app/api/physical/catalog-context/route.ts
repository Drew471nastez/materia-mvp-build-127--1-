import { NextResponse } from "next/server"
import { physicalCaller, physicalJson } from "@/lib/physical/auth"
import { MODEL_LOCATION, ensureDefaultLocation, ensureDefaultProfile, loadLocations, loadProfiles, loadSettings } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * What a new physical product's cards need before it has an id: where stock
 * can be kept and which shipping profiles exist. A shop always has one
 * location and one general profile, as every commerce platform does; they
 * are made here the first time, of the kind the shop said it fulfils from.
 */
export async function GET() {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const settings = await loadSettings(c.db, c.creatorId)
  await ensureDefaultLocation(c.db, c.creatorId, MODEL_LOCATION[settings.fulfillmentModel ?? "self"])
  await ensureDefaultProfile(c.db, c.creatorId)
  const [locations, profiles, fresh] = await Promise.all([loadLocations(c.db, c.creatorId), loadProfiles(c.db, c.creatorId), loadSettings(c.db, c.creatorId)])
  return physicalJson({ locations, profiles: profiles.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault, zoneCount: p.zones.length })), settings: fresh })
}
