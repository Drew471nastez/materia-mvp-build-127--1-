/**
 * ===========================================================================
 *  WHAT A PERSON WANTS ON THEIR PHONE, KIND BY KIND
 * ===========================================================================
 * Account settings, Notifications (components/account/notification-settings
 * .tsx) has one switch per kind of push, under the one switch for all of
 * them (notification_preferences, category "social", channel "push"), the
 * same kinds again for each community on its own, quiet hours, and the two
 * emails a person chooses. This file names the kinds, says which
 * notifications each one covers, and reads and writes the choice. Pure,
 * with no server imports, so the settings screen, the route (app/api/me/
 * push) and the push bridge share it.
 *
 * WHERE IT IS KEPT. No SQL, and notification_preferences only takes its
 * fixed categories, so the choice lives on the account itself: the auth
 * user's app_metadata (server written only), under NOTIFY_META_KEY:
 *
 *   pushOff       kinds turned OFF everywhere. A kind not listed is on, so
 *                 a new kind added later is on for everybody.
 *   communities   { <community id>: kinds turned off there alone }, only
 *                 the communities that have one, at most COMMUNITY_LIMIT.
 *   quiet         { from, to } in minutes after midnight, the person's own
 *                 time, or absent for none.
 *   tz            the person's time zone (IANA), sent by their browser, so
 *                 quiet hours and the daily cap follow their day.
 *   emailOff      emails on by default that they turned off (the daily
 *                 report summary).
 *   emailOn       emails off by default that they asked for (the weekly
 *                 community digest).
 *
 * WHAT THE SWITCHES DO NOT TOUCH. The bell: everything still lands there,
 * so a like turned off for the phone is still in the inbox. And each
 * community's own level (Everything, Everything but likes, Only mentions
 * and replies, Nothing) still applies first (push-bridge.ts levelAllowsPush).
 */

export const PUSH_KIND_KEYS = ["mentions", "comments", "admin_posts", "posts", "events", "programs", "likes", "messages", "followers"] as const
export type PushKindKey = (typeof PUSH_KIND_KEYS)[number]

/** The kinds that can come from a community, so the ones a community can switch off for itself. */
export const COMMUNITY_KIND_KEYS = ["mentions", "comments", "admin_posts", "posts", "events", "programs", "likes", "messages"] as const satisfies readonly PushKindKey[]
export type CommunityKindKey = (typeof COMMUNITY_KIND_KEYS)[number]

/** Emails on unless turned off. */
export const EMAIL_KIND_KEYS = ["report_digest"] as const
export type EmailKindKey = (typeof EMAIL_KIND_KEYS)[number]

/** Emails off unless asked for. */
export const EMAIL_OPT_IN_KEYS = ["weekly_digest"] as const
export type EmailOptInKey = (typeof EMAIL_OPT_IN_KEYS)[number]

/** The account's app_metadata key. */
export const NOTIFY_META_KEY = "storelib_notify"

/** Communities with their own kinds kept on one account. */
export const COMMUNITY_LIMIT = 100

export interface KindInfo {
  key: PushKindKey
  label: string
  detail: string
}

/** In the order Settings shows them: what is addressed to the person first, then news, then the rest. */
export const PUSH_KINDS: readonly KindInfo[] = [
  { key: "mentions", label: "Mentions", detail: "When someone tags you with @." },
  { key: "comments", label: "Replies and comments", detail: "Replies to you, and comments on your posts." },
  { key: "admin_posts", label: "Posts from owners and admins", detail: "New posts by the people who run your communities." },
  { key: "posts", label: "Posts from members", detail: "Only from communities you set to Everything." },
  { key: "events", label: "Events", detail: "New events, changes to ones you are going to, and reminders." },
  { key: "programs", label: "Programs and lessons", detail: "When a new program or lesson opens in Learn." },
  { key: "likes", label: "Likes", detail: "Grouped per post, so ten likes is one notification." },
  { key: "messages", label: "Messages", detail: "Direct messages from members." },
  { key: "followers", label: "New followers", detail: "When someone follows you." },
]

/**
 * Which switch a notification kind sits under, or null for the kinds only
 * the main switch governs (announcements, approvals, admin messages, news
 * from creators you follow): those are rare and addressed to the person.
 * "post" and "admin_post" are push only: a new post has no bell row.
 */
export function pushKindOf(kind: string): PushKindKey | null {
  switch (kind) {
    case "post":
      return "posts"
    case "admin_post":
      return "admin_posts"
    case "comment":
    case "reply":
      return "comments"
    case "reaction":
      return "likes"
    case "mention":
      return "mentions"
    case "dm":
      return "messages"
    case "event":
    case "event_reminder":
      return "events"
    case "course_available":
      return "programs"
    case "new_follower":
      return "followers"
    default:
      return null
  }
}

/** Quiet hours: minutes after midnight in the person's own time. From 22:00 to 08:00 is { from: 1320, to: 480 }. */
export interface QuietHours {
  from: number
  to: number
}

export interface NotifyChoice {
  /** Push kinds turned off everywhere. */
  pushOff: PushKindKey[]
  /** Emails turned off. */
  emailOff: EmailKindKey[]
  /** Emails asked for. */
  emailOn: EmailOptInKey[]
  /** Kinds turned off in one community alone. */
  communities: Record<string, CommunityKindKey[]>
  quiet: QuietHours | null
  tz: string | null
}

export function emptyChoice(): NotifyChoice {
  return { pushOff: [], emailOff: [], emailOn: [], communities: {}, quiet: null, tz: null }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isPushKey = (v: unknown): v is PushKindKey => typeof v === "string" && (PUSH_KIND_KEYS as readonly string[]).includes(v)
const isCommunityKey = (v: unknown): v is CommunityKindKey => typeof v === "string" && (COMMUNITY_KIND_KEYS as readonly string[]).includes(v)
const isEmailKey = (v: unknown): v is EmailKindKey => typeof v === "string" && (EMAIL_KIND_KEYS as readonly string[]).includes(v)
const isOptInKey = (v: unknown): v is EmailOptInKey => typeof v === "string" && (EMAIL_OPT_IN_KEYS as readonly string[]).includes(v)
const isMinute = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1440

/** A time zone the runtime knows ("Europe/Bucharest"), or null. */
export function cleanTimeZone(v: unknown): string | null {
  if (typeof v !== "string" || v.length < 2 || v.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(v)) return null
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v })
    return v
  } catch {
    return null
  }
}

/** Quiet hours as stored or sent, or null for none (a start equal to its end is none). */
export function cleanQuiet(v: unknown): QuietHours | null {
  const q = v && typeof v === "object" ? (v as Record<string, unknown>) : null
  if (!q || !isMinute(q.from) || !isMinute(q.to) || q.from === q.to) return null
  return { from: q.from, to: q.to }
}

function cleanCommunities(v: unknown): Record<string, CommunityKindKey[]> {
  const out: Record<string, CommunityKindKey[]> = {}
  if (!v || typeof v !== "object" || Array.isArray(v)) return out
  for (const [id, list] of Object.entries(v as Record<string, unknown>)) {
    if (Object.keys(out).length >= COMMUNITY_LIMIT) break
    if (!UUID.test(id) || !Array.isArray(list)) continue
    const kinds = COMMUNITY_KIND_KEYS.filter((k) => list.includes(k))
    if (kinds.length) out[id.toLowerCase()] = kinds
  }
  return out
}

/** The choice as stored (any app_metadata), made safe: unknown words are dropped, each kind once. */
export function readNotifyChoice(meta: unknown): NotifyChoice {
  const raw = meta && typeof meta === "object" ? (meta as Record<string, unknown>)[NOTIFY_META_KEY] : null
  const v = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const pushOff = Array.isArray(v.pushOff) ? PUSH_KIND_KEYS.filter((k) => (v.pushOff as unknown[]).includes(k)) : []
  const emailOff = Array.isArray(v.emailOff) ? [...new Set(v.emailOff.filter(isEmailKey))] : []
  const emailOn = Array.isArray(v.emailOn) ? [...new Set(v.emailOn.filter(isOptInKey))] : []
  return { pushOff, emailOff, emailOn, communities: cleanCommunities(v.communities), quiet: cleanQuiet(v.quiet), tz: cleanTimeZone(v.tz) }
}

/** What is written back to app_metadata. */
export function storedChoice(c: NotifyChoice): Record<string, unknown> {
  return { pushOff: c.pushOff, emailOff: c.emailOff, emailOn: c.emailOn, communities: c.communities, quiet: c.quiet, tz: c.tz }
}

/** The community a push group names ("c:<id>" its news, "p:<id>" its posts), or null. */
export function communityOfGroup(group: string | null | undefined): string | null {
  const m = /^[cp]:([0-9a-f-]{36})$/i.exec(group ?? "")
  return m ? m[1].toLowerCase() : null
}

/** Whether a notification kind may reach the phone under this choice, everywhere and in this community. */
export function kindAllowed(choice: NotifyChoice | null | undefined, kind: string, communityId?: string | null): boolean {
  const key = pushKindOf(kind)
  if (!key || !choice) return true
  if (choice.pushOff.includes(key)) return false
  const here = communityId ? choice.communities?.[communityId.toLowerCase()] : undefined
  return !(here && (here as readonly string[]).includes(key))
}

/**
 * A change sent by Settings applied to what is kept. Null when the change
 * names nothing it may change. Each part is optional:
 *
 *   push       { likes: false }                 everywhere
 *   community  { id, push: { likes: false } }   in that community alone
 *   email      { report_digest: false, weekly_digest: true }
 *   quiet      { from: 1320, to: 480 } or null  (null turns them off)
 *   tz         "Europe/Bucharest"
 */
export function applyNotifyChange(current: NotifyChoice, change: unknown): NotifyChoice | null {
  const c = change && typeof change === "object" ? (change as Record<string, unknown>) : {}
  const push = c.push && typeof c.push === "object" ? (c.push as Record<string, unknown>) : {}
  const email = c.email && typeof c.email === "object" ? (c.email as Record<string, unknown>) : {}
  const pushOff = new Set(current.pushOff)
  const emailOff = new Set(current.emailOff)
  const emailOn = new Set(current.emailOn)
  const communities: Record<string, CommunityKindKey[]> = { ...current.communities }
  let quiet = current.quiet
  let tz = current.tz
  let touched = false
  for (const [k, on] of Object.entries(push)) {
    if (!isPushKey(k) || typeof on !== "boolean") continue
    touched = true
    if (on) pushOff.delete(k)
    else pushOff.add(k)
  }
  for (const [k, on] of Object.entries(email)) {
    if (typeof on !== "boolean") continue
    if (isEmailKey(k)) {
      touched = true
      if (on) emailOff.delete(k)
      else emailOff.add(k)
    } else if (isOptInKey(k)) {
      touched = true
      if (on) emailOn.add(k)
      else emailOn.delete(k)
    }
  }
  const community = c.community && typeof c.community === "object" ? (c.community as Record<string, unknown>) : null
  if (community && typeof community.id === "string" && UUID.test(community.id) && community.push && typeof community.push === "object") {
    const id = community.id.toLowerCase()
    const off = new Set<CommunityKindKey>(communities[id] ?? [])
    let named = false
    for (const [k, on] of Object.entries(community.push as Record<string, unknown>)) {
      if (!isCommunityKey(k) || typeof on !== "boolean") continue
      named = true
      if (on) off.delete(k)
      else off.add(k)
    }
    /* A new community past the limit is refused; one already kept may always change. */
    if (named && (id in communities || off.size === 0 || Object.keys(communities).length < COMMUNITY_LIMIT)) {
      touched = true
      if (off.size) communities[id] = COMMUNITY_KIND_KEYS.filter((k) => off.has(k))
      else delete communities[id]
    }
  }
  if ("quiet" in c) {
    const next = c.quiet === null ? null : cleanQuiet(c.quiet)
    if (c.quiet === null || next) {
      touched = true
      quiet = next
    }
  }
  if ("tz" in c) {
    const next = cleanTimeZone(c.tz)
    if (next) {
      touched = true
      tz = next
    }
  }
  if (!touched) return null
  return {
    pushOff: PUSH_KIND_KEYS.filter((k) => pushOff.has(k)),
    emailOff: EMAIL_KIND_KEYS.filter((k) => emailOff.has(k)),
    emailOn: EMAIL_OPT_IN_KEYS.filter((k) => emailOn.has(k)),
    communities,
    quiet,
    tz,
  }
}

/** What Settings draws: every kind with its state. */
export function kindStates(choice: NotifyChoice): Record<PushKindKey, boolean> {
  return Object.fromEntries(PUSH_KIND_KEYS.map((k) => [k, !choice.pushOff.includes(k)])) as Record<PushKindKey, boolean>
}

/** One community's kinds as Settings draws them: on unless turned off there. */
export function communityKindStates(choice: NotifyChoice, communityId: string): Record<CommunityKindKey, boolean> {
  const off = choice.communities[communityId.toLowerCase()] ?? []
  return Object.fromEntries(COMMUNITY_KIND_KEYS.map((k) => [k, !off.includes(k)])) as Record<CommunityKindKey, boolean>
}

/** The emails as Settings draws them. */
export function emailStates(choice: NotifyChoice): { report_digest: boolean; weekly_digest: boolean } {
  return { report_digest: !choice.emailOff.includes("report_digest"), weekly_digest: choice.emailOn.includes("weekly_digest") }
}

/** "22:00" for 1320. */
export function clockText(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}
