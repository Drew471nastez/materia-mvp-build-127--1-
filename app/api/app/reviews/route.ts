import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { readFilters } from "@/lib/reviews/dashboard"
import { listReviews } from "@/lib/reviews/dashboard-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Reviews › Reviews: one page of the store's reviews.
 *
 *   GET ?tab=pending&q=strap&rating=1&product=<id>&verified=yes&media=yes&page=2
 *       → { rows, total, page, pages, counts, ready }
 *
 * The same filters as the page's address (lib/reviews/dashboard.ts
 * readFilters), read by lib/reviews/dashboard-server.ts listReviews. The
 * store's own reviews only; a team member whose role has Products may read
 * them.
 */
export async function GET(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const filters = readFilters(new URL(request.url).searchParams)
  return physicalJson(await listReviews(c.db, c.creatorId, filters))
}
