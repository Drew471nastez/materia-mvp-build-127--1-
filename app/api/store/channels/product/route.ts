import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { loadChannels, productOff, setProductChannels } from "@/lib/store/channels-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The product editor's Sales channels card.
 *
 *   GET  ?productId=   the store's channels, New products, and the channels
 *                      this product is taken off (none for a new product)
 *   PUT  { productId, off: [key, …] }   set them whole, after the product is saved
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const productId = new URL(request.url).searchParams.get("productId")
  const [setup, off] = await Promise.all([loadChannels(c.db, c.creatorId), isUuid(productId) ? productOff(c.db, c.creatorId, productId) : Promise.resolve([])])
  return physicalJson({ ...setup, off })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const out = await setProductChannels(c.db, c.creatorId, body.productId, body.off)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  return physicalJson({ off: out.off })
}
