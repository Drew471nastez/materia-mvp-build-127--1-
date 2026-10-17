import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { isUuid, readBody } from "@/lib/physical/auth"
import { appUrl } from "@/lib/notify/urls"
import { CASE_STATUSES, readCaseReply, type CaseStatus } from "@/lib/support/cases"
import { adminCaseReply, adminCaseUpdate, adminGetCase, readAfter } from "@/lib/support/cases-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

/**
 * One buyer case, for Storelib.
 *
 *   GET                                                         the case, the whole thread with notes, the store, the order, the live channel
 *   GET ?after=<message id>                                     the case and the messages after that one (a page keeping up)
 *   POST { action: "reply", body, internal?, to?, status? }     a message to the buyer and the store, or a note
 *   POST { action: "update", status }                           whose turn it is
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  if (!isUuid(id)) return json({ error: "Not found." }, 404)
  const out = await adminGetCase(createAdminClient(), id, { after: readAfter(new URL(request.url).searchParams.get("after")) })
  if (!out.ok) return json({ error: out.error }, out.status)
  return json({ case: out.case, messages: out.messages, store: out.store, order: out.order, live: out.live })
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  if (!isUuid(id)) return json({ error: "Not found." }, 404)
  const body = await readBody(request)
  const db = createAdminClient()
  if (body?.action === "update") {
    const out = await adminCaseUpdate(db, id, { status: body.status })
    if (!out.ok) return json({ error: out.error }, out.status)
  } else if (body?.action === "reply") {
    const words = readCaseReply(body.body)
    if (!words) return json({ error: "Write the reply first." }, 400)
    const status = CASE_STATUSES.includes(body.status as CaseStatus) ? (body.status as CaseStatus) : null
    const out = await adminCaseReply(db, id, { body: words, internal: body.internal === true, to: body.to === "store" ? "store" : "buyer", status }, appUrl("/").replace(/\/$/, ""))
    if (!out.ok) return json({ error: out.error }, out.status)
  } else return json({ error: "Bad request." }, 400)
  const again = await adminGetCase(db, id)
  return again.ok ? json({ case: again.case, messages: again.messages, store: again.store, order: again.order, live: again.live }) : json({ ok: true })
}
