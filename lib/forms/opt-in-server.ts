import "server-only"
import { randomUUID } from "node:crypto"

/**
 * ===========================================================================
 *  A FORM'S "SEND ME OCCASIONAL UPDATES", KEPT
 * ===========================================================================
 * A form that offers the separate opt-in (definition.marketing_opt_in) shows
 * the visitor "Send me occasional updates" under its consent notice. A tick
 * was stored on the response (form_submissions.consent.marketing) and went
 * nowhere else: the person never joined the creator's list (Audience), the
 * welcome flow never ran, Klaviyo, Omnisend and the other connected email
 * platforms never heard, and on a OnePage the page's own tools (Mailchimp,
 * Kit, a Zapier or Sheets hook, lib/onepage/integrations) got nothing,
 * while every other box on the same page that asks for news reaches all of
 * them (lib/onepage/signup-server addSubscriber, the contact form's
 * lib/site-contact).
 *
 * Now a tick does what those do: the person on the list (or back on it,
 * after an unsubscribe, a purchase or a message that did not ask for news),
 * where they joined from, the welcome flow, the email platforms within the
 * minute, and on a OnePage the page's tools by the response's own id, which
 * is also the id the page gave the pixels' Lead (components/forms/public-form).
 * A bounced, complained or cleaned address stays as it is.
 *
 * Never throws: the response is kept already. Called after the reply
 * (app/api/forms/[id]/submit).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type FormSurface = "onepage" | "website" | "creator_page" | "form"

export interface FormOptIn {
  ownerId: string
  formId: string
  formTitle: string
  email: string
  name: string | null
  phone?: string | null
  surface: FormSurface
  /** The page the form was sent from (origin and path only, as the response keeps it). */
  pageUrl: string | null
  /** The browser's submission id: the response's dedupe key, and the pixels' Lead id. */
  eventId: string | null
  /** Where the person joined from (lib/contacts/contact-source), worked out from the request before the reply. */
  source: unknown
}

export interface OptInDeps {
  recordSource: (db: Db, creatorId: string, email: string, source: unknown) => Promise<void>
  welcome: (db: Db, creatorId: string, email: string, name: string | null, source: unknown) => Promise<void>
  syncPlatforms: (db: Db, creatorId: string) => Promise<void>
  /** The OnePage's own tools (lib/onepage/integrations/deliver-server deliverSignup). */
  deliverToPage: (db: Db, creatorId: string, signup: { email: string; name: string | null; phone?: string | null; form: string; detail: string | null; pageUrl: string | null; eventId: string | null }) => Promise<unknown>
}

const realDeps: OptInDeps = {
  recordSource: async (db, creatorId, email, source) => {
    const { recordContactSource } = await import("@/lib/contacts/contact-source")
    const { recordSignupAttribution } = await import("@/lib/attribution/server")
    await recordContactSource(db, creatorId, email, source as never)
    await recordSignupAttribution(db, { creatorId, email, source: source as never, sent: null })
  },
  welcome: async (db, creatorId, email, name, source) => {
    const { triggerEmailFlows } = await import("@/lib/email")
    await triggerEmailFlows(db, { triggerType: "new_subscriber", creatorId, recipientEmail: email, recipientName: name || undefined, source: source as never })
  },
  syncPlatforms: async (db, creatorId) => {
    const { syncPlatformsSoon } = await import("@/lib/contacts/checkout-contact")
    await syncPlatformsSoon(db, creatorId)
  },
  deliverToPage: async (db, creatorId, s) => {
    const { deliverSignup, pageSignup } = await import("@/lib/onepage/integrations/deliver-server")
    return deliverSignup(db, creatorId, pageSignup(s))
  },
}

/** Statuses a fresh tick does not overturn: the address itself is the problem. */
const STAYS = new Set(["bounced", "complained", "cleaned"])
/** Statuses a fresh tick moves onto the list: they left it, bought, or wrote without asking for news. */
const JOINS = new Set(["unsubscribed", "customer", "wrote"])

/** The one-word `source` column (lib/contacts/contact-source legacySurface reads it). */
export function subscriberSourceWord(surface: FormSurface): string {
  return surface === "onepage" ? "onepage" : surface === "creator_page" ? "creator_page" : surface === "website" ? "website_builder_newsletter" : "form"
}

export function optInConsentText(formTitle: string): string {
  const title = (formTitle || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120)
  return title ? `Ticked "Send me occasional updates" on the form ${title}` : `Ticked "Send me occasional updates" on a form`
}

export type OptInOutcome = "joined" | "already" | "stays" | "failed"

/** On the list, or back on it. Never throws. */
export async function keepFormOptIn(db: Db, input: FormOptIn, deps: OptInDeps = realDeps, now = new Date()): Promise<OptInOutcome> {
  const email = (input.email || "").trim().toLowerCase()
  if (!input.ownerId || !email) return "failed"
  let outcome: OptInOutcome = "failed"
  try {
    const at = now.toISOString()
    const consent = optInConsentText(input.formTitle)
    const { data: existing, error: readError } = await db.from("subscribers").select("id, status").eq("creator_id", input.ownerId).eq("email", email).maybeSingle()
    if (readError) return "failed"
    if (!existing) {
      const row: Record<string, unknown> = {
        email,
        name: input.name ? String(input.name).slice(0, 120) : null,
        source: subscriberSourceWord(input.surface),
        creator_id: input.ownerId,
        status: "subscribed",
        is_active: true,
        subscribed_at: at,
        consent_text: consent,
        consent_timestamp: at,
        unsubscribe_token: randomUUID(),
      }
      let { error } = await db.from("subscribers").insert(row)
      /* An old CHECK on `source`, if a database still has one: the word every website sign up already uses (as lib/site-contact does). */
      if (error?.code === "23514" && /source/i.test(String(error.message))) ({ error } = await db.from("subscribers").insert({ ...row, source: "website_builder_newsletter" }))
      outcome = !error ? "joined" : error.code === "23505" ? "already" : "failed"
    } else if (STAYS.has(String(existing.status))) {
      outcome = "stays"
    } else if (JOINS.has(String(existing.status))) {
      const { error } = await db
        .from("subscribers")
        .update({ status: "subscribed", is_active: true, subscribed_at: at, unsubscribed_at: null, consent_text: consent, consent_timestamp: at })
        .eq("id", existing.id)
        .eq("status", existing.status)
      outcome = error ? "failed" : "joined"
    } else {
      outcome = "already"
    }
  } catch {
    return "failed"
  }
  if (outcome === "joined") {
    await deps.recordSource(db, input.ownerId, email, input.source).catch(() => undefined)
    await deps.welcome(db, input.ownerId, email, input.name, input.source).catch(() => undefined)
    await deps.syncPlatforms(db, input.ownerId).catch(() => undefined)
  }
  /* On a OnePage, its own tools, as every other box there that asks for news. Their own claim keeps one delivery per address and block. */
  if (input.surface === "onepage" && (outcome === "joined" || outcome === "already")) {
    await deps
      .deliverToPage(db, input.ownerId, { email, name: input.name, phone: input.phone ?? null, form: "form", detail: input.formTitle || null, pageUrl: input.pageUrl, eventId: input.eventId })
      .catch(() => undefined)
  }
  return outcome
}
