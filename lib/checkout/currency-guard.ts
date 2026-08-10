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
    const { data, error } = await admin
      .from("platform_migrations")
      .select("key")
      .eq("key", "currency_ron_2026")
      .maybeSingle()

    // A MISSING TABLE IS A MISSING MIGRATION, and it is the same answer: the
    // table is created by the very file that would have set the marker.
    if (error) {
      return {
        ok: false,
        message:
          "Plățile sunt configurate în lei, dar migrarea prețurilor nu a rulat. Rulează supabase/sql/RUN_CURRENCY_RON.sql.",
      }
    }

    if (!data) {
      return {
        ok: false,
        message:
          "Plățile sunt configurate în lei, dar prețurile din catalog sunt încă în altă monedă. Rulează supabase/sql/RUN_CURRENCY_RON.sql.",
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
