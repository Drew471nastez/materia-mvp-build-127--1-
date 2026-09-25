/**
 * ===========================================================================
 *  WHERE A CAMPAIGN IS, AND WHERE IT MAY GO NEXT
 * ===========================================================================
 * A campaign moves one way:
 *
 *     draft ─┬─> scheduled ─┐
 *            │      │       │
 *            │      v       v
 *            └──────────> queued ──> sending ──┬─> sent
 *                                              ├─> partially_failed
 *                                              ├─> failed
 *                                              └─> cancelled
 *
 * Every move is written as a conditional update, "set the new status WHERE
 * the status is still the one I read", and the move only counts when a row
 * comes back. Two clicks on Send, two tabs, or the cron and a click arriving
 * together all ask the database the same question and exactly one of them
 * gets a row. Nothing in memory decides it: serverless instances share none.
 *
 * Pure: no I/O. The queue (lib/email-campaigns/queue.ts), the routes and the
 * compose page all read the same answers from here.
 */

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "queued",
  "sending",
  "sent",
  "partially_failed",
  "failed",
  "cancelled",
] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

/** What the database accepted before supabase/sql/RUN_EMAIL_SENDING.sql. */
export const LEGACY_CAMPAIGN_STATUSES: readonly CampaignStatus[] = ["draft", "scheduled", "sending", "sent", "failed"]

/** Content can still change. */
export const EDITABLE: readonly CampaignStatus[] = ["draft", "scheduled"]
/** A worker may be sending it right now. */
export const ACTIVE: readonly CampaignStatus[] = ["queued", "sending"]
/** Nothing more will happen to it on its own. */
export const FINISHED: readonly CampaignStatus[] = ["sent", "partially_failed", "failed", "cancelled"]

const NEXT: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["scheduled", "queued"],
  scheduled: ["draft", "queued", "failed"],
  queued: ["sending", "cancelled", "failed"],
  sending: ["sent", "partially_failed", "failed", "cancelled"],
  /* Sending the failed ones again. The ones that went out are never touched. */
  partially_failed: ["sending"],
  /* Again, or back to a draft to fix what stopped it. */
  failed: ["sending", "draft"],
  sent: [],
  cancelled: [],
}

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(value)
}

/** An unknown stored value reads as a draft: never as something being sent. */
export function readStatus(value: unknown): CampaignStatus {
  return isCampaignStatus(value) ? value : "draft"
}

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return NEXT[from].includes(to)
}

/** Every status a campaign may move to `to` from. The WHERE of the conditional update. */
export function sourcesOf(to: CampaignStatus): CampaignStatus[] {
  return CAMPAIGN_STATUSES.filter((from) => NEXT[from].includes(to))
}

/**
 * The status as the database can store it. Before the migration the check
 * only knew five words, so the new ones are written as the nearest old one:
 * queued is already sending, a partial send is sent (the counts say the
 * rest), and a stopped send is sent when anything went and a draft when
 * nothing did.
 */
export function storedStatus(status: CampaignStatus, legacy: boolean, sentSoFar = 0): CampaignStatus {
  if (!legacy) return status
  if (status === "queued") return "sending"
  if (status === "partially_failed") return "sent"
  if (status === "cancelled") return sentSoFar > 0 ? "sent" : "draft"
  return status
}

/** The WHERE for a move, in the words the database holds. */
export function storedSources(to: CampaignStatus, legacy: boolean): CampaignStatus[] {
  const all = sourcesOf(to).map((s) => storedStatus(s, legacy))
  return [...new Set(all)].filter((s) => !legacy || LEGACY_CAMPAIGN_STATUSES.includes(s))
}

/* ─── Recipients ─────────────────────────────────────────────────────── */

export const RECIPIENT_STATUSES = ["pending", "sending", "sent", "delivered", "bounced", "complained", "failed", "skipped"] as const
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number]

/** The provider took it. Delivered, bounced and complained all started as a send. */
export const WENT_OUT: readonly RecipientStatus[] = ["sent", "delivered", "bounced", "complained"]
/** Still to do. */
export const OUTSTANDING: readonly RecipientStatus[] = ["pending", "sending"]

export interface RecipientCounts {
  total: number
  pending: number
  sending: number
  sent: number
  delivered: number
  bounced: number
  failed: number
  skipped: number
}

export const EMPTY_COUNTS: RecipientCounts = { total: 0, pending: 0, sending: 0, sent: 0, delivered: 0, bounced: 0, failed: 0, skipped: 0 }

/** How many the provider accepted, whatever happened after. */
export function wentOut(c: RecipientCounts): number {
  return c.sent + c.delivered + c.bounced
}

export function outstanding(c: RecipientCounts): number {
  return c.pending + c.sending
}

/**
 * Where a send ends, from what happened to each address.
 *
 * All out is sent. Some out and some not is partially_failed. None out is
 * failed, including the odd case of every address having left the list
 * between Send and its turn, because "sent" to nobody would be a lie.
 */
export function finalStatus(c: RecipientCounts, cancelled = false): CampaignStatus {
  if (cancelled) return "cancelled"
  const out = wentOut(c)
  if (out === 0) return "failed"
  if (c.failed > 0) return "partially_failed"
  return "sent"
}

/** Words for a status, as a creator reads it. */
export const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  partially_failed: "Partly sent",
  failed: "Not sent",
  cancelled: "Stopped",
}
