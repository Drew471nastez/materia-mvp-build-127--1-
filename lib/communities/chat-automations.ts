/**
 * ===========================================================================
 *  MESSAGES THE COMMUNITY SENDS BY ITSELF, THE DECISIONS (round 38)
 * ===========================================================================
 * An admin writes a message once and says when it goes: when somebody joins,
 * when a member reaches a level, after some days in the community, when a
 * paid membership starts or is cancelled, or once, now or at a time, to
 * everybody or to some of them (a level, a tier, joined lately). It arrives
 * as a real chat message from a member of the team, in the member's Messages
 * (or in a channel), with the unread badge and a push like any other.
 *
 * This file is the pure half: what an admin may save, how {name} and
 * {community} are filled in, which automations a level up crosses, who a
 * broadcast reaches, and the one key per automation and member that makes a
 * send happen once however often it is retried. The server half is
 * lib/communities/server/chat-automations.ts; the table is part 272.
 */

export const AUTOMATION_TRIGGERS = ["join", "level", "days", "paid_start", "paid_cancel", "broadcast"] as const
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number]
export type AutomationTarget = "dm" | "channel"
export type AutomationStatus = "active" | "paused" | "scheduled" | "sending" | "done"
export type DeliveryStatus = "pending" | "sending" | "sent" | "failed" | "skipped"

export const AUTOMATION_NAME_MAX = 80
export const AUTOMATION_BODY_MAX = 4000
export const AUTOMATIONS_PER_COMMUNITY = 50
/** Deliveries one cron run sends at most, across every community: a broadcast to thousands goes out over several runs, never as one storm. */
export const DELIVERIES_PER_RUN = 300
/** And at most this many for one community in one run, so one big broadcast does not hold everybody else's welcome back. */
export const DELIVERIES_PER_COMMUNITY_RUN = 150
/** Members a broadcast or a days automation adds to its queue in one run. */
export const FANOUT_PAGE = 500
/** A delivery claimed this long ago and never finished is tried again (its message key makes a second try write nothing new). */
export const CLAIM_STALE_MS = 10 * 60_000
export const DELIVERY_ATTEMPTS_MAX = 5
/** What a join or a level up sends at once, after the response, before the cron would. */
export const SOON_MAX = 10

export interface AutomationSegment {
  /** Members at this points level or above. */
  minLevel?: number
  /** Members of this tier. */
  tierId?: string
  /** Members who joined in the last N days. */
  joinedWithinDays?: number
}

export interface AutomationInput {
  name: string
  trigger: AutomationTrigger
  triggerLevel: number | null
  triggerDays: number | null
  target: AutomationTarget
  spaceId: string | null
  senderId: string | null
  body: string
  segment: AutomationSegment
  /** A broadcast's time; null is now. */
  sendAt: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function int(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" && v.trim() ? Number(v) : v
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null
}

function cleanBody(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * What an admin sent, checked. Every field is required to make sense for its
 * trigger: a level for "level", days for "days", a channel for a channel
 * message, a time in the future (within a year) for a scheduled broadcast.
 */
export function automationInput(raw: unknown, now: number = Date.now()): { ok: true; value: AutomationInput } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim() : ""
  if (!name) return { ok: false, error: "Give it a name only the team sees." }
  if (name.length > AUTOMATION_NAME_MAX) return { ok: false, error: "Keep the name under 80 characters." }
  if (!AUTOMATION_TRIGGERS.includes(r.trigger as AutomationTrigger)) return { ok: false, error: "Pick when it is sent." }
  const trigger = r.trigger as AutomationTrigger
  const body = typeof r.body === "string" ? cleanBody(r.body) : ""
  if (!body) return { ok: false, error: "Write the message." }
  if (body.length > AUTOMATION_BODY_MAX) return { ok: false, error: "Keep the message under 4,000 characters." }
  const target: AutomationTarget = r.target === "channel" ? "channel" : "dm"
  const spaceId = typeof r.spaceId === "string" && UUID.test(r.spaceId) ? r.spaceId : null
  if (target === "channel" && !spaceId) return { ok: false, error: "Pick the channel." }
  const senderId = typeof r.senderId === "string" && UUID.test(r.senderId) ? r.senderId : null
  let triggerLevel: number | null = null
  let triggerDays: number | null = null
  if (trigger === "level") {
    triggerLevel = int(r.triggerLevel, 2, 100)
    if (triggerLevel === null) return { ok: false, error: "Pick a level from 2 to 100." }
  }
  if (trigger === "days") {
    triggerDays = int(r.triggerDays, 1, 365)
    if (triggerDays === null) return { ok: false, error: "Pick from 1 to 365 days." }
  }
  const segment: AutomationSegment = {}
  let sendAt: string | null = null
  if (trigger === "broadcast") {
    const s = (r.segment && typeof r.segment === "object" ? r.segment : {}) as Record<string, unknown>
    if (s.minLevel !== undefined && s.minLevel !== null && s.minLevel !== "") {
      const n = int(s.minLevel, 1, 100)
      if (n === null) return { ok: false, error: "Pick a level from 1 to 100." }
      if (n > 1) segment.minLevel = n
    }
    if (typeof s.tierId === "string" && s.tierId) {
      if (!UUID.test(s.tierId)) return { ok: false, error: "Pick a tier." }
      segment.tierId = s.tierId
    }
    if (s.joinedWithinDays !== undefined && s.joinedWithinDays !== null && s.joinedWithinDays !== "") {
      const n = int(s.joinedWithinDays, 1, 3650)
      if (n === null) return { ok: false, error: "Pick how many days back." }
      segment.joinedWithinDays = n
    }
    if (r.sendAt !== undefined && r.sendAt !== null && r.sendAt !== "") {
      const t = typeof r.sendAt === "string" ? Date.parse(r.sendAt) : NaN
      if (!Number.isFinite(t)) return { ok: false, error: "Pick a time to send it." }
      if (t < now - 60_000) return { ok: false, error: "Pick a time that has not passed." }
      if (t > now + 366 * 86_400_000) return { ok: false, error: "Pick a time within a year." }
      sendAt = new Date(t).toISOString()
    }
  }
  return { ok: true, value: { name, trigger, triggerLevel, triggerDays, target, spaceId, senderId, body, segment, sendAt } }
}

/** The columns a checked input writes. */
export function automationColumns(v: AutomationInput): Record<string, unknown> {
  return {
    name: v.name,
    trigger: v.trigger,
    trigger_level: v.triggerLevel,
    trigger_days: v.triggerDays,
    target: v.target,
    space_id: v.target === "channel" ? v.spaceId : null,
    sender_id: v.senderId,
    body: v.body,
    segment: v.trigger === "broadcast" ? v.segment : {},
    send_at: v.trigger === "broadcast" ? v.sendAt : null,
  }
}

/** The words a member reads: {name}, {first_name}, {community} and {level} filled in; anything else in braces is left as written. */
export function renderAutomation(body: string, vars: { name?: string | null; community?: string | null; level?: number | null }): string {
  const name = (vars.name ?? "").trim() || "there"
  const first = name.split(/\s+/)[0] || name
  return body.replace(/\{(name|first_name|community|level)\}/g, (_, k: string) => {
    if (k === "name") return name
    if (k === "first_name") return first
    if (k === "community") return (vars.community ?? "").trim() || "the community"
    return String(vars.level ?? 1)
  })
}

/** The variables an admin can use, for the panel's hint. */
export const AUTOMATION_VARIABLES = ["{first_name}", "{name}", "{community}", "{level}"] as const

/**
 * The sender's own id for one delivery's message, unique per author as
 * part 270's index asks: a retried delivery finds the message it already
 * wrote instead of writing a second one.
 */
export function deliveryClientId(deliveryId: string): string {
  return `auto_${deliveryId.replace(/[^0-9a-f]/gi, "").slice(0, 40)}`
}

/** Level automations a level up from `before` to `after` crosses: each level reached on the way, once. */
export function levelsCrossed<T extends { trigger: string; trigger_level: number | null }>(list: readonly T[], before: number, after: number): T[] {
  if (!(after > before)) return []
  return list.filter((a) => a.trigger === "level" && a.trigger_level !== null && a.trigger_level > before && a.trigger_level <= after)
}

/** Which automations an event starts for a member. */
export function automationsFor<T extends { trigger: string; status: string; trigger_level: number | null }>(list: readonly T[], event: { kind: "join" | "paid_start" | "paid_cancel" } | { kind: "level"; before: number; after: number }): T[] {
  const live = list.filter((a) => a.status === "active")
  if (event.kind === "level") return levelsCrossed(live, event.before, event.after)
  return live.filter((a) => a.trigger === event.kind)
}

/**
 * The join dates a days automation reaches in this run: members whose N-th
 * day falls after the automation was made (so a new automation never sends
 * to everybody who joined years ago) and has come. `from` moves forward run
 * by run (the automation's cursor).
 */
export function daysWindow(a: { trigger_days: number; created_at: string; cursor: string | null }, now: number): { from: string; to: string } | null {
  const span = a.trigger_days * 86_400_000
  const made = Date.parse(a.created_at)
  if (!Number.isFinite(made)) return null
  const start = Math.max(made - span, a.cursor ? Date.parse(a.cursor) : -Infinity)
  const end = now - span
  if (!(end >= start)) return null
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() }
}

/** Whether a member is in a broadcast's audience. */
export function inSegment(m: { level: number | null; tier_id: string | null; joined_at: string | null }, s: AutomationSegment, now: number = Date.now()): boolean {
  if (s.minLevel && (m.level ?? 1) < s.minLevel) return false
  if (s.tierId && m.tier_id !== s.tierId) return false
  if (s.joinedWithinDays) {
    const t = m.joined_at ? Date.parse(m.joined_at) : NaN
    if (!Number.isFinite(t) || now - t > s.joinedWithinDays * 86_400_000) return false
  }
  return true
}

/**
 * The deliveries one run takes from those waiting (oldest first): at most
 * DELIVERIES_PER_RUN in all and DELIVERIES_PER_COMMUNITY_RUN per community.
 */
export function takeBatch<T extends { community_id: string }>(waiting: readonly T[], total = DELIVERIES_PER_RUN, perCommunity = DELIVERIES_PER_COMMUNITY_RUN): T[] {
  const out: T[] = []
  const per = new Map<string, number>()
  for (const d of waiting) {
    if (out.length >= total) break
    const n = per.get(d.community_id) ?? 0
    if (n >= perCommunity) continue
    per.set(d.community_id, n + 1)
    out.push(d)
  }
  return out
}

/** A broadcast is finished once its audience is all queued and nothing is waiting. */
export function broadcastFinished(a: { fanned_out_at: string | null }, waiting: number): boolean {
  return !!a.fanned_out_at && waiting === 0
}

/** One line the admin reads for when an automation sends. */
export function triggerLine(a: { trigger: AutomationTrigger; triggerLevel: number | null; triggerDays: number | null; sendAt: string | null; target: AutomationTarget }, channelName?: string | null): string {
  const where = a.target === "channel" ? ` in #${channelName || "a channel"}` : ""
  switch (a.trigger) {
    case "join":
      return `When someone joins${where}`
    case "level":
      return `When a member reaches level ${a.triggerLevel ?? 2}${where}`
    case "days":
      return `${a.triggerDays ?? 1} ${(a.triggerDays ?? 1) === 1 ? "day" : "days"} after someone joins${where}`
    case "paid_start":
      return `When a paid membership starts${where}`
    case "paid_cancel":
      return `When a paid membership is cancelled${where}`
    case "broadcast":
      return a.target === "channel" ? `Once${where}` : "Once, to members"
  }
}
