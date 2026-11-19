/**
 * ===========================================================================
 *  ONE WAY FOR A CONTACT FORM ON A WEBSITE TO REACH THE CREATOR
 * ===========================================================================
 * Two forms send a message: the Contact form section (a .storelib file,
 * submitted by the page, see StorelibSection) and the older Contact Form
 * section (a React renderer). Both call this, so they share one endpoint,
 * one set of spam checks and one wording for what went wrong.
 *
 * The server does the work (app/api/website-builder/contact): the message is
 * kept for the creator, emailed to them with Reply going to the visitor, and
 * the visitor is recorded as a contact who wrote, or as a subscriber when
 * they ticked the box. See lib/site-contact/contact.ts.
 *
 * `company` is the honeypot: a field no person sees or fills in. `elapsed`
 * is how long the form was on the screen; a form filled and sent faster than
 * anybody types is a script, and is told it worked while nothing happens.
 */

import { pageOrigin } from "@/lib/orders/checkout-origin-browser"

export type ContactResult = { ok: true } | { ok: false; error: string }

export interface ContactInput {
  creatorId: string
  name: string
  email: string
  subject?: string
  message: string
  /** The unticked "keep me updated" box, ticked. */
  consent: boolean
  /** The honeypot's value: empty from a person. */
  company?: string
  /** Milliseconds the form was on the page before it was sent. */
  elapsed: number
  /** Which page of the website: "contact", "home", a creator's own page. */
  page: string
  /** Which section sent it, so the server can find the creator's own inbox setting. */
  sectionId?: string
  /** The Lead's id the page's pixels were told (lib/analytics/pixels newLeadEventId), so the server's own Lead for a OnePage signup is the same lead. */
  eventId?: string
}

/** "page.contact" to "contact", "index" to "home". */
export function pageKeyOfTemplate(template: string | undefined): string {
  if (!template || template === "index") return "home"
  return template.startsWith("page.") ? template.slice(5) : template
}

export async function sendContactMessage(input: ContactInput): Promise<ContactResult> {
  const email = input.email.trim()
  if (!email) return { ok: false, error: "Enter your email address." }
  if (!input.message.trim()) return { ok: false, error: "Write a message first." }
  try {
    const res = await fetch("/api/website-builder/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creator_id: input.creatorId,
        name: input.name.trim(),
        email,
        subject: input.subject?.trim() || undefined,
        message: input.message,
        consent: input.consent === true,
        company: input.company ?? "",
        elapsed: Math.max(0, Math.round(input.elapsed)),
        page: input.page,
        section_id: input.sectionId,
        origin: pageOrigin(),
        ...(input.eventId ? { event_id: input.eventId } : {}),
      }),
    })
    if (res.ok) return { ok: true }
    const out = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: out.error || "The message did not send. Try again." }
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." }
  }
}
