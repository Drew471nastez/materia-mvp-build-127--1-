import { NextResponse } from "next/server"
import { NO_STORE, requireContacts } from "@/lib/contacts/gate"
import { readPeopleQuery } from "@/lib/contacts/identity"
import { everyPerson } from "@/lib/contacts/people-server"
import { contactIdsFrom } from "@/lib/contacts/server"
import { csvLine } from "@/lib/contacts/csv"
import { displayEmail } from "@/lib/businesses/email-alias"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/contacts/export?<the list's query>[&ids=<id,id,...>] (round 51)
 *
 * The people the list shows (or the ones picked), as CSV, streamed a
 * thousand at a time and at most EXPORT_CEILING in all, read by the store
 * the session works in (lib/contacts/gate) and nothing else. Every cell goes
 * through the formula guard (lib/contacts/csv csvCell).
 */
const EXPORT_CEILING = 50_000
const HEADER = ["Name", "Email", "Subscribed to marketing", "Lead", "Customer", "Member", "Student", "Paid orders", "Form answers", "Tags", "First seen", "Last seen", "Came from", "Contact id"]

export async function GET(request: Request) {
  const gate = await requireContacts({ read: true })
  if (gate instanceof NextResponse) return gate
  const sp = new URL(request.url).searchParams
  const query = readPeopleQuery((k) => sp.get(k))
  const ids = sp.has("ids") ? contactIdsFrom(sp.get("ids")) : undefined
  if (ids && ids.length === 0) return NextResponse.json({ error: "Pick people to export.", code: "nothing_chosen" }, { status: 400, headers: NO_STORE })
  const encoder = new TextEncoder()
  const rows = everyPerson(gate.db, gate, query, { ceiling: EXPORT_CEILING, ids })
  let header = true
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (request.signal.aborted) return controller.close()
        const next = await rows.next()
        let out = header ? "﻿" + csvLine(HEADER) : ""
        header = false
        if (next.done) {
          if (out) controller.enqueue(encoder.encode(out))
          return controller.close()
        }
        for (const p of next.value)
          out += csvLine([p.name ?? "", displayEmail(p.email) ?? "", p.subscription, p.lead ? "yes" : "", p.customer ? "yes" : "", p.member ? "yes" : "", p.student ? "yes" : "", p.orders, p.forms, p.tags.join(", "), p.firstSeen ?? "", p.lastSeen ?? "", p.origin, p.id])
        controller.enqueue(encoder.encode(out))
      } catch (error) {
        console.error("[contacts] export failed:", (error as Error)?.message)
        controller.error(error)
      }
    },
    cancel() {
      void rows.return(undefined)
    },
  })
  return new Response(stream, {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
