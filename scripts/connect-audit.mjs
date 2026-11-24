#!/usr/bin/env node
/**
 * ===========================================================================
 *  EVERY CONNECTED ACCOUNT, AND WHETHER IT CAN BE PAID OUT (READ ONLY)
 * ===========================================================================
 * Stripe confirmed for Storelib: USD destination charges, automatic currency
 * conversion, and settlement into a creator's supported currency all work,
 * BUT cross-border payouts are not supported for connected accounts on the
 * recipient service agreement. Onboarding (lib/payments/stripe/connect.ts
 * createConnectedAccount) asks for exactly that agreement first for every
 * creator outside the platform's country. This lists who is on it.
 *
 * GET requests only, to Stripe and (optionally) to Supabase. It never
 * creates, updates or deletes anything. It prints no bank details: an
 * external account is shown only by its currency and country.
 *
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/connect-audit.mjs [--json] [--out connect.json]
 *   (with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set, each account is
 *    named by its Storelib store and counted with its paid orders)
 *
 * Verdict per account:
 *   affected        recipient agreement on a cross-border account, or a country
 *                   outside Stripe's cross-border region: cannot be paid out
 *   not-ready       payouts or transfers not enabled, or requirements due
 *   ok              full agreement (or none) with transfers and payouts on
 */
import { writeFileSync } from "node:fs"

const args = process.argv.slice(2)
const AS_JSON = args.includes("--json")
const OUT = (() => {
  const i = args.indexOf("--out")
  return i >= 0 ? args[i + 1] : null
})()
const KEY = process.env.STRIPE_SECRET_KEY
const API = (process.env.STRIPE_API_BASE || "https://api.stripe.com").replace(/\/$/, "")
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function stripe(path, account) {
  const res = await fetch(`${API}/v1/${path}`, { headers: { Authorization: `Bearer ${KEY}`, ...(account ? { "Stripe-Account": account } : {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Stripe ${res.status} on ${path.split("?")[0]}: ${body?.error?.message ?? ""}`)
  return body
}
async function supabase(path) {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  return res.ok ? res.json() : null
}

/** Stripe's self-serve cross-border payout region (same list as lib/payments/stripe/payout-regions.ts; tests/round-ap keeps them equal). */
export const CROSS_BORDER_REGION = new Set([
  "US", "GB", "CA", "CH",
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
])

/** The verdict for one account. Pure, so tests/round-ao and round-ap prove it. */
export function connectVerdict(a, platformCountry) {
  const agreement = a.tos_acceptance?.service_agreement ?? "full"
  const country = String(a.country ?? "").toUpperCase()
  const crossBorder = !!platformCountry && !!country && country !== platformCountry
  /* Round 25: a country the owner opened outside the region (STRIPE_SETTLEMENT_COUNTRIES) is paid through sales made on its behalf, not cross-border payouts. */
  const settled = String(process.env.STRIPE_SETTLEMENT_COUNTRIES ?? "").toUpperCase().split(/[^A-Z]+/).includes(country)
  const outsideRegion = crossBorder && !settled && !(CROSS_BORDER_REGION.has(platformCountry) && CROSS_BORDER_REGION.has(country))
  const transfers = a.capabilities?.transfers ?? "inactive"
  const due = [...(a.requirements?.currently_due ?? []), ...(a.requirements?.past_due ?? [])]
  const reasons = []
  let verdict = "ok"
  if (agreement === "recipient") {
    verdict = "affected"
    reasons.push("recipient service agreement: Stripe does not support cross-border payouts on it")
  }
  if (outsideRegion) {
    verdict = "affected"
    reasons.push(`no self-serve Stripe payouts from ${platformCountry} to ${country} (only within US, UK, EEA, CA, CH)`)
  }
  /* Cross-border payouts work only for destination charges WITHOUT on_behalf_of.
     The seller-statement switch (NEXT_PUBLIC_SELLER_STATEMENT_NAME) charges on_behalf_of an account that can take cards. */
  if (settled && crossBorder && a.capabilities?.card_payments !== "active") reasons.push("sold on its behalf: card_payments must be active before it can take orders")
  if (crossBorder && !settled && a.capabilities?.card_payments === "active") reasons.push("cross-border account can take cards: keep NEXT_PUBLIC_SELLER_STATEMENT_NAME off, or its sales go on_behalf_of it")
  if (!a.payouts_enabled) reasons.push("payouts are not enabled")
  if (transfers !== "active") reasons.push(`transfers capability is ${transfers}`)
  if (due.length) reasons.push(`${due.length} requirement(s) due`)
  if (a.requirements?.disabled_reason) reasons.push(`disabled: ${a.requirements.disabled_reason}`)
  if (verdict === "ok" && reasons.some((r) => !r.startsWith("cross-border account can take cards"))) verdict = "not-ready"
  return { id: a.id, country, agreement, crossBorder, outsideRegion, verdict, reasons, default_currency: a.default_currency ?? null, payouts_enabled: !!a.payouts_enabled, charges_enabled: !!a.charges_enabled, transfers, card_payments: a.capabilities?.card_payments ?? null, dashboard: a.controller?.stripe_dashboard?.type ?? a.type ?? null }
}

async function main() {
  if (!KEY || !/^(sk|rk)_(live|test)_/.test(KEY)) {
    console.error("Set STRIPE_SECRET_KEY (a restricted read-only key is enough: Accounts read). Nothing was read.")
    process.exit(2)
  }
  const mode = KEY.includes("_live_") ? "live" : "test"
  const platform = await stripe("account")
  const platformCountry = String(platform.country ?? "").toUpperCase()

  const accounts = []
  for (let after = null; ; ) {
    const page = await stripe(`accounts?limit=100${after ? `&starting_after=${after}` : ""}`)
    accounts.push(...page.data)
    if (!page.has_more || !page.data.length) break
    after = page.data[page.data.length - 1].id
  }

  const creators = (await supabase("creators?select=id,slug,display_name,stripe_account_id&stripe_account_id=not.is.null&limit=50000")) ?? []
  const byAccount = new Map(creators.map((c) => [c.stripe_account_id, c]))

  const rows = []
  for (const a of accounts) {
    const v = connectVerdict(a, platformCountry)
    let banks = []
    try {
      const ext = await stripe(`accounts/${a.id}/external_accounts?limit=10`)
      banks = (ext.data ?? []).map((b) => ({ currency: b.currency ?? null, country: b.country ?? null, default_for_currency: !!b.default_for_currency }))
    } catch {
      banks = [{ unreadable: true }]
    }
    const creator = byAccount.get(a.id) ?? null
    let paidOrders = null
    if (creator) {
      const o = await supabase(`orders?select=id&creator_id=eq.${creator.id}&status=in.(completed,refunded)&limit=1000`)
      paidOrders = o ? o.length : null
    }
    rows.push({ ...v, payout_banks: banks, creator: creator ? { id: creator.id, slug: creator.slug, name: creator.display_name } : null, paid_orders: paidOrders })
  }

  const tally = (pick) => rows.reduce((m, r) => ((m[pick(r)] = (m[pick(r)] ?? 0) + 1), m), {})
  const report = {
    read_at: new Date().toISOString(),
    mode,
    platform: { id: platform.id, country: platformCountry, default_currency: platform.default_currency ?? null },
    accounts: rows.length,
    by_verdict: tally((r) => r.verdict),
    by_agreement: tally((r) => r.agreement),
    by_country: tally((r) => `${r.country}${r.crossBorder ? " (cross-border)" : ""}`),
    affected: rows.filter((r) => r.verdict === "affected"),
    not_ready: rows.filter((r) => r.verdict === "not-ready"),
    all: rows,
  }
  if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2))
  if (AS_JSON) return console.log(JSON.stringify(report, null, 2))
  console.log(`Stripe ${mode} mode. Platform ${platform.id}: ${platformCountry}, ${platform.default_currency}. ${rows.length} connected accounts. Nothing was changed.`)
  console.log(`  by verdict:   ${JSON.stringify(report.by_verdict)}`)
  console.log(`  by agreement: ${JSON.stringify(report.by_agreement)}`)
  console.log(`  by country:   ${JSON.stringify(report.by_country)}`)
  for (const r of [...report.affected, ...report.not_ready]) {
    const who = r.creator ? `${r.creator.slug ?? r.creator.id}${r.paid_orders !== null ? `, ${r.paid_orders} paid orders` : ""}` : "no Storelib store found"
    console.log(`  ${r.verdict.padEnd(9)} ${r.id}  ${r.country} ${r.agreement}  payouts ${r.payouts_enabled ? "on" : "off"}  banks ${r.payout_banks.map((b) => b.currency ?? "?").join("/") || "none"}  (${who})  ${r.reasons.join("; ")}`)
  }
  if (OUT) console.log(`\nWritten to ${OUT}.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
