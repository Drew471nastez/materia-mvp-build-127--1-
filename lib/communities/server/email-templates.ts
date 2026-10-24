import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY'S OWN WORDS IN ITS EMAILS, AND ITS NAME ON EVERY ONE
 * ===========================================================================
 * The owner can change four things on every email their community sends a
 * member: the subject, the heading, an opening line put before Storelib's
 * text, and the button's label (lib/emails/community-words.ts holds the
 * kinds, the values each can name and the checks). One row per community and
 * kind in community_email_templates (run-now part 217; part 301 adds the
 * ticket and paid membership kinds and the button), read and written only on
 * the server.
 *
 *   welcome, join_approved, invite          sent by ./email.ts
 *   event_ticket, event_ticket_invite,      sent by ./email.ts from the
 *   event_refund, event_cancelled           ticket jobs
 *   membership_started ... membership_ended a paid plan's emails, sent by the
 *                                           memberships engine
 *                                           (lib/memberships/sync.ts)
 *
 * What stays Storelib's: the facts (the event, what was paid, the dates, the
 * card), the link and the note on why the email came. So an email about a
 * ticket or a payment always carries the ticket or the payment, whatever the
 * owner wrote.
 *
 * EVERY EMAIL IS THE COMMUNITY'S (communityBrand): its name in the From line
 * and on top, its picture beside the name, Reply-To its contact address (else
 * the owner's support address), its links on its own domain once that is
 * live, and its name in the footer. The address it is sent from stays
 * Storelib's verified one.
 */
import { renderEmail } from "@/lib/notify/templates"
import { safeData } from "@/lib/notify/workflows/common"
import { baseUrl } from "@/lib/notify/urls"
import type { NotificationType } from "@/lib/notify/types"
import {
  COMMUNITY_WORD_KINDS,
  EMPTY_COMMUNITY_WORDS,
  KINDS_BEFORE_301,
  isCommunityWordKind,
  noCommunityWords,
  readCommunityWords,
  type CommunityWordKind,
  type CommunityWords,
} from "@/lib/emails/community-words"
import { missing, nowIso, reasonOf, type Db } from "./db"

/* Every kind a community can put its words on: each is an email a member really gets. An announcement, an event
   reminder and a new course were listed once and are never emails (lib/notify/email-budget.ts: "never", the bell and
   the phone only); rows saved for them stay in community_email_templates untouched, and nothing reads them. */
export const EDITABLE_EMAILS = COMMUNITY_WORD_KINDS
export type EditableEmail = CommunityWordKind

/** The notification each kind is drawn by. */
export const EDITABLE_EMAIL_TYPES: Record<EditableEmail, NotificationType> = {
  welcome: "COMMUNITY_WELCOME",
  join_approved: "COMMUNITY_JOIN_APPROVED",
  invite: "COMMUNITY_INVITE",
  event_ticket: "COMMUNITY_EVENT_TICKET",
  event_ticket_invite: "COMMUNITY_EVENT_TICKET_INVITE",
  event_refund: "COMMUNITY_EVENT_REFUND",
  event_cancelled: "COMMUNITY_EVENT_CANCELLED",
  membership_started: "MEMBERSHIP_STARTED",
  membership_renewed: "MEMBERSHIP_RENEWED",
  membership_renewal_reminder: "MEMBERSHIP_RENEWAL_REMINDER",
  membership_payment_failed: "MEMBERSHIP_PAYMENT_FAILED",
  membership_canceled: "MEMBERSHIP_CANCELED",
  membership_plan_changed: "MEMBERSHIP_PLAN_CHANGED",
  membership_ended: "MEMBERSHIP_ENDED",
}

/** The membership kind a membership event is (lib/memberships/sync.ts), for the community's words on it. */
export const MEMBERSHIP_WORD_KIND: Record<string, EditableEmail> = {
  "membership.started": "membership_started",
  "membership.renewed": "membership_renewed",
  "membership.renewal_upcoming": "membership_renewal_reminder",
  "membership.payment_failed": "membership_payment_failed",
  "membership.canceled": "membership_canceled",
  "membership.plan_changed": "membership_plan_changed",
  "membership.ended": "membership_ended",
}

export type EmailWords = CommunityWords

export const WORD_LIMITS = { subject: 120, heading: 120, intro: 600, button: 40 } as const

export function isEditableEmail(v: unknown): v is EditableEmail {
  return isCommunityWordKind(v)
}

/** What the owner sent for one kind, cleaned; an error for anything too long or a value that kind has not got. Empty fields keep Storelib's words. */
export function wordsInput(body: Record<string, unknown>, kind: string = "welcome"): EmailWords | { error: string } {
  return readCommunityWords(kind, body)
}

export function emptyWords(w: EmailWords | null | undefined): boolean {
  return noCommunityWords(w)
}

type Row = { kind: string; subject: string | null; heading: string | null; intro: string | null; button?: string | null }

const asWords = (r: Partial<Row> | null | undefined): EmailWords => ({ subject: r?.subject ?? "", heading: r?.heading ?? "", intro: r?.intro ?? "", button: r?.button ?? "" })

/** Reads with the button, and without it on a database before part 301 (no column yet). */
async function readRows(db: Db, communityId: string, kind?: string): Promise<{ data: Row[] | null; error: { code?: string; message?: string } | null }> {
  const run = (columns: string) => {
    let q = db.from("community_email_templates").select(columns).eq("community_id", communityId)
    if (kind) q = q.eq("kind", kind)
    return q
  }
  const first = await run("kind, subject, heading, intro, button")
  if (!first.error) return { data: (first.data as Row[] | null) ?? [], error: null }
  if (first.error.code === "42703" || /button/i.test(first.error.message ?? "")) {
    const old = await run("kind, subject, heading, intro")
    return { data: (old.data as Row[] | null) ?? [], error: old.error ?? null }
  }
  return { data: null, error: first.error }
}

/** Every kind's words for one community. ready false: the table is not there yet (part 217 not run). */
export async function loadEmailWords(db: Db, communityId: string): Promise<{ ready: boolean; words: Partial<Record<EditableEmail, EmailWords>> }> {
  const { data, error } = await readRows(db, communityId)
  if (error) {
    if (!missing(error)) console.error(`[communities] email words read: ${reasonOf(error)}`)
    return { ready: false, words: {} }
  }
  const words: Partial<Record<EditableEmail, EmailWords>> = {}
  for (const r of data ?? []) if (isEditableEmail(r.kind)) words[r.kind] = asWords(r)
  return { ready: true, words }
}

/** Saves one kind's words; all empty puts Storelib's words back (the row goes). */
export async function saveEmailWords(db: Db, communityId: string, kind: EditableEmail, words: EmailWords, userId: string): Promise<{ ok: true } | { error: string; status: number }> {
  const row: Record<string, unknown> = { community_id: communityId, kind, subject: words.subject || null, heading: words.heading || null, intro: words.intro || null, button: words.button || null, updated_by: userId, updated_at: nowIso() }
  const write = (r: Record<string, unknown>) => db.from("community_email_templates").upsert(r, { onConflict: "community_id,kind" })
  let done = emptyWords(words) ? await db.from("community_email_templates").delete().eq("community_id", communityId).eq("kind", kind) : await write(row)
  /* The button's column comes with part 301. Before it, the welcome, an approved request and an invite still save their other words (there is no button to keep). */
  if (done.error && !words.button && KINDS_BEFORE_301.includes(kind) && (done.error.code === "42703" || done.error.code === "PGRST204")) {
    const { button: _none, ...older } = row
    void _none
    done = await write(older)
  }
  if (done.error) {
    const code = done.error.code
    /* 23514: the kind is not in the part 217 check yet. 42703 / PGRST204: no button column yet. */
    if (code === "23514" || code === "42703" || code === "PGRST204") return { error: "Saving words on this email needs run-now part 301 in Supabase first.", status: 503 }
    if (missing(done.error)) return { error: "Email templates need run-now part 217 in Supabase first.", status: 503 }
    console.error(`[communities] email words save: ${reasonOf(done.error)}`)
    return { error: "Could not save that. Try again.", status: 500 }
  }
  wordsCache.delete(`${communityId}:${kind}`)
  return { ok: true }
}

const wordsCache = new Map<string, { at: number; words: EmailWords | null }>()
const WORDS_TTL_MS = 60_000

/** One kind's words for the sender, cached a minute so a fan out reads them once. Null: Storelib's words. */
export async function emailWordsFor(db: Db, communityId: string, kind: string): Promise<EmailWords | null> {
  if (!isEditableEmail(kind)) return null
  const key = `${communityId}:${kind}`
  const hit = wordsCache.get(key)
  if (hit && Date.now() - hit.at < WORDS_TTL_MS) return hit.words
  let words: EmailWords | null = null
  try {
    const { data, error } = await readRows(db, communityId, kind)
    if (!error && data && data[0]) words = asWords(data[0])
  } catch {
    /* Storelib's words */
  }
  wordsCache.set(key, { at: Date.now(), words })
  return words
}

/** The payload keys the catalog reads (tplSubject, tplHeading, tplIntro, tplButton); nothing when the words are Storelib's. */
export function wordsPayload(words: EmailWords | null): Record<string, string> {
  if (!words || emptyWords(words)) return {}
  return {
    ...(words.subject ? { tplSubject: words.subject } : {}),
    ...(words.heading ? { tplHeading: words.heading } : {}),
    ...(words.intro ? { tplIntro: words.intro } : {}),
    ...(words.button ? { tplButton: words.button } : {}),
  }
}

/** A sample membership's facts, for a paid plan's previews. */
function sampleMembership(currency: string): Record<string, unknown> {
  const month = new Date(Date.now() + 30 * 86_400_000).toISOString()
  return { membershipId: "00000000-0000-4000-8000-000000000001", membershipTitle: "Members", amountCents: 1500, currency, interval: "month", periodEnd: month, cardLast4: "4242" }
}

/** Sample facts for a preview, the same shape each kind is sent with. */
function sampleData(kind: EditableEmail, currency: string): Record<string, unknown> {
  const day = new Date(Date.now() + 86_400_000).toISOString()
  const event = { eventId: "sample", eventTitle: "Live Q&A", startsAt: day, timezone: "UTC", online: true, amountCents: 1500, currency }
  const plan = sampleMembership(currency)
  switch (kind) {
    case "welcome":
      return { memberName: "Maria" }
    case "join_approved":
      return { needsPayment: false, memberName: "Maria" }
    case "invite":
      return { inviterName: "", inviteCode: "sample", expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }
    case "event_ticket":
      return { ...event, ticketSource: "purchase", paidAt: new Date().toISOString(), memberName: "Maria" }
    case "event_ticket_invite":
      return { ...event, amountCents: 0, priceCents: 1500, inviterName: "", memberName: "Maria" }
    case "event_refund":
      return { ...event, refundedAt: new Date().toISOString(), byHolder: false, memberName: "Maria" }
    case "event_cancelled":
      return { ...event, refundedAt: new Date().toISOString(), memberName: "Maria" }
    case "membership_started":
      return { ...plan, memberName: "Maria" }
    case "membership_renewed":
      return { ...plan, invoiceId: "sample", memberName: "Maria" }
    case "membership_renewal_reminder":
      return { ...plan, memberName: "Maria" }
    case "membership_payment_failed":
      return { ...plan, graceEndsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), memberName: "Maria" }
    case "membership_canceled":
      return { ...plan, endsAt: plan.periodEnd, memberName: "Maria" }
    case "membership_plan_changed":
      return { ...plan, fromTitle: "Free", changeKind: "tier", memberName: "Maria" }
    case "membership_ended":
      return { ...plan, memberName: "Maria" }
  }
}

export interface CommunityFactsForEmail {
  name: string
  slug: string
  creatorName: string | null
  /** The community's picture (communities.logo_url), the address replies go to, and its own domain once it is live. */
  logoUrl?: string | null
  replyTo?: string | null
  host?: string | null
}

/**
 * WHO THE EMAIL IS FROM (lib/notify/templates BRAND_KEYS): the community by
 * its name, its picture, its reply address and its own domain. Read by every
 * email a community sends, the membership emails of its paid plan and its
 * refunds, so none of them goes out as Storelib's or as the owner's own.
 */
export function communityBrand(community: CommunityFactsForEmail): Record<string, string> {
  const name = (community.name ?? "").replace(/\s+/g, " ").trim()
  if (!name) return {}
  return {
    brandName: name,
    brandKind: "community",
    brandPicture: "mark",
    ...(community.slug ? { brandSlug: community.slug } : {}),
    ...(community.logoUrl ? { brandLogoUrl: community.logoUrl } : {}),
    ...(community.replyTo ? { brandReplyTo: community.replyTo } : {}),
    ...(community.host ? { brandHost: community.host } : {}),
  }
}

/**
 * WHAT A COMMUNITY EMAIL'S TEMPLATE IS HANDED, built one way for the email and
 * for its preview: the facts of the email, then the community's own name,
 * address, owner and brand, then the community's words. ./email.ts
 * sendCommunityEmail puts exactly this in the event (with the address and the
 * key), and the engine hands it to the template.
 */
export function communityEmailPayload(data: Record<string, unknown>, communityId: string, community: CommunityFactsForEmail, words: Record<string, string>): Record<string, unknown> {
  return {
    ...data,
    communityId,
    communityName: community.name,
    communitySlug: community.slug,
    ...(community.creatorName ? { creatorName: community.creatorName } : {}),
    ...communityBrand(community),
    ...words,
  }
}

/**
 * The email as a member gets it: the template the engine sends with
 * (lib/notify/templates renderEmail), the payload the sender builds
 * (communityEmailPayload), the job's own data (safeData), and the context the
 * email channel draws in for a member (lib/notify/channels/email.ts: Storelib's
 * base address, no name, no unsubscribe link on an email a member must get).
 */
export function renderCommunityEmail(kind: EditableEmail | "broadcast", data: Record<string, unknown>, communityId: string, community: CommunityFactsForEmail, words: EmailWords | null) {
  const type: NotificationType = kind === "broadcast" ? "COMMUNITY_BROADCAST" : EDITABLE_EMAIL_TYPES[kind]
  const payload = communityEmailPayload(data, communityId, community, kind === "broadcast" ? {} : wordsPayload(words))
  return renderEmail(type, safeData(payload, { communityId }), { baseUrl: baseUrl(), recipientName: null, unsubscribeUrl: null, preferencesUrl: null, when: null })
}

/** The email as a member would get it, with these words, for the editor's preview and its test. */
export function previewEmailWords(kind: EditableEmail, words: EmailWords, community: CommunityFactsForEmail & { id?: string; currency?: string }) {
  const e = renderCommunityEmail(kind, sampleData(kind, community.currency || "USD"), community.id ?? "00000000-0000-4000-8000-000000000000", community, words)
  return { subject: e.subject, preview: e.preview, html: e.html, text: e.text, fromName: e.fromName ?? null, replyTo: e.replyTo ?? null }
}

/** The owner's own email, drawn the way members get it, for the composer's preview. */
export function previewBroadcast(input: { subject: string; message: string; authorName: string }, community: CommunityFactsForEmail & { id?: string }) {
  const e = renderCommunityEmail("broadcast", { subject: input.subject, message: input.message, authorName: input.authorName }, community.id ?? "00000000-0000-4000-8000-000000000000", community, null)
  return { subject: e.subject, preview: e.preview, html: e.html }
}

/** The facts an email is branded with, read for one community on the server (the preview and test routes). */
export async function communityEmailFacts(db: Db, community: { id: string; name: string; slug: string; creator_id: string | null; logo_url?: string | null }): Promise<CommunityFactsForEmail & { id: string }> {
  let creatorName: string | null = null
  let support: string | null = null
  if (community.creator_id) {
    const { data } = await db.from("creators").select("display_name, username").eq("id", community.creator_id).maybeSingle()
    creatorName = (data?.display_name as string | null) || (data?.username as string | null) || null
    try {
      const { data: s } = await db.from("creators").select("support_email").eq("id", community.creator_id).maybeSingle()
      support = typeof s?.support_email === "string" && s.support_email.includes("@") ? s.support_email.trim() : null
    } catch {
      support = null
    }
  }
  let contact: string | null = null
  let logo: string | null = community.logo_url ?? null
  try {
    const { data } = await db.from("communities").select("contact_email, logo_url").eq("id", community.id).maybeSingle()
    contact = typeof data?.contact_email === "string" && data.contact_email.includes("@") ? data.contact_email.trim() : null
    logo = logo ?? ((data?.logo_url as string | null) || null)
  } catch {
    /* before part 101 */
  }
  if (!logo) {
    const { data } = await db.from("communities").select("logo_url").eq("id", community.id).maybeSingle()
    logo = (data?.logo_url as string | null) || null
  }
  let host: string | null = null
  try {
    const { communityDomainHost } = await import("@/lib/custom-domains/community-server")
    host = await communityDomainHost(community.id)
  } catch {
    host = null
  }
  return { id: community.id, name: community.name, slug: community.slug, creatorName, logoUrl: logo, replyTo: contact || support, host }
}

export { EMPTY_COMMUNITY_WORDS }
