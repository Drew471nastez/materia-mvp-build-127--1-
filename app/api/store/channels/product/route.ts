import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { creatorPagesChanged } from "@/lib/storefront/creator-page-purge"
import { onePageProductsChanged } from "@/lib/onepage/public-cache"
import { creatorShopTag, revalidatePublishedPages } from "@/lib/website-builder/published-site"
import { exploreCatalogueTakenDown } from "@/lib/explore/catalogue-cache"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { changeProductChannels, loadChannels, readProductOff, setProductChannels } from "@/lib/store/channels-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The product editor's Sales channels card.
 *
 *   GET  ?productId=   the store's channels, New products, and the channels
 *                      this product is taken off (none for a new product)
 *   PUT  { productId, list: [key, …], unlist: [key, …] }
 *                      the channels the editor changed, put on top of what is
 *                      saved now, so an older tab never undoes a newer save
 *   PUT  { productId, off: [key, …] }   set them whole (a duplicate copies
 *                      its original's, and a page loaded before this change)
 *
 * A PUT answers what GET answers, read after the write, so the card shows
 * what is saved and its next change starts from there.
 */
export async function GET(request: Request) {
  const c = await shopCaller("products", { read: true })
  if (c instanceof NextResponse) return c
  const productId = new URL(request.url).searchParams.get("productId")
  const [setup, off] = await Promise.all([loadChannels(c.db, c.creatorId), isUuid(productId) ? readProductOff(c.db, c.creatorId, productId) : Promise.resolve([])])
  /* Never "on every channel" for a read that failed: a save would write that over the real choice. */
  if (off === null) return physicalJson({ error: "The sales channels could not be read. Reload and try again." }, 503)
  return physicalJson({ ...setup, off })
}

export async function PUT(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const out = "list" in body || "unlist" in body ? await changeProductChannels(c.db, c.creatorId, body.productId, { list: body.list, unlist: body.unlist }) : await setProductChannels(c.db, c.creatorId, body.productId, body.off)
  if (out.ok === false) return physicalJson({ error: (out as { error: string }).error }, (out as { status: number }).status)
  /* The website's product lists are held for a minute under the shop's tag: taken off (or put back on) a channel shows on the next visit, not a minute later. */
  revalidateTag(creatorShopTag(c.creatorId), { expire: 0 })
  /* Off the creator page channel is off the OnePage too: its held blocks are read afresh (lib/onepage/public-cache). */
  await onePageProductsChanged(c.creatorId)
  /* And the creator page, which the CDN holds for everybody (round 49): a product taken off it is gone at once. */
  await creatorPagesChanged({ creatorId: c.creatorId })
  /* And the pages drawn from it, so the change is on the website at the next visit (revalidatePublishedPages). */
  await revalidatePublishedPages(c.creatorId)
  /* Explore's catalogue is held for everybody the same way (lib/explore/catalogue-cache.ts). */
  exploreCatalogueTakenDown()
  /* The channels as saved, rows made by this write included, so the card's built-ins have their ids. */
  const setup = await loadChannels(c.db, c.creatorId)
  return physicalJson({ ...setup, off: out.off })
}
