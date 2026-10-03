import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadProfiles, readRate } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const read = readRate(body)
  if (read.ok === false) return physicalJson({ error: read.error }, 400)
  const { data, error } = await c.db.from("shipping_rates").update(read.row).eq("id", id).eq("creator_id", c.creatorId).select("id").maybeSingle()
  if (error) return physicalJson({ error: "The rate could not be saved." }, 500)
  if (!data) return physicalJson({ error: "Not found." }, 404)
  return physicalJson({ profiles: await loadProfiles(c.db, c.creatorId) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  await c.db.from("shipping_rates").delete().eq("id", id).eq("creator_id", c.creatorId)
  return physicalJson({ profiles: await loadProfiles(c.db, c.creatorId) })
}
