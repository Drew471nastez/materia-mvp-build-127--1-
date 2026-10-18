#!/usr/bin/env node
/**
 * ===========================================================================
 *  WHICH PRICES WERE MULTIPLIED BY 4.6, PROVEN PRODUCT BY PRODUCT (READ ONLY)
 * ===========================================================================
 * supabase/sql/RUN_CURRENCY_RON.sql multiplies every stored price by 4.6 and
 * writes the marker `currency_ron_2026` into platform_migrations. Its
 * alternative, RUN_CURRENCY_RON_NATIVE.sql, changes no price and writes
 * `currency_ron_native`. A store that never chose a currency sells in the
 * platform's (USD in production), so a price multiplied for lei and charged
 * in dollars costs the buyer 4.6 times what the creator asked.
 *
 * This script never writes. It reads and proves, for each product:
 *
 *   confirmed     the multiplication is recorded (marker and its date), the
 *                 product existed before it, an order paid BEFORE it in a
 *                 known currency was charged exactly today's price / 4.6, that
 *                 currency is still the one the store sells in, and the
 *                 activity log shows no price edit since. Restorable by
 *                 scripts/price-restore.mjs, which checks all of this again.
 *   needs-creator the product existed before the multiplication and its price
 *                 fits the pattern, but no order proves its original price or
 *                 currency, or the currency has changed since. Only the creator
 *                 can say what they meant. Never restored automatically.
 *   not-affected  made after the multiplication, edited since, or no
 *                 multiplication recorded at all.
 *
 * Nothing is assumed: not a currency, not a price, not a date. With no marker
 * row the script says so and lists nothing as confirmed.
 *
 * Run with the production service key (nothing is written anywhere):
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/price-audit.mjs [--creator <uuid>] [--json] [--out audit.json]
 *
 * Personal data: prints product ids, titles and amounts. No buyer names or
 * emails, no payment ids.
 */
import { writeFileSync } from "node:fs"

const args = process.argv.slice(2)
const opt = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const CREATOR = opt("--creator")
const AS_JSON = args.includes("--json")
const OUT = opt("--out")
export const FACTOR = 4.6

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

/** GET only. This script has no write path. Answers null when the table is not there. */
async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    if (/does not exist|Could not find the table|schema cache/i.test(body)) return null
    throw new Error(`Supabase answered ${res.status} for ${path.split("?")[0]}`)
  }
  return res.json()
}

async function all(table, select, filter = "") {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const page = await rest(`${table}?select=${select}${filter}&order=id.asc&limit=1000&offset=${offset}`)
    if (page === null) return null
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

export const knownCurrency = (c) => (typeof c === "string" && /^[a-z]{3}$/i.test(c.trim()) ? c.trim().toLowerCase() : null)
/** What the multiplication left from an original: round(x * 4.6). Its inverse is exact for whole cents. */
export const multiplied = (cents) => Math.round(cents * FACTOR)
export const original = (cents) => Math.round(cents / FACTOR)
/** A price the multiplication could have produced (round(k * 4.6) for some whole k). */
export const fitsPattern = (cents) => Number.isInteger(cents) && cents > 0 && multiplied(original(cents)) === cents

/**
 * The verdict for one product, from facts only. Pure, so tests/round-ao proves it.
 *   facts.appliedAt      when currency_ron_2026 was written, or null
 *   facts.product        { id, created_at, price_cents }
 *   facts.storeCurrency  the store's chosen currency (lower case) or null when it never chose one
 *   facts.platformCurrency  what a store with no choice sells in (lower case)
 *   facts.preOrders      orders of this product paid before appliedAt: { amount_cents, tip_cents, currency, variant_id, variant_price_cents }
 *   facts.priceEditsSince  product.price activity entries after appliedAt
 *   facts.logStartedAt   the first activity entry ever, or null
 */
export function verdictOf(facts) {
  const p = facts.product
  const out = { id: p.id, verdict: "not-affected", reason: "", original_cents: null, currency: null }
  if (!facts.appliedAt) return { ...out, reason: "no 4.6 multiplication is recorded (no currency_ron_2026 marker)" }
  if (!(Date.parse(p.created_at) < Date.parse(facts.appliedAt))) return { ...out, reason: "made after the multiplication" }
  if (!fitsPattern(p.price_cents)) return { ...out, reason: "its price is not one the multiplication could produce, so it was edited since" }
  if (facts.priceEditsSince > 0) return { ...out, reason: "the creator changed its price after the multiplication" }
  const sellsIn = facts.storeCurrency ?? facts.platformCurrency
  const want = original(p.price_cents)
  const plain = facts.preOrders.filter((o) => !o.variant_id)
  const matches = plain.filter((o) => knownCurrency(o.currency) && Math.max(0, (o.amount_cents ?? 0) - (o.tip_cents ?? 0)) === want)
  const currencies = [...new Set(facts.preOrders.map((o) => knownCurrency(o.currency)).filter(Boolean))]
  const editsUnseen = facts.logStartedAt && Date.parse(facts.logStartedAt) > Date.parse(facts.appliedAt)
  if (!matches.length) return { ...out, verdict: "needs-creator", original_cents: want, reason: facts.preOrders.length ? "orders before the multiplication do not show this price" : "no order before the multiplication proves its price or currency" }
  if (currencies.length !== 1) return { ...out, verdict: "needs-creator", original_cents: want, reason: `orders before it were charged in more than one currency (${currencies.join(", ")})` }
  const c0 = currencies[0]
  if (c0 !== sellsIn) return { ...out, verdict: "needs-creator", original_cents: want, currency: c0, reason: `it was charged in ${c0} before, the store sells in ${sellsIn} now` }
  return {
    ...out,
    verdict: "confirmed",
    original_cents: want,
    currency: c0,
    reason: `an order of ${(want / 100).toFixed(2)} ${c0} before the multiplication; now ${(p.price_cents / 100).toFixed(2)} ${sellsIn}${editsUnseen ? " (the activity log began after the multiplication, so an edit in between would not show; its order match still proves the price)" : ""}`,
  }
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. Nothing was read.")
    process.exit(2)
  }
  if (CREATOR && !/^[0-9a-f-]{36}$/i.test(CREATOR)) {
    console.error("--creator must be a store's id.")
    process.exit(2)
  }
  const platformCurrency = (process.env.NEXT_PUBLIC_PLATFORM_CURRENCY || "").toLowerCase() || null
  const markers = (await rest("platform_migrations?select=key,applied_at")) ?? []
  const ron = markers.find((m) => m.key === "currency_ron_2026") ?? null
  const native = markers.find((m) => m.key === "currency_ron_native") ?? null
  const filter = CREATOR ? `&creator_id=eq.${CREATOR}` : ""
  const products = (await all("products", "id,creator_id,title,price_cents,created_at,type,status", `&price_cents=gt.0${filter}`)) ?? []
  const settings = (await all("store_settings", "creator_id,currency")) ?? []
  const chosen = new Map(settings.filter((s) => knownCurrency(s.currency)).map((s) => [s.creator_id, knownCurrency(s.currency)]))
  const firstLog = await rest("store_activity_log?select=created_at&order=created_at.asc&limit=1")
  const logStartedAt = firstLog?.[0]?.created_at ?? null

  const results = []
  for (const p of products) {
    let preOrders = []
    let priceEditsSince = 0
    if (ron && Date.parse(p.created_at) < Date.parse(ron.applied_at)) {
      preOrders = (await rest(`orders?select=amount_cents,tip_cents,currency,variant_id,variant_price_cents,status&product_id=eq.${p.id}&created_at=lt.${encodeURIComponent(ron.applied_at)}&status=in.(completed,refunded)&limit=200`)) ?? []
      const edits = (await rest(`store_activity_log?select=id&action=eq.product.price&subject_id=eq.${p.id}&created_at=gt.${encodeURIComponent(ron.applied_at)}&limit=1`)) ?? []
      priceEditsSince = edits.length
    }
    const v = verdictOf({ appliedAt: ron?.applied_at ?? null, product: p, storeCurrency: chosen.get(p.creator_id) ?? null, platformCurrency: platformCurrency ?? "usd", preOrders, priceEditsSince, logStartedAt })
    results.push({ ...v, creator_id: p.creator_id, title: String(p.title ?? "").slice(0, 80), price_cents: p.price_cents, sells_in: chosen.get(p.creator_id) ?? `platform (${platformCurrency ?? "unknown: set NEXT_PUBLIC_PLATFORM_CURRENCY to what production uses"})` })
  }

  const count = (k) => results.filter((r) => r.verdict === k).length
  const report = {
    read_at: new Date().toISOString(),
    multiplication_recorded: ron ? { at: ron.applied_at } : null,
    native_marker: native ? { at: native.applied_at } : null,
    platform_currency_given: platformCurrency,
    activity_log_started: logStartedAt,
    products_read: results.length,
    confirmed: count("confirmed"),
    needs_creator: count("needs-creator"),
    not_affected: count("not-affected"),
    products: results.filter((r) => r.verdict !== "not-affected"),
  }
  if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2))
  if (AS_JSON) return console.log(JSON.stringify(report, null, 2))
  console.log(`Read ${results.length} priced products. Nothing was changed.`)
  console.log(`  4.6 multiplication recorded: ${ron ? `yes, at ${ron.applied_at}` : "NO (no currency_ron_2026 row)"}`)
  console.log(`  native marker (prices always lei): ${native ? `yes, at ${native.applied_at}` : "no"}`)
  if (ron && native) console.log("  BOTH markers are present: the multiplication ran although the prices may already have been lei. Every confirmed row below is still proven by its own order.")
  console.log(`  platform currency used for stores with no choice: ${platformCurrency ?? "NOT GIVEN (set NEXT_PUBLIC_PLATFORM_CURRENCY to production's value)"}`)
  console.log(`  confirmed: ${report.confirmed}   needs the creator: ${report.needs_creator}   not affected: ${report.not_affected}`)
  for (const r of report.products) console.log(`  ${r.verdict.padEnd(13)} ${r.id}  ${(r.price_cents / 100).toFixed(2)} -> ${r.original_cents === null ? "?" : (r.original_cents / 100).toFixed(2)} ${r.currency ?? ""}  ${r.title}  (${r.reason})`)
  if (OUT) console.log(`\nWritten to ${OUT} for scripts/price-restore.mjs.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
