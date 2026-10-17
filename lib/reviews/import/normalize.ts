/**
 * ===========================================================================
 *  REVIEW IMPORT: ONE CELL AT A TIME
 * ===========================================================================
 * Every review app writes the same facts differently. These read one cell
 * of an export as Storelib keeps it, and are shared by the browser (the
 * mapping step's preview) and the server (which reads every row again and
 * trusts nothing the browser sent).
 *
 *   rating     5, "4.0 out of 5 stars", "8/10", "80%", "★★★★☆", "FIVE",
 *              read on the scale the whole column uses, then whole stars
 *              from one to five
 *   date       ISO, "2024-03-03 10:00:00 UTC", 03/04/2024 (day first when
 *              the column says so), "March 3, 2024", "Reviewed in the
 *              United States on March 3, 2024", unix seconds or ms
 *   yes / no   true, yes, 1, "Verified Purchase", "verified_buyer"
 *   status     published, pending (waits in Reviews › Pending) or hidden
 *   media      every http(s) address in a cell, whatever separates them
 *   text       an export's HTML read as plain text: tags and scripts gone,
 *              entities decoded, line breaks kept
 *
 * Pure: no database, no server modules.
 */
import { cleanReviewText, publicName } from "../app-settings"

/* ── text ─────────────────────────────────────────────────────────────── */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", hellip: "...", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: "-" }

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8}\d?);/gi, (whole, name: string) => {
    const lower = name.toLowerCase()
    if (lower.startsWith("#x")) {
      const n = parseInt(lower.slice(2), 16)
      return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ""
    }
    if (lower.startsWith("#")) {
      const n = parseInt(lower.slice(1), 10)
      return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ""
    }
    return ENTITIES[lower] ?? whole
  })
}

/**
 * What a person reads in a cell an app may have written as HTML: scripts,
 * styles and frames gone with what is inside them, a <br> or a closed
 * paragraph a line break, every other tag gone, entities decoded, and any
 * tag that decoding brought back gone too. The result is plain text, which
 * every page escapes as it prints.
 */
export function plainText(raw: unknown, max: number): string {
  if (raw === null || raw === undefined) return ""
  let s = String(raw)
  if (/[<&]/.test(s)) {
    s = s
      .replace(/<(script|style|iframe|object|embed|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<(script|style|iframe|object|embed|noscript|template|svg)\b[^>]*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)\s*>/gi, "\n")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<\/?[a-z][^>]*>/gi, "")
    s = decodeEntities(s).replace(/<\/?[a-z][^>]*>/gi, "")
  }
  return cleanReviewText(s, max)
}

/** One line of plain text: a title, a name. */
export function plainLine(raw: unknown, max: number): string {
  return plainText(raw, max * 2).replace(/\s*\n+\s*/g, " ").trim().slice(0, max)
}

/* ── rating ───────────────────────────────────────────────────────────── */

const NUMBER_WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/**
 * A rating cell as a number on the scale it was written on, or, when the
 * cell says its own scale ("4 out of 5", "8/10", "80%", a row of stars), on
 * five already. `scaled` says which.
 */
export function readRatingCell(raw: unknown): { value: number; scaled: boolean } | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s) return null
  const filled = (s.match(/[★⭐]/gu) ?? []).length
  if (filled > 0 && /^[\s★☆⭐✩✰]+$/u.test(s)) return { value: filled, scaled: true }
  const word = NUMBER_WORDS[s.toLowerCase().replace(/[^a-z]/g, "")]
  if (word !== undefined && /^[a-z_\s-]+$/i.test(s)) return { value: word, scaled: false }
  const out = s.match(/(\d+(?:[.,]\d+)?)\s*(?:\/|out of|of|sur|von|de|su|z)\s*(\d+(?:[.,]\d+)?)/i)
  if (out) {
    const v = Number(out[1].replace(",", "."))
    const of = Number(out[2].replace(",", "."))
    if (Number.isFinite(v) && Number.isFinite(of) && of > 0) return { value: (v / of) * 5, scaled: true }
  }
  const pct = s.match(/^(\d+(?:[.,]\d+)?)\s*%$/)
  if (pct) return { value: Number(pct[1].replace(",", ".")) / 20, scaled: true }
  const num = s.match(/-?\d+(?:[.,]\d+)?/)
  if (!num) return null
  const v = Number(num[0].replace(",", "."))
  return Number.isFinite(v) ? { value: v, scaled: false } : null
}

/**
 * The scale a rating column is on, from its plain numbers: ten when at
 * least half of them are over five, a hundred when at least half are over
 * ten, else five. A file of 1 to 10 scores read as 1 to 5 would make every
 * 6 a five; one stray 9 in a file of fives is a mistake in that row, not a
 * scale, and that row is refused.
 */
export function ratingScale(cells: readonly unknown[]): 5 | 10 | 100 {
  let n = 0
  let over5 = 0
  let over10 = 0
  for (const c of cells) {
    const r = readRatingCell(c)
    if (!r || r.scaled) continue
    n++
    if (r.value > 5) over5++
    if (r.value > 10) over10++
  }
  if (!n) return 5
  if (over10 * 2 >= n) return 100
  if (over5 * 2 >= n) return 10
  return 5
}

/** Whole stars from one to five, or null when the cell has no usable rating (empty, zero, words). */
export function normalizeRating(raw: unknown, scale: 5 | 10 | 100 = 5): number | null {
  const r = readRatingCell(raw)
  if (!r) return null
  if (!r.scaled && r.value > scale) return null
  const five = r.scaled ? r.value : (r.value / scale) * 5
  if (!Number.isFinite(five) || five < 0.5 || five > 5.5) return null
  return Math.max(1, Math.min(5, Math.round(five)))
}

/* ── dates ────────────────────────────────────────────────────────────── */

/** Whether a column of slash dates is day first: one first number over 12 says so, one second number over 12 says not. */
export function dayFirstColumn(cells: readonly unknown[], fallback = false): boolean {
  for (const c of cells) {
    const m = String(c ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/)
    if (!m) continue
    if (Number(m[1]) > 12) return true
    if (Number(m[2]) > 12) return false
  }
  return fallback
}

const EARLIEST = Date.UTC(1995, 0, 1)

/**
 * A date cell as an ISO instant, or null. A date in the future (a clock
 * wrong somewhere) reads as now; one before 1995 or unreadable is null and
 * the review takes the day it is imported.
 */
export function normalizeDate(raw: unknown, opts: { dayFirst?: boolean; now?: number } = {}): string | null {
  if (raw === null || raw === undefined) return null
  let s = String(raw).trim()
  if (!s) return null
  const now = opts.now ?? Date.now()
  let t = NaN
  if (/^\d{10}(\.\d+)?$/.test(s)) t = Number(s) * 1000
  else if (/^\d{13}$/.test(s)) t = Number(s)
  else {
    s = s.replace(/^reviewed\b.*?\bon\s+/i, "")
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?/i)
    const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i)
    if (iso) {
      const [, y, mo, d, h = "0", mi = "0", se = "0", zone] = iso
      const base = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se))
      let offset = 0
      const z = zone?.toUpperCase()
      if (z && z !== "Z" && z !== "UTC" && z !== "GMT") {
        const m = z.match(/([+-])(\d{2}):?(\d{2})/)
        if (m) offset = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000
      }
      t = base - offset
    } else if (slash) {
      const [, a, b, yRaw, h = "0", mi = "0", se = "0", ampm] = slash
      const day = opts.dayFirst ? Number(a) : Number(b)
      const month = opts.dayFirst ? Number(b) : Number(a)
      let year = Number(yRaw)
      if (year < 100) year += 2000
      let hour = Number(h)
      if (ampm) hour = (hour % 12) + (ampm.toLowerCase() === "pm" ? 12 : 0)
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) t = Date.UTC(year, month - 1, day, hour, Number(mi), Number(se))
    } else {
      t = Date.parse(s.replace(/\s+UTC$/i, " GMT"))
    }
  }
  if (!Number.isFinite(t) || t < EARLIEST) return null
  return new Date(Math.min(t, now)).toISOString()
}

/* ── yes, no and status ───────────────────────────────────────────────── */

const YES = /^(true|t|yes|y|1|x|verified|buyer|confirmed|verified[ _-]?(buyer|purchase|purchaser|reviewer|order|customer))$/i

export function normalizeBool(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw
  return YES.test(String(raw ?? "").trim())
}

export type ImportStatus = "published" | "pending" | "hidden"

const HIDDEN = /^(false|f|no|n|0|hidden|hide|unpublished|not[ _-]?published|rejected|declined|spam|trash|trashed|archived|deleted|inactive|removed|private|disabled|unapproved[ _-]?spam)$/i
const PENDING = /^(pending|not[ _-]?yet|awaiting|awaiting[ _-]?moderation|unapproved|in[ _-]?review|review|moderation|new|draft|hold|on[ _-]?hold)$/i

/** A status cell: anything that reads as off is hidden, waiting reads as pending, everything else (an empty cell too) is published. */
export function normalizeStatus(raw: unknown, map?: Record<string, ImportStatus>): ImportStatus {
  const s = String(raw ?? "").trim()
  if (!s) return "published"
  const own = map?.[s.toLowerCase()]
  if (own) return own
  if (HIDDEN.test(s)) return "hidden"
  if (PENDING.test(s)) return "pending"
  return "published"
}

/* ── photos and videos ────────────────────────────────────────────────── */

/** Every http(s) address in a cell (comma, space, pipe, semicolon, new line or a JSON list between them), each once, at most `max`. */
export function mediaUrls(raw: unknown, max: number): string[] {
  if (raw === null || raw === undefined) return []
  const s = Array.isArray(raw) ? raw.join(" ") : String(raw)
  const out: string[] = []
  for (const m of s.matchAll(/https?:\/\/[^\s,|;"'<>\]\[)(]+/gi)) {
    let url = m[0].replace(/[.,]+$/, "")
    try {
      const u = new URL(url)
      if (u.protocol !== "https:" && u.protocol !== "http:") continue
      if (u.username || u.password) continue
      url = u.toString()
    } catch {
      continue
    }
    if (url.length > 1000 || out.includes(url)) continue
    out.push(url)
    if (out.length >= max) break
  }
  return out
}

/* ── the fingerprint ──────────────────────────────────────────────────── */

/** 53 bits of a string, two ways (cyrb53). Not a secret: the same review in two files reads the same. */
function cyrb53(str: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0")
}

const squash = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim()

/**
 * The same review, whichever app exported it: its product, stars, words,
 * the name it carries and the day. Two imports of one review match here
 * even when the apps gave it different ids.
 */
export function contentHash(r: { productId: string; rating: number; body: string; author: string | null; date: string | null }): string {
  /* The name as the review shows it ("Jane D."), so a review read back from the table makes the same fingerprint. */
  const key = [r.productId, r.rating, squash(r.body), squash(publicName(r.author)), (r.date ?? "").slice(0, 10)].join("|")
  return `h${cyrb53(key, 1)}${cyrb53(key, 7)}`
}

/** A review's own id in the app it came from, as Storelib keys it: "judgeme:12345". */
export function externalKey(platform: string, externalId: string | null | undefined): string | null {
  const id = (externalId ?? "").trim()
  if (!id) return null
  return `${platform}:${id}`.slice(0, 200)
}
