/**
 * ===========================================================================
 *  WHAT A PERSON WANTS ON THEIR PHONE, KIND BY KIND
 * ===========================================================================
 * Account settings, Notifications (components/account/notification-settings
 * .tsx) has one switch per kind of push, under the one switch for all of
 * them (notification_preferences, category "social", channel "push"). This
 * file names the kinds, says which notifications each one covers, and reads
 * and writes the choice. Pure, with no server imports, so the settings
 * screen, the route (app/api/me/push) and the push bridge share it.
 *
 * WHERE IT IS KEPT. No SQL this round, and notification_preferences only
 * takes its fixed categories, so the per kind choice lives on the account
 * itself: the auth user's app_metadata (server written only), under
 * NOTIFY_META_KEY, as the kinds turned OFF. A kind not listed is on, so a
 * new kind added later is on for everybody without a migration. The same
 * place already keeps a browser's push subscription (lib/push/web-
 * subscriptions.ts), and lib/push/sender reads it on every send.
 *
 * WHAT THE SWITCHES DO NOT TOUCH. The bell: everything still lands there,
 * so a like turned off for the phone is still in the inbox. And each
 * community's own level (Everything, Everything but likes, Only mentions
 * and replies, Nothing) still applies first: a new post only pushes from a
 * community at Everything or the default Everything but likes.
 */

export const PUSH_KIND_KEYS = ["posts", "comments", "likes", "mentions", "messages", "events", "followers"] as const
export type PushKindKey = (typeof PUSH_KIND_KEYS)[number]

/** Emails a person can turn off here that are not a category of lib/notify. */
export const EMAIL_KIND_KEYS = ["report_digest"] as const
export type EmailKindKey = (typeof EMAIL_KIND_KEYS)[number]

/** The account's app_metadata key. */
export const NOTIFY_META_KEY = "storelib_notify"

export interface KindInfo {
  key: PushKindKey
  label: string
  detail: string
}

/** In the order Settings shows them. */
export const PUSH_KINDS: readonly KindInfo[] = [
  { key: "posts", label: "New posts", detail: "From your communities, unless one is set to mentions only or nothing." },
  { key: "comments", label: "Comments and replies", detail: "On your posts, and replies to your comments." },
  { key: "likes", label: "Likes", detail: "Grouped per post, so ten likes is one notification." },
  { key: "mentions", label: "Mentions", detail: "When someone tags you with @." },
  { key: "messages", label: "Messages", detail: "Direct messages from members." },
  { key: "events", label: "Events", detail: "New events and reminders for ones you are going to." },
  { key: "followers", label: "New followers", detail: "When someone follows you." },
]

/**
 * Which switch a notification kind sits under, or null for the kinds only
 * the main switch governs (announcements, approvals, admin messages, news
 * from creators you follow): those are rare and addressed to the person.
 * A digest is decided row by row before it is drawn (push-bridge.ts).
 */
export function pushKindOf(kind: string): PushKindKey | null {
  switch (kind) {
    case "post":
      return "posts"
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
    case "new_follower":
      return "followers"
    default:
      return null
  }
}

export interface NotifyChoice {
  /** Push kinds turned off. */
  pushOff: PushKindKey[]
  /** Emails turned off. */
  emailOff: EmailKindKey[]
}

const isPushKey = (v: unknown): v is PushKindKey => typeof v === "string" && (PUSH_KIND_KEYS as readonly string[]).includes(v)
const isEmailKey = (v: unknown): v is EmailKindKey => typeof v === "string" && (EMAIL_KIND_KEYS as readonly string[]).includes(v)

/** The choice as stored (any app_metadata), made safe: unknown words are dropped, each kind once. */
export function readNotifyChoice(meta: unknown): NotifyChoice {
  const raw = meta && typeof meta === "object" ? (meta as Record<string, unknown>)[NOTIFY_META_KEY] : null
  const v = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const pushOff = Array.isArray(v.pushOff) ? [...new Set(v.pushOff.filter(isPushKey))] : []
  const emailOff = Array.isArray(v.emailOff) ? [...new Set(v.emailOff.filter(isEmailKey))] : []
  return { pushOff, emailOff }
}

/** Whether a notification kind may reach the phone under this choice. */
export function kindAllowed(choice: NotifyChoice | null | undefined, kind: string): boolean {
  const key = pushKindOf(kind)
  return !key || !choice || !choice.pushOff.includes(key)
}

/**
 * A change sent by Settings ({ push: { likes: false }, email: { report_digest: true } })
 * applied to what is kept. Null when the change names nothing it may change.
 */
export function applyNotifyChange(current: NotifyChoice, change: unknown): NotifyChoice | null {
  const c = change && typeof change === "object" ? (change as Record<string, unknown>) : {}
  const push = c.push && typeof c.push === "object" ? (c.push as Record<string, unknown>) : {}
  const email = c.email && typeof c.email === "object" ? (c.email as Record<string, unknown>) : {}
  const pushOff = new Set(current.pushOff)
  const emailOff = new Set(current.emailOff)
  let touched = false
  for (const [k, on] of Object.entries(push)) {
    if (!isPushKey(k) || typeof on !== "boolean") continue
    touched = true
    if (on) pushOff.delete(k)
    else pushOff.add(k)
  }
  for (const [k, on] of Object.entries(email)) {
    if (!isEmailKey(k) || typeof on !== "boolean") continue
    touched = true
    if (on) emailOff.delete(k)
    else emailOff.add(k)
  }
  if (!touched) return null
  return { pushOff: PUSH_KIND_KEYS.filter((k) => pushOff.has(k)), emailOff: EMAIL_KIND_KEYS.filter((k) => emailOff.has(k)) }
}

/** What Settings draws: every kind with its state. */
export function kindStates(choice: NotifyChoice): Record<PushKindKey, boolean> {
  return Object.fromEntries(PUSH_KIND_KEYS.map((k) => [k, !choice.pushOff.includes(k)])) as Record<PushKindKey, boolean>
}
