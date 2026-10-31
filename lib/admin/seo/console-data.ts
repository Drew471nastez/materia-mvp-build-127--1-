import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import { bingFromEnv, bingStats, type BingStats } from "./bing"
import { readCrawlReports, type CrawlReports } from "./crawl"
import type { CoverageView, ConflictGroup } from "./insights"
import { coverageGroups, newestReads, sitemapConflicts } from "./insights"
import { serviceAccountFromEnv } from "./google"
import { searchPerformance, type SearchPerformance } from "./search-analytics"
import { quotaDayStart, quotaFromEnv } from "./plan"
import { propertiesFromEnv } from "./properties"
import { listRows, missingSchema, readSyncState, totals, usedToday, type KindTotals, type ListQuery, type ListResult, type SyncState } from "./store"

/**
 * Everything /admin/seo draws on its first paint, read on the server. Each
 * read that fails says so in `problems` instead of turning into a zero.
 */
export interface SeoConsoleData {
  schemaReady: boolean
  google: { connected: boolean; clientEmail: string | null; properties: string[]; perDay: number; reserve: number; usedToday: Record<string, number> }
  totals: KindTotals[]
  list: ListResult
  sync: SyncState | null
  query: ListQuery
  problems: string[]
  /** When this page's database reads were made. */
  readAt: string
  /** The newest answer Google gave for any address, and the newest live check Storelib made. */
  newest: { google: string | null; scored: string | null }
  crawl: CrawlReports | null
  conflicts: ConflictGroup[] | null
  coverage: CoverageView | null
  /** Search Analytics per property, when Search Console is connected. */
  search: SearchPerformance[] | null
  bing: { connected: boolean; stats: BingStats | null }
  /** Whether each verification variable is set. Only whether: the value is never read into the page. */
  verification: { google: boolean; bing: boolean }
}

export async function readSeoConsole(query: ListQuery): Promise<SeoConsoleData> {
  const account = serviceAccountFromEnv()
  const quota = quotaFromEnv()
  const data: SeoConsoleData = {
    schemaReady: true,
    google: { connected: !!account, /* Whether it is set, never its value: the page shows presence only. */ clientEmail: null, properties: propertiesFromEnv(), perDay: quota.perDay, reserve: quota.reserve, usedToday: {} },
    totals: [],
    list: { rows: [], total: 0, page: query.page, pages: 1 },
    sync: null,
    query,
    problems: [],
    readAt: new Date().toISOString(),
    newest: { google: null, scored: null },
    crawl: null,
    conflicts: null,
    coverage: null,
    search: null,
    bing: { connected: !!bingFromEnv(), stats: null },
    verification: { google: !!process.env.GOOGLE_SITE_VERIFICATION?.trim(), bing: !!process.env.BING_SITE_VERIFICATION?.trim() },
  }
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    data.problems.push("The database is not configured on this deployment.")
    data.schemaReady = false
    return data
  }
  const settle = async <T>(what: string, read: () => Promise<T>, apply: (v: T) => void) => {
    try {
      apply(await read())
    } catch (e) {
      if (missingSchema(e as { code?: string; message?: string })) data.schemaReady = false
      else data.problems.push(`${what} could not be read.`)
    }
  }
  await Promise.all([
    settle("Totals", () => totals(admin), (v) => (data.totals = v)),
    settle("Addresses", () => listRows(admin, query), (v) => (data.list = v)),
    settle("The inventory walk", () => readSyncState(admin), (v) => (data.sync = v)),
    settle("Today's inspections", () => usedToday(admin, quotaDayStart()), (v) => (data.google.usedToday = v)),
    settle("The newest reads", () => newestReads(admin), (v) => (data.newest = v)),
    settle("The crawl check", () => readCrawlReports(admin), (v) => (data.crawl = v)),
    settle("Sitemap conflicts", () => sitemapConflicts(admin), (v) => (data.conflicts = v)),
    settle("Indexing issues", () => coverageGroups(admin), (v) => (data.coverage = v)),
    (async () => {
      if (account) data.search = await Promise.all(data.google.properties.slice(0, 2).map((p) => searchPerformance(account, p)))
    })(),
    (async () => {
      const bing = bingFromEnv()
      if (bing) data.bing.stats = await bingStats(bing)
    })(),
  ])
  return data
}
