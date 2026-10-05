/**
 * ===========================================================================
 *  LEARN: PROGRAMS IN A COMMUNITY (the rules, pure and browser safe)
 * ===========================================================================
 * Round 13 renamed the Classroom to Learn, and what it holds are programs:
 * modules of lessons. A program is one row of community_courses (part 102):
 *
 *   an attached course   product_id set: a course product the creator sells
 *                        elsewhere too, its lessons the course's own. Every
 *                        course attached before part 102 is one of these and
 *                        keeps working unchanged.
 *   a program            product_id empty, course_id pointing at its own
 *                        modules and lessons (the same courses tables, with
 *                        no product). Made in the community, never a
 *                        Storelib product.
 *
 * WHO OPENS A PROGRAM is one of three choices the creator makes, plus the
 * older rules an attached course may still carry:
 *
 *   free     every active member
 *   level    members at a level or above (access.minLevel, the same field
 *            spaces and events use)
 *   paid     bought on its own: a one time price, paid in a sheet on the
 *            community page (Stripe Embedded Checkout), recorded in
 *            community_program_access
 *
 * Staff (owner, admins, moderators) open everything, drafts included. A
 * member who bought a program keeps it as long as they are an active member.
 * Drip days (counted from the day they joined) still apply to free and level
 * programs; a bought program opens at once.
 *
 * Everything here is plain functions over plain data, so the same rule runs
 * in the member page, the course player's lesson check, the checkout and
 * the tests.
 */
import { evaluateAccess, parseAccessRule, type AccessRule } from "./access"
import type { Role } from "./types"

export const PROGRAM_STATUSES = ["draft", "published"] as const
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number]

export const PROGRAM_MODES = ["free", "level", "paid"] as const
export type ProgramMode = (typeof PROGRAM_MODES)[number]

export const PROGRAM_TITLE_MAX = 120
export const PROGRAM_SUMMARY_MAX = 2000
/** Stripe's smallest card charge, and the ceiling part 102 holds the price to. */
export const PROGRAM_PRICE_MIN_CENTS = 50
export const PROGRAM_PRICE_MAX_CENTS = 99_999_999
export const MAX_PROGRAMS = 200
export const MAX_LEVEL = 20

const STAFF: readonly Role[] = ["owner", "admin", "moderator"]
const DAY_MS = 86_400_000

/** A program as the rules need it: the stored row, read loosely. */
export interface ProgramRule {
  status: ProgramStatus
  access: unknown
  priceCents: number | null
  dripDays: number | null
}

export interface ProgramViewer {
  role: Role | null
  active: boolean
  tierId: string | null
  ownedProductIds: readonly string[]
  level: number
  joinedAt: string | null
  /** An active row in community_program_access for this program. */
  purchased: boolean
}

export type ProgramGate =
  | { open: true; via: "staff" | "member" | "purchase" }
  | { open: false; reason: "not_member" | "draft" }
  | { open: false; reason: "level"; level: number }
  | { open: false; reason: "paid"; priceCents: number }
  | { open: false; reason: "drip"; opensAt: string }
  | { open: false; reason: "tier" | "product" | "role"; need: string | null }

/** Which of the three choices a program is: a price makes it paid, a level above 1 makes it a level program, otherwise free. */
export function programMode(p: { access: unknown; priceCents: number | null }): ProgramMode {
  if (typeof p.priceCents === "number" && p.priceCents > 0) return "paid"
  if (parseAccessRule(p.access).minLevel) return "level"
  return "free"
}

/** When a drip program opens for a member: joined_at plus drip_days, or null when it does not drip. */
export function dripOpensAt(joinedAt: string | null | undefined, dripDays: number | null | undefined, now: number = Date.now()): string | null {
  const days = Math.floor(Number(dripDays) || 0)
  if (days <= 0) return null
  const joined = Date.parse(joinedAt ?? "")
  /* A member row with no join time is counted from now: it opens after the full wait, never early. */
  const from = Number.isFinite(joined) ? joined : now
  return new Date(from + days * DAY_MS).toISOString()
}

/**
 * WHETHER THIS VIEWER MAY OPEN THIS PROGRAM, and if not, the one thing in
 * the way. In order: a member at all; staff open everything; a draft is
 * staff only; the older tier, product and role rules; the price (bought
 * opens it, and opens it now); the level; the drip day.
 */
export function programGate(p: ProgramRule, v: ProgramViewer, now: number = Date.now()): ProgramGate {
  if (!v.active || !v.role) return { open: false, reason: "not_member" }
  if (STAFF.includes(v.role)) return { open: true, via: "staff" }
  if (p.status !== "published") return { open: false, reason: "draft" }
  const rule: AccessRule = parseAccessRule(p.access)
  const { minLevel, ...others } = rule
  const other = evaluateAccess(others, v)
  if (other.ok === false) {
    if (other.reason === "not_member") return { open: false, reason: "not_member" }
    if (other.reason === "tier" || other.reason === "product" || other.reason === "role") return { open: false, reason: other.reason, need: other.need ?? null }
  }
  if (programMode(p) === "paid") {
    if (v.purchased) return { open: true, via: "purchase" }
    return { open: false, reason: "paid", priceCents: p.priceCents as number }
  }
  if (minLevel && (v.level || 1) < minLevel) return { open: false, reason: "level", level: minLevel }
  const opensAt = dripOpensAt(v.joinedAt, p.dripDays, now)
  if (opensAt && Date.parse(opensAt) > now) return { open: false, reason: "drip", opensAt }
  return { open: true, via: "member" }
}

/* ── Prices ─────────────────────────────────────────────────────────────── */

/** "$49", "$49.50", "RON 120": one time, in the program's currency. */
export function programPrice(cents: number, currency: string | null | undefined): string {
  const code = (currency || "usd").toUpperCase()
  const whole = cents % 100 === 0
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100)
  } catch {
    return `${code} ${(cents / 100).toFixed(whole ? 0 : 2)}`
  }
}

/** A price as the builder's field holds it ("49", "49.5", "49,50") in cents, or null when it is not one. */
export function centsFromTyped(raw: string): number | null {
  const clean = raw.trim().replace(/,/g, ".")
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(clean)) return null
  const cents = Math.round(Number(clean) * 100)
  return Number.isFinite(cents) ? cents : null
}

/** Cents as the builder's field shows them: 4900 -> "49", 4950 -> "49.50". */
export function typedFromCents(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return ""
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)
}

/* ── What the builder sends, checked ────────────────────────────────────── */

export interface ProgramInput {
  title?: unknown
  summary?: unknown
  coverUrl?: unknown
  status?: unknown
  mode?: unknown
  level?: unknown
  priceCents?: unknown
  dripDays?: unknown
}

export interface ProgramPatch {
  title?: string
  summary?: string | null
  status?: ProgramStatus
  mode?: ProgramMode
  level?: number
  priceCents?: number | null
  dripDays?: number | null
}

export type ProgramCheck = { ok: true; patch: ProgramPatch } | { ok: false; field: string; error: string }

/**
 * The builder's fields, each checked on its own, so a save that names one
 * field changes only that one. The cover is checked by the server (only our
 * own storage), not here.
 */
export function checkProgramInput(input: ProgramInput, opts: { requireTitle?: boolean } = {}): ProgramCheck {
  const patch: ProgramPatch = {}
  if (input.title !== undefined || opts.requireTitle) {
    const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : ""
    if (!title) return { ok: false, field: "title", error: "Give the program a name." }
    if (title.length > PROGRAM_TITLE_MAX) return { ok: false, field: "title", error: `Keep the name under ${PROGRAM_TITLE_MAX} characters.` }
    patch.title = title
  }
  if (input.summary !== undefined) {
    const summary = typeof input.summary === "string" ? input.summary.trim() : ""
    if (summary.length > PROGRAM_SUMMARY_MAX) return { ok: false, field: "summary", error: `Keep the description under ${PROGRAM_SUMMARY_MAX.toLocaleString("en-US")} characters.` }
    patch.summary = summary || null
  }
  if (input.status !== undefined) {
    if (!(PROGRAM_STATUSES as readonly unknown[]).includes(input.status)) return { ok: false, field: "status", error: "Pick draft or published." }
    patch.status = input.status as ProgramStatus
  }
  if (input.mode !== undefined) {
    if (!(PROGRAM_MODES as readonly unknown[]).includes(input.mode)) return { ok: false, field: "mode", error: "Pick who can open it." }
    patch.mode = input.mode as ProgramMode
    if (patch.mode === "level") {
      const level = Math.floor(Number(input.level))
      if (!Number.isFinite(level) || level < 2 || level > MAX_LEVEL) return { ok: false, field: "level", error: `Pick a level from 2 to ${MAX_LEVEL}.` }
      patch.level = level
    }
    if (patch.mode === "paid") {
      const cents = typeof input.priceCents === "number" ? Math.round(input.priceCents) : Number.NaN
      if (!Number.isFinite(cents) || cents < PROGRAM_PRICE_MIN_CENTS) return { ok: false, field: "price", error: "Set a price of at least 0.50." }
      if (cents > PROGRAM_PRICE_MAX_CENTS) return { ok: false, field: "price", error: "That price is too high." }
      patch.priceCents = cents
    } else {
      patch.priceCents = null
    }
  }
  if (input.dripDays !== undefined) {
    if (input.dripDays === null || input.dripDays === "" || input.dripDays === 0) patch.dripDays = null
    else {
      const days = Math.floor(Number(input.dripDays))
      if (!Number.isFinite(days) || days < 0 || days > 3650) return { ok: false, field: "dripDays", error: "Use a number of days from 0 to 3650." }
      patch.dripDays = days || null
    }
  }
  return { ok: true, patch }
}

/**
 * The stored access rule after a mode change: the level goes in or comes
 * out, and anything else an older attached course carries (a tier, a
 * product, a role) is kept as it was.
 */
export function accessForMode(current: unknown, mode: ProgramMode, level?: number): Record<string, unknown> {
  const base = current && typeof current === "object" && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {}
  delete base.minLevel
  if (mode === "level" && level && level > 1) base.minLevel = Math.min(MAX_LEVEL, Math.floor(level))
  return base
}

/* ── Addresses ──────────────────────────────────────────────────────────── */

export function learnHref(slug: string): string {
  return `/community/${slug}/learn`
}

export function programHref(slug: string, programId: string, lessonId?: string | null): string {
  return `${learnHref(slug)}/${programId}${lessonId ? `?lesson=${lessonId}` : ""}`
}

/**
 * THE OLD CLASSROOM ADDRESSES, SENT ON FOR GOOD (proxy.ts answers a 308):
 * /community/<slug>/classroom and /community/<slug>/classroom/<id>, with or
 * without a trailing slash, go to the same place under /learn. An old
 * course link carries the course product's id, which the Learn page finds
 * as well as a program's own id. Null for any other address.
 */
export function learnAddressFor(pathname: string): string | null {
  const m = /^\/community\/([^/]+)\/classroom(\/[^/]+)?\/?$/.exec(pathname)
  if (!m) return null
  return `/community/${m[1]}/learn${m[2] ?? ""}`
}
