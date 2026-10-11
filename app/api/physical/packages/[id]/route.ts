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
    const { data: mine } = await c.db.from("shipping_packages").select("id").eq("id", id).eq("creator_id", c.creatorId).maybeSingle()
    if (!mine) return physicalJson({ error: "Not found." }, 404)
    await makeDefaultPackage(c.db, c.creatorId, id)
    return physicalJson({ packages: await loadPackages(c.db, c.creatorId) })
  }
  const read = readPackage(body)
  if (read.ok === false) return physicalJson({ error: read.error }, 400)
  const { error } = await c.db.from("shipping_packages").update(read.row).eq("id", id).eq("creator_id", c.creatorId)
  if (error) return physicalJson({ error: "The package could not be saved." }, 500)
  return physicalJson({ packages: await loadPackages(c.db, c.creatorId) })
}

/** One default, in both places it is read from (the package's flag and the shop's settings), so checkout weighs the box the seller picked. */
async function makeDefaultPackage(db: Parameters<typeof loadPackages>[0], creatorId: string, id: string) {
  await db.from("shipping_packages").update({ is_default: false }).eq("creator_id", creatorId).neq("id", id)
  await db.from("shipping_packages").update({ is_default: true }).eq("id", id).eq("creator_id", creatorId)
  await db.from("commerce_settings").upsert({ creator_id: creatorId, default_package_id: id, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  await c.db.from("shipping_packages").delete().eq("id", id).eq("creator_id", c.creatorId)
  /* The default went: the next one takes its place, so weight based rates keep counting a box. */
  const left = await loadPackages(c.db, c.creatorId)
  if (left.length && !left.some((p) => p.isDefault)) {
    await makeDefaultPackage(c.db, c.creatorId, left[0].id)
    return physicalJson({ packages: await loadPackages(c.db, c.creatorId) })
  }
  return physicalJson({ packages: left })
}
