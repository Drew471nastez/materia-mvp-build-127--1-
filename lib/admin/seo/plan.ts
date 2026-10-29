/**
 * ===========================================================================
 *  WHAT EACH ADDRESS IS, AND WHICH ONES ARE ASKED ABOUT NEXT
 * ===========================================================================
 * Pure, so the suite drives it without a database or Google.
 *
 * KINDS come from the sitemap file an address was listed in, the same files
 * storelib.com/sitemap.xml and storelib.me/sitemap.xml name
 * (lib/seo/sitemaps.ts). pages.xml holds several kinds, told apart by path.
 *
 * QUOTA. Google allows about 2,000 inspections a day and 600 a minute per
 * property. The cron spends the day's allowance less a reserve kept for
 * Check now, spread over the runs of the day, so it never spends tomorrow's
 * share by noon. The database counts what was spent
 * (seo_take_inspection_quota, part 342), so two runs at once cannot both
 * take the last of it.
 *
 * ROTATION. Never checked first, then the longest since it was checked, so
 * every listed address comes round in turn and none waits forever.
 */

export const KINDS = ["page", "blog", "help", "legal", "profile", "product", "collection", "onepage", "community", "website"] as const
export type Kind = (typeof KINDS)[number]

export const KIND_LABEL: Record<Kind, string> = {
  page: "Page",
  blog: "Blog",
  help: "Help",
  legal: "Legal",
  profile: "Creator page",
  product: "Product",
  collection: "Category",
  onepage: "OnePage",
  community: "Community",
  website: "Website page",
}

const LEGAL = /^\/(privacy|terms|legal|cookies|dpa|acceptable-use|refund-policy|imprint|subprocessors)(\/|$)/

/** The kind of an address, from the sitemap file it came from. */
export function kindOf(url: string, source: string): Kind {
  if (source.startsWith("products-")) return "product"
  if (source.startsWith("creators-")) return "profile"
  if (source.startsWith("onepages-")) return "onepage"
  if (source.startsWith("communities-")) return "community"
  if (source.startsWith("websites-") || source.startsWith("site:")) return "website"
  let host = ""
  let path = "/"
  try {
    const u = new URL(url)
    host = u.hostname.toLowerCase()
    path = u.pathname
  } catch {
    /* an address that does not parse is a page */
  }
  if (host.startsWith("help.") || path === "/help" || path.startsWith("/help/")) return "help"
  if (LEGAL.test(path)) return "legal"
  if (path.startsWith("/explore/")) return "collection"
  if (path === "/blog" || path.startsWith("/blog/")) return "blog"
  return "page"
}

/** A built site's handle, from its front page at <handle>.<main domain>. */
export function siteHandleOf(url: string, mainDomain: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase()
    const suffix = `.${mainDomain.toLowerCase()}`
    if (!host.endsWith(suffix)) return null
    const handle = host.slice(0, -suffix.length)
    return /^[a-z0-9][a-z0-9-]*$/.test(handle) && handle !== "www" && handle !== "help" ? handle : null
  } catch {
    return null
  }
}

/* ── Quota ─────────────────────────────────────────────────────────────── */

export interface QuotaSettings {
  perDay: number
  perMinute: number
  /** Kept back each day for Check now. */
  reserve: number
  /** How many times a day the cron runs. */
  runsPerDay: number
}

export const CRON_SCHEDULE = "*/10 * * * *"
export const RUNS_PER_DAY = 144

export function quotaFromEnv(env: Record<string, string | undefined> = process.env): QuotaSettings {
  const n = (v: string | undefined, d: number, max: number) => {
    const x = Number.parseInt(v ?? "", 10)
    return Number.isFinite(x) && x >= 0 ? Math.min(x, max) : d
  }
  const perDay = n(env.GOOGLE_SEARCH_CONSOLE_DAILY_QUOTA, 2000, 2000)
  return { perDay, perMinute: n(env.GOOGLE_SEARCH_CONSOLE_MINUTE_QUOTA, 600, 600), reserve: Math.min(perDay, n(env.GOOGLE_SEARCH_CONSOLE_RESERVE, 200, 2000)), runsPerDay: RUNS_PER_DAY }
}

/**
 * How many inspections one cron run may ask for, per property: the day's
 * allowance less the reserve, an equal share per run, never more than a
 * minute allows, and never more than this run has time for.
 */
export function inspectionsPerRun(q: QuotaSettings, timeCap = 40): number {
  const forCron = Math.max(0, q.perDay - q.reserve)
  if (forCron === 0 || q.runsPerDay <= 0) return 0
  return Math.max(1, Math.min(Math.ceil(forCron / q.runsPerDay), q.perMinute, timeCap))
}

/** Check now may spend the reserve as well as whatever the cron left. Only the per day and per minute totals bind it. */
export function manualAllowed(usedToday: number, q: QuotaSettings): boolean {
  return usedToday < q.perDay
}

export interface RotationRow {
  url: string
  property: string | null
  in_sitemap: boolean
  inspected_at: string | null
}

/**
 * The order rows are asked about in: listed and on a property only, never
 * checked first, then oldest check first, the address breaking a tie so the
 * order is the same every time. The database sorts the same way
 * (store.ts nextToInspect), and this is the rule written once so the suite
 * can hold it.
 */
export function rotationOrder<T extends RotationRow>(rows: T[]): T[] {
  return rows
    .filter((r) => r.in_sitemap && r.property)
    .sort((a, b) => {
      if (a.inspected_at === b.inspected_at) return a.url < b.url ? -1 : a.url > b.url ? 1 : 0
      if (a.inspected_at === null) return -1
      if (b.inspected_at === null) return 1
      return Date.parse(a.inspected_at) - Date.parse(b.inspected_at) || (a.url < b.url ? -1 : 1)
    })
}

/** Take up to `per` rows per property, in rotation order. */
export function takePerProperty<T extends RotationRow>(rows: T[], per: Record<string, number>): T[] {
  const left = { ...per }
  const out: T[] = []
  for (const r of rotationOrder(rows)) {
    const p = r.property as string
    if ((left[p] ?? 0) <= 0) continue
    left[p]--
    out.push(r)
  }
  return out
}

/** Pacific midnight, when Google's daily quota starts again, as an ISO time. */
export function quotaDayStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(now)
    .reduce<Record<string, string>>((o, p) => ((o[p.type] = p.value), o), {})
  const sinceMidnight = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000
  return new Date(Math.floor((now.getTime() - sinceMidnight) / 1000) * 1000).toISOString()
}
