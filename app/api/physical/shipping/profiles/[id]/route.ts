import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadProfiles, text } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  const name = text(body?.name, 80)
  if (!name) return physicalJson({ error: "Name the profile." }, 400)
  await c.db.from("shipping_profiles").update({ name, updated_at: new Date().toISOString() }).eq("id", id).eq("creator_id", c.creatorId)
  return physicalJson({ profiles: await loadProfiles(c.db, c.creatorId) })
}

/** The default profile stays; a custom one goes, and its products fall back to the default. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const { data: p } = await c.db.from("shipping_profiles").select("is_default").eq("id", id).eq("creator_id", c.creatorId).maybeSingle()
  if (!p) return physicalJson({ error: "Not found." }, 404)
  if (p.is_default) return physicalJson({ error: "The general profile can't be deleted." }, 400)
  await c.db.from("shipping_profiles").delete().eq("id", id).eq("creator_id", c.creatorId)
  return physicalJson({ profiles: await loadProfiles(c.db, c.creatorId) })
}
