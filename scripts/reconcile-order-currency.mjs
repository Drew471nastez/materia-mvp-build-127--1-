#!/usr/bin/env node
/**
 * ===========================================================================
 *  WHICH ORDERS' CURRENCY IS PROVEN, AND WHICH IS NOT (READ ONLY)
 * ===========================================================================
 * Currency round AM. Every order keeps the currency it was charged in
 * (orders.currency). Older rows may have none, or one written by a default
 * from before currencies existed. This script never changes anything: it
 * reads orders, compares each paid one with its Stripe payment, and prints
 * what it found, so a person decides what to do about each one.
 *
 *   proven      the order's currency and amount match its Stripe payment
 *   mismatch    Stripe charged another currency or amount than the row says
 *   unknown     the row has no currency at all
 *   unprovable  no Stripe payment to compare with (free orders, other
 *               providers, a payment Stripe no longer returns)
 *
 * Nothing is ever assumed to be US dollars. A row without proof is listed,
 * not fixed.
 *
 * Run (with the production service key and Stripe key in the environment;
 * nothing is written anywhere):
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... STRIPE_SECRET_KEY=... \
 *     node scripts/reconcile-order-currency.mjs [--limit 2000] [--creator <uuid>] [--json]
 *
 * Without the Stripe key it still lists rows with no currency (unknown).
 */
const args = process.argv.slice(2)
const opt = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const LIMIT = Math.max(1, Math.min(50_000, Number(opt("--limit", "2000")) || 2000))
const CREATOR = opt("--creator")
const AS_JSON = args.includes("--json")

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. Nothing was read.")
  process.exit(2)
}
if (CREATOR && !/^[0-9a-f-]{36}$/i.test(CREATOR)) {
  console.error("--creator must be a store's id.")
  process.exit(2)
}

/** GET only. This script has no write path. */
async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  if (!res.ok) throw new Error(`Supabase answered ${res.status} for ${path.split("?")[0]}`)
  return res.json()
}

async function stripePayment(id) {
  if (!STRIPE_KEY || !id) return null
  const kind = id.startsWith("pi_") ? "payment_intents" : id.startsWith("cs_") ? "checkout/sessions" : id.startsWith("ch_") ? "charges" : null
  if (!kind) return null
  const res = await fetch(`https://api.stripe.com/v1/${kind}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${STRIPE_KEY}` } })
  if (!res.ok) return null
  const j = await res.json()
  const amount = j.amount_received ?? j.amount_total ?? j.amount ?? null
  return typeof j.currency === "string" ? { currency: j.currency.toLowerCase(), amount } : null
}

async function main() {
  const filter = CREATOR ? `&creator_id=eq.${CREATOR}` : ""
  const rows = []
  for (let offset = 0; rows.length < LIMIT; offset += 1000) {
    const page = await rest(`orders?select=id,creator_id,created_at,status,amount_cents,currency,stripe_payment_intent_id,stripe_session_id&order=created_at.desc&limit=${Math.min(1000, LIMIT - rows.length)}&offset=${offset}${filter}`)
    rows.push(...page)
    if (page.length < 1000) break
  }

  const out = { proven: [], mismatch: [], unknown: [], unprovable: [] }
  for (const o of rows) {
    const recorded = typeof o.currency === "string" && /^[a-z]{3}$/i.test(o.currency) ? o.currency.toLowerCase() : null
    if (!recorded) {
      out.unknown.push({ id: o.id, creator_id: o.creator_id, created_at: o.created_at, amount_cents: o.amount_cents })
      continue
    }
    const paid = await stripePayment(o.stripe_payment_intent_id || o.stripe_session_id)
    if (!paid) {
      out.unprovable.push({ id: o.id, currency: recorded, amount_cents: o.amount_cents, status: o.status })
      continue
    }
    const sameCurrency = paid.currency === recorded
    /* A basket's payment covers several order rows, so a smaller row amount is expected; a larger one, or another currency, is not. */
    const amountFits = typeof paid.amount !== "number" || (o.amount_cents ?? 0) <= paid.amount
    if (sameCurrency && amountFits) out.proven.push(o.id)
    else out.mismatch.push({ id: o.id, recorded, stripe: paid.currency, amount_cents: o.amount_cents, stripe_amount: paid.amount })
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ read: rows.length, proven: out.proven.length, mismatch: out.mismatch, unknown: out.unknown, unprovable: out.unprovable.length }, null, 2))
    return
  }
  console.log(`Read ${rows.length} orders${CREATOR ? ` of store ${CREATOR}` : ""}. Nothing was changed.`)
  console.log(`  proven by Stripe:      ${out.proven.length}`)
  console.log(`  no currency recorded:  ${out.unknown.length}${out.unknown.length ? "   (listed below; never assumed to be dollars)" : ""}`)
  console.log(`  differs from Stripe:   ${out.mismatch.length}${out.mismatch.length ? "   (listed below)" : ""}`)
  console.log(`  nothing to compare:    ${out.unprovable.length}${STRIPE_KEY ? "" : "   (no STRIPE_SECRET_KEY given)"}`)
  for (const u of out.unknown.slice(0, 200)) console.log(`  unknown   ${u.id}  ${u.created_at}  ${u.amount_cents}`)
  for (const m of out.mismatch.slice(0, 200)) console.log(`  mismatch  ${m.id}  row ${m.recorded} ${m.amount_cents}  stripe ${m.stripe} ${m.stripe_amount}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
