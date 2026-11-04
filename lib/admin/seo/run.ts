import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"

import { GoogleError, accessToken, inspectUrl, serviceAccountFromEnv, type ServiceAccount } from "./google"
import { crawlCheckIfStale } from "./crawl"
import { readSitePages, readSitemapFile, sitemapFiles } from "./inventory"
import { checkLive, type RobotsCache } from "./live"
import { inspectionsPerRun, kindOf, quotaFromEnv, siteHandleOf, type QuotaSettings } from "./plan"
import { propertiesFromEnv, propertyFor } from "./properties"
import {
  markExpanded,
  nextToExpand,
  nextToInspect,
  nextToScore,
  readSyncState,
  recordFile,
  retireUnseen,
  rowByUrl,
  saveInspection,
  saveScore,
  takeQuota,
  writeSyncState,
  type StatusRow,
} from "./store"

/**
 * ===========================================================================
 *  ONE RUN OF THE SEO CRON, AND ONE CHECK NOW
 * ===========================================================================
 * A run does, in this order and inside its time budget:
 *
 *   1. the inventory: the next sitemap files in the walk (lib/seo/sitemaps
 *      through inventory.ts), written to seo_index_status; a new walk starts
 *      when the last one ends, and retires files the index stopped naming;
 *   2. a few built sites' own pages, from each site's own sitemap;
 *   3. Google: per property, this run's share of the day's quota
 *      (plan.ts inspectionsPerRun), taken from the database's counter, for
 *      the never checked and then the stalest rows;
 *   4. scores: the rows scored longest ago, fetched live.
 *
 * Without the service account, step 3 is skipped and said so; everything
 * else still runs.
 */

type Admin = ReturnType<typeof createAdminClient>

export interface RunSummary {
  google: "connected" | "not_connected"
  files: { name: string; listed: number; left: number; unfinished?: boolean }[]
  retired: number
  sites: number
  inspected: Record<string, { asked: number; granted: number; indexed: number; errors: number; stopped?: string }>
  scored: number
  /** Whether this run checked robots.txt and the sitemap files (when the last check was older than six hours). */
  crawlChecked?: boolean
  problems: string[]
  ms: number
}

const FILES_PER_RUN = 3
const SITES_PER_RUN = 4
const SCORE_BATCH = 10
const SCORE_LANES = 5
const INSPECT_LANES = 4
/** How far past the run's budget anything may still be finishing: budget 48 s + 4 s = 52 s, under maxDuration 60 s. */
export const SEO_HARD_STOP_MS = 4_000

async function lanes<T>(items: T[], n: number, work: (item: T) => Promise<void>, stop: () => boolean = () => false) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length && !stop()) await work(items[next++])
    }),
  )
}

const plainError = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200)

/**
 * `deadline`: no new file is started past it. `hardStop`: a file being written
 * stops there, unfinished, and the walk stays on it so the next run writes it
 * again (it used to carry on until the platform killed the run at 60 s).
 */
export async function syncInventory(admin: Admin, deadline: number, summary: RunSummary, properties: string[], hardStop = Number.POSITIVE_INFINITY): Promise<void> {
  let state = await readSyncState(admin)
  const now = () => new Date().toISOString()
  if (!state || state.next_file >= state.files.length) {
    const files = await sitemapFiles()
    const at = now()
    await writeSyncState(admin, { files, next_file: 0, sweep_started_at: at, ...(state ? { sweep_finished_at: state.sweep_finished_at } : {}) })
    state = { files, next_file: 0, sweep_started_at: at, sweep_finished_at: state?.sweep_finished_at ?? null, last_run_at: null, last_error: null }
  }
  let position = state.next_file
  for (let done = 0; done < FILES_PER_RUN && position < state.files.length && Date.now() < deadline; done++) {
    const name = state.files[position]
    const at = now()
    const entries = await readSitemapFile(name)
    const result = await recordFile(
      admin,
      name,
      entries.map((e) => ({ url: e.url, kind: kindOf(e.url, name), source: name, property: propertyFor(e.url, properties) })),
      at,
      hardStop,
    )
    if (!result.complete) {
      summary.files.push({ name, listed: result.written, left: 0, unfinished: true })
      break
    }
    summary.files.push({ name, listed: result.written, left: result.left })
    position++
    await writeSyncState(admin, { next_file: position, last_run_at: at, last_error: null, ...(position >= state.files.length ? { sweep_finished_at: at } : {}) })
    if (position >= state.files.length && state.sweep_started_at) summary.retired += await retireUnseen(admin, state.sweep_started_at, at)
  }
}

export async function expandSites(admin: Admin, deadline: number, summary: RunSummary, properties: string[], hardStop = Number.POSITIVE_INFINITY): Promise<void> {
  const main = getMainDomain()
  for (const front of await nextToExpand(admin, SITES_PER_RUN)) {
    if (Date.now() >= deadline) break
    const at = new Date().toISOString()
    const handle = siteHandleOf(front, main)
    if (handle) {
      const site = await readSitePages(handle)
      const source = `site:${handle}`
      /* The front page stays with its websites file, which is what lists it. */
      const urls = (site?.urls ?? []).filter((u) => u.replace(/\/$/, "") !== front.replace(/\/$/, ""))
      const result = await recordFile(admin, source, urls.map((url) => ({ url, kind: "website" as const, source, property: propertyFor(url, properties) })), at, hardStop)
      /* Not marked expanded when unfinished: the next run reads this site again. */
      if (!result.complete) break
      summary.sites++
    }
    await markExpanded(admin, front, at)
  }
}

export async function inspectBatch(
  admin: Admin,
  account: ServiceAccount,
  quota: QuotaSettings,
  properties: string[],
  deadline: number,
  summary: RunSummary,
  hardStop = Number.POSITIVE_INFINITY,
): Promise<void> {
  const per = inspectionsPerRun(quota)
  const token = await accessToken(account)
  /* An inspection started near the end may take only what is left of the run, never its full 20 s past it. */
  const timeLeft = () => (Number.isFinite(hardStop) ? hardStop - Date.now() : 20_000)
  for (const property of properties) {
    if (Date.now() >= deadline) break
    const tally: RunSummary["inspected"][string] = { asked: per, granted: 0, indexed: 0, errors: 0 }
    summary.inspected[property] = tally
    const rows = await nextToInspect(admin, property, per)
    if (!rows.length) continue
    tally.granted = await takeQuota(admin, property, rows.length, quota.perDay, quota.perMinute)
    let stopped = false
    await lanes(
      rows.slice(0, tally.granted),
      INSPECT_LANES,
      async (row) => {
        const at = new Date().toISOString()
        try {
          const result = await inspectUrl(token, row.url, property, fetch, timeLeft())
          if (result.googleStatus === "indexed") tally.indexed++
          await saveInspection(admin, row.url, result, at)
        } catch (e) {
          tally.errors++
          /* Not a user on the property, or its quota spent: the rest would say the same. */
          if (e instanceof GoogleError && (e.status === 403 || e.status === 429 || e.status === 401)) {
            stopped = true
            tally.stopped = e.message
            if (e.status === 403 || e.status === 401) await saveInspection(admin, row.url, { error: e.message }, at)
            return
          }
          await saveInspection(admin, row.url, { error: plainError(e) }, at)
        }
      },
      () => stopped || Date.now() >= deadline || timeLeft() < 3_000,
    )
  }
}

const googleOf = (status: string | null | undefined): "indexed" | "not_indexed" | null => (status === "indexed" ? "indexed" : status === "not_indexed" ? "not_indexed" : null)

/**
 * One page's check can take up to SCORE_WORST_MS (the page 10 s, a redirect's
 * target 5 s, robots.txt 5 s), so no page is started later than that before
 * the deadline (it was 11 s, which let a slow page run past the function's limit).
 */
const SCORE_WORST_MS = 20_000

export async function scoreBatch(admin: Admin, deadline: number, summary: RunSummary): Promise<void> {
  const robots: RobotsCache = new Map()
  /* The run's hard stop is 4 s past `deadline` (runSeoCron), so a page started by deadline - 16 s ends by it. */
  const lastStart = deadline - (SCORE_WORST_MS - SEO_HARD_STOP_MS)
  while (Date.now() < lastStart - 1_000) {
    const rows = await nextToScore(admin, SCORE_BATCH)
    if (!rows.length) break
    await lanes(
      rows,
      SCORE_LANES,
      async (row) => {
        const live = await checkLive(row.url, { inSitemap: row.in_sitemap, google: googleOf(row.google_status), robots })
        await saveScore(admin, row.url, live, new Date().toISOString())
        summary.scored++
      },
      () => Date.now() >= lastStart,
    )
    if (rows.length < SCORE_BATCH) break
  }
}

/**
 * `started`: when the request began, so the budget counts from there (the
 * route passes it). Every step has its own deadline as a share of the run,
 * and SEO_HARD_STOP_MS past the budget nothing at all is still being written
 * or asked (the function's maxDuration is 60 s; the cron runs again in ten
 * minutes and carries on where this one stopped).
 */
export async function runSeoCron(options: { budgetMs: number; started?: number }): Promise<RunSummary> {
  const started = options.started ?? Date.now()
  const end = started + options.budgetMs
  const hardStop = end + SEO_HARD_STOP_MS
  const admin = createAdminClient()
  const account = serviceAccountFromEnv()
  const properties = propertiesFromEnv()
  const summary: RunSummary = { google: account ? "connected" : "not_connected", files: [], retired: 0, sites: 0, inspected: {}, scored: 0, problems: [], ms: 0 }
  const step = async (what: string, work: () => Promise<void>) => {
    try {
      await work()
    } catch (e) {
      summary.problems.push(`${what}: ${plainError(e)}`)
    }
  }
  /* The inventory gets the first half of the run at most, so Google and the scores always have time. */
  await step("inventory", () => syncInventory(admin, started + options.budgetMs / 2, summary, properties, hardStop))
  await step("sites", () => expandSites(admin, started + options.budgetMs * 0.6, summary, properties, hardStop))
  /* Google's sign in alone may take 10 s: not started without the time for it and a few inspections. */
  if (account && hardStop - Date.now() > 15_000) await step("google", () => inspectBatch(admin, account, quotaFromEnv(), properties, started + options.budgetMs * 0.8, summary, hardStop))
  /* robots.txt and the sitemap files, read live at most every six hours (crawl.ts), inside a tenth of the run, and only with that tenth still left before the hard stop. */
  if (hardStop - Date.now() > options.budgetMs / 10 + 2_000) {
    await step("crawl", async () => {
      summary.crawlChecked = await crawlCheckIfStale(admin, options.budgetMs / 10)
    })
  }
  await step("scores", () => scoreBatch(admin, end, summary))
  if (summary.problems.length) await writeSyncState(admin, { last_error: summary.problems.join(" | ").slice(0, 500) }).catch(() => undefined)
  summary.ms = Date.now() - started
  return summary
}

/* ── Check now ─────────────────────────────────────────────────────────── */

export interface CheckNowResult {
  row: StatusRow
  notes: string[]
}

/**
 * One listed address checked now: Google asked (one inspection from the
 * day's quota, when the property has any left) and the page fetched live.
 * Only an address the inventory lists can be checked, so this is never a
 * way to fetch anything else.
 */
export async function checkNow(url: string): Promise<CheckNowResult | null> {
  const admin = createAdminClient()
  const row = await rowByUrl(admin, url)
  if (!row) return null
  const notes: string[] = []
  const account = serviceAccountFromEnv()
  const quota = quotaFromEnv()
  let google = googleOf(row.google_status)
  const property = propertyFor(row.url, propertiesFromEnv())
  if (property !== row.property) {
    await admin.from("seo_index_status").update({ property, ...(property ? {} : { google_status: "no_property" }) }).eq("url", url)
  }
  if (!property) notes.push("Not in Storelib's Search Console, so Google was not asked.")
  else if (!account) notes.push("Google Search Console is not connected, so Google was not asked.")
  else {
    const granted = await takeQuota(admin, property, 1, quota.perDay, quota.perMinute)
    if (!granted) notes.push(`Today's ${quota.perDay.toLocaleString("en-US")} inspections for ${property} are used. Google was not asked.`)
    else {
      const at = new Date().toISOString()
      try {
        const token = await accessToken(account)
        const result = await inspectUrl(token, row.url, property)
        await saveInspection(admin, row.url, result, at)
        google = googleOf(result.googleStatus)
      } catch (e) {
        const said = plainError(e)
        await saveInspection(admin, row.url, { error: said }, at)
        notes.push(said)
      }
    }
  }
  const live = await checkLive(row.url, { inSitemap: row.in_sitemap, google })
  await saveScore(admin, row.url, live, new Date().toISOString())
  const fresh = await rowByUrl(admin, url)
  return { row: fresh ?? row, notes }
}
