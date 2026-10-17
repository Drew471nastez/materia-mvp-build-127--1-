/**
 * ===========================================================================
 *  THE CREATOR'S COMMUNITY SCREENS: THE RULES BOTH SIDES APPLY
 * ===========================================================================
 * What a creator may type into the create flow, a space, an event, a level
 * or a price, checked by the screen before it sends and by the route before
 * it writes, from the same function, so the two never disagree. Also the
 * small pieces of arithmetic the screens and the server share: keyset
 * cursors, CSV cells, an event's wall clock time in its own zone, the
 * Overview's next steps and the Analytics series.
 *
 * Pure and browser safe: no server import, so a "use client" screen may use
 * all of it.
 */
import { centsFromInput } from "@/lib/memberships/plan"
import { cleanRefundPolicy } from "@/lib/communities/membership-policy"
import { isPricing, isPrivacy, pricingOf, privacyOf, type AccessColumns, type CommunityPricing, type CommunityPrivacy } from "@/lib/communities/access-model"
import { assignableRoles, canActOn, ROLE_RANK } from "@/lib/communities/permissions"
import { LENGTHS, MAX_BENEFITS, MAX_FAQ, MAX_LEVELS, MAX_LINKS, MAX_RULES } from "@/lib/communities/limits"
import { relativeTime } from "@/lib/communities/format"
import { embedFromUrl, embedThumbUrl, type EmbedRef } from "@/lib/communities/post-media"
import { EVENT_KINDS, POST_ROLES, ROLES, SPACE_KINDS, isOneOf, type AccessRuleJson, type CommunityAccess, type CommunityFaq, type CommunityLink, type CommunityRule, type CommunityVisibility, type EventKind, type PostRole, type Role, type SpaceKind } from "@/lib/communities/types"

import type { MemberActionTaken } from "./view-types"
import { tt } from "@/lib/i18n/text"
import { money } from "@/lib/memberships/state"
import { appLocale, zoned } from "@/lib/i18n/format"

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string; field: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v)

/** Control characters out, runs of spaces kept as they were typed (a description has line breaks). */
function plain(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max)
}

/** One line: every run of white space is one space. */
function line(value: unknown, max: number): string {
  return plain(value, max * 2).replace(/\s+/g, " ").trim().slice(0, max)
}

/* ── The three kinds of community a creator picks from ─────────────────── */

export const COMMUNITY_TYPES = ["free", "paid", "private"] as const
export type CommunityType = (typeof COMMUNITY_TYPES)[number]

/** How each kind is stored: who may join (access) and who may find it (visibility). */
export function accessForType(type: CommunityType): { access: CommunityAccess; visibility: CommunityVisibility } {
  if (type === "paid") return { access: "paid", visibility: "public" }
  if (type === "private") return { access: "invite_only", visibility: "private" }
  return { access: "free", visibility: "public" }
}

/** The kind a stored community reads as, for the settings screen. */
export function typeOf(c: { access: CommunityAccess; visibility: CommunityVisibility }): CommunityType {
  if (c.access === "paid" || c.access === "product") return "paid"
  if (c.access === "invite_only" || c.visibility === "private") return "private"
  return "free"
}

/* ── Who can get in, and what it costs: two facts, one card ────────────── */

/**
 * THE SETTINGS CARD'S TWO CHOICES, which replace the one "type" switch for
 * everything but the create flow. Privacy says who can find it and enter,
 * pricing says what joining costs, and the pair is stored in the two columns
 * that already exist (lib/communities/access-model.ts accessColumnsFor). A
 * private community with a paid tier is the combination that was impossible
 * before: only people with the link get in, and it costs money.
 */
export interface AccessChoice {
  privacy: CommunityPrivacy
  pricing: CommunityPricing
}

/** The pair a stored community reads as, for the card's two controls. */
export function accessChoiceOf(c: AccessColumns): AccessChoice {
  return { privacy: privacyOf(c), pricing: pricingOf(c) }
}

/** What the screen sent, checked the way the route checks it. */
export function checkAccessChoice(raw: unknown, current: AccessChoice): Checked<AccessChoice> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const privacy = r.privacy === undefined ? current.privacy : r.privacy
  const pricing = r.pricing === undefined ? current.pricing : r.pricing
  if (!isPrivacy(privacy)) return { ok: false, field: "privacy", error: tt("Pick who can get in.") }
  if (!isPricing(pricing)) return { ok: false, field: "pricing", error: tt("Pick what joining costs.") }
  return { ok: true, value: { privacy, pricing } }
}

export const PRICE_INTERVALS = ["month", "year", "once"] as const
export type PriceInterval = (typeof PRICE_INTERVALS)[number]

/** A recurring price is a membership plan ($1 to $10,000 a month, $1 to $100,000 a year); a one time price is $1 to $10,000. */
export const PRICE_LIMITS = {
  month: { min: 100, max: 1_000_000 },
  year: { min: 100, max: 10_000_000 },
  once: { min: 100, max: 1_000_000 },
} as const

export function checkPrice(raw: unknown, interval: unknown): Checked<{ cents: number; interval: PriceInterval }> {
  if (!isOneOf(PRICE_INTERVALS, interval)) return { ok: false, field: "interval", error: tt("Pick monthly, yearly or one time.") }
  const cents = typeof raw === "number" ? Math.round(raw) : centsFromInput(raw)
  if (cents === null || !Number.isFinite(cents)) return { ok: false, field: "price", error: tt("Add a price.") }
  const { min, max } = PRICE_LIMITS[interval]
  if (cents < min || cents > max) {
    const top = interval === "year" ? "$100,000" : "$10,000"
    return { ok: false, field: "price", error: tt("A price is between $1 and {top}.", { top }) }
  }
  return { ok: true, value: { cents, interval } }
}

/* ── The create flow ────────────────────────────────────────────────────── */

export const DESCRIPTION_CHARS = 2000

export interface CreateInput {
  name: string
  description: string
  logoUrl: string | null
  coverUrl: string | null
  type: CommunityType
  price: { cents: number; interval: PriceInterval } | null
}

const imageUrl = (v: unknown): string | null => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/i.test(v) && v.length <= 1000 ? v : null)

/** The create flow's five fields and the price. Pictures are checked again on the server against the storage host. */
export function checkCreate(raw: unknown): Checked<CreateInput> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const name = line(r.name, 200)
  if (!name) return { ok: false, field: "name", error: tt("Give your community a name.") }
  if (name.length > LENGTHS.communityName.max) return { ok: false, field: "name", error: tt("A name is up to {max} characters.", { max: LENGTHS.communityName.max }) }
  const description = plain(r.description, DESCRIPTION_CHARS + 1)
  if (description.length > DESCRIPTION_CHARS) return { ok: false, field: "description", error: tt("A description is up to {descriptionChars} characters.", { descriptionChars: DESCRIPTION_CHARS }) }
  if (!isOneOf(COMMUNITY_TYPES, r.type)) return { ok: false, field: "type", error: tt("Pick who can join.") }
  let price: CreateInput["price"] = null
  if (r.type === "paid") {
    const p = checkPrice(r.price, r.interval)
    if (!p.ok) return { ok: false, field: (p as { field: string }).field, error: (p as { error: string }).error }
    price = p.value
  }
  return { ok: true, value: { name, description, logoUrl: imageUrl(r.logoUrl), coverUrl: imageUrl(r.coverUrl), type: r.type, price } }
}

/** The first line of a description, as the tagline a card shows, cut at a word. */
export function taglineFrom(description: string, max = LENGTHS.tagline.max): string | null {
  const first = description.split(/\n/).map((s) => s.trim()).find(Boolean) ?? ""
  if (!first) return null
  if (first.length <= max) return first
  const cut = first.slice(0, max - 1)
  const at = cut.lastIndexOf(" ")
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:]+$/, "")}…`
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Plain text as paragraphs of html (the server sanitizes it again before it is stored). */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("")
}

/** Stored html back to the text a textarea shows. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ""
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|div)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/* ── Keyset cursors ─────────────────────────────────────────────────────── */

/**
 * A page's last row, as an opaque token for the next request: the sort value
 * and the id that breaks ties. Never an offset, so page 200 costs what page 1
 * does and a row added meanwhile never shows twice.
 */
export function encodeCursor(sortValue: string | number, id: string | number): string {
  const json = JSON.stringify([sortValue, id])
  const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, "utf8").toString("base64")
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function decodeCursor(raw: unknown): { sort: string | number; id: string | number } | null {
  if (typeof raw !== "string" || !raw || raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/")
    const json = typeof atob === "function" ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, "base64").toString("utf8")
    const v = JSON.parse(json)
    if (!Array.isArray(v) || v.length !== 2) return null
    const [sort, id] = v
    if (!(typeof sort === "string" || typeof sort === "number") || !(typeof id === "string" || typeof id === "number")) return null
    if (typeof sort === "string" && (sort.length > 64 || /[,()]/.test(sort))) return null
    if (typeof id === "string" && !UUID.test(id)) return null
    return { sort, id }
  } catch {
    return null
  }
}

/**
 * The PostgREST filter for "after this cursor" in a newest first (desc) or
 * oldest first (asc) list ordered by a column then id. The sort value was
 * checked by decodeCursor (no commas or brackets) and is quoted besides.
 */
export function keysetOr(column: string, sort: string | number, id: string | number, dir: "desc" | "asc" = "desc"): string {
  const op = dir === "desc" ? "lt" : "gt"
  const v = typeof sort === "number" ? String(sort) : `"${sort}"`
  return `${column}.${op}.${v},and(${column}.eq.${v},id.${op}.${id})`
}

/* ── CSV ────────────────────────────────────────────────────────────────── */

/**
 * One CSV cell. Quoted when it has to be, and a cell that a spreadsheet would
 * run as a formula (=, +, -, @, a tab or a return first) starts with a quote
 * mark, so a member called "=HYPERLINK(...)" is text when the export opens.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvRow(cells: unknown[]): string {
  return `${cells.map(csvCell).join(",")}\r\n`
}

/* ── An event's time in its own zone ────────────────────────────────────── */

export function validTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone || zone.length > 64) return false
  try {
    new Intl.DateTimeFormat(appLocale(), zoned({ timeZone: zone })).format(0)
    return true
  } catch {
    return false
  }
}

function offsetMs(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"))
  return asUtc - Math.floor(instant / 1000) * 1000
}

/**
 * "2026-11-04" at "18:30" in "Europe/Bucharest" as an ISO instant. The
 * offset is read for that very moment (twice, so a date across a daylight
 * saving change lands right). Null for a date or time that is not one.
 */
export function zonedTimeToUtc(date: string, time: string, zone: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "")
  const t = /^(\d{2}):(\d{2})$/.exec(time ?? "")
  if (!d || !t || !validTimeZone(zone)) return null
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])]
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null
  const wall = Date.UTC(y, mo - 1, da, h, mi)
  const check = new Date(wall)
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da) return null
  let guess = wall - offsetMs(wall, zone)
  guess = wall - offsetMs(guess, zone)
  return new Date(guess).toISOString()
}

/** An instant as the date and time inputs show it, in a zone. */
export function utcToZonedParts(iso: string | null | undefined, zone: string): { date: string; time: string } {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t) || !validTimeZone(zone)) return { date: "", time: "" }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(t)
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? ""
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}` }
}

/* ── Access rules a creator sets ───────────────────────────────────────── */

/** A rule from the editor: tiers, a minimum level, roles. Unknown ids are dropped by the server against the community's own. */
export function checkAccessRule(raw: unknown): AccessRuleJson {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const out: AccessRuleJson = {}
  const tiers = Array.isArray(r.tierIds) ? [...new Set(r.tierIds.filter(isUuid))].slice(0, 20) : []
  const products = Array.isArray(r.productIds) ? [...new Set(r.productIds.filter(isUuid))].slice(0, 20) : []
  const roles = Array.isArray(r.roles) ? [...new Set(r.roles.filter((x): x is Role => isOneOf(ROLES, x)))] : []
  if (tiers.length) out.tierIds = tiers
  if (products.length) out.productIds = products
  if (roles.length) out.roles = roles
  const level = Number(r.minLevel)
  if (Number.isInteger(level) && level > 1 && level <= 20) out.minLevel = level
  return out
}

/* ── Spaces ─────────────────────────────────────────────────────────────── */

export interface SpaceInput {
  name: string
  description: string | null
  icon: string | null
  kind: SpaceKind
  postRole: PostRole
  commentsEnabled: boolean
  viewAccess: AccessRuleJson
}

export function checkSpace(raw: unknown, opts: { creating: boolean }): Checked<SpaceInput> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const name = line(r.name, 80)
  if (!name) return { ok: false, field: "name", error: tt("Give the space a name.") }
  if (name.length > LENGTHS.spaceName.max) return { ok: false, field: "name", error: tt("A space name is up to {max} characters.", { max: LENGTHS.spaceName.max }) }
  const description = line(r.description, 400)
  if (description.length > LENGTHS.spaceDescription.max) return { ok: false, field: "description", error: tt("A description is up to {max} characters.", { max: LENGTHS.spaceDescription.max }) }
  const kind = isOneOf(SPACE_KINDS, r.kind) ? r.kind : opts.creating ? "feed" : null
  if (!kind) return { ok: false, field: "kind", error: tt("Pick what the space is for.") }
  const postRole = isOneOf(POST_ROLES, r.postRole) ? r.postRole : kind === "announcements" ? "admin" : "member"
  const icon = line(r.icon, 40)
  return {
    ok: true,
    value: {
      name,
      description: description || null,
      icon: icon || null,
      kind,
      postRole,
      commentsEnabled: r.commentsEnabled !== false,
      viewAccess: checkAccessRule(r.viewAccess),
    },
  }
}

/* ── Events ─────────────────────────────────────────────────────────────── */

export interface EventInput {
  title: string
  description: string
  kind: EventKind
  startsAt: string
  endsAt: string | null
  timezone: string
  location: string | null
  meetingUrl: string | null
  livestreamUrl: string | null
  capacity: number | null
  coverUrl: string | null
  access: AccessRuleJson
}

/** An https link, or null for empty; NaN-like false for anything else. */
function httpsLink(value: unknown): string | null | false {
  const s = typeof value === "string" ? value.trim() : ""
  if (!s) return null
  if (s.length > 1000) return false
  try {
    const u = new URL(s)
    return u.protocol === "https:" ? u.toString() : false
  } catch {
    return false
  }
}

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  get online() { return tt("Online") },
  get live() { return tt("Live stream") },
  get workshop() { return tt("Workshop") },
  get ama() { return tt("Q&A") },
  get meetup() { return tt("Meetup") },
  get in_person() { return tt("In person") },
}

/**
 * An event from the editor: the start and end are typed as a date and a
 * time in the event's zone and stored as instants, so every member sees
 * them in their own zone.
 */
export function checkEvent(raw: unknown): Checked<EventInput> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const title = line(r.title, 300)
  if (!title) return { ok: false, field: "title", error: tt("Give the event a title.") }
  if (title.length > LENGTHS.eventTitle.max) return { ok: false, field: "title", error: tt("A title is up to {max} characters.", { max: LENGTHS.eventTitle.max }) }
  const description = plain(r.description, LENGTHS.eventDescription.max + 1)
  if (description.length > 4000) return { ok: false, field: "description", error: tt("A description is up to 4,000 characters.") }
  const kind = isOneOf(EVENT_KINDS, r.kind) ? r.kind : "online"
  const timezone = validTimeZone(r.timezone) ? (r.timezone as string) : null
  if (!timezone) return { ok: false, field: "timezone", error: tt("Pick a time zone.") }
  const startsAt = zonedTimeToUtc(String(r.startDate ?? ""), String(r.startTime ?? ""), timezone)
  if (!startsAt) return { ok: false, field: "start", error: tt("Add when it starts.") }
  let endsAt: string | null = null
  if (r.endTime) {
    endsAt = zonedTimeToUtc(String(r.endDate || r.startDate || ""), String(r.endTime), timezone)
    if (!endsAt) return { ok: false, field: "end", error: tt("That end time is not a time.") }
    if (Date.parse(endsAt) <= Date.parse(startsAt)) return { ok: false, field: "end", error: tt("It has to end after it starts.") }
  }
  const meeting = httpsLink(r.meetingUrl)
  if (meeting === false) return { ok: false, field: "meetingUrl", error: tt("A meeting link starts with https://") }
  const livestream = httpsLink(r.livestreamUrl)
  if (livestream === false) return { ok: false, field: "livestreamUrl", error: tt("A livestream link starts with https://") }
  let capacity: number | null = null
  if (r.capacity !== undefined && r.capacity !== null && r.capacity !== "") {
    const n = Number(r.capacity)
    if (!Number.isInteger(n) || n < 1 || n > 100_000) return { ok: false, field: "capacity", error: tt("Capacity is a whole number from 1.") }
    capacity = n
  }
  const location = line(r.location, 300) || null
  return {
    ok: true,
    value: { title, description, kind, startsAt, endsAt, timezone, location, meetingUrl: meeting, livestreamUrl: livestream, capacity, coverUrl: imageUrl(r.coverUrl), access: checkAccessRule(r.access) },
  }
}

/* ── Tickets on an event (round 14, run-now part 105) ───────────────── */

/** The least a ticket may cost, the same floor the Learn price uses. */
export const EVENT_PRICE_MIN_CENTS = 50
/** Part 105's CHECK on price_cents. */
export const EVENT_PRICE_MAX_CENTS = 99_999_999
/** Part 105's CHECK on refund_window_hours: a year. */
export const EVENT_REFUND_WINDOW_MAX_HOURS = 8760

/** What the Tickets card sends: free as every event used to be, or a price. */
export interface EventTicketInput {
  priceCents: number | null
  salesCloseAt: string | null
  refundWindowHours: number | null
  refundPolicy: string | null
}

/**
 * The Tickets card from the editor, checked by the card before it sends and
 * by the route before it writes. Free means every field is cleared, so
 * taking a price off an event leaves nothing behind. Sales close when the
 * event starts unless a date and time are typed, in the event's own zone
 * like its start, and they have to fall before it starts.
 */
export function checkEventTickets(raw: unknown, event: { startsAt: string; timezone: string }): Checked<EventTicketInput> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const free = { ok: true as const, value: { priceCents: null, salesCloseAt: null, refundWindowHours: null, refundPolicy: null } }
  if (r.priceMode !== "paid") return free
  const cents = centsFromInput(r.price)
  if (cents === null || Number.isNaN(cents)) return { ok: false, field: "price", error: tt("Type the ticket price, like 25 or 25.50.") }
  if (cents < EVENT_PRICE_MIN_CENTS) return { ok: false, field: "price", error: tt("A ticket is at least 0.50.") }
  if (cents > EVENT_PRICE_MAX_CENTS) return { ok: false, field: "price", error: tt("That price is too high.") }
  let salesCloseAt: string | null = null
  const closeDate = typeof r.salesCloseDate === "string" ? r.salesCloseDate : ""
  const closeTime = typeof r.salesCloseTime === "string" ? r.salesCloseTime : ""
  if (closeDate || closeTime) {
    if (!closeDate || !closeTime) return { ok: false, field: "salesClose", error: tt("Give both a date and a time for when sales close.") }
    salesCloseAt = zonedTimeToUtc(closeDate, closeTime, event.timezone)
    if (!salesCloseAt) return { ok: false, field: "salesClose", error: tt("That is not a date and time.") }
    if (Date.parse(salesCloseAt) > Date.parse(event.startsAt)) return { ok: false, field: "salesClose", error: tt("Sales have to close by the time it starts.") }
  }
  let refundWindowHours: number | null = null
  if (r.refundWindow !== undefined && r.refundWindow !== null && r.refundWindow !== "") {
    const n = Number(r.refundWindow)
    if (!Number.isInteger(n) || n < 0 || n > EVENT_REFUND_WINDOW_MAX_HOURS) return { ok: false, field: "refundWindow", error: tt("A refund window is a whole number of hours, up to {value}.", { value: EVENT_REFUND_WINDOW_MAX_HOURS }) }
    refundWindowHours = n
  }
  return { ok: true, value: { priceCents: cents, salesCloseAt, refundWindowHours, refundPolicy: cleanRefundPolicy(r.refundPolicy) } }
}

/**
 * The refund window in words, for the line under the field and for the
 * holder's own page: hours up to a day, then days.
 */
export function refundWindowWords(hours: number | null): string | null {
  if (hours === null) return null
  if (hours === 0) return tt("until it starts")
  if (hours === 1) return tt("until an hour before it starts")
  if (hours < 48) return tt("until {hours} hours before it starts", { hours })
  const days = Math.round(hours / 24)
  return tt("until {days} days before it starts", { days })
}

/** A replay as pasted: a Storelib video id, or any link with one in it. */
export function replayVideoId(raw: unknown): string | null | false {
  const s = typeof raw === "string" ? raw.trim() : ""
  if (!s) return null
  const m = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(s)
  return m ? m[0].toLowerCase() : false
}

/* ── Levels, badges, points ─────────────────────────────────────────────── */

export interface LevelInput {
  level: number
  name: string
  minPoints: number
  reward: string | null
}

/** Levels from the editor: numbered from 1, the first at 0 points, each one needing more than the one before. */
export function checkLevels(raw: unknown): Checked<LevelInput[]> {
  const list = Array.isArray(raw) ? raw : []
  if (list.length < 1) return { ok: false, field: "levels", error: tt("Keep at least one level.") }
  if (list.length > MAX_LEVELS) return { ok: false, field: "levels", error: tt("Up to {maxLevels} levels.", { maxLevels: MAX_LEVELS }) }
  const out: LevelInput[] = []
  for (let i = 0; i < list.length; i++) {
    const r = (list[i] && typeof list[i] === "object" ? list[i] : {}) as Record<string, unknown>
    const name = line(r.name, 80)
    if (!name || name.length > LENGTHS.levelName.max) return { ok: false, field: `level-${i + 1}`, error: tt("Level {value} needs a name up to {max} characters.", { value: i + 1, max: LENGTHS.levelName.max }) }
    const minPoints = i === 0 ? 0 : Number(r.minPoints)
    if (!Number.isInteger(minPoints) || minPoints < 0 || minPoints > 10_000_000) return { ok: false, field: `level-${i + 1}`, error: tt("Level {value} needs a number of points.", { value: i + 1 }) }
    if (i > 0 && minPoints <= out[i - 1].minPoints) return { ok: false, field: `level-${i + 1}`, error: tt("Level {value} needs more points than level {i}.", { value: i + 1, i }) }
    out.push({ level: i + 1, name, minPoints, reward: line(r.reward, 200) || null })
  }
  return { ok: true, value: out }
}

export function checkPoints(raw: unknown): Checked<number> {
  const n = Number(raw)
  if (!Number.isInteger(n) || n === 0 || n < -10_000 || n > 10_000) return { ok: false, field: "points", error: tt("Points are a whole number from -10,000 to 10,000, not 0.") }
  return { ok: true, value: n }
}

/* ── Rules, FAQ, benefits, links ────────────────────────────────────────── */

export function checkRules(raw: unknown): Checked<CommunityRule[]> {
  const list = (Array.isArray(raw) ? raw : []).map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
  const out = list.map((r) => ({ title: line(r.title, 120), body: plain(r.body, 1000) })).filter((r) => r.title || r.body)
  if (out.length > MAX_RULES) return { ok: false, field: "rules", error: tt("Up to {maxRules} rules.", { maxRules: MAX_RULES }) }
  if (out.some((r) => !r.title)) return { ok: false, field: "rules", error: tt("Each rule needs a title.") }
  return { ok: true, value: out }
}

export function checkFaq(raw: unknown): Checked<CommunityFaq[]> {
  const list = (Array.isArray(raw) ? raw : []).map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
  const out = list.map((r) => ({ q: line(r.q, 200), a: plain(r.a, 2000) })).filter((r) => r.q || r.a)
  if (out.length > MAX_FAQ) return { ok: false, field: "faq", error: tt("Up to {maxFaq} questions.", { maxFaq: MAX_FAQ }) }
  if (out.some((r) => !r.q || !r.a)) return { ok: false, field: "faq", error: tt("Each question needs an answer.") }
  return { ok: true, value: out }
}

export function checkBenefits(raw: unknown): Checked<string[]> {
  const out = (Array.isArray(raw) ? raw : []).map((b) => line(b, 120)).filter(Boolean)
  if (out.length > MAX_BENEFITS) return { ok: false, field: "benefits", error: tt("Up to {maxBenefits} lines.", { maxBenefits: MAX_BENEFITS }) }
  return { ok: true, value: out }
}

export function checkLinks(raw: unknown): Checked<CommunityLink[]> {
  const list = (Array.isArray(raw) ? raw : []).map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
  const out: CommunityLink[] = []
  for (const r of list) {
    const label = line(r.label, 60)
    const url = httpsLink(r.url)
    if (!label && !url) continue
    if (!label || !url) return { ok: false, field: "links", error: tt("Each link needs a label and an https:// address.") }
    out.push({ label, url })
  }
  if (out.length > MAX_LINKS) return { ok: false, field: "links", error: tt("Up to {maxLinks} links.", { maxLinks: MAX_LINKS }) }
  return { ok: true, value: out }
}

/* ── The Overview's next steps ──────────────────────────────────────────── */

export interface NextStepFacts {
  published: boolean
  paid: boolean
  paymentsReady: boolean
  members: number
  invites: number
  posts: number
  courses: number
  events: number
  customized: boolean
  /** How many rules the community has; none asks for them. */
  rules: number
  classroomEnabled: boolean
  eventsEnabled: boolean
  /** Round 14: an event carries a ticket price but payouts are not connected, so nobody can buy one. */
  pricedEventsUnsellable?: number
}

/* Round 33: group, post, app and intro come from the setup list (lib/communities/setup-checklist.ts), which the Overview now reads. */
export type NextStepId = "publish" | "payouts" | "invite" | "welcome" | "course" | "event" | "event_payouts" | "customize" | "rules" | "group" | "post" | "app" | "intro"

export interface NextStep {
  id: NextStepId
  title: string
  detail: string
  href: string
  action: string
}

/**
 * What to do next, in order, and only what is not done yet: each one
 * disappears once its row exists. Read from real counts, never stored.
 */
export function nextSteps(f: NextStepFacts, base: string): NextStep[] {
  const steps: NextStep[] = []
  if (f.paid && !f.paymentsReady) steps.push({ id: "payouts", title: tt("Connect payouts"), detail: tt("Members pay you through Stripe. Nobody can join a paid community until payouts are connected."), href: "/app/settings?tab=payments", action: tt("Connect") })
  if (!f.published) steps.push({ id: "publish", title: tt("Publish your community"), detail: tt("It is a draft. Only you can see it until you publish."), href: `${base}/settings?tab=advanced`, action: tt("Publish") })
  if (f.members <= 1 && f.invites === 0) steps.push({ id: "invite", title: tt("Invite your first members"), detail: tt("Send an invite by email or share a link."), href: `${base}/members?invite=1`, action: tt("Invite") })
  if (f.posts === 0) steps.push({ id: "welcome", title: tt("Write a welcome post"), detail: tt("Say who it is for and how to get started."), href: `${base}/feed?compose=welcome`, action: tt("Write") })
  if (f.classroomEnabled && f.courses === 0) steps.push({ id: "course", title: tt("Add something to Learn"), detail: tt("A program of lessons, or a course you already sell."), href: `${base}/learn`, action: tt("Add") })
  if (f.eventsEnabled && f.events === 0) steps.push({ id: "event", title: tt("Schedule an event"), detail: tt("A call, a workshop or a Q&A."), href: `${base}/events?new=1`, action: tt("Schedule") })
  if (f.eventsEnabled && !f.paymentsReady && (f.pricedEventsUnsellable ?? 0) > 0)
    steps.push({
      id: "event_payouts",
      title: (f.pricedEventsUnsellable ?? 0) === 1 ? tt("Connect payouts to sell that ticket") : tt("Connect payouts to sell those tickets"),
      detail: (f.pricedEventsUnsellable ?? 0) === 1 ? tt("One event has a price, and nobody can buy a ticket until payouts are connected.") : tt("{pricedEventsUnsellable} events have a price, and nobody can buy a ticket until payouts are connected.", { pricedEventsUnsellable: f.pricedEventsUnsellable }),
      href: "/app/settings?tab=payments",
      action: tt("Connect"),
    })
  if (!f.customized) steps.push({ id: "customize", title: tt("Customize the page"), detail: tt("Add pictures, a video and what members get."), href: `${base}/page`, action: tt("Edit") })
  if (f.rules === 0) steps.push({ id: "rules", title: tt("Write the rules"), detail: tt("Members see them before they join and when they post."), href: `${base}/moderation?tab=rules`, action: tt("Write") })
  return steps
}

/* ── The row of sections (round 26, ./community-shell CommunityTabs) ─────── */

/** The fade over each end of the row is this wide, and a tab under it counts as out of view. */
export const TABS_FADE_PX = 24

/** Which ends of a sideways row have more to scroll to (a pixel of slack for the browser's rounding). */
export function tabsMore(scrollLeft: number, clientWidth: number, scrollWidth: number): { left: boolean; right: boolean } {
  return { left: scrollLeft > 1, right: scrollLeft + clientWidth < scrollWidth - 1 }
}

/**
 * Where the row scrolls to so the tab you are on is in view: null while it is wholly clear of both fades (the row stays
 * as it is), else the scroll that puts it in the middle of the row, within what the row can scroll. Boxes are on screen
 * (getBoundingClientRect), the scroll is the row's own.
 */
export function tabRevealLeft(row: { left: number; width: number }, tab: { left: number; width: number }, scroll: { left: number; client: number; width: number }, fade = TABS_FADE_PX): number | null {
  if (tab.left >= row.left + fade && tab.left + tab.width <= row.left + row.width - fade) return null
  const want = scroll.left + (tab.left - row.left) - (row.width - tab.width) / 2
  return Math.max(0, Math.min(scroll.width - scroll.client, Math.round(want)))
}

/* ── The Overview's figures (round 26) ──────────────────────────────────── */

/** One of the Overview's figures: a name, the number as shown, a quiet line under it, and the screen it opens. */
export interface OverviewFigure {
  label: string
  value: string
  foot?: string
  href?: string
}

/**
 * FOUR FIGURES AT MOST, NONE TWICE (round 26, the owner: "too many statistics ... repeated metrics"). Members with who
 * joined in 30 days under it; Active in 30 days with its share; then, for a community that sells and a person who may see
 * its prices, Paid members with the cancellations under it and Monthly revenue; otherwise Posts this week with the
 * comments. Every number is one the server counted (OverviewFigures); nothing is derived from two of them, so round 33's
 * Per paid member (the revenue divided by the paid members) is gone, as are New, 30 days and Cancellations as cells of
 * their own.
 */
export function overviewFigures(
  head: { slug: string; can: Partial<Record<"manage_members" | "approve_member" | "invite" | "manage_pricing" | "view_analytics" | "moderate_content", boolean>> },
  data: { figures: { members: number; active30d: number; new30d: number; paidMembers: number; mrrCents: number; currency: string; cancellations30d: number; posts7d: number; comments7d: number }; sells: boolean },
): OverviewFigure[] {
  const f = data.figures
  const base = `/app/community/${head.slug}`
  const n = (v: number) => v.toLocaleString(appLocale())
  const canSeeMembers = head.can.manage_members || head.can.approve_member || head.can.invite
  const sells = data.sells && head.can.manage_pricing === true
  return [
    { label: tt("Members"), value: n(f.members), foot: f.new30d > 0 ? tt("+{n} in 30 days", { n: n(f.new30d) }) : undefined, href: canSeeMembers ? `${base}/members` : undefined },
    { label: tt("Active, 30 days"), value: n(f.active30d), foot: f.members ? tt("{p}% of members", { p: Math.round((f.active30d / Math.max(1, f.members)) * 100) }) : undefined },
    ...(sells
      ? [
          { label: tt("Paid members"), value: n(f.paidMembers), foot: f.cancellations30d > 0 ? tt("{n, plural, one {# cancellation} other {# cancellations}} in 30 days", { n: f.cancellations30d }) : undefined },
          { label: tt("Monthly revenue"), value: money(f.mrrCents, f.currency), foot: tt("From active memberships"), href: head.can.view_analytics ? `${base}/analytics` : undefined },
        ]
      : [{ label: tt("Posts this week"), value: n(f.posts7d), foot: tt("{n, plural, one {# comment} other {# comments}}", { n: f.comments7d }), href: head.can.moderate_content ? `${base}/feed` : undefined }]),
  ]
}

/* ── Analytics ──────────────────────────────────────────────────────────── */

export interface DayPoint {
  day: string
  value: number
}

/** The last `days` days ending today (UTC), each with its value or 0, oldest first. */
export function fillDays(rows: { day: string; value: number }[], days: number, today: string): DayPoint[] {
  const by = new Map(rows.map((r) => [r.day.slice(0, 10), r.value]))
  const end = Date.parse(`${today.slice(0, 10)}T00:00:00Z`)
  const out: DayPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10)
    out.push({ day, value: Number(by.get(day) ?? 0) })
  }
  return out
}

/* ── Members ────────────────────────────────────────────────────────────── */

/**
 * The member list's views. Each is a member status, except "muted": active
 * members whose mute has not run out yet (a mute is a time, not a status).
 */
/**
 * The Members views. "restricted" is the one that holds everybody a
 * moderator took out (removed, banned, suspended and muted) with who did it
 * beside them, so bringing somebody back is one place rather than four.
 */
export const MEMBER_STATUS_FILTERS = ["active", "pending", "restricted", "muted", "paused", "banned", "removed", "expired", "cancelled"] as const
export type MemberStatusFilter = (typeof MEMBER_STATUS_FILTERS)[number]

export const MEMBERS_PAGE = 50

/**
 * Round 32: the order of the list. Newest joined first is the default; oldest first, most recently active (members who
 * never came back go last) and most points are the others. Kept out of the query when it is the default, so an address
 * without one reads exactly as before.
 */
export const MEMBER_SORTS = ["newest", "oldest", "active", "points"] as const
export type MemberSort = (typeof MEMBER_SORTS)[number]

/** Round 32: who joined within this many days (the Joined filter). */
export const MEMBER_JOINED_DAYS = [7, 30, 90, 365] as const

export interface MemberQuery {
  status: MemberStatusFilter
  role: Role | null
  tierId: string | null
  q: string
  cursor: string | null
  /** Absent means newest first. */
  sort?: MemberSort
  /** Joined in the last this many days; absent means any time. */
  joined?: number | null
}

export function parseMemberQuery(p: URLSearchParams | Record<string, string | undefined>): MemberQuery {
  const get = (k: string) => (p instanceof URLSearchParams ? p.get(k) : p[k]) ?? ""
  const status = get("status")
  const role = get("role")
  const tier = get("tier")
  return {
    status: isOneOf(MEMBER_STATUS_FILTERS, status) ? status : "active",
    role: isOneOf(ROLES, role) ? role : null,
    tierId: isUuid(tier) ? tier : null,
    q: line(get("q"), 80),
    cursor: get("cursor") || null,
    ...(() => {
      const sort = get("sort")
      const joined = Number(get("joined"))
      return {
        ...(isOneOf(MEMBER_SORTS, sort) && sort !== "newest" ? { sort } : {}),
        ...((MEMBER_JOINED_DAYS as readonly number[]).includes(joined) ? { joined } : {}),
      }
    })(),
  }
}

export const ROLE_LABEL: Record<Role, string> = { get owner() { return tt("Owner") }, get admin() { return tt("Admin") }, get moderator() { return tt("Moderator") }, get member() { return tt("Member") } }

/* ── Invites ────────────────────────────────────────────────────────────── */

export interface InviteInput {
  email: string | null
  maxUses: number | null
  expiresInDays: number | null
  tierId: string | null
  /**
   * Said outright: true gives the tier without paying, false sends them to
   * the price. Left out, the server decides from the community (a private
   * community that charges sends them to pay; everywhere else an invite is
   * the gift it has always been). An invite for one free event leaves it
   * out for exactly that reason: the seat is the gift, the membership is
   * still the community's own rule.
   */
  complimentary?: boolean | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function checkInvite(raw: unknown): Checked<InviteInput> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const email = typeof r.email === "string" && r.email.trim() ? r.email.trim().toLowerCase() : null
  if (email && (!EMAIL.test(email) || email.length > 254)) return { ok: false, field: "email", error: tt("That email address does not look right.") }
  let maxUses: number | null = null
  if (!email && r.maxUses !== undefined && r.maxUses !== null && r.maxUses !== "") {
    const n = Number(r.maxUses)
    if (!Number.isInteger(n) || n < 1 || n > 100_000) return { ok: false, field: "maxUses", error: tt("Uses is a whole number from 1.") }
    maxUses = n
  }
  let expiresInDays: number | null = null
  if (r.expiresInDays !== undefined && r.expiresInDays !== null && r.expiresInDays !== "") {
    const n = Number(r.expiresInDays)
    if (!Number.isInteger(n) || n < 1 || n > 365) return { ok: false, field: "expires", error: tt("An invite lasts 1 to 365 days.") }
    expiresInDays = n
  }
  return {
    ok: true,
    value: {
      email,
      maxUses: email ? 1 : maxUses,
      expiresInDays: email && expiresInDays === null ? 30 : expiresInDays,
      tierId: isUuid(r.tierId) ? r.tierId : null,
      complimentary: typeof r.complimentary === "boolean" ? r.complimentary : null,
    },
  }
}

/** Space kinds as the editor names them. */
export const SPACE_KIND_LABEL: Record<SpaceKind, string> = { get feed() { return tt("Discussion") }, get chat() { return tt("Chat") }, get announcements() { return tt("Announcements") }, get resources() { return tt("Resources") } }

/* ── The page's gallery ─────────────────────────────────────────────────── */

/** Pictures and videos at the top of the community's page, in order. */
export const GALLERY_MAX = 12

/**
 * A YouTube or Vimeo video in the gallery (round 11), kept as the post
 * composer keeps one (lib/communities/post-media embedFromUrl): which
 * service, its id, Vimeo's private hash, and its still. The still is
 * YouTube's own picture (i.ytimg.com, from the id) or the one Vimeo's oEmbed
 * answered when it was saved (i.vimeocdn.com), never an address the creator
 * typed. `cover` (only ever on the first item) makes it the community's
 * cover: the page leads with it and its still stands in for the cover
 * picture wherever a still is needed (Explore, a shared link).
 */
export type GalleryEmbed = { type: "embed"; provider: "youtube" | "vimeo"; id: string; hash?: string; thumb?: string; cover?: true }

/**
 * A video uploaded to this community (round 13: `cover`, only ever on the
 * first item, makes it the community's cover video, the About page's hero;
 * its still, taken from the file when it was chosen, is the cover picture).
 */
export type GalleryUpload = { type: "video"; videoId: string; cover?: true }

export type GalleryItem = { type: "image"; url: string } | GalleryUpload | GalleryEmbed

/** The one string an item is known by: its picture, its upload's id, or the service and id of a linked video. */
export function galleryKey(i: GalleryItem): string {
  return i.type === "image" ? i.url : i.type === "video" ? i.videoId.toLowerCase() : `${i.provider}:${i.id}`
}

/**
 * A YouTube or Vimeo link (or a stored item) as a gallery item, or null for
 * anything else. A link the creator pastes and a stored item go through the
 * same parse, so a stored id is only ever one embedFromUrl accepted.
 */
export function galleryEmbed(raw: unknown): GalleryEmbed | null {
  let ref: EmbedRef | null = null
  if (typeof raw === "string") ref = embedFromUrl(raw)
  else if (raw && typeof raw === "object") {
    const it = raw as Record<string, unknown>
    if (typeof it.url === "string") ref = embedFromUrl(it.url)
    else if ((it.provider === "youtube" || it.provider === "vimeo") && typeof it.id === "string") {
      const hash = typeof it.hash === "string" && /^[A-Za-z0-9]{1,40}$/.test(it.hash) ? it.hash : ""
      ref = embedFromUrl(it.provider === "youtube" ? `https://www.youtube.com/watch?v=${it.id}` : `https://vimeo.com/${it.id}${hash ? `/${hash}` : ""}`)
    }
    if (ref && it.provider && it.provider !== ref.provider) ref = null
  }
  if (!ref) return null
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const thumb = ref.provider === "youtube" ? ref.thumb : embedThumbUrl(stored.thumb) ?? undefined
  return { type: "embed", provider: ref.provider, id: ref.id, ...(ref.hash ? { hash: ref.hash } : {}), ...(thumb ? { thumb } : {}), ...(stored.cover === true ? { cover: true as const } : {}) }
}

/** The cover video, when the first item is a YouTube or Vimeo one. */
export function coverVideo(items: readonly GalleryItem[]): GalleryEmbed | null {
  const first = items[0]
  return first && first.type === "embed" && first.cover ? first : null
}

/** The cover video, when the first item is one uploaded to the community (round 13). */
export function coverUpload(items: readonly GalleryItem[]): GalleryUpload | null {
  const first = items[0]
  return first && first.type === "video" && first.cover ? first : null
}

/** The cover item, either kind: the gallery editor shows what follows it. */
export function coverItem(items: readonly GalleryItem[]): GalleryEmbed | GalleryUpload | null {
  return coverVideo(items) ?? coverUpload(items)
}

/**
 * A gallery as the route stores it in communities.gallery: at most twelve,
 * pictures only from our own storage (`ownUrl` answers the URL it accepts,
 * or null), videos by the id of a video uploaded to this community (the
 * route then checks each id is one), YouTube and Vimeo videos by a link
 * embedFromUrl accepts (anything else is refused with what to do). The same
 * picture or video twice is kept once; `cover` stays on the first item only.
 */
export function checkGallery(raw: unknown, ownUrl: (url: unknown) => string | null): Checked<GalleryItem[]> {
  if (!Array.isArray(raw)) return { ok: false, field: "gallery", error: tt("The gallery is a list.") }
  if (raw.length > GALLERY_MAX) return { ok: false, field: "gallery", error: tt("Up to {galleryMax} pictures and videos.", { galleryMax: GALLERY_MAX }) }
  const out: GalleryItem[] = []
  const seen = new Set<string>()
  for (const x of raw) {
    const item = x && typeof x === "object" ? (x as Record<string, unknown>) : {}
    if (item.type === "image") {
      const url = ownUrl(item.url)
      if (!url) return { ok: false, field: "gallery", error: tt("Upload the picture again.") }
      if (seen.has(url)) continue
      seen.add(url)
      out.push({ type: "image", url })
    } else if (item.type === "video") {
      if (!isUuid(item.videoId)) return { ok: false, field: "gallery", error: tt("Upload the video again.") }
      const id = item.videoId.toLowerCase()
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ type: "video", videoId: id, ...(item.cover === true && out.length === 0 ? { cover: true as const } : {}) })
    } else if (item.type === "embed") {
      const embed = galleryEmbed(item)
      if (!embed) return { ok: false, field: "gallery", error: tt("Only YouTube and Vimeo links can be added as a video.") }
      const key = galleryKey(embed)
      if (seen.has(key)) continue
      seen.add(key)
      if (out.length > 0) delete embed.cover
      out.push(embed)
    } else {
      return { ok: false, field: "gallery", error: tt("A gallery holds pictures and videos.") }
    }
  }
  return { ok: true, value: out }
}

/** The list with the item at `from` moved to `to` (both clamped), as a new array. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from < 0 || from >= next.length) return next
  const [x] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, x)
  return next
}

/* ── What a moderator may do to a member ────────────────────────────────── */

/** How long a mute lasts, in hours, as the menus offer it (lib/communities/server/moderation.ts muteUntil takes hours). */
export const MUTE_CHOICES = [
  { hours: 1, get label() { return tt("1 hour") } },
  { hours: 24, get label() { return tt("24 hours") } },
  { hours: 24 * 7, get label() { return tt("7 days") } },
  { hours: 24 * 30, get label() { return tt("30 days") } },
] as const

/**
 * One thing that can be done to a member: `action` is what
 * PATCH /api/app/community/<id>/members/<userId> takes (MEMBER_ACTIONS),
 * or one of the other member writes ("complimentary", "end_complimentary",
 * "points", "badge"). `confirm` asks first; `danger` draws it red.
 */
export interface MemberChoice {
  key: string
  label: string
  /** The same press in fewer words, where a phone's row has no room for the whole label. */
  shortLabel?: string
  action: "mute" | "unmute" | "suspend" | "unsuspend" | "ban" | "unban" | "remove" | "reinstate" | "approve" | "reject" | "role" | "complimentary" | "end_complimentary" | "points" | "badge"
  role?: Role
  hours?: number
  confirm?: boolean
  danger?: boolean
  section?: string
}

export interface ChoiceActor {
  userId: string
  role: Role
  can: Partial<Record<string, boolean>>
  gamification: boolean
  badges: number
}

/**
 * Everything this person may do to that member, in the order the row's
 * menu shows it, from the same rules the server applies (can() through
 * `actor.can`, and never to somebody ranked the same or above: canActOn).
 * Nothing for themselves or the owner.
 */
export function memberChoices(actor: ChoiceActor, m: { userId: string; role: Role; status: string; source: string; mutedUntil: string | null; approved?: boolean; acted?: MemberActionTaken | null }): MemberChoice[] {
  if (m.userId === actor.userId || m.role === "owner") return []
  if (!canActOn(actor.role, m.role)) return []
  const c = actor.can
  const out: MemberChoice[] = []
  if (m.status === "pending") {
    if (c.approve_member && !m.approved) {
      out.push({ key: "approve", label: tt("Approve"), action: "approve" })
      out.push({ key: "reject", label: tt("Decline"), action: "reject", confirm: true })
    }
    return out
  }
  if (m.status === "active") {
    if (c.change_role) {
      for (const r of assignableRoles(actor.role).filter((r) => r !== m.role)) out.push({ key: `role-${r}`, label: r === "member" ? tt("Make a member") : r === "admin" ? tt("Make an admin") : tt("Make a moderator"), action: "role", role: r, section: "Role" })
    }
    if (c.manage_members) {
      if (m.source === "manual") out.push({ key: "end-comp", label: tt("End complimentary access"), action: "end_complimentary", section: "Access" })
      else if (!["subscription", "purchase", "product"].includes(m.source)) out.push({ key: "comp", label: tt("Give complimentary access"), action: "complimentary", section: "Access" })
    }
    if (actor.gamification && c.award_points) {
      out.push({ key: "points", label: tt("Give points"), action: "points", section: "Points" })
      if (actor.badges > 0) out.push({ key: "badge", label: tt("Give a badge"), action: "badge", section: "Points" })
    }
    if (c.mute) {
      if (m.mutedUntil) out.push({ key: "unmute", label: tt("Unmute"), action: "unmute", section: "Moderate" })
      else out.push({ key: "mute", label: tt("Mute"), action: "mute", confirm: true, section: "Moderate" })
    }
    if (c.suspend) out.push({ key: "suspend", label: tt("Suspend"), action: "suspend", confirm: true, section: "Moderate" })
    if (c.remove_member) out.push({ key: "remove", label: tt("Remove from the community"), action: "remove", confirm: true, danger: true, section: "Moderate" })
    if (c.ban) out.push({ key: "ban", label: tt("Ban"), action: "ban", confirm: true, danger: true, section: "Moderate" })
    return out
  }
  /*
    THE OTHER HALF: putting it back. Each undo needs the permission that took
    the action away, and none of them is offered when the person who took it
    is ranked above this actor, which is the rule the server applies too
    (lib/communities/server/moderation.ts mayUndo).
  */
  const theirs = m.acted ?? null
  const mayUndoHere = !theirs?.byRole || theirs.byUserId === actor.userId || ROLE_RANK[theirs.byRole] <= ROLE_RANK[actor.role]
  if (m.status === "paused" && c.suspend && mayUndoHere) out.push({ key: "unsuspend", label: tt("Bring back"), action: "unsuspend", confirm: true })
  if (m.status === "paused" && c.ban) out.push({ key: "ban", label: tt("Ban"), action: "ban", confirm: true, danger: true })
  if (m.status === "banned" && c.ban && mayUndoHere) out.push({ key: "unban", label: tt("Unban"), action: "unban", confirm: true })
  if (m.status === "removed" && c.remove_member && mayUndoHere) out.push({ key: "reinstate", label: tt("Let them back in"), shortLabel: tt("Let back in"), action: "reinstate", confirm: true })
  return out
}

/** "Mar 4", in the reader's own zone; empty for anything that is not a time. */
function dayAndMonth(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  return new Intl.DateTimeFormat(appLocale(), zoned({ month: "short", day: "numeric" })).format(t)
}

/**
 * The line a row in the "Not active" view reads: what happened, who did it,
 * when, and the reason when there is one.
 */
export function takenAwayLine(m: { status: string; mutedUntil?: string | null; acted?: MemberActionTaken | null }, now: number = Date.now()): string {
  const a = m.acted ?? null
  const what = a?.kind === "banned" ? tt("Banned") : a?.kind === "removed" ? tt("Removed") : a?.kind === "suspended" ? tt("Suspended") : a?.kind === "muted" ? tt("Muted") : m.status === "banned" ? tt("Banned") : m.status === "removed" ? tt("Removed") : m.status === "paused" ? tt("Suspended") : tt("Muted")
  const parts = [a?.byName ? tt("{what} by {byName}", { what, byName: a.byName }) : what]
  if (a?.at) parts.push(relativeTime(a.at, now))
  if (a?.kind === "muted" && (a.until || m.mutedUntil)) parts.push(tt("ends {date}", { date: dayAndMonth(a.until ?? m.mutedUntil ?? "") }))
  if (a?.reason) parts.push(a.reason)
  return parts.filter(Boolean).join(" · ")
}

/** What a member action is called once it is done, for the toast. */
export function memberDoneText(choice: MemberChoice, name: string): string {
  switch (choice.action) {
    case "approve":
      return tt("{name} approved", { name })
    case "reject":
      return tt("Request declined")
    case "role":
      return tt("{name} is now {value}", { name, value: choice.role === "admin" ? tt("an admin") : choice.role === "moderator" ? tt("a moderator") : tt("a member") })
    case "mute":
      return tt("{name} is muted for {value}", { name, value: MUTE_CHOICES.find((x) => x.hours === choice.hours)?.label ?? tt("a while") })
    case "unmute":
      return tt("{name} can post again", { name })
    case "suspend":
      return tt("{name} is suspended", { name })
    case "unsuspend":
      return tt("{name} is back", { name })
    case "reinstate":
      return tt("{name} is back in", { name })
    case "ban":
      return tt("{name} is banned", { name })
    case "unban":
      return tt("{name} is unbanned", { name })
    case "remove":
      return tt("{name} was removed", { name })
    case "end_complimentary":
      return tt("Complimentary access ended")
    default:
      return tt("Saved")
  }
}

/** The line a confirmation shows before a member action that cannot simply be undone. */
export function memberConfirmText(choice: MemberChoice, name: string, person?: { source?: string; paying?: boolean }): { title: string; detail: string; verb: string } {
  /*
    A paid way in that nobody is paying for any more comes back as the free
    tier, and the confirm says so before it is pressed. The screen cannot see
    whether the payment is live (the server works that out when it runs), so
    the sentence is written to be true either way.
  */
  const toFree = person && ["subscription", "purchase", "product"].includes(person.source ?? "") && person.paying !== true ? tt(" If their paid membership has ended, they come back on the free tier.") : ""
  switch (choice.action) {
    case "reject":
      return { title: tt("Decline {name}?", { name }), detail: tt("They can ask again later."), verb: tt("Decline") }
    case "reinstate":
      return { title: tt("Let {name} back in?", { name }), detail: tt("They get access again now, and keep their points, level and posts.{free}", { free: toFree }), verb: tt("Let them in") }
    case "unban":
      return { title: tt("Unban {name}?", { name }), detail: tt("They can open the community and post again, and keep their points, level and posts.{free}", { free: toFree }), verb: tt("Unban") }
    case "unsuspend":
      return { title: tt("Bring {name} back?", { name }), detail: tt("Their access starts again now, with their points, level and posts as they were.{free}", { free: toFree }), verb: tt("Bring them back") }
    case "suspend":
      return { title: tt("Suspend {name}?", { name }), detail: tt("They lose access until you bring them back. Their posts stay."), verb: tt("Suspend") }
    case "remove":
      return { title: tt("Remove {name}?", { name }), detail: tt("They lose access now and can join again. A paid membership keeps billing until they cancel it."), verb: tt("Remove") }
    default:
      return { title: tt("Ban {name}?", { name }), detail: tt("They lose access and cannot join again unless you unban them."), verb: tt("Ban") }
  }
}

/* ── Settings tabs ──────────────────────────────────────────────────────── */

/*
  ROUND 32: every panel's name in one list, a line each, so a new panel is one more line here and one more entry in
  ./settings-section.tsx PANELS. "address" (the storelib address and the creator's own domain) and "discovery" (the
  Explore category, Explore and search) were inside Page and Access; they are panels of their own now.
*/
/*
  ROUND 33, THE OWNER: the community's page is edited on its own, in the Page section beside Overview
  (/app/community/<slug>/page), not in Settings. Settings keeps what runs the community: who gets in and what it costs,
  its address, how it is found, its features, publishing, the people and rules, points, your notifications. An address
  from before (?tab=page, ?tab=general and the page's parts) is sent on to the Page section (pageTabAsked).
*/
export const SETTINGS_TABS = [
  "access",
  "address",
  "discovery",
  "features",
  "advanced",
  "roles",
  "policies",
  "gamification",
  "notifications",
  /* round32: features panels */
] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]

/** The settings tabs that held the community's page before round 33: an address naming one opens the Page section. */
const PAGE_TABS = new Set(["page", "general", "about", "gallery", "media", "photos", "benefits", "faq", "links", "appearance", "look"])

export function pageTabAsked(raw: string | undefined | null): boolean {
  return typeof raw === "string" && PAGE_TABS.has(raw.trim().toLowerCase())
}

/** A tab asked for by name, old names included, as the tab that holds it now. */
export function settingsTabOf(raw: string | undefined | null): SettingsTab {
  switch (raw) {
    case "domain":
    case "domains":
      return "address"
    case "explore":
    case "search":
      return "discovery"
    case "welcome":
      return "features"
    case "rules":
    case "contact":
      return "policies"
    case "team":
    case "permissions":
      return "roles"
    case "publish":
    case "archive":
    case "delete":
      return "advanced"
    case "pricing":
    case "tiers":
      return "access"
    default:
      /* Nothing named, or a page tab (the server sends those on to the Page section first): the first panel. */
      return (SETTINGS_TABS as readonly string[]).includes(raw ?? "") ? (raw as SettingsTab) : "access"
  }
}


/* ── Reports Storelib opened itself (round 13) ──────────────────────────── */

/**
 * What a report with no reporter is about, from the note the safety rules
 * wrote (lib/communities/server/safety.ts joinAlarm and pauseInvite): a
 * join alarm, an invite link turned off after a burst, or null for any
 * other (a post held back is told by its removed state instead).
 */
export function systemReportKind(note: string | null | undefined): "join_alarm" | "invite_paused" | null {
  const n = (note ?? "").trim()
  if (n.startsWith("Join alarm:")) return "join_alarm"
  if (n.startsWith("Invite link turned off:")) return "invite_paused"
  return null
}

/* ── Moving between a community's sections (round 31) ───────────────────── */

/*
  "Too much loading between them." Each section of /app/community/<slug> is a
  page of its own on the server, and every press waited for it. The shell
  (./community-shell.tsx) now keeps every section it has drawn, as it was
  drawn, and shows one again on the frame of the press. The rules it follows
  are here, pure, for tests/communities-admin31.test.ts.
*/

/** The sections, by the place in the address after the community's slug. */
export type AdminSection = "overview" | "feed" | "spaces" | "classroom" | "events" | "members" | "moderation" | "analytics" | "page" | "settings"

/** The section an address is on: /app/community/<slug or id>/<section>. Old addresses land on the section that holds them now. */
export function adminSectionOf(pathname: string): AdminSection {
  const seg = (pathname.split(/[?#]/)[0].split("/").filter(Boolean)[3] ?? "").toLowerCase()
  switch (seg) {
    case "gamification":
      return "settings"
    case "learn":
    case "classroom":
      return "classroom"
    case "feed":
    case "spaces":
    case "events":
    case "members":
    case "moderation":
    case "analytics":
    case "page":
    case "settings":
      return seg
    default:
      return "overview"
  }
}

/** A section shown again from what the shell holds is read again quietly once it is older than this. */
export const SECTION_FRESH_MS = 60_000
/** A section on its way from the server keeps the one being left on screen this long before its waiting screen shows. */
export const SECTION_WAIT_MS = 250
/** Reading the unopened sections ahead is not repeated within this long. */
export const SECTION_AHEAD_MS = 4 * 60_000

/**
 * What a press on a section's tab does: nothing (it is the one showing), show
 * it at once (the shell holds it, or the router's page is it), or ask the
 * router for it (never opened yet; read ahead, it usually arrives at once).
 */
export function sectionMove(target: AdminSection, facts: { active: AdminSection; routed: AdminSection | null; held: boolean }): "stay" | "show" | "fetch" {
  if (target === facts.active) return "stay"
  if (facts.held || facts.routed === target) return "show"
  return "fetch"
}

/** Whether a section shown from what the shell holds is read again behind it: marked stale by a change elsewhere, or simply old. */
export function sectionStale(held: { at: number; stale: boolean } | null | undefined, now: number, fresh: number = SECTION_FRESH_MS): boolean {
  if (!held) return false
  return held.stale || now - held.at > fresh
}

/**
 * A section drawn again by the server with a one time ask in its address
 * (?new=1, ?compose=, ?invite=1, ?created=1) starts again from that ask; the
 * same section drawn again without one (a refresh after a save) keeps its
 * place, its open tab and what was typed.
 */
export function sectionRestarts(before: string | null | undefined, after: string | null | undefined): boolean {
  return !!after && after !== (before ?? "")
}

/** Whether the settings address names a panel (?tab=). A phone opens on the list of panels when it does not. */
export function settingsTabAsked(raw: string | undefined | null): boolean {
  return typeof raw === "string" && raw.trim() !== ""
}
