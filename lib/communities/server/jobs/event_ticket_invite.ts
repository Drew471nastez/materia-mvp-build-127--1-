import "server-only"

/**
 * ===========================================================================
 *  A FREE SEAT, GIVEN BY THE PEOPLE WHO RUN THE COMMUNITY
 * ===========================================================================
 * Staff with `price_events` can put people into a paid event without a
 * payment. Two cases, and only two:
 *
 *   A MEMBER        the ticket is granted at once
 *                   (event-tickets.ts grantTicket, source "invite"), and
 *                   they get the bell row and the email every ticket gets.
 *   AN ADDRESS THAT IS NOBODY YET
 *                   the community's own invite link is made and emailed
 *                   (invites.ts createInvite), carrying this event, so that
 *                   accepting it makes them a member, grants the ticket and
 *                   lands them on the event's page.
 *
 * THE LINK CARRIES THE EVENT, SIGNED. There is no column to keep it in, so
 * the event id travels in the link beside the invite token with a short
 * signature over the two together (eventInviteTag). Nobody can take an
 * ordinary invite link, add an event to it and walk into a paid event: the
 * signature is made with the server's own key and checked when the link is
 * redeemed.
 *
 * IT NEVER GRANTS TWICE. One ticket row per person and event (the UNIQUE in
 * run-now part 105), so the same person invited twice, or a link used twice,
 * is one ticket; the second time answers created: false and no second email
 * goes, because the email's key names the ticket.
 *
 * BEFORE PART 105 there are no tickets, and the invite answers that the
 * database update is needed rather than pretending.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { eventPriceMode } from "../../event-tickets"
import { grantTicket, pricingOf, readPricedEvent, ticketsReady } from "../event-tickets"
import type { CommunityRow } from "../../types"
import { createInvite } from "../invites"
import { peopleOf } from "../moderation"
import { audit } from "../audit"
import { missing, reasonOf, type Db } from "../db"
import { ticketPaidNotice } from "./event_ticket_notify"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,24}$/i

/** How many people one call may invite. */
export const INVITE_AT_ONCE = 50

/* ── The event in an invite link, signed ────────────────────────────────── */

function signingKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const secret = env.COMMUNITY_INVITE_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (secret.length < 16) return null
  return createHmac("sha256", secret).update("storelib.community-event-invite.v1").digest()
}

/**
 * The short signature that ties one event to one invite token. Null when the
 * server has no key, and then an invite link simply carries no event.
 */
export function eventInviteTag(token: string, eventId: string, env?: Record<string, string | undefined>): string | null {
  const key = signingKey(env)
  if (!key || !token || !UUID.test(eventId)) return null
  /* The token is hashed first, so nothing derived from it can be turned back into the link. */
  const subject = createHash("sha256").update(token, "utf8").digest("hex")
  return createHmac("sha256", key).update(`${subject}:${eventId.toLowerCase()}`).digest("hex").slice(0, 32)
}

/** Whether this tag was made here for this token and event. */
export function verifyEventInviteTag(token: unknown, eventId: unknown, tag: unknown, env?: Record<string, string | undefined>): boolean {
  if (typeof token !== "string" || typeof eventId !== "string" || typeof tag !== "string") return false
  if (!/^[0-9a-f]{32}$/.test(tag)) return false
  const made = eventInviteTag(token, eventId, env)
  if (!made) return false
  const a = Buffer.from(made, "utf8")
  const b = Buffer.from(tag, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The invite link with the event on it: /community/<slug>/join?invite=<token>&event=<id>&et=<tag>. */
export function eventInviteQuery(token: string, eventId: string, env?: Record<string, string | undefined>): string {
  const tag = eventInviteTag(token, eventId, env)
  return tag ? `&event=${encodeURIComponent(eventId)}&et=${tag}` : ""
}

/* ── Inviting ───────────────────────────────────────────────────────────── */

export interface EventInviteInput {
  userIds?: unknown
  emails?: unknown
  message?: unknown
}

export interface EventInviteAnswer {
  /** How many tickets are now held because of this call. */
  invited: number
  /** Who could not be given one, with a plain reason each. */
  failed: { who: string; reason: string }[]
  /** Addresses that are nobody here yet, and were sent the community's invite link instead. */
  notMembers: string[]
}

/** The people and addresses asked for, each once, in the order they were given. */
export function cleanInviteInput(input: EventInviteInput): { userIds: string[]; emails: string[]; message: string | null } {
  const userIds = Array.isArray(input.userIds) ? [...new Set(input.userIds.filter((v): v is string => typeof v === "string" && UUID.test(v)).map((v) => v.toLowerCase()))] : []
  const emails = Array.isArray(input.emails)
    ? [...new Set(input.emails.filter((v): v is string => typeof v === "string").map((v) => v.trim().toLowerCase()).filter((v) => EMAIL.test(v)))]
    : []
  const message = typeof input.message === "string" && input.message.trim() ? input.message.trim().slice(0, 400) : null
  return { userIds: userIds.slice(0, INVITE_AT_ONCE), emails: emails.slice(0, INVITE_AT_ONCE), message }
}

const REASONS: Record<string, string> = {
  full: "The event is sold out.",
  not_found: "That event could not be found.",
  not_set_up: "The database update for paid events has not run yet.",
  failed: "That did not go through. Try again.",
  not_member: "They are not a member of this community.",
}

function reasonWords(code: string): string {
  return REASONS[code] ?? REASONS.failed
}

/** An active member of this community, by id. */
async function activeMembers(db: Db, communityId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const { data, error } = await db.from("community_members").select("user_id, status").eq("community_id", communityId).in("user_id", userIds)
  if (error) {
    if (!missing(error)) console.error(`[communities] invite members read: ${reasonOf(error)}`)
    return new Set()
  }
  return new Set(((data as { user_id: string; status: string }[] | null) ?? []).filter((m) => m.status === "active").map((m) => m.user_id))
}

/** The accounts behind these addresses, when they have one. */
async function accountsByEmail(db: Db, emails: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (emails.length === 0) return out
  const { data, error } = await db.from("profiles").select("id, email").in("email", emails)
  if (error) {
    if (!missing(error)) console.error(`[communities] invite accounts read: ${reasonOf(error)}`)
    return out
  }
  for (const p of (data as { id: string; email: string | null }[] | null) ?? []) {
    const email = (p.email ?? "").trim().toLowerCase()
    if (email && !out.has(email)) out.set(email, p.id)
  }
  return out
}

export type EventInviteResult = { ok: true; answer: EventInviteAnswer } | { ok: false; status: number; error: string; message: string }

/**
 * GIVE FREE SEATS. The event must be this community's and must cost
 * something: a free event has no ticket to give, so it says so instead of
 * quietly doing nothing.
 */
export async function inviteToEvent(
  db: Db,
  a: { community: CommunityRow; eventId: string; actorId: string; input: EventInviteInput; enabled?: boolean },
): Promise<EventInviteResult> {
  if (!UUID.test(a.eventId)) return { ok: false, status: 404, error: "not_found", message: REASONS.not_found }
  if (!(await ticketsReady(db))) return { ok: false, status: 409, error: "not_set_up", message: REASONS.not_set_up }
  const event = await readPricedEvent(db, a.community.id, a.eventId)
  if (!event || event.status === "cancelled") return { ok: false, status: 404, error: "not_found", message: REASONS.not_found }
  const pricing = pricingOf(event)
  if (eventPriceMode(pricing) === "free") {
    return { ok: false, status: 400, error: "free_event", message: "This event is free, so there is no ticket to give. Share the event instead." }
  }

  const { userIds, emails, message } = cleanInviteInput(a.input)
  if (userIds.length === 0 && emails.length === 0) return { ok: false, status: 400, error: "nobody", message: "Pick a member or type an email address." }

  const people = await peopleOf(db, [a.actorId])
  const inviterName = people.get(a.actorId)?.name ?? null
  const answer: EventInviteAnswer = { invited: 0, failed: [], notMembers: [] }

  /* An address that already has an account and is already a member is one of them, not an invite link. */
  const accounts = await accountsByEmail(db, emails)
  const byEmail = new Map<string, string>()
  const members = await activeMembers(db, a.community.id, [...new Set([...userIds, ...accounts.values()])])
  for (const [email, userId] of accounts) if (members.has(userId)) byEmail.set(email, userId)

  const ids = [...new Set([...userIds, ...byEmail.values()])]
  const names = ids.length ? await peopleOf(db, ids) : new Map()
  for (const userId of ids) {
    const who = names.get(userId)?.name ?? "Member"
    if (!members.has(userId)) {
      answer.failed.push({ who, reason: REASONS.not_member })
      continue
    }
    const granted = await grantTicket(db, { eventId: event.id, userId, communityId: a.community.id, source: "invite", by: a.actorId })
    if (!granted.ok) {
      answer.failed.push({ who, reason: reasonWords((granted as { error?: string }).error ?? "failed") })
      continue
    }
    answer.invited++
    /* The bell row and the one email, once per ticket: inviting the same person again sends nothing. */
    if (granted.created) {
      await ticketPaidNotice(db, {
        communityId: a.community.id,
        eventId: event.id,
        ticketId: granted.ticketId,
        userId,
        amountCents: 0,
        currency: pricing.currency,
        source: "invite",
        invitedByName: inviterName,
        message,
        enabled: a.enabled,
      })
    }
  }

  /* Nobody here yet: the community's own invite link, carrying this event. */
  for (const email of emails) {
    if (byEmail.has(email)) continue
    const made = await createInvite(db, {
      community: a.community,
      createdBy: a.actorId,
      inviterName: inviterName ?? a.community.name,
      input: { email, tierId: null, maxUses: 1, expiresInDays: 30 },
      event: { id: event.id, title: event.title },
      enabled: a.enabled,
    })
    if (!made.ok) {
      answer.failed.push({ who: email, reason: (made as { error?: string }).error ?? REASONS.failed })
      continue
    }
    answer.notMembers.push(email)
  }

  await audit(db, {
    communityId: a.community.id,
    actorId: a.actorId,
    actorKind: "member",
    action: "event.tickets_invited",
    targetType: "event",
    targetId: event.id,
    targetLabel: event.title,
    detail: { invited: answer.invited, links: answer.notMembers.length, failed: answer.failed.length },
  })
  return { ok: true, answer }
}

/* ── Arriving through an invite link that carries an event ──────────────── */

export interface InviteTicketOnJoin {
  community: CommunityRow
  userId: string
  /** The raw token from the link, which the signature is tied to. */
  token: unknown
  eventId: unknown
  tag: unknown
  /** True when the caller already knows the communities switch is on. */
  enabled?: boolean
}

/**
 * THE TICKET AT THE DOOR. Called by the redeem route once the membership is
 * made: when the link carried an event and the signature holds, the ticket
 * is granted and the event's page is where they land. Answers null when
 * there is no event on the link, nothing signed it, or there is no seat, so
 * the ordinary invite answer stands.
 */
export async function grantTicketOnJoin(db: Db, a: InviteTicketOnJoin): Promise<{ url: string } | null> {
  if (!verifyEventInviteTag(a.token, a.eventId, a.tag)) return null
  const eventId = String(a.eventId)
  if (!UUID.test(a.userId)) return null
  try {
    if (!(await ticketsReady(db))) return null
    const event = await readPricedEvent(db, a.community.id, eventId)
    if (!event || event.status === "cancelled") return null
    const pricing = pricingOf(event)
    if (eventPriceMode(pricing) === "free") return null
    const granted = await grantTicket(db, { eventId: event.id, userId: a.userId, communityId: a.community.id, source: "invite" })
    if (!granted.ok) return null
    if (granted.created) {
      await ticketPaidNotice(db, {
        communityId: a.community.id,
        eventId: event.id,
        ticketId: granted.ticketId,
        userId: a.userId,
        amountCents: 0,
        currency: pricing.currency,
        source: "invite",
        enabled: a.enabled,
      })
    }
    return { url: `/community/${a.community.slug}/events/${event.id}` }
  } catch (e) {
    console.error(`[communities] invite ticket ${eventId}: ${reasonOf(e)}`)
    return null
  }
}
