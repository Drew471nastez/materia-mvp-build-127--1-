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
 * day's rates older than lib/markets/money FX_FRESH_DAYS are not used.
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
