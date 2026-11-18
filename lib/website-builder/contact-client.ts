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
      }),
    })
    if (res.ok) return { ok: true }
    const out = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, error: out.error || "The message did not send. Try again." }
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." }
  }
}

/**
 * ===========================================================================
 *  EVERY FIELD A CONTACT FORM ASKS FOR REACHES THE CREATOR (round 56)
 * ===========================================================================
 * The endpoint reads name, email, subject, message and the consent box. A
 * contact form a website draws often asks for more: a phone number, a date,
 * a budget, which service. Read by those five names only, the rest was typed
 * by the visitor and then dropped. Each other field is added under the
 * message, one line each, under its label ("Phone: 0712 345 678"), so the
 * creator reads everything the visitor wrote, in the same email and in
 * Messages. The same endpoint, the same checks and limits; nothing new is
 * stored. Pure, so the tests drive it without a browser.
 *
 * Left out: what the endpoint already reads, the honeypot, files (the
 * endpoint takes text only, and a form that asks for one is refused before
 * it ships), a box that is not ticked, an empty choice.
 */
export interface ContactExtraField {
  /** The field's name attribute. */
  name: string
  /** What the visitor read beside it: its label, or the legend of its group. */
  label: string
  value: string
}

/** The names the endpoint reads itself (and the honeypot): never added to the message. */
export const CONTACT_OWN_FIELDS = new Set(["name", "email", "subject", "message", "consent", "company"])

/** The longest message the endpoint keeps (lib/site-contact/contact.ts LIMITS.message). */
export const CONTACT_MESSAGE_MAX = 5000

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim()

/** "budget_range" to "Budget range", for a field with no label. */
function labelOfName(name: string): string {
  const words = name.replace(/[_\-[\]]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim().toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : "Field"
}

/**
 * The message as the creator reads it: what the visitor wrote, then every
 * other field under its label. Several values of one field (ticked boxes)
 * share a line. Never longer than the endpoint keeps; the visitor's own words
 * come first, so only the added lines are ever cut.
 */
export function contactMessageFrom(message: string, extras: readonly ContactExtraField[]): string {
  const body = message.trim()
  const lines: { label: string; values: string[] }[] = []
  for (const f of extras) {
    const name = f.name.trim()
    if (!name || CONTACT_OWN_FIELDS.has(name.toLowerCase())) continue
    const value = oneLine(f.value)
    if (!value) continue
    const label = oneLine(f.label).replace(/[:*\s]+$/, "") || labelOfName(name)
    const at = lines.find((l) => l.label === label)
    if (at) at.values.push(value)
    else lines.push({ label, values: [value] })
  }
  if (!lines.length) return body
  const extra = lines.map((l) => `${l.label}: ${l.values.join(", ")}`).join("\n")
  const out = body ? `${body}\n\n${extra}` : extra
  return out.length > CONTACT_MESSAGE_MAX ? out.slice(0, CONTACT_MESSAGE_MAX).trimEnd() : out
}
