import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { loadSettings, locationsWithPartners, readLocation, saveLocationExtra } from "@/lib/physical/config-server"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const read = readLocation(body)
  if (read.ok === false) return physicalJson({ error: read.error }, 400)
  const { data, error } = await c.db.from("inventory_locations").update(read.row).eq("id", id).eq("creator_id", c.creatorId).select("*").maybeSingle()
  if (error) return physicalJson({ error: "The location could not be saved." }, 500)
  if (!data) return physicalJson({ error: "Not found." }, 404)
  const extra = await saveLocationExtra(c.db, c.creatorId, id, read.extra)
  await recordActivity(c.db, c, { action: "location.updated", subjectType: "location", subjectId: id, subjectLabel: String(data.name ?? "") })
  /* With its print partner (Connected to Printful), so the row keeps saying it after a save. */
  const [location] = await locationsWithPartners(c.db, c.creatorId, [extra.row ?? data])
  readinessChanged(c)
  return physicalJson({ location, ...(extra.notice ? { message: extra.notice } : {}) })
}

/**
 * A location with stock or open orders is switched off rather than deleted,
 * so nothing it holds or owes is lost; an empty one is removed.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const settings = await loadSettings(c.db, c.creatorId)
  if (settings.defaultLocationId === id) return physicalJson({ error: "This is your default location. Choose another default first." }, 400)
  const { data: stock } = await c.db.from("inventory_levels").select("variant_id").eq("location_id", id).eq("creator_id", c.creatorId).or("on_hand.neq.0,committed.gt.0,incoming.gt.0").limit(1)
  if ((stock ?? []).length > 0) {
    await c.db.from("inventory_locations").update({ active: false, fulfills_orders: false, updated_at: new Date().toISOString() }).eq("id", id).eq("creator_id", c.creatorId)
    return physicalJson({ deactivated: true, message: "This location still holds stock, so it was switched off instead of deleted. Move or adjust its stock to delete it." })
  }
  const { data: gone, error } = await c.db.from("inventory_locations").delete().eq("id", id).eq("creator_id", c.creatorId).select("name").maybeSingle()
  if (error) return physicalJson({ error: "The location could not be deleted." }, 500)
  await recordActivity(c.db, c, { action: "location.removed", subjectType: "location", subjectId: id, subjectLabel: (gone as { name?: string } | null)?.name ?? null })
  readinessChanged(c)
  return physicalJson({ deleted: true })
}
