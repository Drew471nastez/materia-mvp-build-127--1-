/**
 * ===========================================================================
 *  THE DATABASE SAYS A STORE'S PRODUCTS CHANGED; THE CACHES ARE CLEARED
 * ===========================================================================
 * Called by the database, never by a person: Supabase part 179's triggers on
 * products, product_variants, inventory_levels, product_collections and
 * product_collection_items post here through pg_net after a write commits,
 * whichever client made it (the product editor writes from the browser, a
 * sale changes stock in a function). See lib/cache/db-invalidate.ts.
 *
 * It clears the same tags app/api/revalidate clears after an editor save:
 * the product's own (by id and by slug), the creator's, the website shop's
 * (creatorShopTag, which the compat site's catalogue and collections share)
 * and, for a product or its price, Explore's catalogue.
 *
 * WHO MAY CALL IT. `Authorization: Bearer <CACHE_INVALIDATE_SECRET>`,
 * compared in constant time. With the variable unset it answers 503 and
 * clears nothing, so a deployment without it behaves exactly as before:
 * the sixty second holds expire on their own.
 *
 * At most one purge per store per ten seconds on a server; pings inside the
 * window are folded into one purge at its end, so the last change is never
 * the one dropped.
 */
import { NextResponse, after } from "next/server"
import { revalidatePath, revalidateTag } from "next/cache"
import { creatorPagesChanged } from "@/lib/storefront/creator-page-purge"
import { onePageProductsChanged } from "@/lib/onepage/public-cache"
import { matchesSecret } from "@/lib/api/require-secret"
import { PingGate, parsePing, type Batch } from "@/lib/cache/db-invalidate"
import { creatorTag, productTag } from "@/lib/commerce/product-page-cache"
import { creatorShopTag, revalidatePublishedProduct } from "@/lib/website-builder/published-site"
import { exploreCatalogueChanged, exploreCatalogueTakenDown } from "@/lib/explore/catalogue-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const gate = new PingGate(10_000)
const noStore = { "Cache-Control": "no-store" }

async function purge(b: Batch): Promise<void> {
  for (const id of b.productIds) revalidateTag(productTag(id), "max")
  for (const slug of b.slugs) {
    revalidateTag(productTag(slug), "max")
    revalidatePath(`/p/${slug}`)
  }
  revalidateTag(creatorTag(b.creatorId), "max")
  revalidateTag(creatorShopTag(b.creatorId), "max")
  /* The OnePage blocks that draw this store's products (lib/onepage/public-cache). */
  onePageProductsChanged(b.creatorId)
  if (b.explore === "taken-down") exploreCatalogueTakenDown()
  else if (b.explore === "changed") exploreCatalogueChanged()
  /* The creator page and its product pages, which the CDN holds for everybody (round 49). */
  await creatorPagesChanged({ creatorId: b.creatorId, tags: [...b.productIds, ...b.slugs].map(productTag) })
  /* The product's page on the creator's website, held for a minute like the rest of it. */
  for (const slug of b.slugs) await revalidatePublishedProduct(b.creatorId, slug).catch(() => {})
}

export async function POST(request: Request) {
  const secret = process.env.CACHE_INVALIDATE_SECRET
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503, headers: noStore })
  const header = request.headers.get("authorization") ?? ""
  if (!matchesSecret(header.startsWith("Bearer ") ? header.slice(7) : "", secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore })
  }
  let body: unknown
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore })
  }
  const ping = parsePing(body)
  if (!ping) return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: noStore })

  const step = gate.add(ping)
  if ("now" in step) {
    await purge(step.now)
    return NextResponse.json({ purged: "now" }, { status: 202, headers: noStore })
  }
  if ("later" in step) {
    const wait = step.later
    after(async () => {
      await new Promise((r) => setTimeout(r, wait))
      const batch = gate.take(ping.creatorId)
      if (batch) await purge(batch).catch((e) => console.error("[invalidate] held purge failed:", e instanceof Error ? e.message : e))
    })
    return NextResponse.json({ purged: "later" }, { status: 202, headers: noStore })
  }
  return NextResponse.json({ purged: "merged" }, { status: 202, headers: noStore })
}
