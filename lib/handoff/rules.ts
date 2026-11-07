/**
 * ===========================================================================
 *  HANDING A BUSINESS TO SOMEBODY ELSE: THE RULES
 * ===========================================================================
 * A founder builds a business for a client from their own login: a business
 * account they added from the account menu (lib/businesses, SQL part 39).
 * That account is the business. Its creator row, OnePage, store, products,
 * orders, websites, domains, files and emails are all keyed by its user id or
 * its creator id, and which login may open it is one row in
 * public.business_links (owner_id = the login, member_id = the business).
 *
 * So a handoff moves that one row, from the founder's login to the client's,
 * inside public.business_handoff_accept (supabase/migrations/
 * 20271131_business_handoff.sql). Nothing the business owns is rewritten:
 * the account id and creator id stay, and with them the username, the
 * OnePage address, the store's address, the custom domains and every
 * storage path (they are named by the business's own user id). What was the
 * founder's own and not the business's is detached in the same transaction:
 * payout accounts, the billing customer and saved cards, AI keys, agent and
 * analytics tokens, the GitHub link, devices, pending codes, and the team.
 *
 * A login's FIRST business is the login itself (its email and password), so
 * it can never be handed over this way: only a business made from the
 * account menu can. lib/handoff/coverage.ts lists every table and what
 * happens to it.
 *
 * Pure: no database, no clock but the one passed. tests/business-handoff
 * holds every rule to account.
 */
import { MAX_BUSINESSES } from "@/lib/businesses/rules"
import { presetPermissions } from "@/lib/team/permissions"

/** How long a claim link works, in days, unless the founder picks another. */
export const DEFAULT_TTL_DAYS = 7
export const TTL_CHOICES = [1, 3, 7, 14, 30] as const
export const MIN_TTL_DAYS = 1
export const MAX_TTL_DAYS = 30
/** A link sent again within this long is a double press, not a second email. */
export const RESEND_COOLDOWN_MS = 60 * 1000

/** What the founder keeps when they stay on the team. Never payouts, billing or the team itself: the presets leave those out. */
export const FOUNDER_ACCESS = ["full", "content", "support"] as const
export type FounderAccess = (typeof FOUNDER_ACCESS)[number]

export function isFounderAccess(v: unknown): v is FounderAccess {
  return typeof v === "string" && (FOUNDER_ACCESS as readonly string[]).includes(v)
}

/** The permissions the SQL function gives a founder who stays: the team's own presets, word for word. */
export function founderPermissions(access: FounderAccess): string[] {
  return presetPermissions(access)
}

export function ttlDays(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return DEFAULT_TTL_DAYS
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,2}$/.test(v) ? Number(v) : NaN
  return Number.isInteger(n) && n >= MIN_TTL_DAYS && n <= MAX_TTL_DAYS ? n : null
}

/** A claim token: 32 random bytes as base64url, 43 characters. Anything else is not one of ours. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
export function tokenShapeOk(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token)
}

/** An email as a handoff keeps it: trimmed, lower case, or null when it is not one. */
export function handoffEmail(v: unknown): string | null {
  if (typeof v !== "string") return null
  const e = v.trim().toLowerCase()
  if (e.length < 3 || e.length > 254) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase()
  const y = (b ?? "").trim().toLowerCase()
  return !!x && x === y
}

/** The page a claim link opens. Under /team, a word no creator can hold, so no creator's page is ever shadowed by it. */
export const CLAIM_PREFIX = "/team/claim/"
export function claimPath(token: string): string {
  return `${CLAIM_PREFIX}${encodeURIComponent(token)}`
}

/** Log in or create an account, then straight back to the claim. The email is filled in when the link was sent to one. */
export function claimSignInPath(token: string, opts: { signup: boolean; email: string | null }): string {
  const params = new URLSearchParams()
  if (opts.email) params.set("email", opts.email)
  params.set("next", claimPath(token))
  return `${opts.signup ? "/signup" : "/login"}?${params.toString()}`
}

/* ── The row, and what a claim link says when it is opened ─────────────── */

export interface HandoffRow {
  id: string
  business_user_id: string
  creator_id: string | null
  from_owner_id: string
  recipient_email: string | null
  keep_founder: boolean
  founder_access: FounderAccess
  ttl_days: number
  status: "pending" | "accepted" | "revoked" | "expired"
  expires_at: string
  created_at: string
  last_sent_at: string | null
  send_count: number
  accepted_at: string | null
  accepted_by: string | null
  revoked_at: string | null
  finished_at: string | null
}

export interface BusinessShown {
  name: string
  avatarUrl: string | null
}

/** Why a business cannot be handed over yet. The founder fixes these; the link waits. */
export type Blocker = "paid_plan" | "live_memberships" | "payout_balance" | "payouts_unreachable"

export const BLOCKER_TEXT: Record<Blocker, string> = {
  paid_plan: "This business is on a paid plan billed to you. Cancel it in Settings, Plan and wait for it to end, then the new owner picks their own.",
  live_memberships: "Buyers pay a monthly or yearly membership into your payout account. Cancel those memberships first, so their payments stop reaching you.",
  payout_balance: "There is money in this business's payout account. Cash it out first.",
  payouts_unreachable: "We couldn't check this business's payout account just now. Try again in a minute.",
}

/** The same, as the person taking the business over reads it on the claim page. */
export const BLOCKER_TEXT_FOR_RECIPIENT: Record<Blocker, string> = {
  paid_plan: "It is still on a paid plan billed to the sender. Once that plan ends, you choose your own.",
  live_memberships: "Buyers still pay memberships into the sender's payout account. Those have to end first.",
  payout_balance: "The sender's payout account for it still holds money they need to cash out.",
  payouts_unreachable: "We couldn't check the payout account just now. Try again in a minute.",
}

/** Who is looking: nobody, or the login they signed in with (the first business of their group, whichever business they were in). */
export interface Viewer {
  /** The login: the group's first account. Ownership goes to this one. */
  loginId: string
  /** The account this browser is in now. */
  sessionId: string
  /** The login's own email, as Supabase Auth has it. */
  email: string | null
  emailVerified: boolean
  /** Every account in the viewer's group, the login first. */
  groupIds: string[]
}

export type ClaimState =
  | { kind: "invalid" }
  | { kind: "gone" }
  | { kind: "revoked"; business: BusinessShown }
  | { kind: "expired"; business: BusinessShown }
  | { kind: "accepted"; business: BusinessShown; mine: boolean; businessUserId: string }
  | { kind: "stale"; business: BusinessShown }
  | { kind: "signed_out"; business: BusinessShown; email: string | null }
  | { kind: "own"; business: BusinessShown }
  | { kind: "wrong_email"; business: BusinessShown; email: string; signedInAs: string | null }
  | { kind: "verify_email"; business: BusinessShown; signedInAs: string | null; userId: string }
  | { kind: "limit"; business: BusinessShown }
  | { kind: "not_ready"; business: BusinessShown; blockers: Blocker[] }
  | { kind: "ready"; business: BusinessShown; email: string | null; keepFounder: boolean }

/**
 * One answer per way a claim link can be, decided here so the page, the
 * accept and the suite agree. The database decides again inside the
 * transfer (business_handoff_accept), so a page drawn a moment too early
 * never moves anything it should not.
 */
export function claimStateOf(input: {
  token: unknown
  handoff: HandoffRow | null
  business: BusinessShown | null
  /** The founder's login still holds the business (business_links). False once it moved or was deleted. */
  stillFounders: boolean
  viewer: Viewer | null
  blockers: Blocker[]
  now: number
}): ClaimState {
  const { handoff, viewer } = input
  if (!tokenShapeOk(input.token)) return { kind: "invalid" }
  if (!handoff) return { kind: "gone" }
  const business: BusinessShown = input.business ?? { name: "A Storelib business", avatarUrl: null }
  if (handoff.status === "accepted") {
    const mine = !!viewer && (viewer.groupIds.includes(handoff.business_user_id) || (!!handoff.accepted_by && viewer.groupIds.includes(handoff.accepted_by)))
    return { kind: "accepted", business, mine, businessUserId: handoff.business_user_id }
  }
  if (handoff.status === "revoked") return { kind: "revoked", business }
  if (handoff.status === "expired" || Date.parse(handoff.expires_at) <= input.now) return { kind: "expired", business }
  if (!input.stillFounders) return { kind: "stale", business }
  if (!viewer) return { kind: "signed_out", business, email: handoff.recipient_email }
  /* The founder, from their login or any business of it (the one being handed over included). */
  if (viewer.groupIds.includes(handoff.from_owner_id) || viewer.groupIds.includes(handoff.business_user_id)) return { kind: "own", business }
  if (handoff.recipient_email && !sameEmail(viewer.email, handoff.recipient_email)) {
    return { kind: "wrong_email", business, email: handoff.recipient_email, signedInAs: viewer.email }
  }
  if (!viewer.emailVerified) return { kind: "verify_email", business, signedInAs: viewer.email, userId: viewer.loginId }
  if (viewer.groupIds.length >= MAX_BUSINESSES) return { kind: "limit", business }
  if (input.blockers.length > 0) return { kind: "not_ready", business, blockers: input.blockers }
  return { kind: "ready", business, email: handoff.recipient_email, keepFounder: handoff.keep_founder }
}

/**
 * What the transfer function's refusals mean, by the word it raises
 * (business_handoff_accept). Anything else is a failure to try again: the
 * transaction rolled back and the link still works.
 */
export const SQL_REFUSALS: Record<string, { state: ClaimState["kind"] | "failed"; status: number; error: string }> = {
  handoff_invalid: { state: "invalid", status: 400, error: "This link is not complete. Open it from the email again." },
  handoff_not_found: { state: "gone", status: 404, error: "This link doesn't work any more." },
  handoff_used: { state: "accepted", status: 409, error: "This link has already been used." },
  handoff_revoked: { state: "revoked", status: 410, error: "This link was cancelled." },
  handoff_expired: { state: "expired", status: 410, error: "This link has expired." },
  handoff_stale: { state: "stale", status: 409, error: "This business is no longer the sender's to give." },
  handoff_self: { state: "own", status: 400, error: "This business is already yours." },
  handoff_recipient_is_business: { state: "own", status: 400, error: "Accept it from the account you sign in with." },
  handoff_recipient_missing: { state: "failed", status: 401, error: "Sign in again, then accept." },
  handoff_wrong_email: { state: "wrong_email", status: 403, error: "This link was sent to another email." },
  handoff_limit: { state: "limit", status: 409, error: `You already have ${MAX_BUSINESSES} businesses, the most one login can have.` },
  handoff_paid_plan: { state: "not_ready", status: 409, error: BLOCKER_TEXT.paid_plan },
  handoff_live_memberships: { state: "not_ready", status: 409, error: BLOCKER_TEXT.live_memberships },
  handoff_team_missing: { state: "failed", status: 503, error: "The team is not set up on Storelib yet. Try again later." },
  handoff_founder_email: { state: "failed", status: 500, error: "The handover could not finish. Nothing changed. Try again." },
}

export function refusalOfSql(error: { message?: string | null; code?: string | null } | null | undefined): { code: string; state: ClaimState["kind"] | "failed"; status: number; error: string } {
  const message = error?.message ?? ""
  const code = Object.keys(SQL_REFUSALS).find((k) => new RegExp(`\\b${k}\\b`).test(message))
  if (code) return { code, ...SQL_REFUSALS[code] }
  /* 23514 from business_links' own limit trigger, between our count and the insert. */
  if (error?.code === "23514") return { code: "handoff_limit", ...SQL_REFUSALS.handoff_limit }
  return { code: "failed", state: "failed", status: 500, error: "The handover could not finish. Nothing changed and the link still works. Try again." }
}

/** The answer a refused accept gives, from the page's own states. */
export function refusalOf(state: ClaimState): { status: number; error: string } | null {
  switch (state.kind) {
    case "ready":
      return null
    case "invalid":
      return { status: 400, error: SQL_REFUSALS.handoff_invalid.error }
    case "gone":
      return { status: 404, error: SQL_REFUSALS.handoff_not_found.error }
    case "revoked":
      return { status: 410, error: SQL_REFUSALS.handoff_revoked.error }
    case "expired":
      return { status: 410, error: SQL_REFUSALS.handoff_expired.error }
    case "accepted":
      return { status: 409, error: state.mine ? "This business is already yours." : SQL_REFUSALS.handoff_used.error }
    case "stale":
      return { status: 409, error: SQL_REFUSALS.handoff_stale.error }
    case "signed_out":
      return { status: 401, error: "Sign in to accept." }
    case "own":
      return { status: 400, error: SQL_REFUSALS.handoff_self.error }
    case "wrong_email":
      return { status: 403, error: `This link was sent to ${state.email}. Sign in with that email to accept.` }
    case "verify_email":
      return { status: 403, error: "Confirm your email first, then accept." }
    case "limit":
      return { status: 409, error: SQL_REFUSALS.handoff_limit.error }
    case "not_ready":
      return { status: 409, error: state.blockers.map((b) => BLOCKER_TEXT_FOR_RECIPIENT[b]).join(" ") }
  }
}

/* ── What goes with the business, as the claim page lists it ──────────── */

export const GOES_WITH_IT = [
  "The OnePage, store and creator page, at the same addresses",
  "Products, orders, customers and reviews",
  "Websites and custom domains",
  "Pictures, files and downloads",
  "Emails, subscribers, communities and courses",
  "Settings, taxes, shipping and integrations",
] as const

export const STAYS_BEHIND = [
  "The sender's payout account. Connect your own to get paid.",
  "The sender's plan, card and invoices. You choose your own plan.",
  "The sender's other businesses and their login",
  "AI keys, agent and analytics tokens, and the GitHub link",
  "The current team. You can invite your own.",
] as const
