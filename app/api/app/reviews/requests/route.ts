import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { cleanSearch, SKIP_WORDS } from "@/lib/reviews/manage"
import { REQUEST_FILTERS, askableOrders, forgetReviewsManage, listRequests, type RequestFilter } from "@/lib/reviews/manage-server"
import { askNowWithReason } from "@/lib/reviews/requests-server"
import { loadReviewsApp } from "@/lib/reviews/app-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * Storelib Reviews › Requests. The store's owner only.
 *
 *   GET ?filter&page&q          one page of review requests, newest first
 *   GET ?orders=1&q             recent orders to ask by hand, with what
 *                               already happened for each
 *   POST { orderId }            ask that order's buyer now. Every cap stays
 *                               (requests-server askNowWithReason): one link
 *                               an order a week, never a reviewed, refunded,
 *                               unsubscribed or own order. The answer says why
 *                               when it did not go.
 */
export async function GET(request: Request) {
  const c = await shopCaller("products", { read: true })
  if (c instanceof NextResponse) return c
  const p = new URL(request.url).searchParams
  const q = cleanSearch(p.get("q"))
  if (p.get("orders") === "1") return physicalJson({ orders: await askableOrders(c.db, c.creatorId, q) })
  const asked = p.get("filter") ?? "all"
  const filter: RequestFilter = (REQUEST_FILTERS as readonly string[]).includes(asked) ? (asked as RequestFilter) : "all"
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(p.get("page")) || 1)))
  return physicalJson(await listRequests(c.db, c.creatorId, { filter, page, q }))
}

export async function POST(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "review-ask-manual", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 30, seconds: 3600 }, { limit: 200, seconds: 86_400 }] })
  if (limited) return limited
  const body = await readBody(request)
  if (!body || !isUuid(body.orderId)) return physicalJson({ error: "Choose an order." }, 400)
  const { settings } = await loadReviewsApp(c.db, c.creatorId)
  const out = await askNowWithReason(c.db, c.creatorId, body.orderId, settings, Date.now(), { manual: true })
  forgetReviewsManage(c.creatorId)
  if (!out.sent) return physicalJson({ sent: false, reason: out.reason, error: SKIP_WORDS[out.reason] ?? "It was not sent." }, 409)
  return physicalJson({ sent: true })
}
