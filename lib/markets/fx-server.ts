import "server-only"

/**
 * ===========================================================================
 *  EXCHANGE RATES: THE EUROPEAN CENTRAL BANK'S, ONE DAY AT A TIME
 * ===========================================================================
 * The ECB publishes reference rates for about thirty currencies against the
 * euro every working day around 16:00 CET. The daily cron fetches them
 * (refreshRates) and keeps one row per day (fx_rates, SQL part 136); a
 * website reads the newest (latestRates), cached for an hour. Nothing is
 * ever invented: a currency the ECB does not publish has no rate, and a
 * day's rates that missed more than lib/markets/money FX_MISSED_DAYS
 * publications are not used.
 *
 * These are reference rates for showing prices, never for charging: the
 * card is charged in the store's currency (lib/markets/money chargeNote).
 */
import { unstable_cache, revalidateTag } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import type { FxRates } from "./money"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
const FX_TAG = "fx-rates"

/** The ECB's daily file, read: its date and each currency's rate per euro. Null for anything that is not that file. */
export function parseEcbDaily(xml: string): FxRates | null {
  const day = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)
  if (!day) return null
  const rates: Record<string, number> = {}
  for (const m of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g)) {
    const r = Number(m[2])
    if (Number.isFinite(r) && r > 0) rates[m[1]] = r
  }
  return Object.keys(rates).length >= 5 ? { asOf: day[1], rates } : null
}

/** Fetch today's rates and keep them. For the daily cron; never on a visitor's request. */
export async function refreshRates(db: Db = createAdminClient()): Promise<{ ok: boolean; asOf?: string; error?: string }> {
  try {
    const res = await fetch(ECB_DAILY_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { Accept: "application/xml" } })
    if (!res.ok) return { ok: false, error: `ECB answered ${res.status}` }
    const fx = parseEcbDaily(await res.text())
    if (!fx) return { ok: false, error: "The ECB file could not be read" }
    const { error } = await db.from("fx_rates").upsert({ as_of: fx.asOf, base: "EUR", rates: fx.rates, source: "ecb", fetched_at: new Date().toISOString() }, { onConflict: "as_of" })
    if (error) return { ok: false, error: error.code ?? "save failed" }
    revalidateTag(FX_TAG, { expire: 0 })
    return { ok: true, asOf: fx.asOf }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "fetch failed" }
  }
}

/** The newest day's rates, or null (none yet, or part 136 not run). Freshness is the caller's to check (lib/markets/money fxFresh). */
export async function latestRates(db: Db = createAdminClient()): Promise<FxRates | null> {
  try {
    const { data, error } = await db.from("fx_rates").select("as_of, rates").order("as_of", { ascending: false }).limit(1).maybeSingle()
    if (error || !data) return null
    const row = data as { as_of: string; rates: Record<string, number> }
    return { asOf: String(row.as_of).slice(0, 10), rates: row.rates ?? {} }
  } catch {
    return null
  }
}

/** The same, cached for an hour and cleared when new rates arrive. */
export const cachedRates = unstable_cache(() => latestRates(), ["fx-rates-latest"], { tags: [FX_TAG], revalidate: 3600 })

/* ─── History: every published day, for reports in the store's currency ─── */

export const ECB_HISTORY_90D_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml"
export const ECB_HISTORY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml"

/** Every day in an ECB history file, oldest first. Empty for anything that is not one. */
export function parseEcbHistory(xml: string): FxRates[] {
  const days: FxRates[] = []
  for (const block of xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g)) {
    const rates: Record<string, number> = {}
    for (const m of block[2].matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g)) {
      const r = Number(m[2])
      if (Number.isFinite(r) && r > 0) rates[m[1]] = r
    }
    if (Object.keys(rates).length >= 5) days.push({ asOf: block[1], rates })
  }
  return days.sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0))
}

/**
 * Fill in the days fx_rates does not have yet, from the ECB's own history:
 * the last 90 days normally, every day since 1999 the first time (`full`).
 * A day already kept is never rewritten (the rates a report or a currency
 * change used stay exactly what they were). For the daily cron; never on a
 * visitor's request.
 */
export async function refreshHistory(db: Db = createAdminClient(), opts: { full?: boolean } = {}): Promise<{ ok: boolean; added?: number; error?: string }> {
  try {
    const res = await fetch(opts.full ? ECB_HISTORY_URL : ECB_HISTORY_90D_URL, { cache: "no-store", signal: AbortSignal.timeout(opts.full ? 60_000 : 15_000), headers: { Accept: "application/xml" } })
    if (!res.ok) return { ok: false, error: `ECB answered ${res.status}` }
    const days = parseEcbHistory(await res.text())
    if (!days.length) return { ok: false, error: "The ECB history could not be read" }
    const fetchedAt = new Date().toISOString()
    let added = 0
    for (let i = 0; i < days.length; i += 500) {
      const chunk = days.slice(i, i + 500).map((d) => ({ as_of: d.asOf, base: "EUR", rates: d.rates, source: "ecb", fetched_at: fetchedAt }))
      const { error, count } = await db.from("fx_rates").upsert(chunk, { onConflict: "as_of", ignoreDuplicates: true, count: "exact" })
      if (error) return { ok: false, added, error: error.code ?? "save failed" }
      added += typeof count === "number" ? count : 0
    }
    return { ok: true, added }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "fetch failed" }
  }
}

/** How many days fx_rates keeps: the cron fetches the whole history once while it is short. */
export async function keptDays(db: Db = createAdminClient()): Promise<number> {
  try {
    const { count } = await db.from("fx_rates").select("as_of", { count: "exact", head: true })
    return typeof count === "number" ? count : 0
  } catch {
    return 0
  }
}

/**
 * Every kept day between two dates (a week before `from`, for a weekend or
 * a holiday at its start), oldest first, for converting a report's orders
 * at their own day's rates (lib/money/report-currency). Empty when the
 * table cannot be read: the report then converts nothing rather than guess.
 */
export async function dayRatesBetween(from: string, to: string, db: Db = createAdminClient()): Promise<Array<{ asOf: string; rates: Record<string, number> }>> {
  try {
    const start = new Date(Date.parse(`${from}T00:00:00Z`) - 8 * 86_400_000).toISOString().slice(0, 10)
    const out: Array<{ asOf: string; rates: Record<string, number> }> = []
    let after = start
    for (;;) {
      const { data, error } = await db.from("fx_rates").select("as_of, rates").gte("as_of", after).lte("as_of", to).order("as_of", { ascending: true }).limit(1000)
      if (error || !data) break
      const rows = data as Array<{ as_of: string; rates: Record<string, number> }>
      for (const r of rows) out.push({ asOf: String(r.as_of).slice(0, 10), rates: r.rates ?? {} })
      if (rows.length < 1000) break
      const last = String(rows[rows.length - 1].as_of).slice(0, 10)
      after = new Date(Date.parse(`${last}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    }
    return out
  } catch {
    return []
  }
}
