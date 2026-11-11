import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { signupLooksAutomated, signupName } from "@/lib/onepage/creator-blocks"
import { liveAppBlockData, pageCreatorId, publishedBlocksOf } from "@/lib/onepage/page-block"
import { readLivePage } from "@/lib/onepage/tips-server"
import { addSubscriber, saveLead } from "@/lib/onepage/signup-server"
import { contactSourceFrom } from "@/lib/contacts/contact-source"
import { deliverSignup, pageSignup } from "@/lib/onepage/integrations/deliver-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/onepage/rsvp { onepage_id, block_id, name, email, keep_posted? }
 *
 * An RSVP to an Event block (round AR). Kept as the page's lead with what it
 * was for (onepage_leads, magnet_kind "rsvp", magnet_label the event's
 * name), so the creator sees who is coming in Leads and in the block's
 * figures. The person goes on the creator's subscriber list only when they
 * ticked "Send me news by email too": an RSVP alone is not a yes to news.
 * The block is read from the published page (on, in its schedule, RSVP on);
 * the same spam checks and limits as every signup on the page.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Something was missing." }, { status: 400 })
  }
  if (signupLooksAutomated(body)) return NextResponse.json({ success: true })
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!EMAIL.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  const name = signupName(body.name)
  if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 })
  const limited = await rateLimit({ bucket: "email-capture", subjects: [addressSubject(request), emailSubject(email)], windows: LIMITS.subscribe, message: "That is a lot of sign-ups at once. Try again in a minute." })
  if (limited) return limited

  const db = createAdminClient()
  const page = await readLivePage(db, body.onepage_id)
  if (!page) return NextResponse.json({ error: "This page is not available." }, { status: 404 })
  const event = liveAppBlockData<{ title?: string; rsvp?: boolean; event_start?: string }>(publishedBlocksOf(page), body.block_id, "event")
  if (!event || event.rsvp !== true) return NextResponse.json({ error: "RSVPs are closed for this event." }, { status: 404 })
  const start = Date.parse(event.event_start || "")
  if (!Number.isNaN(start) && Date.now() > start + 6 * 3600_000) return NextResponse.json({ error: "This event has ended." }, { status: 409 })

  const blockId = String(body.block_id)
  const country = request.headers.get("x-vercel-ip-country")
  const saved = await saveLead(db, {
    onepageId: page.id,
    email,
    name,
    blockId,
    referrer: request.headers.get("referer"),
    utm: {},
    magnetKind: "rsvp",
    magnetLabel: (event.title || "").slice(0, 120) || null,
    country: { code: country, name: country },
  })
  if (saved.ok === false) return NextResponse.json({ error: "That did not go through. Try again." }, { status: 500 })

  const creatorId = pageCreatorId(page)
  if (creatorId && body.keep_posted === true) {
    const source = contactSourceFrom({ request, surface: "onepage", form: "lead_magnet", sent: {} })
    await addSubscriber(db, creatorId, { email, name, onepageId: page.id, consentText: "Asked for news when answering an RSVP on OnePage", source, sent: body.origin })
    after(() => deliverSignup(db, creatorId, pageSignup({ email, name, form: "rsvp", detail: event.title ?? null, blockId, onepageId: page.id, pageUrl: request.headers.get("referer") })))
  }
  return NextResponse.json({ success: true, already: !saved.fresh })
}
