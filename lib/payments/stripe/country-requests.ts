import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { countryCode, countryName } from "@/lib/checkout/countries"
import { PaymentsProblem } from "../errors"

/**
 * "TELL ME WHEN MY COUNTRY OPENS" (round 25). A seller whose bank is in a
 * country Storelib cannot pay out to yet (lib/payments/stripe/payout-regions)
 * is not left at a dead end: the country step offers to note it. The request
 * goes into integration_requests, the queue Storelib already reads and
 * answers in /admin, Integrations, named "Payouts in <country>" with the
 * code in the note, so the owner sees which countries are asked for most and
 * who to write to when one opens. One per seller and country.
 */
export const PAYOUT_COUNTRY_NOTE = "payouts_country:"

export async function askForCountry(creatorId: string, raw: string): Promise<{ ok: true; already: boolean }> {
  const code = countryCode(raw)
  if (!code) throw new PaymentsProblem("Choose a country.", 400, "country_required")
  const name = `Payouts in ${countryName(code)}`.slice(0, 80)
  const db = createAdminClient()
  const { data: asked, error: readError } = await db.from("integration_requests").select("id").eq("creator_id", creatorId).eq("name", name).limit(1)
  if (!readError && (asked ?? []).length > 0) return { ok: true, already: true }
  const { error } = await db.from("integration_requests").insert({ creator_id: creatorId, name, note: `${PAYOUT_COUNTRY_NOTE}${code}` })
  if (error) {
    console.error(JSON.stringify({ evt: "payouts_country_request_failed", creator: creatorId, country: code, msg: String(error.message ?? "").slice(0, 160) }))
    throw new PaymentsProblem("That could not be saved just now. Try again in a minute, or write to support@storelib.com.", 503, "retry")
  }
  console.info(JSON.stringify({ evt: "payouts_country_requested", creator: creatorId, country: code }))
  return { ok: true, already: false }
}
