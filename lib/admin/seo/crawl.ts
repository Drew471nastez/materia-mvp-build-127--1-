import "server-only"

import { fetchPublic } from "@/lib/api/public-fetch"
import { onePageOrigin } from "@/lib/onepage/address"
import type { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { parseRobots, robotsVerdict } from "@/lib/seo/robots-match"
import { invalidEntries, parseSitemapXml, type InvalidEntry } from "@/lib/seo/sitemap-check"

import { missingSchema } from "./store"

/**
 * ===========================================================================
 *  CRAWLABILITY: storelib.com's robots.txt AND SITEMAP FILES, AS SERVED NOW
 * ===========================================================================
 * Read live from the public site, never from the code, so what is checked
 * is what a crawler gets. Gentle by design:
 *
 *   one robots.txt, then each sitemap file once, two at a time, each with a
 *   time and size limit, the whole check inside a deadline;
 *   run by Check crawlability in /admin/seo (at most once a minute, the
 *   last report is shown otherwise) and by the cron when the last report is
 *   older than six hours; the report is kept in seo_crawl_reports (part 346)
 *   so the console reads it and never fetches anything as it draws.
 *
 * The important paths are fixed pages plus one product and one creator page
 * the inventory lists. Each is judged for Googlebot, Bingbot and
 * OAI-SearchBot (ChatGPT search) by lib/seo/robots-match.
 */

type Admin = ReturnType<typeof createAdminClient>

export const CRAWLERS = [
  { id: "googlebot", label: "Googlebot", tokens: ["googlebot"] },
  { id: "bingbot", label: "Bingbot", tokens: ["bingbot"] },
  { id: "oai-searchbot", label: "OAI-SearchBot", tokens: ["oai-searchbot"] },
] as const

export const FIXED_PATHS = [
  { label: "Home", path: "/" },
  { label: "Pricing", path: "/pricing" },
  { label: "Blog", path: "/blog" },
] as const

export interface RobotsReport {
  url: string
  /** HTTP status, 0 when it did not answer. */
  status: number
  /** How Google treats that answer. */
  reading: "parsed" | "missing_allows_all" | "unreadable"
  ms: number
  sitemaps: string[]
  paths: { label: string; path: string; verdicts: { crawler: string; allowed: boolean; rule: string | null; group: string | null }[] }[]
  notes: string[]
}

export interface SitemapFileReport {
  url: string
  index: string
  status: number
  ms: number
  urls: number | null
  invalidCount: number
  invalid: InvalidEntry[]
  error: string | null
}

export interface SitemapsReport {
  indexes: { url: string; status: number; files: number; error: string | null }[]
  files: SitemapFileReport[]
  /** Files the index named that this check did not reach in its time. */
  skipped: number
}

export interface CrawlReports {
  robots: { report: RobotsReport; checkedAt: string } | null
  sitemaps: { report: SitemapsReport; checkedAt: string } | null
  /** Part 346 has not run: reports are not kept between checks. */
  missingTable: boolean
}

const ROBOTS_LIMIT = { maxBytes: 512 * 1024, timeoutMs: 8_000, maxRedirects: 2 }
const FILE_LIMIT = { maxBytes: 12 * 1024 * 1024, timeoutMs: 12_000, maxRedirects: 0 }
const MAX_FILES = 40
const FILE_LANES = 2
const SHOWN_INVALID = 8

const plain = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160)

async function timed(url: string, limit: typeof ROBOTS_LIMIT): Promise<{ status: number; text: string; ms: number; error: string | null }> {
  const started = Date.now()
  try {
    const res = await fetchPublic(url, limit)
    const text = res.ok ? await res.text() : ""
    return { status: res.status, text, ms: Date.now() - started, error: null }
  } catch (e) {
    const said = plain(e)
    return { status: 0, text: "", ms: Date.now() - started, error: /timed out/.test(said) ? `Took longer than ${limit.timeoutMs / 1000} seconds` : /larger than allowed/.test(said) ? "Larger than the check reads" : /redirect/i.test(said) ? "Redirects" : `Did not load (${said.slice(0, 80)})` }
  }
}

/** One product and one creator page the inventory lists and last saw answer 200, to judge against robots.txt. */
async function samplePaths(admin: Admin, origin: string): Promise<{ label: string; path: string }[]> {
  const out: { label: string; path: string }[] = []
  for (const [kind, label] of [["product", "A product"], ["profile", "A creator page"]] as const) {
    try {
      const { data } = await admin.from("seo_index_status").select("url").eq("in_sitemap", true).eq("kind", kind).eq("http_status", 200).like("url", `${origin}/%`).order("url", { ascending: true }).limit(1)
      const url = (data as { url: string }[] | null)?.[0]?.url
      if (url) {
        const u = new URL(url)
        out.push({ label, path: `${u.pathname}${u.search}` })
      }
    } catch {
      /* no sample: the fixed paths are still judged */
    }
  }
  return out
}

export async function checkRobots(admin: Admin): Promise<RobotsReport> {
  const origin = `https://${getMainDomain().replace(/^www\./, "")}`
  const url = `${origin}/robots.txt`
  const got = await timed(url, ROBOTS_LIMIT)
  const notes: string[] = []
  const reading: RobotsReport["reading"] = got.status >= 200 && got.status < 300 ? "parsed" : got.status >= 400 && got.status < 500 ? "missing_allows_all" : "unreadable"
  if (reading === "missing_allows_all") notes.push(`robots.txt answered ${got.status}. Google reads a 4xx as no rules at all: everything may be crawled.`)
  if (reading === "unreadable") notes.push(`robots.txt ${got.error ? `did not load: ${got.error}` : `answered ${got.status}`}. Google stops crawling a site whose robots.txt answers 5xx for long.`)
  const parsed = parseRobots(reading === "parsed" ? got.text : "")
  const paths = [...FIXED_PATHS, ...(await samplePaths(admin, origin))]
  if (paths.length < 5) notes.push("No product or creator page answering 200 is in the inventory yet, so only the fixed pages are judged.")
  return {
    url,
    status: got.status,
    reading,
    ms: got.ms,
    sitemaps: parsed.sitemaps,
    paths: paths.map((p) => ({
      label: p.label,
      path: p.path,
      verdicts: CRAWLERS.map((c) => {
        if (reading === "unreadable") return { crawler: c.label, allowed: false, rule: null, group: null }
        const v = robotsVerdict(parsed, p.path, [...c.tokens])
        return { crawler: c.label, allowed: v.allowed, rule: v.rule ? `${v.rule.allow ? "Allow" : "Disallow"}: ${v.rule.path}` : null, group: v.group }
      }),
    })),
    notes,
  }
}

async function lanes<T>(items: T[], n: number, work: (item: T) => Promise<void>, stop: () => boolean) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length && !stop()) await work(items[next++])
    }),
  )
}

export async function checkSitemaps(indexUrls: string[], deadline: number): Promise<SitemapsReport> {
  const main = getMainDomain().replace(/^www\./, "")
  const report: SitemapsReport = { indexes: [], files: [], skipped: 0 }
  const queue: { url: string; index: string }[] = []
  for (const index of [...new Set(indexUrls)]) {
    const got = await timed(index, FILE_LIMIT)
    const parsed = got.status === 200 ? parseSitemapXml(got.text) : null
    const files = parsed?.kind === "index" ? parsed.entries.map((e) => e.loc).filter(Boolean) : []
    report.indexes.push({ url: index, status: got.status, files: files.length, error: got.error ?? (got.status !== 200 ? `HTTP ${got.status}` : parsed?.kind === "urlset" ? null : parsed?.kind === "index" ? null : "Not a sitemap") })
    if (parsed?.kind === "urlset") queue.push({ url: index, index })
    for (const f of files) queue.push({ url: f, index })
  }
  const take = queue.slice(0, MAX_FILES)
  report.skipped = queue.length - take.length
  await lanes(
    take,
    FILE_LANES,
    async (f) => {
      const got = await timed(f.url, FILE_LIMIT)
      let host = main
      try {
        host = new URL(f.url).hostname
      } catch {
        /* the index's own address is checked below */
      }
      const parsed = got.status === 200 ? parseSitemapXml(got.text) : null
      const invalid = parsed ? invalidEntries(parsed, host, host.replace(/^www\./, "") === main) : []
      report.files.push({
        url: f.url,
        index: f.index,
        status: got.status,
        ms: got.ms,
        urls: parsed && parsed.kind === "urlset" ? parsed.entries.length : null,
        invalidCount: invalid.length,
        invalid: invalid.slice(0, SHOWN_INVALID),
        error: got.error ?? (got.status !== 200 ? `HTTP ${got.status}` : parsed && parsed.kind !== "urlset" ? "Not a urlset" : null),
      })
    },
    () => Date.now() >= deadline,
  )
  report.skipped += take.length - report.files.length
  report.files.sort((a, b) => take.findIndex((t) => t.url === a.url) - take.findIndex((t) => t.url === b.url))
  return report
}

/* ── Kept between checks (part 346) ────────────────────────────────────── */

export async function readCrawlReports(admin: Admin): Promise<CrawlReports> {
  const { data, error } = await admin.from("seo_crawl_reports").select("report_kind, report, checked_at")
  if (error) {
    if (missingSchema(error)) return { robots: null, sitemaps: null, missingTable: true }
    throw error
  }
  const rows = (data ?? []) as { report_kind: string; report: unknown; checked_at: string }[]
  const of = <T>(kind: string) => {
    const r = rows.find((x) => x.report_kind === kind)
    return r ? { report: r.report as T, checkedAt: r.checked_at } : null
  }
  return { robots: of<RobotsReport>("robots"), sitemaps: of<SitemapsReport>("sitemaps"), missingTable: false }
}

/** How old a report may be before the cron checks again. */
export const CRAWL_STALE_MS = 6 * 60 * 60 * 1000
/** Check crawlability is answered from the last report when that is younger than this. */
export const CRAWL_MIN_GAP_MS = 60 * 1000

/**
 * Both checks, run and kept. The robots.txt's own Sitemap lines name the
 * indexes, with storelib.me's (the OnePages) added; when robots.txt names
 * none, storelib.com/sitemap.xml is read.
 */
export async function runCrawlCheck(admin: Admin, budgetMs: number): Promise<CrawlReports> {
  const deadline = Date.now() + budgetMs
  const robots = await checkRobots(admin)
  const origin = `https://${getMainDomain().replace(/^www\./, "")}`
  const indexes = [...(robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`]), `${onePageOrigin()}/sitemap.xml`]
  const sitemaps = await checkSitemaps(indexes, deadline)
  const at = new Date().toISOString()
  const { error } = await admin.from("seo_crawl_reports").upsert(
    [
      { report_kind: "robots", report: robots, checked_at: at },
      { report_kind: "sitemaps", report: sitemaps, checked_at: at },
    ],
    { onConflict: "report_kind" },
  )
  const missingTable = !!error && missingSchema(error)
  if (error && !missingTable) throw error
  return { robots: { report: robots, checkedAt: at }, sitemaps: { report: sitemaps, checkedAt: at }, missingTable }
}

/** For the cron: a check only when the kept one is older than six hours, or there is none. */
export async function crawlCheckIfStale(admin: Admin, budgetMs: number): Promise<boolean> {
  const kept = await readCrawlReports(admin)
  if (kept.missingTable) return false
  const at = kept.robots?.checkedAt ? Date.parse(kept.robots.checkedAt) : 0
  if (Date.now() - at < CRAWL_STALE_MS) return false
  await runCrawlCheck(admin, budgetMs)
  return true
}
