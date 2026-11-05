import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"

import type { Inspection } from "./google"
import { KINDS, type Kind } from "./plan"
import type { Check } from "./score"

/**
 * ===========================================================================
 *  THE ROWS OF part 342, READ AND WRITTEN
 * ===========================================================================
 * Every read the console makes is one page of rows, filtered and ordered in
 * SQL: the table holds every address Storelib lists, hundreds of thousands
 * of them, and none of it is loaded whole.
 */

type Admin = ReturnType<typeof createAdminClient>


export const PAGE_SIZE = 50

export interface StatusRow {
  url: string
  kind: Kind
  source: string
  property: string | null
  in_sitemap: boolean
  first_seen_at: string
  last_seen_at: string
  left_sitemap_at: string | null
  google_status: Inspection["googleStatus"] | null
  verdict: string | null
  coverage_state: string | null
  indexing_state: string | null
  robots_txt_state: string | null
  page_fetch_state: string | null
  last_crawl_time: string | null
  google_canonical: string | null
  user_canonical: string | null
  inspection_link: string | null
  inspect_error: string | null
  inspected_at: string | null
  score: number | null
  checks: Check[] | null
  http_status: number | null
  score_error: string | null
  scored_at: string | null
}

export const ROW_COLUMNS =
  "url, kind, source, property, in_sitemap, first_seen_at, last_seen_at, left_sitemap_at, google_status, verdict, coverage_state, indexing_state, robots_txt_state, page_fetch_state, last_crawl_time, google_canonical, user_canonical, inspection_link, inspect_error, inspected_at, score, checks, http_status, score_error, scored_at"

/** Part 342 has not run: the table or function is not there. */
export function missingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42883" || /does not exist|could not find/i.test(error.message ?? "")
}

/* ── Filters ───────────────────────────────────────────────────────────── */

export const STATUS_FILTERS = ["all", "indexed", "not_indexed", "not_checked", "no_property", "error", "left", "low_score"] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export interface ListQuery {
  kind: Kind | "all"
  status: StatusFilter
  q: string
  page: number
}

export function parseListQuery(get: (k: string) => string | null | undefined): ListQuery {
  const kind = get("kind") ?? "all"
  const status = get("status") ?? "all"
  const page = Number.parseInt(get("page") ?? "1", 10)
  return {
    kind: (KINDS as readonly string[]).includes(kind) ? (kind as Kind) : "all",
    status: (STATUS_FILTERS as readonly string[]).includes(status) ? (status as StatusFilter) : "all",
    /* Searched with ilike, so its own wildcards are taken as letters. */
    q: (get("q") ?? "").trim().slice(0, 200),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 100_000) : 1,
  }
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export interface ListResult {
  rows: StatusRow[]
  total: number
  page: number
  pages: number
}

export async function listRows(admin: Admin, query: ListQuery): Promise<ListResult> {
  let q = admin.from("seo_index_status").select(ROW_COLUMNS, { count: "exact" })
  if (query.kind !== "all") q = q.eq("kind", query.kind)
  switch (query.status) {
    case "indexed":
      q = q.eq("in_sitemap", true).eq("google_status", "indexed")
      break
    case "not_indexed":
      q = q.eq("in_sitemap", true).eq("google_status", "not_indexed")
      break
    case "not_checked":
      q = q.eq("in_sitemap", true).not("property", "is", null).or("google_status.is.null,google_status.eq.unknown,google_status.eq.error")
      break
    case "no_property":
      q = q.eq("in_sitemap", true).is("property", null)
      break
    case "error":
      q = q.eq("google_status", "error")
      break
    case "left":
      q = q.eq("in_sitemap", false)
      break
    case "low_score":
      q = q.eq("in_sitemap", true).lt("score", 70)
      break
    default:
      q = q.eq("in_sitemap", true)
  }
  if (query.q) q = q.ilike("url", `%${likeEscape(query.q)}%`)
  const from = (query.page - 1) * PAGE_SIZE
  const { data, error, count } = await q.order("kind", { ascending: true }).order("url", { ascending: true }).range(from, from + PAGE_SIZE - 1)
  if (error) throw error
  const total = count ?? 0
  return { rows: (data ?? []) as unknown as StatusRow[], total, page: query.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export async function rowByUrl(admin: Admin, url: string): Promise<StatusRow | null> {
  const { data, error } = await admin.from("seo_index_status").select(ROW_COLUMNS).eq("url", url).maybeSingle()
  if (error) throw error
  return (data as unknown as StatusRow) ?? null
}

/* ── Totals ────────────────────────────────────────────────────────────── */

export interface KindTotals {
  kind: Kind
  listed: number
  in_sitemap: number
  answers_200: number
  indexed: number
  not_indexed: number
  not_checked: number
  no_property: number
  scored: number
  average_score: number | null
}

export async function totals(admin: Admin): Promise<KindTotals[]> {
  const { data, error } = await admin.rpc("seo_index_totals")
  if (error) throw error
  const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    kind: r.kind as Kind,
    listed: num(r.listed),
    in_sitemap: num(r.in_sitemap),
    answers_200: num(r.answers_200),
    indexed: num(r.indexed),
    not_indexed: num(r.not_indexed),
    not_checked: num(r.not_checked),
    no_property: num(r.no_property),
    scored: num(r.scored),
    average_score: r.average_score === null || r.average_score === undefined ? null : Number(r.average_score),
  }))
}

/* ── Quota ─────────────────────────────────────────────────────────────── */

/** Inspections granted (0 when the day's or the minute's allowance is spent). */
export async function takeQuota(admin: Admin, property: string, want: number, perDay: number, perMinute: number): Promise<number> {
  const { data, error } = await admin.rpc("seo_take_inspection_quota", { p_property: property, p_want: want, p_per_day: perDay, p_per_minute: perMinute })
  if (error) throw error
  return Number(data ?? 0)
}

/** What each property has spent since Pacific midnight. */
export async function usedToday(admin: Admin, dayStart: string): Promise<Record<string, number>> {
  const { data, error } = await admin.from("seo_inspection_quota").select("property, used").eq("window_kind", "day").gte("window_start", dayStart)
  if (error) throw error
  const out: Record<string, number> = {}
  for (const r of (data ?? []) as { property: string; used: number }[]) out[r.property] = (out[r.property] ?? 0) + Number(r.used)
  return out
}

/* ── The walk through the sitemap files ────────────────────────────────── */

export interface SyncState {
  files: string[]
  next_file: number
  sweep_started_at: string | null
  sweep_finished_at: string | null
  last_run_at: string | null
  last_error: string | null
}

export async function readSyncState(admin: Admin): Promise<SyncState | null> {
  const { data, error } = await admin.from("seo_sync_state").select("files, next_file, sweep_started_at, sweep_finished_at, last_run_at, last_error").eq("id", 1).maybeSingle()
  if (error) throw error
  return (data as SyncState) ?? null
}

export async function writeSyncState(admin: Admin, state: Partial<SyncState>): Promise<void> {
  const { error } = await admin.from("seo_sync_state").upsert({ id: 1, ...state, updated_at: new Date().toISOString() }, { onConflict: "id" })
  if (error) throw error
}

/* ── Writes ────────────────────────────────────────────────────────────── */

export interface ListedAddress {
  url: string
  kind: Kind
  source: string
  property: string | null
}

const WRITE_BATCH = 500

/**
 * The addresses one sitemap file lists, written as seen now, then every row
 * that file listed before and does not any more marked as out of the
 * sitemap. Google's answer and the score are kept: an address that comes
 * back has its history.
 */
export async function recordFile(
  admin: Admin,
  source: string,
  addresses: ListedAddress[],
  seenAt: string,
  until = Number.POSITIVE_INFINITY,
): Promise<{ written: number; left: number; complete: boolean }> {
  const unique = [...new Map(addresses.map((a) => [a.url, a])).values()]
  /*
    UNFINISHED BY THE RUN'S DEADLINE (`until`): no more batches, and no row is
    marked as left the sitemap (that needs every address of the file written
    first). The caller does not move past this file, so the next run writes it
    again from the start; an upsert written twice is the same row.
  */
  let written = 0
  /*
    Two kinds of batch, because an upsert writes every column any row of the
    batch names: an address with no property is marked so, and one with a
    property keeps whatever Google last said about it.
  */
  for (const group of [unique.filter((a) => a.property), unique.filter((a) => !a.property)]) {
    for (let i = 0; i < group.length; i += WRITE_BATCH) {
      const batch = group.slice(i, i + WRITE_BATCH).map((a) => ({
        url: a.url,
        kind: a.kind,
        source: a.source,
        property: a.property,
        in_sitemap: true,
        last_seen_at: seenAt,
        left_sitemap_at: null,
        ...(a.property ? {} : { google_status: "no_property" }),
        updated_at: seenAt,
      }))
      if (Date.now() >= until) return { written, left: 0, complete: false }
      const { error } = await admin.from("seo_index_status").upsert(batch, { onConflict: "url" })
      if (error) throw error
      written += batch.length
    }
  }
  const { data, error } = await admin
    .from("seo_index_status")
    .update({ in_sitemap: false, left_sitemap_at: seenAt, updated_at: seenAt })
    .eq("source", source)
    .eq("in_sitemap", true)
    .lt("last_seen_at", seenAt)
    .select("url")
  if (error) throw error
  return { written: unique.length, left: (data ?? []).length, complete: true }
}

/**
 * At the end of a full pass: every address no sitemap file named during it
 * has left. By the time it was last seen rather than by file name, because
 * a file's name carries the number of files of its kind (products-3-of-16),
 * which changes as the catalogue grows, and the addresses move between files.
 */
export async function retireUnseen(admin: Admin, sweepStartedAt: string, seenAt: string): Promise<number> {
  const { data, error } = await admin
    .from("seo_index_status")
    .update({ in_sitemap: false, left_sitemap_at: seenAt, updated_at: seenAt })
    .eq("in_sitemap", true)
    .not("source", "like", "site:%")
    .lt("last_seen_at", sweepStartedAt)
    .select("url")
  if (error) throw error
  return (data ?? []).length
}

/** The next rows to ask Google about for one property, in rotation order (plan.ts rotationOrder, said in SQL). */
/*
  ===========================================================================
   ONLY WHAT IS DUE (round 54)
  ===========================================================================
  The three queues below were ordered by "longest ago" with no floor, so
  every ten minute run took the next rows whatever their age: on an
  inventory smaller than one run's share, the same pages were fetched (each
  a full render with its own database reads, on a page that was usually
  stale in the CDN) and the same sites' sitemaps read again every run, all
  day. A row is now due only when its last check is older than these.
*/
/** A page is scored again a day after its last score (Check now still checks at once). */
export const SCORE_EVERY_MS = 24 * 60 * 60 * 1000
/** A built site's own pages are listed again a day after the last listing. */
export const EXPAND_EVERY_MS = 24 * 60 * 60 * 1000
/** Google is asked about an address again a day after it last answered for it. */
export const INSPECT_EVERY_MS = 24 * 60 * 60 * 1000

/** `column` is null or older than `everyMs` before `now`: the PostgREST filter, its time quoted. */
export function dueFilter(column: string, everyMs: number, now: number): string {
  return `${column}.is.null,${column}.lt."${new Date(now - everyMs).toISOString()}"`
}

export async function nextToInspect(admin: Admin, property: string, n: number, now = Date.now()): Promise<{ url: string; property: string }[]> {
  if (n <= 0) return []
  const { data, error } = await admin
    .from("seo_index_status")
    .select("url, property")
    .eq("in_sitemap", true)
    .eq("property", property)
    .or(dueFilter("inspected_at", INSPECT_EVERY_MS, now))
    .order("inspected_at", { ascending: true, nullsFirst: true })
    .order("url", { ascending: true })
    .limit(n)
  if (error) throw error
  return (data ?? []) as { url: string; property: string }[]
}

export async function nextToScore(admin: Admin, n: number, now = Date.now()): Promise<{ url: string; in_sitemap: boolean; google_status: string | null }[]> {
  if (n <= 0) return []
  const { data, error } = await admin
    .from("seo_index_status")
    .select("url, in_sitemap, google_status")
    .eq("in_sitemap", true)
    .or(dueFilter("scored_at", SCORE_EVERY_MS, now))
    .order("scored_at", { ascending: true, nullsFirst: true })
    .order("url", { ascending: true })
    .limit(n)
  if (error) throw error
  return (data ?? []) as { url: string; in_sitemap: boolean; google_status: string | null }[]
}

/** Website front pages whose own pages have been listed longest ago. */
export async function nextToExpand(admin: Admin, n: number, now = Date.now()): Promise<string[]> {
  if (n <= 0) return []
  const { data, error } = await admin
    .from("seo_index_status")
    .select("url")
    .eq("in_sitemap", true)
    .like("source", "websites-%")
    .or(dueFilter("expanded_at", EXPAND_EVERY_MS, now))
    .order("expanded_at", { ascending: true, nullsFirst: true })
    .order("url", { ascending: true })
    .limit(n)
  if (error) throw error
  return ((data ?? []) as { url: string }[]).map((r) => r.url)
}

export async function markExpanded(admin: Admin, url: string, at: string): Promise<void> {
  const { error } = await admin.from("seo_index_status").update({ expanded_at: at }).eq("url", url)
  if (error) throw error
}

export async function saveInspection(admin: Admin, url: string, result: Inspection | { error: string }, at: string): Promise<void> {
  const patch =
    "error" in result
      ? { google_status: "error", inspect_error: result.error.slice(0, 300), inspected_at: at, updated_at: at }
      : {
          google_status: result.googleStatus,
          verdict: result.verdict,
          coverage_state: result.coverageState,
          indexing_state: result.indexingState,
          robots_txt_state: result.robotsTxtState,
          page_fetch_state: result.pageFetchState,
          last_crawl_time: result.lastCrawlTime,
          google_canonical: result.googleCanonical,
          user_canonical: result.userCanonical,
          inspection_link: result.inspectionLink,
          inspect_error: null,
          inspected_at: at,
          updated_at: at,
        }
  const { error } = await admin.from("seo_index_status").update(patch).eq("url", url)
  if (error) throw error
}

export async function saveScore(admin: Admin, url: string, result: { score: number; checks: Check[]; httpStatus: number; error: string | null }, at: string): Promise<void> {
  const { error } = await admin
    .from("seo_index_status")
    .update({ score: result.score, checks: result.checks, http_status: result.httpStatus || null, score_error: result.error?.slice(0, 300) ?? null, scored_at: at, updated_at: at })
    .eq("url", url)
  if (error) throw error
}
