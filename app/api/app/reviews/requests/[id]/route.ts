import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import { requestAction } from "@/lib/reviews/requests-server"
import type { RequestAction } from "@/lib/reviews/request-copy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Reviews › Requests, one row:
 *
 *   POST { action: send_now | resend | cancel | retry }  → { row }
 *
 * lib/reviews/requests-server.ts requestAction: the same rules the hourly
 * run keeps (never to an address that turned review emails off, never after
 * a review, at most once a day), the row claimed before the email goes so a
 * second press sends nothing. The store's own rows only.
 */
const ACTIONS: RequestAction[] = ["send_now", "resend", "cancel", "retry"]

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "That request is not there any more." }, 404)
  const body = await readBody(request)
  const action = String(body?.action ?? "") as RequestAction
  if (!ACTIONS.includes(action)) return physicalJson({ error: "Bad request." }, 400)
  if (action !== "cancel") {
    const limited = await rateLimit({ bucket: "review-request-send", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 30, seconds: 3600 }, { limit: 200, seconds: 86_400 }], message: "That is a lot of emails at once. Try again later." })
    if (limited) return limited
  }
  const { settings } = await loadReviewsApp(c.db, c.creatorId)
  const out = await requestAction(c.db, c.creatorId, id, action, settings)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  return physicalJson({ row: out.row })
}
