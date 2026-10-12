import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, emailSubject, rateLimit } from "@/lib/api/rate-limit"
import { appUrl } from "@/lib/notify/urls"
import { readNewCase } from "@/lib/support/cases"
import { openCase, orderForToken } from "@/lib/support/cases-server"
import { readCaseRequest } from "@/lib/support/case-photos-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

/**
 * A buyer asks for help with their order (lib/support/cases.ts).
 *
 *   POST { kind: "physical" | "digital", token, reason, message }
 *   or the same as a form (multipart/form-data) with up to four `photos`
 *
 * `token` is the order's own receipt token, the key the buyer already holds
 * from their confirmation email and order page; nothing else opens a case.
 * The buyer's email and name are the order's, never what was sent. The
 * answer is the case's private link, also emailed to the buyer.
 */
export async function POST(request: Request) {
  const { body, photos } = await readCaseRequest(request)
  const kind = body?.kind === "digital" ? "digital" : "physical"
  const token = typeof body?.token === "string" ? body.token : ""
  const db = createAdminClient()
  const order = await orderForToken(db, kind, token)
  if (!order) return json({ error: "That order could not be found. Open this page from your order email." }, 404)
  const limited = await rateLimit({ bucket: "order-help", subjects: [addressSubject(request), emailSubject(order.buyerEmail)], windows: [{ limit: 5, seconds: 3600 }, { limit: 15, seconds: 86_400 }], message: "You've sent a few messages in a short time. Your case is open; the store will reply." })
  if (limited) return limited
  const input = readNewCase(body, kind)
  if (!input.ok) return json({ error: input.error }, 400)
  const out = await openCase(db, order, { ...input, photos }, appUrl("/").replace(/\/$/, ""))
  if (!out.ok) return json({ error: out.error }, out.status)
  return json({ id: out.id, link: out.link, existing: out.existing, photosNotKept: out.photosNotKept === true })
}
