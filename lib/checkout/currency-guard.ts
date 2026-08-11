import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { PLATFORM_CURRENCY } from "@/lib/checkout/currency"

/**
 * ===========================================================================
 *  THE ORDER THESE TWO THINGS HAPPEN IN IS WORTH REAL MONEY
 * ===========================================================================
 *
 * Moving the platform to lei is two steps that have to happen in one order:
 *
 *   1. supabase/sql/RUN_CURRENCY_RON.sql, which rewrites `price_cents` from
 *      USD cents into bani
 *   2. NEXT_PUBLIC_PLATFORM_CURRENCY=ron, which tells Stripe what to charge
 *
 * Done that way round, the worst case is a few minutes of prices quoted high.
 * Done the other way round — the flag first — every listing in the catalogue is
 * charged in lei against a dollar-denominated number: a $100 item sells for
 * 100 lei, a 78% discount applied silently, and nothing anywhere reports an
 * error because both halves are individually working exactly as written.
 *
 * A comment in a SQL file is not a safeguard against that. This is: the
 * migration leaves a marker row behind, and a checkout that intends to charge
 * lei checks for it before it builds a PaymentIntent. Set the flag first and
 * checkout refuses loudly instead of undercharging quietly, which turns an
 * irreversible mistake into a five-minute one.
 *
 * ---------------------------------------------------------------------------
 * IT COSTS ONE QUERY, ONCE
 * ---------------------------------------------------------------------------
 * Cached in module scope after the first successful positive answer. The
 * marker can only ever go from absent to present — a migration is not undone —
 * so a `true` is safe to keep forever, and a `false` is deliberately NOT
 * cached: it is the state somebody is actively fixing, and caching it would
 * mean the fix does not take effect until the next deployment.
 *
 * Nothing runs at all while the platform is in USD, which is every request
 * until the day of the switch.
 */
let migrationConfirmed = false

export type CurrencyReadiness = { ok: true } | { ok: false; message: string }

export async function assertChargeCurrencyReady(): Promise<CurrencyReadiness> {
  if (PLATFORM_CURRENCY !== "ron") return { ok: true }
  if (migrationConfirmed) return { ok: true }

  try {
    const admin = createAdminClient()
    /**
     * EITHER MARKER WILL DO, BECAUSE THERE ARE TWO HONEST WAYS TO BE IN LEI.
     *
     *   currency_ron_2026    the catalogue held USD cents and was converted.
     *                        Left behind by RUN_CURRENCY_RON.sql.
     *
     *   currency_ron_native  the catalogue was ALWAYS lei and there was nothing
     *                        to convert. Left behind by
     *                        RUN_CURRENCY_RON_NATIVE.sql.
     *
     * The second exists because this guard was written assuming the only road to
     * lei was a conversion, and that is not the road this product took.
     * `price_cents` is written by exactly one screen — the sell form — which
     * takes a number typed by a Romanian seller and multiplies it by 100. It has
     * always held bani.
     *
     * Demanding the conversion marker would therefore demand a migration that
     * must NEVER run here: RUN_CURRENCY_RON.sql multiplies every stored amount
     * by 4.6, which against a catalogue already in bani is the old display bug
     * made permanent and written to the data instead of the screen.
     *
     * What the guard is for has not changed. It still refuses to charge lei
     * until somebody has stated, in the database, what the stored unit is. It
     * now accepts both of the true answers rather than only one of them.
     */
    const { data, error } = await admin
      .from("platform_migrations")
      .select("key")
      .in("key", ["currency_ron_2026", "currency_ron_native"])
      .limit(1)
      .maybeSingle()

    // A MISSING TABLE IS AN UNSTATED UNIT, and it is the same answer: the table
    // is created by whichever file would have left the marker.
    if (error || !data) {
      return {
        ok: false,
        message:
          "Plățile sunt configurate în lei, dar unitatea prețurilor nu este confirmată. " +
          "Rulează supabase/sql/RUN_CURRENCY_RON_NATIVE.sql dacă prețurile au fost " +
          "dintotdeauna în lei, sau RUN_CURRENCY_RON.sql dacă sunt în dolari.",
      }
    }

    migrationConfirmed = true
    return { ok: true }
  } catch {
    return {
      ok: false,
      message: "Nu am putut verifica moneda platformei. Încearcă din nou.",
    }
  }
}
