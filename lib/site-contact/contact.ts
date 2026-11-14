/**
 * ===========================================================================
 *  A MESSAGE FROM A CREATOR'S WEBSITE
 * ===========================================================================
 * The contact form used to open the visitor's own mail app with a mailto:
 * link, addressed to whatever the creator typed into the section. Nothing was
 * kept, a creator who left the field empty got nothing at all, and every
 * visitor without a mail app set up was told their message had gone.
 *
 * Now the website's form posts here (app/api/website-builder/contact), and a
 * message that gets through is:
 *
 *   KEPT         in site_contact_messages, which the creator reads under row
 *                level security and nobody writes but this server
 *   EMAILED      to the creator, with Reply going to the visitor, built from
 *                escaped text: nothing the visitor typed is ever markup.
 *                "New message from <name> on <site>", linking to it in
 *                Emails, Messages
 *   NOTIFIED     a row in the creator's notifications panel (./notify.ts)
 *   A CONTACT    the sender joins the creator's contacts (`subscribers`,
 *                source "contact_form", where on which website in
 *                source_detail). What they agreed to decides the status, and
 *                only a tick is a yes:
 *
 *       ticked        subscribed, with the consent line saying where, and the
 *                     creator's welcome automation, like any other sign up
 *       not ticked    "wrote": on the list of people who wrote, never sent a
 *                     campaign or an automation that sells
 *       already on    left as they are. A contact message never unsubscribes
 *       the list      anybody, and never puts back somebody who left: the
 *                     address is typed, not proven, so a stranger could type
 *                     theirs. A tick moves a customer or a writer onto the
 *                     list, which is the same yes the newsletter box takes.
 *
 * SPAM, before any of that: a field no person can see (`company`), the time
 * the form was on the screen, and the platform rate limit per visitor, per
 * address and per creator's inbox. The first two are answered "sent" and do
 * nothing, so a script learns nothing from the answer. There is no captcha,
 * because the app has none and a new paid service is not this change's to
 * add.
 *
 * NEVER LOGGED: no address, no name, no message. Codes and steps only.
 *
 * Every step after the checks is its own best effort. A creator's inbox
 * being full does not lose the message (it is kept), and a missing table
 * before the SQL has run does not lose the email (it is sent). What the app
 * does before supabase/sql/run-now's contact part has run: the email is
 * sent, the sender is recorded only if they ticked the box, and nothing is
 * kept in /app yet.
 */

import { platformEmail } from "@/lib/emails/layout"
import { v4 as uuidv4 } from "uuid"
import { inboxAddress, provenInbox, type LoginEmail } from "@/lib/seller-inbox"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export const LIMITS = {
  name: 120,
  email: 254,
  subject: 150,
  message: 5000,
} as const

/** Faster than this from the form appearing to it being sent is not a person typing. */
export const MIN_ELAPSED_MS = 2500

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/* A page key ("contact", "about"), or one level down for a page of a kind (round 25: "products/mug", a question asked on a product). */
const PAGE_KEY = /^[a-z0-9](?:[a-z0-9-]{0,62})(?:\/[a-z0-9][a-z0-9-]{0,99})?$/

export interface ContactMessage {
  creatorId: string
  name: string
  email: string
  subject: string
  message: string
  consent: boolean
  page: string
  sectionId: string | null
}

/** One line: control characters and runs of space gone, cut to size. */
function line(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
}

/** A message: line breaks kept (as \n), other control characters gone, cut to size. */
function body(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max)
}

export type Validated = { ok: true; value: ContactMessage } | { ok: false; status: number; error: string }

/** What the form sent, checked and trimmed, or the one thing to tell the visitor. */
export function validateContact(raw: unknown): Validated {
  const b = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const creatorId = typeof b.creator_id === "string" ? b.creator_id.trim() : ""
  if (!UUID.test(creatorId)) return { ok: false, status: 400, error: "This form is not connected to a store." }
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : ""
  if (!EMAIL.test(email) || email.length > LIMITS.email) return { ok: false, status: 400, error: "Enter a valid email address." }
  const message = body(b.message, LIMITS.message)
  if (!message) return { ok: false, status: 400, error: "Write a message first." }
  if (typeof b.message === "string" && b.message.trim().length > LIMITS.message) {
    return { ok: false, status: 400, error: `Keep the message under ${LIMITS.message.toLocaleString("en-US")} characters.` }
  }
  const page = typeof b.page === "string" && PAGE_KEY.test(b.page) ? b.page : "contact"
  const sectionId = typeof b.section_id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(b.section_id) ? b.section_id : null
  return {
    ok: true,
    value: {
      creatorId,
      email,
      name: line(b.name, LIMITS.name),
      subject: line(b.subject, LIMITS.subject),
      message,
      consent: b.consent === true,
      page,
      sectionId,
    },
  }
}

/** The two checks a person always passes: the invisible field is empty, and the form was on screen long enough to type into. */
export function looksAutomated(raw: unknown): boolean {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  if (typeof b.company === "string" && b.company.trim() !== "") return true
  if (b.company !== undefined && typeof b.company !== "string") return true
  const elapsed = typeof b.elapsed === "number" && Number.isFinite(b.elapsed) ? b.elapsed : -1
  return elapsed < MIN_ELAPSED_MS
}

/* ─── The sender as a contact ───────────────────────────────────────────── */

export const WROTE_STATUS = "wrote"

export const CONTACT_CONSENT_TEXT = "Ticked \"Keep me updated\" on the contact form of this creator's website"
export const WROTE_TEXT = "Wrote through the contact form of this creator's website. Did not ask for news"

export interface ExistingContact {
  id: string
  status: string | null
  is_active: boolean | null
}

export type ContactPlan =
  | { kind: "insert"; row: Record<string, unknown> }
  | { kind: "subscribe"; patch: Record<string, unknown> }
  | { kind: "none"; why: string }

const STAYS = new Set(["unsubscribed", "bounced", "complained", "cleaned"])

/** What to do with the sender's row. Pure: the decision table at the top of this file. */
export function planSender(existing: ExistingContact | null, input: { creatorId: string; email: string; name: string; consent: boolean }, nowIso: string): ContactPlan {
  if (!existing) {
    return {
      kind: "insert",
      row: {
        email: input.email,
        name: input.name || null,
        source: "contact_form",
        creator_id: input.creatorId,
        status: input.consent ? "subscribed" : WROTE_STATUS,
        is_active: true,
        subscribed_at: nowIso,
        consent_text: input.consent ? CONTACT_CONSENT_TEXT : WROTE_TEXT,
        consent_timestamp: input.consent ? nowIso : null,
        unsubscribe_token: uuidv4(),
      },
    }
  }
  const status = existing.status ?? "subscribed"
  if (STAYS.has(status) || existing.is_active === false) return { kind: "none", why: "left the list" }
  if (status === "subscribed") return { kind: "none", why: "already subscribed" }
  if (!input.consent) return { kind: "none", why: "no new consent" }
  /* A customer, or somebody who wrote before, who ticks the box now. */
  return {
    kind: "subscribe",
    patch: { status: "subscribed", is_active: true, subscribed_at: nowIso, consent_text: CONTACT_CONSENT_TEXT, consent_timestamp: nowIso },
  }
}

export type SenderOutcome = "subscribed" | "wrote" | "unchanged" | "unavailable" | "failed"

function warn(step: string, code: unknown) {
  console.warn(`[contact] ${step} (${typeof code === "string" && code ? code : "error"})`)
}

/**
 * Records the sender as a contact, as planSender says. Never throws. The
 * row's id comes back so the creator's email can link to the contact.
 */
export async function recordSender(
  db: Db,
  input: { creatorId: string; email: string; name: string; consent: boolean },
  now = new Date(),
): Promise<{ outcome: SenderOutcome; id: string | null }> {
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error: readError } = await db
        .from("subscribers")
        .select("id, status, is_active")
        .eq("creator_id", input.creatorId)
        .eq("email", input.email)
        .maybeSingle()
      if (readError) {
        warn("could not read the contact", readError.code)
        return { outcome: "failed", id: null }
      }
      const existing = (data as ExistingContact | null) ?? null
      const plan = planSender(existing, input, now.toISOString())
      if (plan.kind === "none") return { outcome: "unchanged", id: existing?.id ?? null }
      if (plan.kind === "subscribe") {
        const { error } = await db.from("subscribers").update(plan.patch).eq("id", existing!.id).eq("status", existing!.status)
        if (error) {
          warn("could not subscribe the contact", error.code)
          return { outcome: "failed", id: existing!.id }
        }
        return { outcome: "subscribed", id: existing!.id }
      }
      let row = plan.row
      let { data: made, error } = await db.from("subscribers").insert(row).select("id").maybeSingle()
      /* An old CHECK on `source`, if a database still has one: the value every website sign up already uses. */
      if (error?.code === "23514" && /source/i.test(String(error.message))) {
        row = { ...row, source: "website_builder_newsletter" }
        ;({ data: made, error } = await db.from("subscribers").insert(row).select("id").maybeSingle())
      }
      if (error?.code === "23505") continue /* Somebody else's insert landed first: plan again against theirs. */
      if (error?.code === "23514") {
        /* "wrote" is not an allowed status until the SQL runs. A person who ticked is still subscribed above. */
        warn("the contact status is not allowed yet; run the contact form SQL part", error.code)
        return { outcome: "unavailable", id: null }
      }
      if (error) {
        warn("could not add the contact", error.code)
        return { outcome: "failed", id: null }
      }
      return { outcome: row.status === "subscribed" ? "subscribed" : "wrote", id: (made as { id?: string } | null)?.id ?? null }
    }
    return { outcome: "unchanged", id: null }
  } catch (error) {
    warn("recording the contact threw", (error as Error)?.name)
    return { outcome: "failed", id: null }
  }
}

/* ─── The message, kept ─────────────────────────────────────────────────── */

/** Postgres "undefined table", or PostgREST not finding it. */
function missingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === "42P01" || error.code === "PGRST205") return true
  const m = String(error.message ?? "").toLowerCase()
  return m.includes("relation") && m.includes("does not exist")
}

export type KeptOutcome = { kept: true; id: string | null } | { kept: false; why: "missing" | "failed" }

export async function keepMessage(
  db: Db,
  msg: ContactMessage,
  where: { site: string | null; sourceDetail: unknown; subscriberId: string | null },
): Promise<KeptOutcome> {
  try {
    const { data, error } = await db
      .from("site_contact_messages")
      .insert({
        creator_id: msg.creatorId,
        subscriber_id: where.subscriberId,
        email: msg.email,
        name: msg.name || null,
        subject: msg.subject || null,
        message: msg.message,
        consent: msg.consent,
        site: where.site,
        page: msg.page,
        source_detail: where.sourceDetail ?? null,
      })
      .select("id")
      .maybeSingle()
    if (error) {
      if (missingTable(error)) return { kept: false, why: "missing" }
      warn("could not keep the message", error.code)
      return { kept: false, why: "failed" }
    }
    return { kept: true, id: (data as { id?: string } | null)?.id ?? null }
  } catch (error) {
    warn("keeping the message threw", (error as Error)?.name)
    return { kept: false, why: "failed" }
  }
}

export async function markEmailed(db: Db, id: string | null): Promise<void> {
  if (!id) return
  try {
    await db.from("site_contact_messages").update({ emailed_at: new Date().toISOString() }).eq("id", id)
  } catch {
    /* Bookkeeping only. */
  }
}

/* ─── Where the creator reads it ───────────────────────────────────────── */

/**
 * The address the creator's messages go to: the one the section names (the
 * older Contact Form section has a "Recipient Email" field, which a creator
 * may have filled in), then what lib/seller-inbox answers for every message
 * to a seller: the support email from Settings, then the login's address as
 * it is now (the owner's, for a second business), then the profile's. Read
 * from the published site and the creator's own rows, never from the request.
 * A "+slb-" business tag never reaches the To.
 *
 * Round AX: the section's address and the support email are used only when
 * the store has proven it owns them (the account's or a team member's sign
 * in address, lib/seller-inbox provenInbox). Any other goes unused and the
 * message goes to the account's own address: the Contact Form was an open
 * relay of visitor text from Storelib's domain to any address typed there.
 */
export async function creatorInbox(db: Db, creatorId: string, sectionId: string | null, loginEmail: LoginEmail = async () => null): Promise<string | null> {
  let chosen: string | null = null
  if (sectionId) {
    try {
      const { data: install } = await db
        .from("store_theme_installs")
        .select("id")
        .eq("creator_id", creatorId)
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle()
      const installId = (install as { id?: string } | null)?.id
      if (installId) {
        const { data: pages } = await db.from("store_theme_pages").select("sections").eq("install_id", installId).limit(100)
        for (const p of (pages ?? []) as { sections?: unknown }[]) {
          const list = Array.isArray(p.sections) ? (p.sections as { id?: string; settings?: Record<string, unknown> }[]) : []
          const hit = list.find((s) => s?.id === sectionId)
          if (hit) {
            chosen = inboxAddress(hit.settings?.recipient_email)
            break
          }
        }
      }
    } catch {
      /* The creator's own addresses below. */
    }
  }
  const inbox = await provenInbox(db, creatorId, loginEmail, chosen ? [chosen] : [])
  if (inbox?.held) console.warn("[contact] the form's address is not the account's or a team member's sign in email; sent to the account's address")
  return inbox?.to ?? null
}

/* ─── The email to the creator ─────────────────────────────────────────── */


export interface CreatorEmail {
  subject: string
  html: string
  text: string
}

/**
 * The email a creator gets. Every value the visitor typed is escaped for
 * HTML and kept to one line where it is one line; the subject has no line
 * breaks, so it cannot add a header of its own.
 */
export function creatorEmail(input: {
  store: string
  msg: ContactMessage
  site: string | null
  contactUrl: string
  /** The message itself in Emails, Messages, once it is kept. */
  messageUrl?: string | null
}): CreatorEmail {
  const { msg } = input
  const who = msg.name || msg.email
  /* "New message from Ana on maralind.storelib.com", and what they called it after a colon. */
  const on = input.site || input.store
  const lead = on ? `New message from ${who} on ${on}` : `New message from ${who}`
  const subject = line(msg.subject ? `${lead}: ${msg.subject}` : lead, 180)
  const where = input.site ? `${input.site}${msg.page === "home" ? "" : `/${msg.page}`}` : `your website, ${msg.page} page`
  const consent = msg.consent ? "Asked to get news from you, and was added to your Subscribers." : "Did not ask for news. Kept in your contacts as somebody who wrote."
  /* Drawn in the one Storelib layout (lib/emails/layout.ts); the visitor's words quoted, every value escaped there. */
  const html = platformEmail({
    subject,
    preview: msg.message.replace(/\s+/g, " ").slice(0, 140),
    heading: `${who} sent you a message`,
    paragraphs: [`From the contact form on ${input.store}. Reply to this email to answer ${who}.`],
    facts: [...(msg.name ? [{ label: "Name", value: msg.name }] : []), { label: "Email", value: msg.email }, ...(msg.subject ? [{ label: "Subject", value: msg.subject }] : []), { label: "Sent from", value: where }],
    quote: { text: msg.message },
    action: input.messageUrl ? { label: "Open in Messages", url: input.messageUrl } : null,
    fallback: false,
    secondary: { label: "See them in Emails", url: input.contactUrl },
    note: consent,
  }).html
  const text = [
    `A message from the contact form on ${input.store}. Reply to this email to answer ${who}.`,
    "",
    msg.name ? `Name: ${msg.name}` : null,
    `Email: ${msg.email}`,
    msg.subject ? `Subject: ${msg.subject}` : null,
    `Sent from: ${where}`,
    "",
    msg.message,
    "",
    input.messageUrl ? `Open in Messages: ${input.messageUrl}` : null,
    consent,
    `See them in Emails: ${input.contactUrl}`,
  ]
    .filter((l) => l !== null)
    .join("\n")
  return { subject, html, text }
}
