import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { REQUEST_FILTERS, listRequests, type RequestFilter } from "@/lib/reviews/dashboard-server"
import { cleanSearch } from "@/lib/reviews/dashboard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Reviews › Requests: the review request emails, newest first.
 *
 *   GET ?filter=scheduled|sent|reviewed|stopped&q=<name or address>&page=2
 *       → { rows, total, page, pages, counts, ready }
 *
 * An address is shown to the store that sold to it, as Orders shows it.
 */
export async function GET(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const p = new URL(request.url).searchParams
  const filter = (REQUEST_FILTERS as readonly string[]).includes(p.get("filter") ?? "") ? (p.get("filter") as RequestFilter) : "all"
  const page = Math.max(1, Math.floor(Number(p.get("page")) || 1))
  return physicalJson(await listRequests(c.db, c.creatorId, filter, page, cleanSearch(p.get("q")).replace(/\s/g, "")))
}
