/**
 * ===========================================================================
 *  A COMMUNITY'S OWN WORDS ON THE EMAILS IT SENDS ITS MEMBERS
 * ===========================================================================
 * Emails › Customer emails › Communities lets an owner change six parts of
 * every email their community sends, the way a store changes its order
 * emails (lib/emails/customer-custom.ts): the subject, the inbox's preview
 * text, the heading, an opening line put before Storelib's own text, the
 * button's label and a footer note. The first four are kept in
 * community_email_templates; the preview text and the footer note (round 28)
 * beside the store's own email words (lib/communities/server/email-templates.ts
 * communityExtras), so no database change was needed for them. The
 * facts (the event, the price, the dates, the card), the link and the note
 * on why the email came stay the template's own, so an email about a ticket
 * or a payment always carries the ticket or the payment.
 *
 *   saved      community_email_templates (run-now part 217; part 301 adds
 *              the ticket and paid membership kinds and the button)
 *   read by    lib/communities/server/email.ts sendCommunityEmail and
 *              lib/memberships/sync.ts (a community's paid plan), into the
 *              event as tplSubject, tplHeading, tplIntro and tplButton
 *   drawn by   lib/notify/templates/catalog.ts, which fills the values
 *
 * VALUES. {{community_name}} and the others below, in double braces, each
 * kind with its own; the older {community} and {creator} still work. An
 * unknown one is refused on save, and anything left in braces is dropped
 * when the email is drawn, so a member never reads "{{evnt_title}}".
 *
 * Pure: the browser, the server, the templates and the tests share it.
 */

export const COMMUNITY_WORD_KINDS = [
  "welcome",
  "join_approved",
  "invite",
  "event_ticket",
  "event_ticket_invite",
  "event_refund",
  "event_cancelled",
  "membership_started",
  "membership_renewed",
  "membership_renewal_reminder",
  "membership_payment_failed",
  "membership_canceled",
  "membership_plan_changed",
  "membership_ended",
] as const
export type CommunityWordKind = (typeof COMMUNITY_WORD_KINDS)[number]

/** The kinds a database before run-now part 301 can hold (its check names only these). */
export const KINDS_BEFORE_301: readonly CommunityWordKind[] = ["welcome", "join_approved", "invite"]

export function isCommunityWordKind(v: unknown): v is CommunityWordKind {
  return typeof v === "string" && (COMMUNITY_WORD_KINDS as readonly string[]).includes(v)
}

export interface CommunityWords {
  subject: string
  heading: string
  intro: string
  button: string
  /** The inbox's preview line after the subject (round 28). Empty: the email's own first line. */
  preheader?: string
  /** A line of the community's own at the foot of the email (round 28), newlines kept. Empty: none. */
  footer?: string
}

/** Every part an owner can write, in the editor's order. */
export const COMMUNITY_WORD_FIELDS = ["subject", "preheader", "heading", "intro", "button", "footer"] as const
export type CommunityWordField = (typeof COMMUNITY_WORD_FIELDS)[number]

export const COMMUNITY_WORD_LIMITS = { subject: 120, preheader: 150, heading: 120, intro: 600, button: 40, footer: 300 } as const
export const EMPTY_COMMUNITY_WORDS: CommunityWords = { subject: "", heading: "", intro: "", button: "", preheader: "", footer: "" }

export const COMMUNITY_VALUE_LABELS: Record<string, string> = {
  first_name: "Member's first name",
  community_name: "Community name",
  creator_name: "Your name",
  inviter_name: "Who invited them",
  event_title: "Event name",
  event_date: "Event date",
  amount: "Amount",
  plan_name: "Plan name",
  price: "Price",
  next_payment: "Next payment date",
  access_until: "Access until",
}

const BASE = ["first_name", "community_name", "creator_name"]

const VALUES: Record<CommunityWordKind, string[]> = {
  welcome: BASE,
  join_approved: BASE,
  /* Somebody invited by address may have no account yet, so no first name. */
  invite: ["community_name", "creator_name", "inviter_name"],
  event_ticket: [...BASE, "event_title", "event_date", "amount"],
  event_ticket_invite: [...BASE, "event_title", "event_date", "inviter_name"],
  event_refund: [...BASE, "event_title", "amount"],
  event_cancelled: [...BASE, "event_title", "event_date", "amount"],
  membership_started: [...BASE, "plan_name", "price", "next_payment"],
  membership_renewed: [...BASE, "plan_name", "amount", "next_payment"],
  membership_renewal_reminder: [...BASE, "plan_name", "price", "next_payment"],
  membership_payment_failed: [...BASE, "plan_name", "amount"],
  membership_canceled: [...BASE, "plan_name", "access_until"],
  membership_plan_changed: [...BASE, "plan_name", "price", "next_payment"],
  membership_ended: [...BASE, "plan_name"],
}

/** The values one kind fills in, in the order the editor offers them. */
export function communityValuesFor(kind: string | null | undefined): Array<{ key: string; label: string }> {
  const keys = isCommunityWordKind(kind) ? VALUES[kind] : BASE
  return keys.map((key) => ({ key, label: COMMUNITY_VALUE_LABELS[key] ?? key }))
}

/**
 * What each kind says when the owner changed nothing, written with the same
 * values: the editor shows these as the hint in each empty field. The
 * templates draw these words for the usual case and say a little more on
 * their own when the facts call for it (a free trial, a paid request).
 */
export const COMMUNITY_DEFAULT_WORDS: Record<CommunityWordKind, CommunityWords> = {
  welcome: { subject: "Welcome to {{community_name}}", heading: "Welcome to {{community_name}}", intro: "", button: "Open the community" },
  join_approved: { subject: "You can join {{community_name}} now", heading: "Your request was approved", intro: "", button: "Open the community" },
  invite: { subject: "You are invited to {{community_name}}", heading: "Join {{community_name}}", intro: "", button: "Accept the invite" },
  event_ticket: { subject: "Your ticket for {{event_title}}", heading: "You are going to {{event_title}}", intro: "", button: "Open the event" },
  event_ticket_invite: { subject: "You have a ticket for {{event_title}}", heading: "Your seat at {{event_title}}", intro: "", button: "Open the event" },
  event_refund: { subject: "Refunded: your ticket for {{event_title}}", heading: "{{amount}} is on its way back", intro: "", button: "See the event" },
  event_cancelled: { subject: "Cancelled: {{event_title}}", heading: "{{event_title}} is cancelled", intro: "", button: "See what else is on" },
  membership_started: { subject: "You are a member of {{plan_name}}", heading: "Welcome to {{plan_name}}", intro: "", button: "Open your membership" },
  membership_renewed: { subject: "{{amount}} for {{plan_name}}", heading: "Your membership renewed", intro: "", button: "Open your membership" },
  membership_renewal_reminder: { subject: "{{plan_name}} renews on {{next_payment}}", heading: "Your membership renews on {{next_payment}}", intro: "", button: "Manage your membership" },
  membership_payment_failed: { subject: "Your payment for {{plan_name}} did not go through", heading: "Your payment did not go through", intro: "", button: "Update your card" },
  membership_canceled: { subject: "{{plan_name}} ends on {{access_until}}", heading: "Your membership ends on {{access_until}}", intro: "", button: "Open your membership" },
  membership_plan_changed: { subject: "You're now on {{plan_name}}", heading: "You're now on {{plan_name}}", intro: "", button: "Open your membership" },
  membership_ended: { subject: "Your membership of {{plan_name}} has ended", heading: "Your membership has ended", intro: "", button: "See your memberships" },
}

const DOUBLE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
const LEGACY = /\{\s*(community|creator)\s*\}/gi

/** Values in a text that this kind cannot fill in. The older {community} and {creator} are always known. */
export function unknownCommunityValues(kind: string, text: string): string[] {
  const known = new Set(communityValuesFor(kind).map((v) => v.key))
  const out = new Set<string>()
  for (const m of text.matchAll(DOUBLE)) if (!known.has(m[1])) out.add(m[1])
  return [...out]
}

/** One line of text: control characters out, spaces collapsed, at most `max`. */
function oneLine(v: unknown, max: number): string {
  if (typeof v !== "string") return ""
  // eslint-disable-next-line no-control-regex
  return v.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
}

/**
 * What the owner sent for one kind, cleaned; an error for anything too long
 * or a value the kind does not have. Empty fields keep Storelib's words.
 */
export function readCommunityWords(kind: string, body: Record<string, unknown>): CommunityWords | { error: string } {
  const out: CommunityWords = { ...EMPTY_COMMUNITY_WORDS }
  for (const key of COMMUNITY_WORD_FIELDS) {
    const raw = body?.[key]
    if (raw == null || raw === "") continue
    if (typeof raw !== "string") return { error: "Use text for the subject, preview text, heading, opening line, button and footer note." }
    const name = key === "intro" ? "opening line" : key === "preheader" ? "preview text" : key === "footer" ? "footer note" : key
    if (raw.trim().length > COMMUNITY_WORD_LIMITS[key]) return { error: `Keep the ${name} under ${COMMUNITY_WORD_LIMITS[key]} characters.` }
    const text = key === "footer" ? lines(raw, COMMUNITY_WORD_LIMITS.footer) : oneLine(raw, COMMUNITY_WORD_LIMITS[key])
    const bad = unknownCommunityValues(kind, text)
    if (bad.length) return { error: `{{${bad[0]}}} isn't one of this email's values. Use ${communityValuesFor(kind).map((v) => `{{${v.key}}}`).join(", ")}.` }
    /* The hint, typed out as it is, is Storelib's words: nothing to save. */
    if (isCommunityWordKind(kind) && key !== "preheader" && key !== "footer" && text === COMMUNITY_DEFAULT_WORDS[kind][key]) continue
    out[key] = text
  }
  return out
}

export function noCommunityWords(w: Partial<CommunityWords> | null | undefined): boolean {
  return !w || (!w.subject && !w.heading && !w.intro && !w.button && !w.preheader && !w.footer)
}

/** A few lines of text: tags and control characters out, each line's spaces collapsed, blank lines kept to one, at most `max`. */
function lines(v: string, max: number): string {
  return (
    v
      .replace(/<[^>]*>/g, "")
      .replace(/\r\n?/g, "\n")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, max)
  )
}

/**
 * A text with its values filled in, plain text. The older {community} and
 * {creator} first; a value with nothing to say reads as the kind's own
 * fallback ("there", "the community"), and an unknown one is dropped.
 */
export function fillCommunityValues(text: string, vars: Record<string, string | null | undefined>): string {
  const value = (key: string) => {
    const v = (vars[key] ?? "").toString().replace(/\s+/g, " ").trim()
    if (v) return v
    if (key === "first_name") return "there"
    if (key === "community_name") return "the community"
    if (key === "creator_name" || key === "inviter_name") return "the team"
    return ""
  }
  return text
    .replace(DOUBLE, (_m, key: string) => (key in COMMUNITY_VALUE_LABELS ? value(key) : ""))
    .replace(LEGACY, (_m, key: string) => value(key.toLowerCase() === "community" ? "community_name" : "creator_name"))
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

/*
  THE PREVIEW TEXT AND THE FOOTER NOTE, KEPT BESIDE THE STORE'S OWN WORDS
  (round 28). community_email_templates has a column for each of the first
  four parts; rather than a database change, these two are kept in the
  owner's store_settings.customer_emails under COMMUNITY_EXTRAS_KEY, by
  community and kind. lib/emails/customer-custom.ts readSavedCopy ignores the
  key, and saving the store's words keeps it (customer-copy-server.ts).
*/
export const COMMUNITY_EXTRAS_KEY = "_communities"
export type CommunityExtras = { preheader?: string; footer?: string }

/** One community's extras out of a stored customer_emails object, cleaned. */
export function readCommunityExtras(raw: unknown, communityId: string): Partial<Record<CommunityWordKind, CommunityExtras>> {
  const all = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[COMMUNITY_EXTRAS_KEY] : null
  const mine = all && typeof all === "object" ? (all as Record<string, unknown>)[communityId] : null
  const out: Partial<Record<CommunityWordKind, CommunityExtras>> = {}
  if (!mine || typeof mine !== "object") return out
  for (const [kind, v] of Object.entries(mine as Record<string, unknown>)) {
    if (!isCommunityWordKind(kind) || !v || typeof v !== "object") continue
    const e = v as Record<string, unknown>
    const pre = typeof e.preheader === "string" ? oneLine(e.preheader, COMMUNITY_WORD_LIMITS.preheader) : ""
    const foot = typeof e.footer === "string" ? lines(e.footer, COMMUNITY_WORD_LIMITS.footer) : ""
    if ((pre && !unknownCommunityValues(kind, pre).length) || (foot && !unknownCommunityValues(kind, foot).length)) {
      out[kind] = { ...(pre && !unknownCommunityValues(kind, pre).length ? { preheader: pre } : {}), ...(foot && !unknownCommunityValues(kind, foot).length ? { footer: foot } : {}) }
    }
  }
  return out
}

/** The stored object with one community's kind's extras replaced (or taken out when empty); everything else as it was. */
export function withCommunityExtras(raw: unknown, communityId: string, kind: CommunityWordKind, extras: CommunityExtras): Record<string, unknown> {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
  const all = { ...((base[COMMUNITY_EXTRAS_KEY] as Record<string, unknown> | undefined) ?? {}) }
  const mine = { ...((all[communityId] as Record<string, unknown> | undefined) ?? {}) }
  const kept: CommunityExtras = { ...(extras.preheader ? { preheader: extras.preheader } : {}), ...(extras.footer ? { footer: extras.footer } : {}) }
  if (Object.keys(kept).length) mine[kind] = kept
  else delete mine[kind]
  if (Object.keys(mine).length) all[communityId] = mine
  else delete all[communityId]
  if (Object.keys(all).length) base[COMMUNITY_EXTRAS_KEY] = all
  else delete base[COMMUNITY_EXTRAS_KEY]
  return base
}
