/**
 * New email, opened from Contacts with people already chosen (round 51):
 * /app/emails/new?to=<id> or ?contacts=<id,...> (at most 200).
 *
 *   POST { contacts: string[] }
 *     -> { segment: { id, count } | null, asked, recipients, leftOut }
 *
 * Only marketing eligible people are kept, decided here and again when the
 * email is sent (lib/emails/recipient-contacts.ts, lib/email-campaigns/
 * queue.ts resolveAudience). The ones kept become a picked segment the
 * composer sends to; the rest are only counted, by reason, so the page can
 * say how many were left out and why. Addresses never go back to the page.
 */
import { NextResponse } from "next/server"
import { isResponse, noStore, readJson, requireCreator } from "@/lib/email-campaigns/route-auth"
import { MAX_PICKED, keepPickedSegment, readContactIds, resolvePickedContacts } from "@/lib/emails/recipient-contacts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const body = await readJson(request)
  const raw = Array.isArray(body.contacts) ? (body.contacts as unknown[]).filter((x): x is string => typeof x === "string") : []
  if (raw.length > MAX_PICKED) return NextResponse.json({ error: `Pick up to ${MAX_PICKED} people at a time.` }, { status: 400, headers: noStore })
  const ids = readContactIds(raw)
  if (ids.length === 0) return NextResponse.json({ error: "Nobody was picked." }, { status: 400, headers: noStore })

  let picked
  try {
    picked = await resolvePickedContacts(ctx.admin, ctx.creatorId, ids)
  } catch {
    return NextResponse.json({ error: "Could not read your contacts. Try again in a moment." }, { status: 503, headers: noStore })
  }
  const segment = picked.recipients.length ? await keepPickedSegment(ctx.admin, ctx.creatorId, picked.recipients.map((r) => r.subscriberId)) : null
  if (picked.recipients.length && !segment) return NextResponse.json({ error: "Could not keep this list. Try again." }, { status: 503, headers: noStore })
  return NextResponse.json(
    {
      segment: segment ? { id: segment.id, count: picked.recipients.length } : null,
      asked: picked.asked,
      recipients: picked.recipients.length,
      leftOut: picked.leftOut,
    },
    { headers: noStore },
  )
}
