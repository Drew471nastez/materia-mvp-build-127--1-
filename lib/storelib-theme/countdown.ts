/**
 * ===========================================================================
 *  AN IMPORTED THEME'S COUNTDOWN: WHEN IT ENDS
 * ===========================================================================
 * A Shopify theme's countdown block keeps its deadline in whatever settings
 * its author chose: a text `end_date` with two ranges `end_hour` and
 * `end_minute` and a `utc_offset`, one `end_iso`, one `countdown_date` typed
 * as "Nov 3, 2026 23:59:00". The editor draws one calendar, one time and one
 * time zone for all of them (components/website-builder/editor/controls/
 * countdown-control.tsx), and this module is everything it knows, with no
 * React and no clock of its own, so it is tested on its own
 * (tests/countdown.test.ts).
 *
 * THE SETTINGS KEEP THEIR IDS AND THEIR SHAPES. A value is read as it was
 * stored and written back only when somebody changes it, in the shape it
 * already had: "2026/11/03" stays slashes, an hour stored as the number 9 is
 * written as a number, "09" as two digits, "+2" as "+2" and "UTC+02:00" as
 * "UTC+02:00". The theme's own script reads these, and it reads them its way.
 *
 * NEVER THROUGH `new Date(string)`. A string with no zone is local time to
 * whoever parses it, so a server and a browser read the same text as two
 * instants. Every value here is taken apart by hand, and an instant is only
 * made from a wall time and an offset in minutes (Date.UTC).
 */

/* ── calendar ─────────────────────────────────────────────────────────── */

export interface Wall {
  year: number
  month: number
  day: number
  /** Null when the value has a date and no time. */
  hour: number | null
  minute: number | null
  second?: number
  /** Milliseconds, kept so a stamp written again keeps them. */
  ms?: number
}

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0
}

/** A real day of the calendar: no 30 February, and 29 February only in a leap year. */
export function isRealDate(year: number, month: number, day: number): boolean {
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) && year >= 1000 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

/** The instant a wall time names at a fixed offset (minutes east of UTC). Hour 24 is the next day's midnight, as a range up to 24 means. */
export function instantOf(wall: Wall, offsetMinutes: number): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour ?? 0, wall.minute ?? 0, wall.second ?? 0) - offsetMinutes * 60_000
}

/** The wall time an instant reads as at a fixed offset. */
export function wallAt(instant: number, offsetMinutes: number): Wall {
  const d = new Date(instant + offsetMinutes * 60_000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() }
}

/* ── a date and time written as text, and its shape ───────────────────── */

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const monthOfName = (s: string): number => {
  const k = s.toLowerCase()
  if (k.length < 3) return 0
  const i = MONTHS_LONG.findIndex((m) => m.toLowerCase() === k || (k.length === 3 && m.slice(0, 3).toLowerCase() === k) || (k === "sept" && m === "September"))
  return i + 1
}

type Tok =
  | { k: "lit"; s: string }
  | { k: "Y" }
  | { k: "M"; pad: boolean }
  | { k: "Mon"; long: boolean; caps: "title" | "lower" | "upper" }
  | { k: "D"; pad: boolean }
  | { k: "h"; pad: boolean }
  | { k: "m" }
  | { k: "s" }
  | { k: "ms"; n: number }
  | { k: "zone"; prefix: string; style: "Z" | "colon" | "compact" | "hours"; pad: boolean }

/** How a date and time was written, so a new one is written the same way. */
export interface StampShape {
  toks: Tok[]
  hasTime: boolean
  /** The value names its own zone (Z, +02:00, GMT+0200). */
  hasZone: boolean
  /** That zone is "Z" (or a bare "UTC"/"GMT"): the value is always written in UTC. */
  utcOnly: boolean
}

export interface Stamp {
  wall: Wall
  /** Minutes east of UTC that the value names, or null when it names none. */
  zone: number | null
  shape: StampShape
}

const DATE_YMD = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})/
const DATE_DMY = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})/
const DATE_MON_FIRST = /^([A-Za-z]{3,9})(\.?)(\s+)(\d{1,2})(,?\s+)(\d{4})/
const DATE_DAY_FIRST = /^(\d{1,2})(\s+)([A-Za-z]{3,9})(\.?)(,?\s+)(\d{4})/
const TIME = /^(T|\s+|,\s*|\s+at\s+)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/
const ZONE = /^(\s*)(?:(Z)|(GMT|UTC)?([+-])(\d{1,2})(?:(:)?(\d{2}))?|(GMT|UTC))$/

const capsOf = (s: string): "title" | "lower" | "upper" => (s === s.toUpperCase() ? "upper" : s === s.toLowerCase() ? "lower" : "title")

/**
 * A date, a date and time, or an ISO stamp, taken apart with how it was
 * written. Null for anything else, and for a day the calendar does not have.
 */
export function parseStamp(value: unknown): Stamp | null {
  if (typeof value !== "string") return null
  const lead = /^\s*/.exec(value)![0]
  const trail = /\s*$/.exec(value)![0]
  let s = value.slice(lead.length, value.length - trail.length)
  if (!s) return null
  const toks: Tok[] = []
  if (lead) toks.push({ k: "lit", s: lead })
  let year = 0, month = 0, day = 0
  let m: RegExpExecArray | null
  if ((m = DATE_YMD.exec(s))) {
    year = +m[1]; month = +m[3]; day = +m[4]
    toks.push({ k: "Y" }, { k: "lit", s: m[2] }, { k: "M", pad: m[3].length === 2 }, { k: "lit", s: m[2] }, { k: "D", pad: m[4].length === 2 })
  } else if ((m = DATE_DMY.exec(s))) {
    const a = +m[1], b = +m[3]
    /* "/" is month first, as a browser reads 11/03/2026; "." and "-" are day first. A number over 12 settles it either way. */
    const monthFirst = a > 12 ? false : b > 12 ? true : m[2] === "/"
    year = +m[4]; month = monthFirst ? a : b; day = monthFirst ? b : a
    const first: Tok = monthFirst ? { k: "M", pad: m[1].length === 2 } : { k: "D", pad: m[1].length === 2 }
    const second: Tok = monthFirst ? { k: "D", pad: m[3].length === 2 } : { k: "M", pad: m[3].length === 2 }
    toks.push(first, { k: "lit", s: m[2] }, second, { k: "lit", s: m[2] }, { k: "Y" })
  } else if ((m = DATE_MON_FIRST.exec(s)) && monthOfName(m[1])) {
    month = monthOfName(m[1]); day = +m[4]; year = +m[6]
    toks.push({ k: "Mon", long: m[1].length > 3 && m[1].toLowerCase() !== "sept", caps: capsOf(m[1]) }, { k: "lit", s: m[2] + m[3] }, { k: "D", pad: m[4].length === 2 }, { k: "lit", s: m[5] }, { k: "Y" })
  } else if ((m = DATE_DAY_FIRST.exec(s)) && monthOfName(m[3])) {
    day = +m[1]; month = monthOfName(m[3]); year = +m[6]
    toks.push({ k: "D", pad: m[1].length === 2 }, { k: "lit", s: m[2] }, { k: "Mon", long: m[3].length > 3 && m[3].toLowerCase() !== "sept", caps: capsOf(m[3]) }, { k: "lit", s: m[4] + m[5] }, { k: "Y" })
  } else return null
  if (!isRealDate(year, month, day)) return null
  s = s.slice(m[0].length)
  let hour: number | null = null, minute: number | null = null, second: number | undefined, ms: number | undefined
  let hasTime = false
  if ((m = TIME.exec(s))) {
    hour = +m[2]; minute = +m[3]
    if (hour > 24 || minute > 59 || (hour === 24 && minute > 0)) return null
    hasTime = true
    toks.push({ k: "lit", s: m[1] }, { k: "h", pad: m[2].length === 2 }, { k: "lit", s: ":" }, { k: "m" })
    if (m[4] !== undefined) {
      second = +m[4]
      if (second > 59) return null
      toks.push({ k: "lit", s: ":" }, { k: "s" })
      if (m[5] !== undefined) {
        ms = +m[5]
        toks.push({ k: "lit", s: "." }, { k: "ms", n: m[5].length })
      }
    }
    s = s.slice(m[0].length)
  }
  let zone: number | null = null
  let hasZone = false, utcOnly = false
  if (s) {
    const z = ZONE.exec(s)
    if (!z) return null
    hasZone = true
    if (z[2] || z[8]) {
      zone = 0
      utcOnly = true
      toks.push({ k: "lit", s: z[1] + (z[2] ?? z[8]) })
    } else {
      const h = +z[5], mm = z[7] !== undefined ? +z[7] : 0
      if (h > 14 || mm > 59) return null
      zone = (z[4] === "-" ? -1 : 1) * (h * 60 + mm)
      const style = z[7] === undefined ? "hours" : z[6] ? "colon" : "compact"
      toks.push({ k: "lit", s: z[1] }, { k: "zone", prefix: z[3] ?? "", style, pad: z[5].length === 2 })
    }
  }
  if (trail) toks.push({ k: "lit", s: trail })
  return { wall: { year, month, day, hour, minute, ...(second !== undefined ? { second } : {}), ...(ms !== undefined ? { ms } : {}) }, zone, shape: { toks, hasTime, hasZone, utcOnly } }
}

const pad2 = (n: number) => String(n).padStart(2, "0")

function zoneText(offset: number, prefix: string, style: "Z" | "colon" | "compact" | "hours", pad: boolean): string {
  const sign = offset < 0 ? "-" : "+"
  const a = Math.abs(offset), h = Math.floor(a / 60), mm = a % 60
  if (style === "hours" && mm === 0) return `${prefix}${sign}${pad ? pad2(h) : String(h)}`
  if (style === "compact") return `${prefix}${sign}${pad2(h)}${pad2(mm)}`
  return `${prefix}${sign}${pad2(h)}:${pad2(mm)}`
}

/**
 * A wall time written in a shape read before. `offset` is the zone the wall
 * time is in; a shape that names its own zone prints it (a "Z" shape prints
 * the same instant in UTC). A shape with no time prints the date alone.
 */
export function formatStamp(shape: StampShape, wall: Wall, offset: number | null): string {
  let w = wall
  let zone = offset ?? 0
  if (shape.utcOnly && offset !== null && offset !== 0) {
    w = wallAt(instantOf(wall, offset), 0)
    zone = 0
  }
  return shape.toks
    .map((t) => {
      switch (t.k) {
        case "lit": return t.s
        case "Y": return String(w.year)
        case "M": return t.pad ? pad2(w.month) : String(w.month)
        case "Mon": {
          const name = t.long ? MONTHS_LONG[w.month - 1] : MONTHS_LONG[w.month - 1].slice(0, 3)
          return t.caps === "upper" ? name.toUpperCase() : t.caps === "lower" ? name.toLowerCase() : name
        }
        case "D": return t.pad ? pad2(w.day) : String(w.day)
        case "h": return t.pad ? pad2(w.hour ?? 0) : String(w.hour ?? 0)
        case "m": return pad2(w.minute ?? 0)
        case "s": return pad2(w.second ?? 0)
        case "ms": return String(w.ms ?? 0).padStart(t.n, "0").slice(0, t.n)
        case "zone": return zoneText(zone, t.prefix, t.style, t.pad)
      }
    })
    .join("")
}

/* Shapes for a setting that holds nothing yet: what a browser parses the same everywhere it is read. */
const SHAPE_DATE = parseStamp("2000-01-01")!.shape
const SHAPE_ISO = parseStamp("2000-01-01T00:00:00+00:00")!.shape
const SHAPE_COMBINED = parseStamp("2000/01/01 00:00:00")!.shape

/* ── an hour or a minute held in its own setting ──────────────────────── */

export type NumberShape = { kind: "number" } | { kind: "string"; pad: boolean }

export function parseWhole(value: unknown): { n: number; shape: NumberShape } | null {
  if (typeof value === "number" && Number.isFinite(value)) return { n: Math.trunc(value), shape: { kind: "number" } }
  if (typeof value === "string" && /^\s*\d{1,2}\s*$/.test(value)) return { n: Number(value), shape: { kind: "string", pad: value.trim().length === 2 } }
  return null
}

export const formatWhole = (n: number, shape: NumberShape): number | string => (shape.kind === "number" ? n : shape.pad ? pad2(n) : String(n))

/** "23:59", "9:05", "11:59 PM": an `end_time`. */
export function parseClock(value: unknown): { hour: number; minute: number; pad: boolean; ampm: null | "upper" | "lower" } | null {
  if (typeof value !== "string") return null
  const m = /^\s*(\d{1,2}):(\d{2})(?:\s*([AaPp])[Mm])?\s*$/.exec(value)
  if (!m) return null
  let hour = +m[1]
  const minute = +m[2]
  if (minute > 59) return null
  let ampm: null | "upper" | "lower" = null
  if (m[3]) {
    if (hour < 1 || hour > 12) return null
    ampm = m[3] === m[3].toUpperCase() ? "upper" : "lower"
    hour = (hour % 12) + (m[3].toLowerCase() === "p" ? 12 : 0)
  } else if (hour > 24 || (hour === 24 && minute > 0)) return null
  return { hour, minute, pad: m[1].length === 2, ampm }
}

function formatClock(hour: number, minute: number, like: { pad: boolean; ampm: null | "upper" | "lower" }): string {
  if (like.ampm) {
    const h = hour % 12 || 12
    const ap = hour < 12 ? "AM" : "PM"
    return `${like.pad ? pad2(h) : h}:${pad2(minute)} ${like.ampm === "upper" ? ap : ap.toLowerCase()}`
  }
  return `${like.pad ? pad2(hour) : hour}:${pad2(minute)}`
}

/* ── a UTC offset held in its own setting ─────────────────────────────── */

export type OffsetShape =
  | { kind: "number"; unit: "hours" | "minutes" }
  | { kind: "string"; prefix: string; space: string; sign: boolean; pad: boolean; minutes: "none" | "colon" | "compact" | "decimal" }

const OFFSET_TEXT = /^\s*(UTC|GMT)?(\s*)([+\-−])?(\d{1,2})(?:(:)(\d{2})|(\d{2})|\.(\d+))?\s*$/i

/** Minutes east of UTC, from 2, -5, 5.5, "+2", "-05:00", "+0530", "UTC+2", "GMT-3:30" or a bare "UTC". */
export function parseOffset(value: unknown): { minutes: number; shape: OffsetShape } | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    /* A number past 14 cannot be hours: a range in minutes. */
    if (Math.abs(value) > 14) return Math.abs(value) <= 14 * 60 ? { minutes: Math.round(value), shape: { kind: "number", unit: "minutes" } } : null
    return { minutes: Math.round(value * 60), shape: { kind: "number", unit: "hours" } }
  }
  if (typeof value !== "string") return null
  if (/^\s*(UTC|GMT|Z)\s*$/i.test(value)) return { minutes: 0, shape: { kind: "string", prefix: value.trim().toUpperCase() === "Z" ? "" : value.trim(), space: "", sign: false, pad: false, minutes: "none" } }
  const m = OFFSET_TEXT.exec(value)
  if (!m) return null
  const h = +m[4]
  const mm = m[6] !== undefined ? +m[6] : m[7] !== undefined ? +m[7] : m[8] !== undefined ? Math.round(Number(`0.${m[8]}`) * 60) : 0
  if (h > 14 || mm > 59) return null
  const negative = m[3] === "-" || m[3] === "−"
  return {
    minutes: (negative ? -1 : 1) * (h * 60 + mm),
    shape: { kind: "string", prefix: m[1] ?? "", space: m[2], sign: m[3] !== undefined, pad: m[4].length === 2, minutes: m[6] !== undefined ? "colon" : m[7] !== undefined ? "compact" : m[8] !== undefined ? "decimal" : "none" },
  }
}

export function formatOffset(minutes: number, shape: OffsetShape): number | string {
  if (shape.kind === "number") return shape.unit === "minutes" ? minutes : minutes / 60
  const a = Math.abs(minutes), h = Math.floor(a / 60), mm = a % 60
  const sign = minutes < 0 ? "-" : shape.sign ? "+" : ""
  const hh = shape.pad ? pad2(h) : String(h)
  let rest = ""
  if (shape.minutes === "colon") rest = `:${pad2(mm)}`
  else if (shape.minutes === "compact") rest = pad2(mm)
  else if (mm) rest = shape.minutes === "decimal" || shape.minutes === "none" ? String(mm / 60).slice(1) : ""
  if (!shape.prefix) return `${sign}${hh}${rest}`
  /* "UTC" alone was zero; any other offset is written UTC+2. */
  return minutes === 0 && shape.minutes === "none" && !shape.sign ? shape.prefix : `${shape.prefix}${shape.space}${minutes < 0 ? "-" : "+"}${hh}${rest}`
}

/** "UTC+2", "UTC-3:30", "UTC": how a person says a fixed offset. */
export function offsetLabel(minutes: number): string {
  if (minutes === 0) return "UTC"
  const a = Math.abs(minutes)
  return `UTC${minutes < 0 ? "-" : "+"}${Math.floor(a / 60)}${a % 60 ? `:${pad2(a % 60)}` : ""}`
}

/** Every offset in use somewhere, west to east, for a time zone list. */
export const COMMON_OFFSETS = [-720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60, 0, 60, 120, 180, 210, 240, 270, 300, 330, 345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720, 765, 780, 840]

/* ── which settings make a countdown ──────────────────────────────────── */

export interface CountdownFieldLike {
  id: string
  type: string
  default?: unknown
  options?: { value: string; label?: string }[]
  min?: number
  max?: number
  step?: number
  label?: string
}

export interface CountdownGroup {
  /** Where the deadline's date is: one stamp (`end_iso`, `countdown_date`) or a date with its parts beside it (`end_date`). */
  source: "iso" | "combined" | "date"
  /** The setting holding the date. */
  dateId: string
  hourId?: string
  minuteId?: string
  timeId?: string
  offsetId?: string
  /** The first of them in the panel's order: where the one control is drawn. */
  lead: string
  /** The rest, drawn by that control and so not on their own. */
  absorbed: string[]
}

const ROLE_IDS = {
  iso: ["end_iso", "countdown_iso", "deadline_iso"],
  combined: ["countdown_date", "countdown_end", "end_datetime", "countdown_datetime"],
  date: ["end_date", "countdown_end_date"],
  hour: ["end_hour", "countdown_hour"],
  minute: ["end_minute", "countdown_minute"],
  time: ["end_time", "countdown_time"],
  offset: ["utc_offset", "timezone_offset", "time_zone_offset", "countdown_utc_offset"],
} as const

/* A text-like setting can hold a date; a checkbox or a picture called end_date cannot. */
const TEXTLIKE = new Set(["text", "textarea", "inline_richtext", "date", "datetime"])
const NUMBERLIKE = new Set(["range", "number", "select", "text", "radio"])

/**
 * The countdown among a section's or a block's settings, by their ids, or
 * null. One per list: the first stamp found (an ISO one before a combined
 * one before a plain date), with the hour, minute, time and offset beside a
 * plain date, and the offset beside a stamp that does not name its own zone.
 */
export function countdownGroup(fields: readonly CountdownFieldLike[]): CountdownGroup | null {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const find = (ids: readonly string[], types: Set<string>) => ids.find((id) => byId.has(id) && types.has(byId.get(id)!.type))
  const iso = find(ROLE_IDS.iso, TEXTLIKE)
  const combined = find(ROLE_IDS.combined, TEXTLIKE)
  const date = find(ROLE_IDS.date, TEXTLIKE)
  const source = iso ? "iso" : combined ? "combined" : date ? "date" : null
  if (!source) return null
  const dateId = (iso ?? combined ?? date)!
  const group: CountdownGroup = { source, dateId, lead: dateId, absorbed: [] }
  if (source === "date") {
    group.hourId = find(ROLE_IDS.hour, NUMBERLIKE)
    group.minuteId = find(ROLE_IDS.minute, NUMBERLIKE)
    if (!group.hourId) group.timeId = find(ROLE_IDS.time, TEXTLIKE)
  }
  group.offsetId = find(ROLE_IDS.offset, NUMBERLIKE)
  const members = [dateId, group.hourId, group.minuteId, group.timeId, group.offsetId].filter((x): x is string => !!x)
  const order = fields.map((f) => f.id)
  members.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  group.lead = members[0]
  group.absorbed = members.slice(1)
  return group
}

/* ── reading one ──────────────────────────────────────────────────────── */

export type ZoneMode =
  /** A setting of its own holds the offset. */
  | "setting"
  /** The stamp names its zone, and a new one is written into it. */
  | "inline"
  /** The stamp is written in UTC ("Z"): no zone to choose. */
  | "utc"
  /** Nothing names a zone: the theme's script reads it in each visitor's own time. */
  | "visitor"

export interface CountdownState {
  /** The date, or null when none is set. */
  date: { year: number; month: number; day: number } | null
  /** The time, or null when the settings hold none. */
  time: { hour: number; minute: number } | null
  /** Minutes east of UTC, or null in "visitor" mode. */
  offset: number | null
  zone: ZoneMode
  /** Whether a time can be stored at all (a date-only stamp with no hour beside it cannot). */
  canTime: boolean
  /** A stored date that is not a day of the calendar ("2027-02-29"), kept as it is and named. */
  invalid: string | null
}

type Settings = Record<string, unknown>
const valueOf = (settings: Settings, fields: readonly CountdownFieldLike[], id: string | undefined): unknown => {
  if (!id) return undefined
  const v = settings[id]
  return v === undefined || v === null || v === "" ? fields.find((f) => f.id === id)?.default : v
}

/** An offset setting's value: a select's option or what is typed, as minutes. */
function offsetFrom(field: CountdownFieldLike | undefined, value: unknown): number | null {
  const direct = parseOffset(value)
  if (direct) return direct.minutes
  const option = field?.options?.find((o) => o.value === value)
  return option?.label ? parseOffset(option.label)?.minutes ?? null : null
}

export function readCountdown(group: CountdownGroup, fields: readonly CountdownFieldLike[], settings: Settings): CountdownState {
  const raw = valueOf(settings, fields, group.dateId)
  const stamp = parseStamp(raw)
  const offsetField = fields.find((f) => f.id === group.offsetId)
  const siblingOffset = group.offsetId ? offsetFrom(offsetField, valueOf(settings, fields, group.offsetId)) : null
  let zone: ZoneMode
  let offset: number | null
  if (stamp?.shape.utcOnly) { zone = "utc"; offset = 0 }
  else if (stamp?.shape.hasZone) { zone = "inline"; offset = stamp.zone }
  else if (group.offsetId) { zone = "setting"; offset = siblingOffset ?? 0 }
  else if (group.source === "iso") { zone = "inline"; offset = 0 }
  else { zone = "visitor"; offset = null }
  /* An ISO setting with nothing in it yet is written with its zone; one holding a zone-less stamp is left zone-less. */
  if (group.source === "iso" && stamp && !stamp.shape.hasZone) {
    zone = group.offsetId ? "setting" : "visitor"
    offset = group.offsetId ? siblingOffset ?? 0 : null
  }
  let time: CountdownState["time"] = null
  let canTime: boolean
  if (group.source === "date" && (group.hourId || group.timeId)) {
    canTime = true
    if (group.hourId) {
      const h = parseWhole(valueOf(settings, fields, group.hourId))
      const mi = group.minuteId ? parseWhole(valueOf(settings, fields, group.minuteId)) : null
      if (h) time = { hour: h.n, minute: mi?.n ?? 0 }
    } else {
      const c = parseClock(valueOf(settings, fields, group.timeId))
      if (c) time = { hour: c.hour, minute: c.minute }
    }
  } else {
    canTime = stamp ? stamp.shape.hasTime : group.source !== "date"
    if (stamp?.wall.hour !== null && stamp?.wall.hour !== undefined) time = { hour: stamp.wall.hour, minute: stamp.wall.minute ?? 0 }
  }
  const invalid = !stamp && typeof raw === "string" && raw.trim() ? raw.trim() : null
  return {
    date: stamp ? { year: stamp.wall.year, month: stamp.wall.month, day: stamp.wall.day } : null,
    time,
    offset,
    zone,
    canTime,
    invalid,
  }
}

/**
 * The instant the countdown ends, or null with no date. A "visitor" one is
 * read at `visitorOffset(wall)` (the editor passes its own zone, a test a
 * number): what the theme's script does in each visitor's browser.
 */
export function deadlineOf(state: CountdownState, visitorOffset: (wall: Wall) => number = () => 0): number | null {
  if (!state.date) return null
  const wall: Wall = { ...state.date, hour: state.time?.hour ?? 0, minute: state.time?.minute ?? 0 }
  return instantOf(wall, state.offset ?? visitorOffset(wall))
}

/* ── writing one ──────────────────────────────────────────────────────── */

export interface CountdownEdit {
  date?: { year: number; month: number; day: number }
  time?: { hour: number; minute: number }
  offset?: number
}

/** The value a range, a number or a select can hold nearest to `n`. */
function snap(field: CountdownFieldLike | undefined, n: number): number {
  if (!field) return n
  if (field.type === "select" || field.type === "radio") {
    const nums = (field.options ?? []).map((o) => Number(o.value)).filter((x) => Number.isFinite(x))
    if (!nums.length) return n
    return nums.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) || (Math.abs(x - n) === Math.abs(best - n) && x < best) ? x : best), nums[0])
  }
  let v = n
  if (typeof field.min === "number") v = Math.max(field.min, v)
  if (typeof field.max === "number") v = Math.min(field.max, v)
  if (typeof field.step === "number" && field.step > 0) {
    const base = typeof field.min === "number" ? field.min : 0
    v = base + Math.round((v - base) / field.step) * field.step
    if (typeof field.max === "number" && v > field.max) v -= field.step
  }
  return v
}

/** A whole number written into a setting the way it was written before, or as its type holds one. */
function writeWhole(field: CountdownFieldLike | undefined, current: unknown, n: number): unknown {
  const v = snap(field, n)
  const was = parseWhole(current) ?? parseWhole(field?.default)
  if (field?.type === "select" || field?.type === "radio") {
    const o = field.options?.find((x) => Number(x.value) === v)
    if (o) return o.value
  }
  if (was) return formatWhole(v, was.shape)
  return field?.type === "range" || field?.type === "number" ? v : pad2(v)
}

function writeOffset(field: CountdownFieldLike | undefined, current: unknown, minutes: number): unknown {
  if (field?.options?.length) {
    const o = field.options.find((x) => offsetFrom(field, x.value) === minutes)
    return o ? o.value : current
  }
  const was = parseOffset(current) ?? parseOffset(field?.default)
  if (was) return formatOffset(minutes, was.shape)
  if (field?.type === "range" || field?.type === "number") return minutes / 60
  return formatOffset(minutes, { kind: "string", prefix: "", space: "", sign: true, pad: false, minutes: "decimal" })
}

/** The offsets a zone list offers: a select's own options, or every offset in use. */
export function offsetChoices(group: CountdownGroup, fields: readonly CountdownFieldLike[]): number[] {
  const field = fields.find((f) => f.id === group.offsetId)
  if (field?.options?.length) {
    const out = field.options.map((o) => offsetFrom(field, o.value)).filter((x): x is number => x !== null)
    return [...new Set(out)]
  }
  return COMMON_OFFSETS
}

/**
 * The settings one change writes, and only those whose value changes: a
 * date picked writes the date setting alone, a time its hour and minute.
 * Each in the shape it was stored in.
 */
export function writeCountdown(group: CountdownGroup, fields: readonly CountdownFieldLike[], settings: Settings, edit: CountdownEdit): Record<string, unknown> {
  const state = readCountdown(group, fields, settings)
  const field = (id: string | undefined) => fields.find((f) => f.id === id)
  const date = edit.date ?? state.date
  if (!date || !isRealDate(date.year, date.month, date.day)) return {}
  const time = edit.time ?? state.time ?? (state.canTime ? { hour: 23, minute: 59 } : null)
  const offset = edit.offset ?? state.offset
  const patch: Record<string, unknown> = {}
  const put = (id: string | undefined, v: unknown) => {
    if (!id || v === undefined) return
    const now = settings[id]
    if (now === v) return
    /* Unset and still its default: nothing to write. */
    if ((now === undefined || now === null || now === "") && field(id)?.default === v) return
    patch[id] = v
  }

  const raw = valueOf(settings, fields, group.dateId)
  const stamp = parseStamp(raw)
  const shape = stamp?.shape ?? (group.source === "iso" ? SHAPE_ISO : group.source === "combined" ? SHAPE_COMBINED : SHAPE_DATE)
  const inlineTime = group.source !== "date" || !(group.hourId || group.timeId)
  /* A time the stamp holds and a setting beside it overrides is left as it was written. */
  const keepOwn = !inlineTime || !edit.time
  const wall: Wall = {
    ...date,
    hour: !shape.hasTime ? null : inlineTime ? time?.hour ?? 0 : stamp?.wall.hour ?? 0,
    minute: !shape.hasTime ? null : inlineTime ? time?.minute ?? 0 : stamp?.wall.minute ?? 0,
    ...(keepOwn && stamp?.wall.second !== undefined ? { second: stamp.wall.second } : {}),
    ...(keepOwn && stamp?.wall.ms !== undefined ? { ms: stamp.wall.ms } : {}),
  }
  const inlineZone = state.zone === "inline" || state.zone === "utc"
  put(group.dateId, formatStamp(shape, wall, inlineZone ? offset ?? 0 : null))

  if (!inlineTime && time && edit.time) {
    if (group.hourId) {
      put(group.hourId, writeWhole(field(group.hourId), settings[group.hourId], time.hour))
      if (group.minuteId) put(group.minuteId, writeWhole(field(group.minuteId), settings[group.minuteId], time.minute))
    } else if (group.timeId) {
      const like = parseClock(settings[group.timeId]) ?? parseClock(field(group.timeId)?.default) ?? { pad: true, ampm: null }
      put(group.timeId, formatClock(time.hour, time.minute, like))
    }
  }
  if (state.zone === "setting" && group.offsetId && offset !== null && edit.offset !== undefined) {
    put(group.offsetId, writeOffset(field(group.offsetId), valueOf(settings, fields, group.offsetId), offset))
  }
  return patch
}

/* ── saying it ────────────────────────────────────────────────────────── */

const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Tue 3 Nov, 23:59", with the year when it is not this one: read from the parts, so no zone moves the day. */
export function wallInWords(date: { year: number; month: number; day: number }, time: { hour: number; minute: number } | null, thisYear: number): string {
  const weekday = EN_DAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()]
  const year = date.year === thisYear ? "" : ` ${date.year}`
  const at = time ? `, ${pad2(time.hour)}:${pad2(time.minute)}` : ""
  return `${weekday} ${date.day} ${EN_MONTHS[date.month - 1]}${year}${at}`
}

/** "Bucharest" from "Europe/Bucharest"; nothing for a zone with no city. */
export function cityOf(timeZone: string | null | undefined): string | null {
  if (!timeZone || !timeZone.includes("/") || /^Etc\//.test(timeZone)) return null
  return timeZone.split("/").pop()!.replace(/_/g, " ")
}

/** Where a reader of the deadline is: their zone's name and what offset it is on at an instant. */
export interface ZoneContext {
  timeZone?: string | null
  offsetAt?: (instant: number) => number
}

export interface DeadlineWords {
  ended: boolean
  /** "Tue 3 Nov, 23:59" */
  when: string
  /** The city when the offset is the reader's own on that date. */
  city: string | null
  /** "UTC+2", or null for a visitor's own time. */
  zone: string | null
}

export function deadlineWords(state: CountdownState, now: number, ctx: ZoneContext = {}): DeadlineWords | null {
  if (!state.date) return null
  const visitor = (wall: Wall) => (ctx.offsetAt ? ctx.offsetAt(instantOf(wall, 0)) : 0)
  const at = deadlineOf(state, visitor)!
  const thisYear = wallAt(now, state.offset ?? (ctx.offsetAt ? ctx.offsetAt(now) : 0)).year
  const city = state.offset !== null && ctx.offsetAt && ctx.offsetAt(at) === state.offset ? cityOf(ctx.timeZone) : null
  return { ended: now >= at, when: wallInWords(state.date, state.time, thisYear), city, zone: state.offset === null ? null : offsetLabel(state.offset) }
}

/** English, for tests and logs; the editor says the same in the creator's language. */
export function deadlineSentence(w: DeadlineWords): string {
  const verb = w.ended ? "Ended" : "Ends"
  if (w.zone === null) return `${verb} ${w.when} in each visitor's own time`
  return w.city ? `${verb} ${w.when} in ${w.city} (${w.zone})` : `${verb} ${w.when} ${w.zone}`
}

/**
 * A fixed offset does not follow daylight saving. When the reader's own zone
 * is on another offset on the deadline's date, which one: "Bucharest is on
 * UTC+3 on that date" for a UTC+2 set in summer.
 */
export function daylightHint(state: CountdownState, ctx: ZoneContext): { city: string; zone: string } | null {
  if (state.offset === null || !state.date || !ctx.offsetAt) return null
  const city = cityOf(ctx.timeZone)
  if (!city) return null
  const at = deadlineOf(state)!
  const theirs = ctx.offsetAt(at)
  if (theirs === state.offset) return null
  /* Only a zone that moves: a city a whole offset away all year is another zone, not daylight saving. */
  const year = state.date.year
  const jan = ctx.offsetAt(Date.UTC(year, 0, 15)), jul = ctx.offsetAt(Date.UTC(year, 6, 15))
  if (jan === jul || (state.offset !== jan && state.offset !== jul)) return null
  return { city, zone: offsetLabel(theirs) }
}

/** The offset a named zone is on at an instant, by Intl. */
export function zoneOffsetAt(timeZone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instant))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"))
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000)
}
