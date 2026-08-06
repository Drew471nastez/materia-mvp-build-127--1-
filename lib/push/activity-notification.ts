/**
 * Social activity push — likes, follows and trending listings, batched.
 *
 * ---------------------------------------------------------------------------
 * Why this is not shaped like chat push
 * ---------------------------------------------------------------------------
 * A chat message is addressed to you personally and is worth interrupting for,
 * so lib/push/message-notification.ts sends one push per message and uses an
 * APNs collapse id to keep the banners from stacking. That works because the
 * events are rare relative to how much each one matters.
 *
 * A like is the opposite. It costs the sender one tap, it arrives in bursts,
 * and the ninth one tells you nothing the first did not. Sending one push per
 * like — even a collapsing one — is a phone that buzzes nine times, and a
 * collapse id does not help with that: collapsing replaces the BANNER, it does
 * not suppress the ALERT. The buzz already happened.
 *
 * So this feature does not push on the event at all. Events are written to a
 * queue as they happen, and a cron sweeps the queue and sends at most one
 * summary per person per MIN_GAP_MS. That is where "8 people liked your
 * listing today" comes from: it is not a formatting choice, it is the only
 * thing the batch CAN say, because the batch is what exists.
 *
 * ---------------------------------------------------------------------------
 * The four things that keep it from being spam
 * ---------------------------------------------------------------------------
 *  1. SETTLE_MS — an event is not eligible until it has sat for a few minutes,
 *     so a burst is always a batch and never a race between the burst and the
 *     cron tick.
 *  2. MIN_GAP_MS — at most one activity push per person per four hours, held in
 *     the DATABASE (profiles.activity_push_last_at), not in memory. Vercel
 *     functions do not share memory; a module-level timestamp is a rate limit
 *     that works on one instance and not across two.
 *  3. Quiet hours — nothing between 22:00 and 08:00. The events wait; the 08:00
 *     tick sends one digest containing the night.
 *  4. A permanent dedupe key per (actor, target) — see dedupeKeyFor. Liking,
 *     unliking and liking again produces one event, ever. Without this, the
 *     cheapest way to harass somebody is a finger on a heart button.
 *
 * ---------------------------------------------------------------------------
 * Every dependency is an argument
 * ---------------------------------------------------------------------------
 * Same as the chat module and for the same reason: the whole decision table
 * runs in tests/activity-notifications.test.ts without a database, a device or
 * Firebase credentials. `now` is a parameter rather than a call to Date.now, so
 * quiet hours and the rate-limit gap are testable rather than time-dependent.
 */

import "server-only"

export type ActivityKind = "like" | "follow" | "trending"

/** One queued event, as it comes back out of the queue. */
export interface PendingActivity {
  id: string
  kind: ActivityKind
  /** Who did it. Absent for `trending`, which nobody does. */
  actorId?: string | null
  /** Their display name, resolved by the db layer. Only used when previews are on. */
  actorName?: string | null
  /** The listing. Absent for `follow`, which is about a person. */
  listingId?: string | null
  createdAt: number
}

// ── The knobs, in one place ─────────────────────────────────────────────────

/**
 * How long an event must sit before it may be sent.
 *
 * This is what makes the batching real rather than accidental. Without it, a
 * cron tick landing one second after the first like of a burst sends "1
 * apreciere" and the remaining eight arrive four hours later as a separate
 * push — the worst of both designs.
 */
export const SETTLE_MS = 10 * 60_000

/**
 * The floor between two activity pushes to the same person.
 *
 * Four hours means at most six a day in the pathological case and, in practice,
 * one or two. Vinted and Depop both sit in this range. Lower and a busy seller
 * is buzzed all afternoon; higher and a follow feels like it arrived by post.
 */
export const MIN_GAP_MS = 4 * 60 * 60_000

/**
 * Events older than this are dropped without being sent.
 *
 * A like from three days ago is not news, and a queue that never expires turns
 * one outage into a digest that says "312 aprecieri" — which is not a summary,
 * it is an apology.
 */
export const MAX_AGE_MS = 48 * 60 * 60_000

/** Read cap per recipient per tick. The text says "N"; it does not list them. */
export const MAX_EVENTS_PER_DIGEST = 500

/**
 * Quiet hours, in ONE fixed zone.
 *
 * Storelib has no per-user timezone and the app is Romanian, so Europe/Bucharest
 * is the honest approximation rather than a guess dressed up as a setting. It is
 * computed with Intl, which is in the platform — no dependency, no tz database
 * to keep current.
 *
 * The day a `profiles.timezone` column exists this becomes a lookup and nothing
 * else here changes.
 */
export const QUIET_TZ = "Europe/Bucharest"
export const QUIET_START_HOUR = 22
export const QUIET_END_HOUR = 8

/** The hour of the day at `at`, in QUIET_TZ. 0–23. */
export function hourIn(at: Date, timeZone: string = QUIET_TZ): number {
  try {
    const s = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hour12: false }).format(at)
    const h = Number.parseInt(s, 10)
    // "24" is how some ICU builds spell midnight.
    return Number.isFinite(h) ? h % 24 : at.getUTCHours()
  } catch {
    // An environment without the zone must not silence notifications forever.
    return at.getUTCHours()
  }
}

export function isQuietHour(at: Date, timeZone: string = QUIET_TZ): boolean {
  const h = hourIn(at, timeZone)
  // The window wraps midnight, so it is a union rather than a range.
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR
}

// ── Romanian counting ───────────────────────────────────────────────────────

/**
 * "2 persoane" but "20 DE persoane".
 *
 * Romanian inserts `de` before the noun when the last two digits of the number
 * are 00 or 20–99. It is not decoration: "8 persoane" and "20 persoane" read as
 * a translation, and this feature's whole job is to sound like it was written
 * by somebody who speaks the language.
 */
export function roCount(n: number, one: string, many: string): string {
  if (n === 1) return `1 ${one}`
  const last2 = n % 100
  const de = n >= 20 && (last2 === 0 || last2 >= 20)
  return `${n} ${de ? "de " : ""}${many}`
}

// ── Dedupe keys ─────────────────────────────────────────────────────────────

/**
 * The permanent identity of an event, and the anti-abuse mechanism.
 *
 * It is a unique constraint in Postgres, so `insert … on conflict do nothing` is
 * the whole of "notify once". Note what is NOT in it: a timestamp. That is
 * deliberate — a key containing the time would let somebody generate unlimited
 * events by toggling a heart, which is precisely the case this exists to stop.
 *
 * `trending` is the exception and carries a day, because a listing that trends
 * on Monday and again on Friday genuinely is two pieces of news.
 */
export function dedupeKeyFor(
  kind: ActivityKind,
  opts: { actorId?: string | null; listingId?: string | null; recipientId: string; day?: string },
): string {
  if (kind === "like") return `like:${opts.listingId ?? ""}:${opts.actorId ?? ""}`
  if (kind === "follow") return `follow:${opts.recipientId}:${opts.actorId ?? ""}`
  return `trending:${opts.listingId ?? ""}:${opts.day ?? ""}`
}

/** YYYY-MM-DD in QUIET_TZ — the "day" a trending event belongs to. */
export function dayKey(at: Date, timeZone: string = QUIET_TZ): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

// ── The text ────────────────────────────────────────────────────────────────

export interface DigestText {
  title: string
  body: string
}

/**
 * What one digest says.
 *
 * Pure, exported and tested directly, because this is the part a person reads
 * and the part most likely to be wrong in a way no type checks.
 *
 * `preview` off means counts and nothing else — no name, no listing. Who
 * admires your shop is as private as what somebody wrote to you, and the
 * existing `push_preview_enabled` switch already means exactly that for chat.
 */
export function summarize(events: PendingActivity[], preview: boolean): DigestText {
  const likes = events.filter((e) => e.kind === "like")
  const follows = events.filter((e) => e.kind === "follow")
  const trending = events.filter((e) => e.kind === "trending")

  const likeCount = likes.length
  const followCount = follows.length
  const trendCount = trending.length
  const listings = new Set(likes.map((e) => e.listingId).filter(Boolean))

  const kinds = (likeCount > 0 ? 1 : 0) + (followCount > 0 ? 1 : 0) + (trendCount > 0 ? 1 : 0)

  // ── Mixed: a headline and a tally. Anything more specific would have to
  //    pick one kind to be about, and the person can see the rest in the feed.
  if (kinds > 1) {
    const parts: string[] = []
    if (likeCount) parts.push(roCount(likeCount, "apreciere", "aprecieri"))
    if (followCount) parts.push(roCount(followCount, "urmăritor nou", "urmăritori noi"))
    if (trendCount) parts.push(roCount(trendCount, "anunț în tendințe", "anunțuri în tendințe"))
    return { title: "Activitate nouă", body: parts.join(" · ") }
  }

  if (followCount > 0) {
    if (followCount === 1) {
      const name = preview ? (follows[0].actorName ?? "").trim() : ""
      return {
        title: "Un urmăritor nou",
        body: name ? `${name} te urmărește acum` : "Cineva te urmărește acum",
      }
    }
    return { title: "Urmăritori noi", body: `${roCount(followCount, "persoană nouă", "persoane noi")} te urmăresc` }
  }

  if (likeCount > 0) {
    if (listings.size > 1) {
      return {
        title: "Aprecieri noi",
        body: `${roCount(likeCount, "apreciere", "aprecieri")} pe ${roCount(listings.size, "anunț", "anunțuri")} ale tale`,
      }
    }
    if (likeCount === 1) {
      const name = preview ? (likes[0].actorName ?? "").trim() : ""
      return {
        title: "O apreciere nouă",
        body: name ? `${name} ți-a apreciat anunțul` : "Cineva ți-a apreciat anunțul",
      }
    }
    return {
      title: "Aprecieri noi",
      body: `${roCount(likeCount, "persoană", "persoane")} ți-au apreciat anunțul`,
    }
  }

  if (trendCount === 1) {
    return { title: "Ești în tendințe", body: "Unul dintre anunțurile tale atrage multă atenție azi" }
  }
  return {
    title: "Ești în tendințe",
    body: `${roCount(trendCount, "anunț de-al tău este", "anunțuri de-ale tale sunt")} în tendințe azi`,
  }
}

// ── Grouping keys ───────────────────────────────────────────────────────────

/**
 * One stack, one replaceable banner, per person.
 *
 * Unlike chat — where the key is per CONVERSATION so two people writing at once
 * produce two stacks — every activity digest for one person supersedes the last
 * one, because the newer digest is always the better summary. A digest sitting
 * on the lock screen saying "3 aprecieri" next to one saying "8 aprecieri" is
 * two ways of saying the same thing, one of them stale.
 */
export function activityThreadIdFor(recipientId: string): string {
  return `activity_${recipientId}`
}

// ── The plan ────────────────────────────────────────────────────────────────

export type ActivitySkipReason =
  | "muted"
  | "nothing-pending"
  | "too-soon"
  | "quiet-hours"
  | "claim-lost"

export interface ActivityPlan {
  send: boolean
  reason?: ActivitySkipReason
  /** The events this plan intends to consume. Claimed before anything is sent. */
  eventIds: string[]
  text?: DigestText
  data?: Record<string, string>
  threadId?: string
  collapseId?: string
}

export interface ActivityContext {
  now: Date
  enabled: boolean
  preview: boolean
  /** Epoch ms of the last activity digest sent to this person, or null. */
  lastPushAt: number | null
  /** Overridable so a test can pin quiet hours without pinning the clock. */
  timeZone?: string
}

/**
 * Decide, without doing anything.
 *
 * Split from the send so the ordering is visible in one screen and so the tests
 * can assert on a decision rather than on a mock's call log. The order is the
 * same discipline as the chat module: free comparisons first, and nothing is
 * read or written for a digest that was never going out.
 */
export function planDigest(
  pending: PendingActivity[],
  ctx: ActivityContext,
  recipientId: string,
): ActivityPlan {
  if (!ctx.enabled) return { send: false, reason: "muted", eventIds: [] }

  const nowMs = ctx.now.getTime()

  // Fresh events are not eligible yet — see SETTLE_MS. Ancient ones are not
  // eligible ever, and are NOT in this list: expiring them is the sweep's job
  // (see runActivityDigest), because dropping events is a write and this
  // function does not do writes.
  const eligible = pending.filter(
    (e) => nowMs - e.createdAt >= SETTLE_MS && nowMs - e.createdAt <= MAX_AGE_MS,
  )
  if (eligible.length === 0) return { send: false, reason: "nothing-pending", eventIds: [] }

  if (ctx.lastPushAt !== null && nowMs - ctx.lastPushAt < MIN_GAP_MS) {
    // Deliberately leaves them pending. They roll into the next digest, which
    // is how a quiet afternoon becomes one push instead of six.
    return { send: false, reason: "too-soon", eventIds: [] }
  }

  if (isQuietHour(ctx.now, ctx.timeZone)) {
    return { send: false, reason: "quiet-hours", eventIds: [] }
  }

  const events = eligible.slice(0, MAX_EVENTS_PER_DIGEST)
  return {
    send: true,
    eventIds: events.map((e) => e.id),
    ...buildDigest(events, ctx.preview, recipientId),
  }
}

/**
 * Turn a set of events into the thing handed to the sender.
 *
 * Separate from planDigest because it is called TWICE in the real flow: once to
 * plan, and once after the claim, on the rows the claim actually won. See the
 * note on the race in lib/push/activity-db.ts — in short, two overlapping cron
 * runs can each win part of a set, and building the text from the claimed rows
 * rather than the read rows is what keeps the number honest.
 */
export function buildDigest(
  events: PendingActivity[],
  preview: boolean,
  recipientId: string,
): { text: DigestText; data: Record<string, string>; threadId: string; collapseId: string } {
  const likes = events.filter((e) => e.kind === "like").length
  const follows = events.filter((e) => e.kind === "follow").length
  const trending = events.filter((e) => e.kind === "trending").length
  const key = activityThreadIdFor(recipientId)
  return {
    text: summarize(events, preview),
    // Counts and a type. No actor ids, no listing ids, no names — the payload
    // travels through two third parties and the feed already holds the detail.
    data: {
      type: "activity",
      likes: String(likes),
      follows: String(follows),
      trending: String(trending),
    },
    threadId: key,
    collapseId: key,
  }
}
