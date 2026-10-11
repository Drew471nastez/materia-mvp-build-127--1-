import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { assignProfileProducts, loadProfiles, loadShippingProducts, text } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const { data: profile } = await c.db.from("shipping_profiles").select("id, is_default").eq("id", id).eq("creator_id", c.creatorId).maybeSingle()
  if (!profile) return physicalJson({ error: "Not found." }, 404)
  if ("name" in body) {
    const name = text(body.name, 80)
    if (!name) return physicalJson({ error: "Name the profile." }, 400)
    await c.db.from("shipping_profiles").update({ name, updated_at: new Date().toISOString() }).eq("id", id).eq("creator_id", c.creatorId)
  }
  /* Products in a custom profile; the general one holds every product not in another, so nothing is added to it. */
  if (("addProductIds" in body || "removeProductIds" in body) && !profile.is_default) {
    const moved = await assignProfileProducts(c.db, c.creatorId, id, body.addProductIds, body.removeProductIds)
    if (moved.ok === false) return physicalJson({ error: moved.error }, 500)
  }
  const [profiles, shippingProducts] = await Promise.all([loadProfiles(c.db, c.creatorId), loadShippingProducts(c.db, c.creatorId)])
  return physicalJson({ profiles, shippingProducts })
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
  const [profiles, shippingProducts] = await Promise.all([loadProfiles(c.db, c.creatorId), loadShippingProducts(c.db, c.creatorId)])
  return physicalJson({ profiles, shippingProducts })
}
