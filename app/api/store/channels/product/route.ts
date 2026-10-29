import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { onePageProductsChanged } from "@/lib/onepage/public-cache"
import { creatorShopTag, revalidatePublishedPages } from "@/lib/website-builder/published-site"
import { exploreCatalogueChanged } from "@/lib/explore/catalogue-cache"
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
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const productId = new URL(request.url).searchParams.get("productId")
  const [setup, off] = await Promise.all([loadChannels(c.db, c.creatorId), isUuid(productId) ? productOff(c.db, c.creatorId, productId) : Promise.resolve([])])
  return physicalJson({ ...setup, off })
}

export async function PUT(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const out = await setProductChannels(c.db, c.creatorId, body.productId, body.off)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  /* The website's product lists are held for a minute under the shop's tag: taken off (or put back on) a channel shows on the next visit, not a minute later. */
  revalidateTag(creatorShopTag(c.creatorId), "max")
  /* Off the creator page channel is off the OnePage too: its held blocks are read afresh (lib/onepage/public-cache). */
  onePageProductsChanged(c.creatorId)
  /* And the pages drawn from it, so the change is on the website at the next visit (revalidatePublishedPages). */
  await revalidatePublishedPages(c.creatorId)
  /* Explore's catalogue is held for everybody the same way (lib/explore/catalogue-cache.ts). */
  exploreCatalogueChanged()
  return physicalJson({ off: out.off })
}
