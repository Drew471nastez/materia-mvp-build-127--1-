import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { readListQuery } from "@/lib/reviews/manage"
import { listReviews, reviewedProducts } from "@/lib/reviews/manage-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Storelib Reviews › Reviews: one page of the store's reviews, filtered,
 * sorted and counted on the server (lib/reviews/manage-server listReviews).
 * The store's owner only.
 *
 *   GET ?tab&q&rating&product&verified&source&media&from&to&sort&page&id
 *       → { rows, total, page, pageSize, counts, ready }
 *   GET ?only=products → { products } the store's products, for the filter
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const params = new URL(request.url).searchParams
  if (params.get("only") === "products") return physicalJson({ products: await reviewedProducts(c.db, c.creatorId) })
  return physicalJson(await listReviews(c.db, c.creatorId, readListQuery(params)))
}
