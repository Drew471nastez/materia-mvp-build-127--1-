import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY EMAIL, THROUGH STORELIB'S NOTIFICATION ENGINE
 * ===========================================================================
 * sendCommunityEmail is the one way community code sends an email: the
 * welcome, an approved request, an invite, an announcement, an event
 * reminder, a course that opened in the classroom. It decides whether the
 * person should hear it, then raises one `community.*` event in the outbox
 * (lib/notify/outbox.ts, notification_events); the engine plans the job
 * (lib/notify/workflows/communities.ts), draws the email
 * (lib/notify/templates/catalog.ts) and sends it, with the suppression list,
 * the daily cap on optional email and retries it gives every email.
 *
 * ONCE PER KEY. The event's key is the kind, the community, the recipient and
 * the caller's own key, so the same announcement told to the same member
 * twice (a job that ran again, a retried request) is one email: the second
 * call answers "duplicate".
 *
 * WHO HEARS WHAT.
 *   welcome, announcement, event_reminder, course_available
 *                     an active member of the community, found by userId
 *   announcement      only while the member's email_announcements is on
 *   event_reminder    only while the member's email_events is on
 *   join_approved     the person whose request it was, active or approved
 *                     and waiting to pay
 *   event_ticket_invite
 *                     an active member a free ticket was given to
 *   event_ticket, event_refund, event_cancelled
 *                     a ticket holder, whatever their switches say and
 *                     whatever state their membership is in: it is money
 *   invite            an address (email), member or not
 *   broadcast         an active member who keeps email_announcements on: the
 *                     owner's own email (./broadcasts.ts), at most one a day
 *   report_digest     an active member, once a day at most per community,
 *                     about new reports (jobs/report_digest.ts checks the
 *                     role and the person's own switch first)
 * Nothing is sent while the communities switch is off, or for a community
 * that is suspended or deleted. NEVER one email per feed post: only an
 * announcement, which a moderator chose to make, is emailed.
 *
 * Answers "queued" (a new event), "duplicate" (this key was raised before)
 * or "unavailable" (nothing was raised: the switch is off, the person is not
 * a member who wants this, has no address, or the outbox could not be
 * written). Never throws: an email must never break the action it follows.
 */
import { storeOf } from "@/lib/notify/store"
import type { DomainEventName } from "@/lib/notify/types"
import { communitiesEnabled } from "../flag"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { communityEmailPayload, emailWordsFor, wordsPayload } from "./email-templates"

export const COMMUNITY_EMAIL_KINDS = ["welcome", "announcement", "event_reminder", "invite", "course_available", "join_approved", "report_digest", "event_ticket", "event_ticket_invite", "event_refund", "event_cancelled", "broadcast"] as const
export type CommunityEmailKind = (typeof COMMUNITY_EMAIL_KINDS)[number]

export type CommunityEmailOutcome = "queued" | "duplicate" | "unavailable"

export interface CommunityEmailInput {
  /** The member, for every kind but an invite. Their address is read on the server. */
  userId?: string
  /** An address, for an invite to somebody who may have no account. */
  email?: string
  communityId: string
  /**
   * What the template shows (lib/notify/templates/catalog.ts DATA_KEYS):
   * announcement { postId, title, excerpt, authorName }, event_reminder
   * { eventId, eventTitle, startsAt, endsAt, timezone, lead: "24h" | "1h",
   * location, online }, course_available { courseTitle, courseProductId },
   * invite { inviterName, inviteCode, tagline, expiresAt }, join_approved
   * { needsPayment, priceLine }, welcome { welcomeText }. Strings, numbers
   * and booleans only; the community's own name and address are added here.
   */
  data: Record<string, unknown>
  /** Once per key, per recipient: "announcement:<postId>", "event:<eventId>:24h". */
  key: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,24}$/i

/**
 * A TICKET IS MONEY ADDRESSED TO THE PERSON, so a receipt, a refund and an
 * event called off are sent whatever the member asked to hear and whatever
 * state their membership is in; the row only has to say they belong to this
 * community. A free ticket somebody gave them is for a member who is in.
 */
const MONEY_KINDS: readonly CommunityEmailKind[] = ["event_ticket", "event_refund", "event_cancelled"]

/** Kinds sent only to an active member, and the member's own switch for each, when it has one. */
const MEMBER_ONLY: Partial<Record<CommunityEmailKind, "email_announcements" | "email_events" | null>> = {
  welcome: null,
  announcement: "email_announcements",
  event_reminder: "email_events",
  course_available: null,
  report_digest: null,
  event_ticket_invite: null,
  /* Round AG: the owner's own email (./broadcasts.ts) goes to members who keep community emails on, like an announcement. */
  broadcast: "email_announcements",
}

/** "welcome" or "community.welcome", as the kind it is. */
export function communityEmailKind(value: unknown): CommunityEmailKind | null {
  if (typeof value !== "string") return null
  const k = value.startsWith("community.") ? value.slice("community.".length) : value
  return (COMMUNITY_EMAIL_KINDS as readonly string[]).includes(k) ? (k as CommunityEmailKind) : null
}

/** The outbox key: the kind, the community, the recipient and the caller's key. */
export function communityEmailKey(kind: CommunityEmailKind, communityId: string, recipient: string, key: string): string {
  return `community.${kind}:${communityId}:${recipient}:${key}`.slice(0, 480)
}

/** Strings, numbers and booleans only, short, so a payload never carries an object or a secret by accident. */
function plainData(data: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) continue
    if (typeof v === "string") out[k] = v.slice(0, k === "message" ? 4000 : 1000)
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v
    else if (typeof v === "boolean") out[k] = v
  }
  return out
}

interface CommunityFacts {
  name: string
  slug: string
  creatorName: string | null
  open: boolean
}

const factsCache = new Map<string, { at: number; facts: CommunityFacts | null }>()
const FACTS_TTL_MS = 60_000

/** The community's name, address and owner's name, cached a minute: a fan out asks once, not ten thousand times. */
async function communityFacts(db: Db, communityId: string): Promise<CommunityFacts | null> {
  const hit = factsCache.get(communityId)
  if (hit && Date.now() - hit.at < FACTS_TTL_MS) return hit.facts
  const { data, error } = await db.from("communities").select("id, name, slug, status, creator_id, suspended_at, deleted_at").eq("id", communityId).maybeSingle()
  if (error) throw error
  let facts: CommunityFacts | null = null
  if (data) {
    let creatorName: string | null = null
    if (data.creator_id) {
      const { data: c } = await db.from("creators").select("display_name, username").eq("id", data.creator_id).maybeSingle()
      creatorName = (c?.display_name as string | null) || (c?.username as string | null) || null
    }
    facts = { name: data.name, slug: data.slug, creatorName, open: !data.deleted_at && !data.suspended_at && data.status !== "suspended" }
  }
  factsCache.set(communityId, { at: Date.now(), facts })
  return facts
}

/** The login address of an account: auth first (it is current), profiles.email otherwise. */
async function addressOf(db: Db, userId: string): Promise<string | null> {
  try {
    const got = db.auth?.admin?.getUserById ? await db.auth.admin.getUserById(userId) : null
    const email = got?.data?.user?.email
    if (typeof email === "string" && EMAIL.test(email)) return email.toLowerCase()
  } catch {
    /* profiles.email below */
  }
  const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle()
  const email = data?.email
  return typeof email === "string" && EMAIL.test(email) ? email.toLowerCase() : null
}

export async function sendCommunityEmail(
  db: Db,
  kindIn: CommunityEmailKind | `community.${CommunityEmailKind}`,
  input: CommunityEmailInput,
  opts: { soon?: boolean; enabled?: boolean } = {},
): Promise<CommunityEmailOutcome> {
  const kind = communityEmailKind(kindIn)
  const key = typeof input?.key === "string" ? input.key.trim() : ""
  if (!kind || !key || !UUID.test(input?.communityId ?? "")) return "unavailable"
  try {
    if (!(opts.enabled ?? (await communitiesEnabled()))) return "unavailable"
    const community = await communityFacts(db, input.communityId)
    if (!community || !community.open) return "unavailable"

    let recipientEmail: string | null = null
    let recipient: string
    if (kind === "invite") {
      const email = (input.email ?? "").trim().toLowerCase()
      if (!EMAIL.test(email)) return "unavailable"
      recipientEmail = email
      recipient = `e:${email}`
    } else {
      const userId = input.userId ?? ""
      if (!UUID.test(userId)) return "unavailable"
      const { data: member, error } = await db
        .from("community_members")
        .select("status, email_announcements, email_events")
        .eq("community_id", input.communityId)
        .eq("user_id", userId)
        .maybeSingle()
      if (error) {
        if (!missing(error)) console.error(`[communities] email ${kind} member read: ${reasonOf(error)}`)
        return "unavailable"
      }
      if (!member) return "unavailable"
      if (kind === "join_approved") {
        if (member.status !== "active" && member.status !== "pending") return "unavailable"
      } else if (MONEY_KINDS.includes(kind)) {
        /* Nothing to check here: they paid, so they hear about their own money. */
      } else if (kind in MEMBER_ONLY) {
        if (member.status !== "active") return "unavailable"
        const wish = MEMBER_ONLY[kind]
        if (wish && member[wish] === false) return "unavailable"
      }
      recipientEmail = await addressOf(db, userId)
      if (!recipientEmail) return "unavailable"
      recipient = `u:${userId}`
    }

    /* Round AG: the owner's own subject, heading and opening line for this kind, when they wrote any (./email-templates.ts). */
    const words = wordsPayload(await emailWordsFor(db, input.communityId, kind))
    const result = await storeOf(db).insertEvent({
      name: `community.${kind}` as DomainEventName,
      key: communityEmailKey(kind, input.communityId, recipient, key),
      userId: kind === "invite" ? null : (input.userId ?? null),
      entityType: "community",
      entityId: input.communityId,
      /* The same payload its preview in Emails draws (./email-templates.ts communityEmailPayload), with the address and the key. */
      payload: {
        ...communityEmailPayload(plainData(input.data), input.communityId, community, words),
        recipientEmail,
        dedupeKey: key.slice(0, 200),
      },
      occurredAt: nowIso(),
      correlationId: null,
    })
    if (result.status === "unavailable") return "unavailable"
    if (result.status === "duplicate") return "duplicate"
    if (opts.soon !== false) {
      try {
        const { processSoon } = await import("@/lib/notify/worker")
        processSoon()
      } catch {
        /* the notify cron sends it within five minutes */
      }
    }
    return "queued"
  } catch (e) {
    console.error(`[communities] email ${kind} ${key}: ${reasonOf(e)}`)
    return "unavailable"
  }
}
