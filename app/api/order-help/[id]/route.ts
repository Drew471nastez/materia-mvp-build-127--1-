import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isUuid, readBody } from "@/lib/physical/auth"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { appUrl } from "@/lib/notify/urls"
import { readCaseReply } from "@/lib/support/cases"
import { buyerAct, getCaseForBuyer } from "@/lib/support/cases-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

/**
 * A buyer's own case, read and written with its private link's secret (`k`).
 *
 *   GET ?k=                                           the case and its thread
 *   POST { k, action: "reply", body }                 a message to the store (and Storelib, once it is in)
 *   POST { k, action: "escalate", body? }             ask Storelib to step in
 *   POST { k, action: "resolve" }                     it's sorted
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const k = new URL(request.url).searchParams.get("k") ?? ""
  if (!isUuid(id)) return json({ error: "Not found." }, 404)
  const out = await getCaseForBuyer(createAdminClient(), id, k)
  if (!out.ok) return json({ error: out.error }, out.status)
  return json({ case: out.case, messages: out.messages, store: { name: out.store.name, logoUrl: out.store.logoUrl, email: out.store.email, phone: out.store.phone, websiteUrl: out.store.websiteUrl } })
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!isUuid(id)) return json({ error: "Not found." }, 404)
  const limited = await rateLimit({ bucket: "order-help-reply", subjects: [addressSubject(request), `case:${id}`], windows: [{ limit: 20, seconds: 3600 }], message: "That's a lot of messages at once. Give the store a moment to reply." })
  if (limited) return limited
  const body = await readBody(request)
  const k = typeof body?.k === "string" ? body.k : ""
  const db = createAdminClient()
  const origin = appUrl("/").replace(/\/$/, "")
  let out
  if (body?.action === "reply") {
    const words = readCaseReply(body.body)
    if (!words) return json({ error: "Write your message first." }, 400)
    out = await buyerAct(db, id, k, { kind: "reply", body: words }, origin)
  } else if (body?.action === "escalate") {
    out = await buyerAct(db, id, k, { kind: "escalate", body: readCaseReply(body.body) }, origin)
  } else if (body?.action === "resolve") {
    out = await buyerAct(db, id, k, { kind: "resolve" }, origin)
  } else return json({ error: "Bad request." }, 400)
  if (!out.ok) return json({ error: out.error }, out.status)
  const again = await getCaseForBuyer(db, id, k)
  return again.ok ? json({ case: again.case, messages: again.messages }) : json({ ok: true })
}
