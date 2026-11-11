// OnePage: a stat's number, read so it can be counted up to (round AR)
// Location: lib/onepage/stat-count.ts
//
// The stats block shows numbers the creator typed ("12k", "98%", "$1.2M",
// "4.9") or numbers Storelib tracks for them (subscribers, sales, reviews:
// lib/onepage/data-blocks-server.ts fills them in on the server). When the
// block scrolls into view each number arrives one of three ways:
//
//   count   from 0 up to the number, the prefix and suffix kept still
//   roll    each digit rolls into place, like an odometer
//   fade    the number fades and rises into place
//   none    shown as it is
//
// A visitor whose device asks for reduced motion always gets "none". The
// number is never made up: a value that is not a number ("Top 10", "#1")
// is shown exactly as typed and never animated.

export const STAT_ANIMATIONS = ["count", "roll", "fade", "none"] as const
export type StatAnimation = (typeof STAT_ANIMATIONS)[number]

export function statAnimationOf(data: { stats_animation?: unknown } | null | undefined): StatAnimation {
  const v = data?.stats_animation
  return typeof v === "string" && (STAT_ANIMATIONS as readonly string[]).includes(v) ? (v as StatAnimation) : "count"
}

export interface StatNumber {
  prefix: string
  value: number
  decimals: number
  /** "1,204": written with thousands separators. */
  grouped: boolean
  suffix: string
}

/**
 * "12k" as { value 12, suffix "k" }, "$1.2M" as { prefix "$", value 1.2,
 * decimals 1, suffix "M" }, "1,204+" as { value 1204, grouped, suffix "+" }.
 * Null for anything that is not one number with words around it.
 */
export function parseStatValue(raw: unknown): StatNumber | null {
  if (typeof raw !== "string") return null
  const text = raw.trim()
  if (!text || text.length > 16) return null
  const m = text.match(/^([^\d\-.]{0,3}?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?([^\d]{0,6})$/)
  if (!m) return null
  const [, prefix, whole, frac = "", suffix] = m
  if (/\d/.test(prefix) || /\d/.test(suffix)) return null
  const grouped = whole.includes(",")
  const value = Number(`${whole.replace(/,/g, "")}${frac ? `.${frac}` : ""}`)
  if (!Number.isFinite(value)) return null
  return { prefix, value, decimals: frac.length, grouped, suffix }
}

/** The number at a share `t` (0 to 1) of the way, written as the creator wrote it. */
export function statFrame(n: StatNumber, t: number): string {
  const share = Math.min(1, Math.max(0, t))
  const v = share >= 1 ? n.value : n.value * share
  const fixed = v.toFixed(n.decimals)
  const [w, f] = fixed.split(".")
  const whole = n.grouped ? Number(w).toLocaleString("en-US") : w
  return `${n.prefix}${whole}${f ? `.${f}` : ""}${n.suffix}`
}

/** Fast then gentle: most of the number arrives early, the last digits settle. */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - (1 - x) ** 3
}

/** How long a count takes: longer for a bigger number, never more than 1.6s. */
export function countDuration(n: StatNumber): number {
  const digits = Math.floor(Math.log10(Math.max(1, n.value))) + 1
  return Math.min(1600, 900 + digits * 120)
}

/* ─── Numbers Storelib tracks ───────────────────────────────────────── */

export const STAT_SOURCES = ["typed", "subscribers", "sales", "reviews", "rating"] as const
export type StatSource = (typeof STAT_SOURCES)[number]

export function statSourceOf(item: { source?: unknown } | null | undefined): StatSource {
  const v = item?.source
  return typeof v === "string" && (STAT_SOURCES as readonly string[]).includes(v) ? (v as StatSource) : "typed"
}

/** 950, 1.2k, 12k, 1.2M: short enough for a tile, never rounded up past what is true. */
export function compactCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0"
  const floor1 = (x: number) => Math.floor(x * 10) / 10
  if (n < 1000) return String(Math.floor(n))
  if (n < 10_000) return `${floor1(n / 1000)}k`.replace(".0k", "k")
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`
  if (n < 10_000_000) return `${floor1(n / 1_000_000)}M`.replace(".0M", "M")
  return `${Math.floor(n / 1_000_000)}M`
}
