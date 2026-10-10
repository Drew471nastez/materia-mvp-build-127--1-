import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { readNewTicket } from "@/lib/support/tickets"
import { listTickets, openTicket } from "@/lib/support/tickets-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A store's support requests to Storelib (lib/support, SQL part 114).
 *
 *   GET                                         its requests, newest first
 *   POST { topic, subject, message, orderRef? } open one
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const out = await listTickets(c.db, c.creatorId)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  return physicalJson({ tickets: out.tickets })
}

export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "support", subjects: [`support:${c.userId}`], windows: [{ limit: 5, seconds: 3600 }], message: "You've opened a few requests in a short time. Reply on one of those, or try again in an hour." })
  if (limited) return limited
  const input = readNewTicket(await readBody(request))
  if (!input.ok) return physicalJson({ error: input.error }, 400)
  const out = await openTicket(c.db, { creatorId: c.creatorId, userId: c.userId }, input)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  return physicalJson({ ticket: out.ticket })
}
