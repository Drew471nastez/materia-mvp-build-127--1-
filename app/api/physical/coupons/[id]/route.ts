import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A discount code's physical options, set after the code itself is saved
 * (app/app/coupons/coupon-editor.tsx): free shipping, a limit per customer,
 * physical products only, and collections it is limited to. The checkout
 * reads them (lib/physical/checkout-pricing-server.ts).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const collectionIds = Array.isArray(body.collectionIds) ? [...new Set(body.collectionIds.filter(isUuid))].slice(0, 50) : []
  if (collectionIds.length) {
    const { data } = await c.db.from("product_collections").select("id").eq("creator_id", c.creatorId).in("id", collectionIds)
    if ((data ?? []).length !== collectionIds.length) return physicalJson({ error: "Choose your own collections." }, 400)
  }
  const limit = body.perCustomerLimit === null || body.perCustomerLimit === undefined || body.perCustomerLimit === "" ? null : Math.floor(Number(body.perCustomerLimit))
  if (limit !== null && (!Number.isFinite(limit) || limit < 1 || limit > 1000)) return physicalJson({ error: "Uses per customer is 1 to 1000." }, 400)
  const { data, error } = await c.db
    .from("coupons")
    .update({ free_shipping: body.freeShipping === true, physical_only: body.physicalOnly === true, per_customer_limit: limit, collection_ids: collectionIds.length ? collectionIds : null })
    .eq("id", id)
    .eq("creator_id", c.creatorId)
    .select("id, free_shipping, physical_only, per_customer_limit, collection_ids")
    .maybeSingle()
  if (error) return physicalJson({ error: error.code === "42703" || error.code === "PGRST204" ? "Run SQL part 78 to use these options." : "The options could not be saved." }, 500)
  if (!data) return physicalJson({ error: "Not found." }, 404)
  return physicalJson({ coupon: data })
}
