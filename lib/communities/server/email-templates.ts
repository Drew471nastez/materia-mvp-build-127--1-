import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY'S OWN WORDS IN ITS EMAILS (round AG)
 * ===========================================================================
 * The owner can change three things on the emails their community sends: the
 * subject, the heading, and an opening line put before Storelib's text. One
 * row per community and kind in community_email_templates (run-now part 217),
 * read and written only on the server.
 *
 * What stays Storelib's: the button, the facts, the note on why the email came
 * and how to turn it off. So an email from a community always says what it is
 * for, whatever the owner wrote. {community} and {creator} become the
 * community's name and its owner's (lib/notify/templates/catalog.ts
 * fillCommunityWords).
 *
 * Money emails (a ticket's receipt, a refund) are never changed: what they say
 * is about someone's money, so it is Storelib's alone.
 */
import { renderEmail } from "@/lib/notify/templates"
import type { NotificationType } from "@/lib/notify/types"
import { missing, nowIso, reasonOf, type Db } from "./db"

export const EDITABLE_EMAILS = ["welcome", "join_approved", "invite", "announcement", "event_reminder", "course_available"] as const
export type EditableEmail = (typeof EDITABLE_EMAILS)[number]

export const EDITABLE_EMAIL_INFO: Record<EditableEmail, { name: string; when: string; type: NotificationType }> = {
  welcome: { name: "Welcome", when: "When someone joins", type: "COMMUNITY_WELCOME" },
  join_approved: { name: "Request approved", when: "When you approve a request to join", type: "COMMUNITY_JOIN_APPROVED" },
  invite: { name: "Invite", when: "When you invite someone by email", type: "COMMUNITY_INVITE" },
  announcement: { name: "Announcement", when: "When you post an announcement", type: "COMMUNITY_ANNOUNCEMENT" },
  event_reminder: { name: "Event reminder", when: "Before an event someone is going to", type: "COMMUNITY_EVENT_REMINDER" },
  course_available: { name: "New course", when: "When a course opens in the classroom", type: "COMMUNITY_COURSE_AVAILABLE" },
}

export interface EmailWords {
  subject: string
  heading: string
  intro: string
}

export const WORD_LIMITS = { subject: 120, heading: 120, intro: 600 } as const

export function isEditableEmail(v: unknown): v is EditableEmail {
  return typeof v === "string" && (EDITABLE_EMAILS as readonly string[]).includes(v)
}

/** One line of text: control characters out, spaces collapsed, at most `max`. */
function line(v: unknown, max: number): string {
  if (typeof v !== "string") return ""
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
}

/** What the owner sent, cleaned; an error for anything too long. Empty fields keep Storelib's words. */
export function wordsInput(body: Record<string, unknown>): EmailWords | { error: string } {
  const out: EmailWords = { subject: "", heading: "", intro: "" }
  for (const key of ["subject", "heading", "intro"] as const) {
    const raw = body[key]
    if (raw == null || raw === "") continue
    if (typeof raw !== "string") return { error: "Use text for the subject, heading and opening line." }
    if (raw.trim().length > WORD_LIMITS[key]) return { error: `Keep the ${key === "intro" ? "opening line" : key} under ${WORD_LIMITS[key]} characters.` }
    out[key] = line(raw, WORD_LIMITS[key])
  }
  return out
}

export function emptyWords(w: EmailWords | null | undefined): boolean {
  return !w || (!w.subject && !w.heading && !w.intro)
}

/** Every kind's words for one community. ready false: the table is not there yet (part 217 not run). */
export async function loadEmailWords(db: Db, communityId: string): Promise<{ ready: boolean; words: Partial<Record<EditableEmail, EmailWords>> }> {
  const { data, error } = await db.from("community_email_templates").select("kind, subject, heading, intro").eq("community_id", communityId)
  if (error) {
    if (!missing(error)) console.error(`[communities] email words read: ${reasonOf(error)}`)
    return { ready: false, words: {} }
  }
  const words: Partial<Record<EditableEmail, EmailWords>> = {}
  for (const r of (data as { kind: string; subject: string | null; heading: string | null; intro: string | null }[] | null) ?? []) {
    if (isEditableEmail(r.kind)) words[r.kind] = { subject: r.subject ?? "", heading: r.heading ?? "", intro: r.intro ?? "" }
  }
  return { ready: true, words }
}

/** Saves one kind's words; all empty puts Storelib's words back (the row goes). */
export async function saveEmailWords(db: Db, communityId: string, kind: EditableEmail, words: EmailWords, userId: string): Promise<{ ok: true } | { error: string; status: number }> {
  const done = emptyWords(words)
    ? await db.from("community_email_templates").delete().eq("community_id", communityId).eq("kind", kind)
    : await db
        .from("community_email_templates")
        .upsert({ community_id: communityId, kind, subject: words.subject || null, heading: words.heading || null, intro: words.intro || null, updated_by: userId, updated_at: nowIso() }, { onConflict: "community_id,kind" })
  if (done.error) {
    if (missing(done.error)) return { error: "Email templates need run-now part 217 in Supabase first.", status: 503 }
    console.error(`[communities] email words save: ${reasonOf(done.error)}`)
    return { error: "Could not save that. Try again.", status: 500 }
  }
  wordsCache.delete(`${communityId}:${kind}`)
  return { ok: true }
}

const wordsCache = new Map<string, { at: number; words: EmailWords | null }>()
const WORDS_TTL_MS = 60_000

/** One kind's words for sendCommunityEmail, cached a minute so a fan out reads them once. Null: Storelib's words. */
export async function emailWordsFor(db: Db, communityId: string, kind: string): Promise<EmailWords | null> {
  if (!isEditableEmail(kind)) return null
  const key = `${communityId}:${kind}`
  const hit = wordsCache.get(key)
  if (hit && Date.now() - hit.at < WORDS_TTL_MS) return hit.words
  let words: EmailWords | null = null
  try {
    const { data, error } = await db.from("community_email_templates").select("subject, heading, intro").eq("community_id", communityId).eq("kind", kind).maybeSingle()
    if (!error && data) words = { subject: data.subject ?? "", heading: data.heading ?? "", intro: data.intro ?? "" }
  } catch {
    /* Storelib's words */
  }
  wordsCache.set(key, { at: Date.now(), words })
  return words
}

/** The payload keys the catalog reads (tplSubject, tplHeading, tplIntro); nothing when the words are Storelib's. */
export function wordsPayload(words: EmailWords | null): Record<string, string> {
  if (emptyWords(words)) return {}
  return { ...(words!.subject ? { tplSubject: words!.subject } : {}), ...(words!.heading ? { tplHeading: words!.heading } : {}), ...(words!.intro ? { tplIntro: words!.intro } : {}) }
}

/** Sample facts for a preview, the same shape each kind is sent with. */
function sampleData(kind: EditableEmail): Record<string, unknown> {
  const day = new Date(Date.now() + 86_400_000).toISOString()
  switch (kind) {
    case "welcome":
      return {}
    case "join_approved":
      return { needsPayment: false }
    case "invite":
      return { inviterName: "", inviteCode: "sample", expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }
    case "announcement":
      return { postId: "sample", title: "New lessons this week", excerpt: "Three new lessons are up in the classroom.", authorName: "" }
    case "event_reminder":
      return { eventId: "sample", eventTitle: "Live Q&A", startsAt: day, timezone: "UTC", lead: "24h", online: true }
    case "course_available":
      return { courseTitle: "Mixing basics", courseProductId: "sample" }
  }
}

/** The email as a member would get it, with these words, for the editor's preview. */
export function previewEmailWords(kind: EditableEmail, words: EmailWords, community: { name: string; slug: string; creatorName: string | null }) {
  const data = { ...sampleData(kind), communityName: community.name, communitySlug: community.slug, creatorName: community.creatorName ?? "", ...wordsPayload(words) }
  const e = renderEmail(EDITABLE_EMAIL_INFO[kind].type, data, { baseUrl: "https://storelib.com", recipientName: "Sam Rivera" })
  return { subject: e.subject, preview: e.preview, html: e.html }
}

/** The owner's own email, drawn the way members get it, for the composer's preview. */
export function previewBroadcast(input: { subject: string; message: string; authorName: string }, community: { name: string; slug: string; creatorName: string | null }) {
  const e = renderEmail("COMMUNITY_BROADCAST", { subject: input.subject, message: input.message, authorName: input.authorName, communityName: community.name, communitySlug: community.slug, creatorName: community.creatorName ?? "" }, { baseUrl: "https://storelib.com", recipientName: "Sam Rivera" })
  return { subject: e.subject, preview: e.preview, html: e.html }
}
