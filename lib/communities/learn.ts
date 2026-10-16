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
 * WHO OPENS A PROGRAM is one of five choices the creator makes (round 33,
 * the column access_mode of part 200), plus the older rules an attached
 * course may still carry:
 *
 *   free     every active member ("Open" in the builder)
 *   level    members at a level or above (access.minLevel, the same field
 *            spaces and events use, and the levels the points system gives)
 *   paid     bought on its own: a one time price, paid in a sheet on the
 *            community page (Stripe Embedded Checkout), recorded in
 *            community_program_access
 *   time     a number of days after the member joined (drip_days). This is
 *            the older "Opens after joining N days", now a choice of its own.
 *   private  only the members the creator picked (member_ids). Everybody
 *            else does not see it at all: not on the shelf, not its page,
 *            not a free preview.
 *
 * A row from before part 200 has no access_mode and is read as it always
 * was: a price makes it paid, a level a level program, drip days a time
 * program, otherwise free.
 *
 * Staff (owner, admins, moderators) open everything, drafts included. A
 * member who bought a program keeps it as long as they are an active member.
 * Drip days (counted from the day they joined) still apply to a level
 * program that has them from before; a bought program opens at once.
 *
 * Everything here is plain functions over plain data, so the same rule runs
 * in the member page, the course player's lesson check, the checkout and
 * the tests.
 */
import { evaluateAccess, parseAccessRule, type AccessRule } from "./access"
import { slugifyHandle } from "@/lib/profile/username-rules"
import type { Role } from "./types"

export const PROGRAM_STATUSES = ["draft", "published"] as const
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number]

export const PROGRAM_MODES = ["free", "level", "paid", "time", "private"] as const
export type ProgramMode = (typeof PROGRAM_MODES)[number]

export const PROGRAM_TITLE_MAX = 120
export const PROGRAM_SUMMARY_MAX = 2000
/** Stripe's smallest card charge, and the ceiling part 102 holds the price to. */
export const PROGRAM_PRICE_MIN_CENTS = 50
export const PROGRAM_PRICE_MAX_CENTS = 99_999_999
export const MAX_PROGRAMS = 200
export const MAX_LEVEL = 20
/** The members a private program can be given to (part 200 holds member_ids to 1,000). */
export const MAX_PROGRAM_MEMBERS = 1000
/** The rich description, as cleaned HTML (part 200 holds description to 60,000 characters). */
export const PROGRAM_DESCRIPTION_MAX = 60_000
export const MAX_DRIP_DAYS = 3650

const STAFF: readonly Role[] = ["owner", "admin", "moderator"]
const DAY_MS = 86_400_000

/** A program as the rules need it: the stored row, read loosely. */
export interface ProgramRule {
  status: ProgramStatus
  access: unknown
  priceCents: number | null
  dripDays: number | null
  /** The creator's choice (part 200); missing or null on an older row, read from the fields above. */
  accessMode?: string | null
  /** For a private program: the account ids of the members it is open to. */
  memberIds?: readonly string[] | null
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
  /** The viewer's account, for a private program's list. */
  userId?: string | null
}

export type ProgramGate =
  | { open: true; via: "staff" | "member" | "purchase" }
  | { open: false; reason: "not_member" | "draft" }
  | { open: false; reason: "level"; level: number }
  | { open: false; reason: "paid"; priceCents: number }
  | { open: false; reason: "drip"; opensAt: string }
  | { open: false; reason: "private" }
  | { open: false; reason: "tier" | "product" | "role"; need: string | null }

/**
 * Which of the five choices a program is. Private is only ever chosen (it
 * needs its list); otherwise a price makes it paid, a level above 1 a level
 * program, drip days a time program, and anything else is free. The stored
 * choice and the fields agree because updateProgram writes them together;
 * where an older row has only the fields, they decide.
 */
export function programMode(p: { access: unknown; priceCents: number | null; dripDays?: number | null; accessMode?: string | null }): ProgramMode {
  if (p.accessMode === "private") return "private"
  if (typeof p.priceCents === "number" && p.priceCents > 0) return "paid"
  if (parseAccessRule(p.access).minLevel) return "level"
  if (Math.floor(Number(p.dripDays) || 0) > 0) return "time"
  return "free"
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A private program's list as stored: account ids, each once, nothing else. */
export function programMemberIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === "string" && UUID.test(v)).map((v) => v.toLowerCase()))].slice(0, MAX_PROGRAM_MEMBERS)
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
 * staff only; the older tier, product and role rules; a private program's
 * list; the price (bought opens it, and opens it now); the level; the drip
 * day.
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
  const mode = programMode(p)
  if (mode === "private") {
    const me = (v.userId ?? "").toLowerCase()
    return me && programMemberIds(p.memberIds).includes(me) ? { open: true, via: "member" } : { open: false, reason: "private" }
  }
  if (mode === "paid") {
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
  memberIds?: unknown
}

export interface ProgramPatch {
  title?: string
  summary?: string | null
  status?: ProgramStatus
  mode?: ProgramMode
  level?: number
  priceCents?: number | null
  dripDays?: number | null
  /** Sent with mode private: the members picked. Any other mode clears the list. */
  memberIds?: string[]
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
    /* Rich HTML from the editor is held to the description's own limit; the server cleans it and keeps a plain copy (lib/communities/server/learn.ts). */
    const summary = typeof input.summary === "string" ? input.summary.trim() : ""
    const max = /<[a-z][\s\S]*>/i.test(summary) ? PROGRAM_DESCRIPTION_MAX : PROGRAM_SUMMARY_MAX
    if (summary.length > max) return { ok: false, field: "summary", error: `Keep the description under ${max.toLocaleString("en-US")} characters.` }
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
    if (patch.mode === "private") {
      if (input.memberIds !== undefined && !Array.isArray(input.memberIds)) return { ok: false, field: "members", error: "Pick the members it is for." }
      if (Array.isArray(input.memberIds) && input.memberIds.length > MAX_PROGRAM_MEMBERS) return { ok: false, field: "members", error: `A private program is for up to ${MAX_PROGRAM_MEMBERS.toLocaleString("en-US")} members.` }
      patch.memberIds = programMemberIds(input.memberIds)
    } else {
      patch.memberIds = []
    }
  }
  if (input.dripDays !== undefined) {
    if (input.dripDays === null || input.dripDays === "" || input.dripDays === 0) patch.dripDays = null
    else {
      const days = Math.floor(Number(input.dripDays))
      if (!Number.isFinite(days) || days < 0 || days > MAX_DRIP_DAYS) return { ok: false, field: "dripDays", error: "Use a number of days from 0 to 3650." }
      patch.dripDays = days || null
    }
  }
  /* A time program is its days, at least one. Open, bought and private open without a wait, so their days go with the change. */
  if (patch.mode === "time") {
    if (!patch.dripDays) return { ok: false, field: "dripDays", error: "Say how many days after joining it opens." }
  } else if (patch.mode === "free" || patch.mode === "paid" || patch.mode === "private") {
    patch.dripDays = null
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

/** A readable path segment from a program or lesson title. Empty when the title cannot make one. */
export function contentKey(title: string | null | undefined): string {
  const base = slugifyHandle(title, 60)
  return base.length >= 2 ? base : ""
}

/** Unique among siblings: the title key, or that key plus a short id when two share a title. */
export function uniqueContentKey(title: string | null | undefined, id: string, taken: ReadonlySet<string>): string {
  const base = contentKey(title)
  if (!base) return id
  if (!taken.has(base)) return base
  return `${base}-${id.replace(/-/g, "").slice(0, 4)}`
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
