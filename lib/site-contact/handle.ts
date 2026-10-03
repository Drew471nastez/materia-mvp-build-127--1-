/**
 * The contact route's work, in the order it happens, with everything it
 * reaches outside itself handed in: the database, the rate limiter, the
 * mailer, the automations and the notifications panel. The route (app/api/website-builder/contact)
 * passes the real ones; tests/site-contact.test.ts passes fakes and watches
 * the console, so "no address in the logs" is a measurement rather than a
 * promise.
 */

import {
  creatorEmail,
  creatorInbox,
  keepMessage,
  looksAutomated,
  markEmailed,
  recordSender,
  validateContact,
  type ContactMessage,
} from "./contact"
import type { MessageNotice } from "./notify"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ContactDeps {
  db: Db
  /** Null to go on, or the refusal to send back (the platform limiter's 429). */
  limit: (msg: ContactMessage) => Promise<{ status: number; error: string } | null>
  send: (mail: { to: string; replyTo: string; subject: string; html: string; text: string; fromName: string }) => Promise<{ success: boolean }>
  /** The creator's welcome automation, for a sender who ticked the box. */
  welcome: (msg: ContactMessage, source: unknown) => Promise<void>
  /** Where on which website, worked out from the request (lib/contacts/contact-source). */
  source: (msg: ContactMessage) => { site: string | null; detail: unknown }
  /** The store's name, for the email. */
  brand: (creatorId: string) => Promise<string>
  /** Best effort, never thrown: first door wins. */
  recordSource: (creatorId: string, email: string, detail: unknown) => Promise<void>
  /** "https://storelib.com". */
  platform: string
  /** The creator's login address as it is now (lib/seller-inbox). Left out, the saved addresses are used. */
  loginEmail?: (userId: string) => Promise<string | null>
  /** The row in the creator's notifications panel (./notify.ts). Best effort, never thrown. */
  notify?: (notice: MessageNotice) => Promise<unknown>
}

export type ContactReply = { status: number; body: { ok: true } | { error: string } }

export async function handleContact(raw: unknown, deps: ContactDeps): Promise<ContactReply> {
  const checked = validateContact(raw)
  if (checked.ok === false) return { status: checked.status, body: { error: checked.error } }
  const msg = checked.value

  /* A script: told it worked, and nothing is written, counted or sent. */
  if (looksAutomated(raw)) return { status: 200, body: { ok: true } }

  const limited = await deps.limit(msg)
  if (limited) return { status: limited.status, body: { error: limited.error } }

  /* A creator that does not exist gets nothing written for it, and nor does
     a banned one, whose website answers as no site (lib/seo/bans.ts). Read
     whole, so a database without the ban column simply has no bans. */
  let exists = false
  try {
    const { data } = await deps.db.from("creators").select("*").eq("id", msg.creatorId).maybeSingle()
    exists = !!data && !(data as { banned_at?: string | null }).banned_at
  } catch {
    exists = false
  }
  if (!exists) return { status: 404, body: { error: "This form is not connected to a store." } }

  const where = deps.source(msg)
  const sender = await recordSender(deps.db, { creatorId: msg.creatorId, email: msg.email, name: msg.name, consent: msg.consent })
  if (sender.outcome === "subscribed" || sender.outcome === "wrote" || sender.outcome === "unchanged") {
    await deps.recordSource(msg.creatorId, msg.email, where.detail)
  }
  if (sender.outcome === "subscribed") {
    try {
      await deps.welcome(msg, where.detail)
    } catch {
      console.warn("[contact] the welcome automation did not start")
    }
  }

  const kept = await keepMessage(deps.db, msg, { site: where.site, sourceDetail: where.detail, subscriberId: sender.id })
  if (kept.kept === false && kept.why === "missing") {
    console.warn("[contact] site_contact_messages is not there yet; the message is emailed and not kept (run the contact form SQL part)")
  }

  const keptId = kept.kept ? kept.id : null
  /* The creator's notifications panel, for a message they can open (./notify.ts). Never stops the message. */
  const bell = async () => {
    if (!deps.notify) return
    try {
      await deps.notify({ creatorId: msg.creatorId, messageId: keptId, name: msg.name, email: msg.email, subject: msg.subject, message: msg.message, site: where.site })
    } catch {
      console.warn("[contact] the notification did not go")
    }
  }

  const inbox = await creatorInbox(deps.db, msg.creatorId, msg.sectionId, deps.loginEmail)
  if (!inbox) {
    console.warn("[contact] the creator has no address to send the message to")
    /* Kept, the creator reads it in Emails, and the visitor did their part.
       Neither kept nor sendable is a message nobody will ever read: say so. */
    if (kept.kept) await bell()
    return kept.kept ? { status: 200, body: { ok: true } } : { status: 502, body: { error: "The message did not send. Try again in a minute." } }
  }
  const store = await deps.brand(msg.creatorId)
  const contactUrl = sender.id ? `${deps.platform}/app/emails?contact=${encodeURIComponent(sender.id)}` : `${deps.platform}/app/emails`
  const messageUrl = keptId ? `${deps.platform}/app/emails?tab=messages&message=${encodeURIComponent(keptId)}` : null
  const mail = creatorEmail({ store, msg, site: where.site, contactUrl, messageUrl })
  let sent = false
  try {
    const out = await deps.send({ to: inbox, replyTo: msg.email, subject: mail.subject, html: mail.html, text: mail.text, fromName: `${store} website` })
    sent = out.success
  } catch {
    sent = false
  }
  if (sent && kept.kept) await markEmailed(deps.db, kept.id)
  if (!sent) console.warn("[contact] the email to the creator did not send")
  if (sent || kept.kept) await bell()

  /* Neither kept nor sent is the one outcome that loses the message. Say so. */
  if (!sent && !kept.kept) return { status: 502, body: { error: "The message did not send. Try again in a minute." } }
  return { status: 200, body: { ok: true } }
}
