/**
 * ===========================================================================
 *  THE NEWSLETTER SECTION, ACTUALLY SUBSCRIBING SOMEBODY
 * ===========================================================================
 * The section's submit handler used to call `preventDefault()` and set a
 * success message. That is all it did. A visitor was told "you're in, check
 * your inbox" and nothing was recorded anywhere, on any site built with it.
 * Nobody could tell from looking, which is what made it worse than a button
 * that plainly did nothing.
 *
 * This writes to the same `subscribers` table the rest of the platform uses,
 * with the same shape and the same email flows, so a person captured by a
 * built site appears beside everybody else and the creator's existing
 * automations fire.
 *
 * PUBLIC BY DESIGN, and therefore careful:
 *   - the creator is named by id and checked to exist, so a bad id writes
 *     nothing rather than writing an orphan row;
 *   - the address is validated and lowercased;
 *   - subscribing twice is not an error and not a second row;
 *   - nothing about an existing subscriber is ever reported back, because
 *     "already subscribed" is an answer that tells a stranger who is on the
 *     list.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { triggerEmailFlows } from "@/lib/email"
import { randomUUID } from "node:crypto"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { contactSourceFrom, recordContactSource, type ContactForm } from "@/lib/contacts/contact-source"
import { recordSignupAttribution } from "@/lib/attribution/server"

/** Deliberately plain. A clever pattern refuses addresses that work. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const MAX_NAME = 120

/**
 * WHERE ON THE PAGE THEY SAID YES.
 *
 * A consent record has to say what somebody agreed to, and "the newsletter
 * section" is not true of a footer box or a ticked checkbox on a contact form.
 * The caller names the placement; an unknown one is recorded as the generic
 * form rather than refused, because refusing a sign-up over a label would be
 * the wrong failure.
 */
const CONSENT: Record<string, string> = {
  newsletter: "Subscribed via the newsletter section of this creator's website",
  footer: "Subscribed via the sign-up box in the footer of this creator's website",
  contact: "Ticked \"Keep me updated\" on the contact form of this creator's website",
  section: "Subscribed via a sign-up form on this creator's website",
  password: "Asked to be told when this creator's website opens, on its coming soon page",
  bar: "Subscribed via the sign-up bar on this creator's website",
  popup: "Subscribed via a sign-up popup on this creator's website",
}

function consentFor(placement: unknown): string {
  return typeof placement === "string" && CONSENT[placement] ? CONSENT[placement] : CONSENT.newsletter
}

export async function POST(req: NextRequest) {
  let body: { creator_id?: unknown; email?: unknown; name?: unknown; source?: unknown; placement?: unknown; origin?: unknown; company?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : ""
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME) : ""

  if (!creatorId || !EMAIL.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
  }

  /* A form's invisible field filled in is a script: told it worked, and nothing is written (lib/site-contact, looksAutomated). */
  if (typeof body.company === "string" && body.company.trim() !== "") return NextResponse.json({ ok: true })

  /* Counted before anything is read or written. See lib/api/rate-limit.ts. */
  const limited = await rateLimit({
    bucket: "subscribe",
    subjects: [addressSubject(req), emailSubject(email)],
    windows: LIMITS.subscribe,
    message: "That is a lot of sign-ups at once. Try again in a minute.",
  })
  if (limited) return limited

  const db = createAdminClient()

  // A creator that does not exist writes nothing. Without this, anybody
  // could fill the table with rows belonging to no account.
  // A banned creator's website answers as no site (lib/seo/bans.ts), so it
  // collects nobody either. Read whole: a database without the column has no bans.
  const { data: creator } = await db.from("creators").select("*").eq("id", creatorId).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Unknown site" }, { status: 404 })
  if ((creator as { banned_at?: string | null }).banned_at) return NextResponse.json({ error: "Unknown site" }, { status: 404 })

  const { data: existing } = await db
    .from("subscribers")
    .select("id, status")
    .eq("creator_id", creatorId)
    .eq("email", email)
    .maybeSingle()

  /* A buyer who never asked for news is a customer contact
     (lib/contacts/checkout-contact), and somebody who wrote through a contact
     form without ticking the box is a contact who wrote (lib/site-contact).
     Signing up here is that yes: they join the list and get the welcome,
     like anybody new. */
  const customer = existing?.status === "customer" || existing?.status === "wrote"

  // Already on the list: say the same thing as a fresh subscribe. The answer
  // must not differ, or it becomes a way to ask whether an address is known.
  if (existing && !customer) return NextResponse.json({ ok: true })

  const now = new Date().toISOString()
  const { error } = customer
    ? await db.from("subscribers").update({ status: "subscribed", is_active: true, subscribed_at: now, consent_text: consentFor(body.placement), consent_timestamp: now }).eq("id", existing!.id).eq("status", existing!.status)
    : await db.from("subscribers").insert({
      email,
      name: name || null,
      /*
        One source for every website sign-up, and deliberately the value that
        has been in production since this route was written. An old setup
        script declares `CHECK (source IN ('onepage', 'store_builder'))`, and
        whether that constraint is live on a given database cannot be seen from
        here. A new value into a constrained column fails every insert, so the
        WHERE on the page goes in the consent line instead, which is free text.
      */
      source: "website_builder_newsletter",
      creator_id: creatorId,
      status: "subscribed",
      is_active: true,
      subscribed_at: new Date().toISOString(),
      consent_text: consentFor(body.placement),
      consent_timestamp: new Date().toISOString(),
      unsubscribe_token: randomUUID(),
    })

  if (error) {
    // A race with another submission of the same address lands here as a
    // unique violation, and that is a success from the visitor's side.
    if (error.code === "23505") return NextResponse.json({ ok: true })
    console.error("[subscribe] insert failed:", error.message)
    return NextResponse.json({ error: "Could not subscribe" }, { status: 500 })
  }

  /**
   * WHICH WEBSITE, AND FROM WHERE. The address is this request's own page
   * (a site's forms post to their own origin), never one the page claims;
   * what the page adds is where its visit came from. lib/contacts/contact-source.
   */
  /* A website's popup is a sign-up form to Emails: "popup" there is the profile's Subscribe button (lib/contacts/contact-source FORM_NAME). */
  const placement: ContactForm = body.placement === "popup" ? "section" : typeof body.placement === "string" && body.placement in CONSENT ? (body.placement as ContactForm) : "newsletter"
  const source = contactSourceFrom({ request: req, surface: "website", form: placement, sent: body.origin })
  await recordContactSource(db, creatorId, email, source)
  /* And onto the same contact, this website and the visit's touches (lib/attribution). */
  await recordSignupAttribution(db, { creatorId, email, source, sent: body.origin })

  /**
   * The creator's own welcome automation, the same one every other capture
   * path fires. A failure here is not the visitor's problem: they are
   * subscribed either way.
   */
  try {
    await triggerEmailFlows(db, {
      triggerType: "new_subscriber",
      creatorId,
      recipientEmail: email,
      recipientName: name || undefined,
      source,
    })
  } catch (err) {
    console.error("[subscribe] email flow failed:", err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ ok: true })
}
