import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { readReply } from "@/lib/support/tickets"
import { getTicket, replyAsStore, resolveAsStore } from "@/lib/support/tickets-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * One of the store's own requests.
 *
 *   GET                              the request and its thread
 *   POST { action: "reply", body }   reply, which hands it back to Storelib
 *   POST { action: "resolve" }       mark it resolved
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await ctx.params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const out = await getTicket(c.db, c.creatorId, id)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  return physicalJson({ ticket: out.ticket, messages: out.messages })
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await ctx.params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (body?.action === "resolve") {
    const out = await resolveAsStore(c.db, c.creatorId, id)
    return out.ok ? physicalJson({ ok: true }) : physicalJson({ error: out.error }, out.status)
  }
  if (body?.action !== "reply") return physicalJson({ error: "Bad request." }, 400)
  const words = readReply(body.body)
  if (!words) return physicalJson({ error: "Write your reply first." }, 400)
  const out = await replyAsStore(c.db, { creatorId: c.creatorId }, id, words)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  const again = await getTicket(c.db, c.creatorId, id)
  return again.ok ? physicalJson({ ticket: again.ticket, messages: again.messages }) : physicalJson({ ok: true })
}
