import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { isUuid, readBody } from "@/lib/physical/auth"
import { STATUSES, readReply, type TicketStatus } from "@/lib/support/tickets"
import { adminGet, adminReply, adminUpdate } from "@/lib/support/tickets-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

/**
 * One request, for Storelib.
 *
 *   GET                                                  the request, the whole thread with notes, and who to write to
 *   POST { action: "reply", body, internal?, status? }   a reply (emailed to the store) or an internal note
 *   POST { action: "update", status?, priority? }        whose turn, and how pressing
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  if (!isUuid(id)) return json({ error: "Not found." }, 404)
  const out = await adminGet(createAdminClient(), id)
  if (!out.ok) return json({ error: out.error }, out.status)
  return json({ ticket: out.ticket, messages: out.messages, contact: out.contact })
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  if (!isUuid(id)) return json({ error: "Not found." }, 404)
  const body = await readBody(request)
  const db = createAdminClient()
  if (body?.action === "update") {
    const out = await adminUpdate(db, id, { status: body.status, priority: body.priority })
    if (!out.ok) return json({ error: out.error }, out.status)
  } else if (body?.action === "reply") {
    const words = readReply(body.body)
    if (!words) return json({ error: "Write the reply first." }, 400)
    const status = STATUSES.includes(body.status as TicketStatus) ? (body.status as TicketStatus) : null
    const out = await adminReply(db, id, { body: words, internal: body.internal === true, status })
    if (!out.ok) return json({ error: out.error }, out.status)
  } else return json({ error: "Bad request." }, 400)
  const again = await adminGet(db, id)
  return again.ok ? json({ ticket: again.ticket, messages: again.messages, contact: again.contact }) : json({ ok: true })
}
