import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadPackages, readPackage } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  if (body.makeDefault === true) {
    await c.db.from("shipping_packages").update({ is_default: false }).eq("creator_id", c.creatorId).neq("id", id)
    await c.db.from("shipping_packages").update({ is_default: true }).eq("id", id).eq("creator_id", c.creatorId)
    return physicalJson({ packages: await loadPackages(c.db, c.creatorId) })
  }
  const read = readPackage(body)
  if (read.ok === false) return physicalJson({ error: read.error }, 400)
  await c.db.from("shipping_packages").update(read.row).eq("id", id).eq("creator_id", c.creatorId)
  return physicalJson({ packages: await loadPackages(c.db, c.creatorId) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  await c.db.from("shipping_packages").delete().eq("id", id).eq("creator_id", c.creatorId)
  return physicalJson({ packages: await loadPackages(c.db, c.creatorId) })
}
