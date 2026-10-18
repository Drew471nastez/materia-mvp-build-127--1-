#!/usr/bin/env node
/**
 * ===========================================================================
 *  ONE REAL STRIPE TEST-MODE MARKETPLACE PURCHASE, TRANSFER AND REFUND
 * ===========================================================================
 * Runs, in Stripe TEST MODE only, the money path Marketplace USD will use, the
 * same way Storelib's own routes call Stripe (app/api/checkout/stripe-session,
 * app/api/stripe/refund):
 *
 *   1. a USD PaymentIntent, confirmed with Stripe's test card, as a destination
 *      charge to the connected account with Storelib's application fee
 *   2. the platform's balance transaction: settlement currency, rate, fee
 *   3. the transfer to the creator and what it settled as in THEIR currency
 *      (the destination payment's balance transaction, on their account)
 *   4. a partial refund with reverse_transfer, as the refund route does
 *   5. the transfer reversal: proportional to the refund, in usd
 *   6. the account's payout eligibility: service agreement, region, banks
 *   7. a real (test) payout of what is left, from the creator's balance to
 *      their bank, in the currency it settled in
 *
 * It refuses any key that is not sk_test_ / rk_test_. Nothing in live mode is
 * read or touched. Test-mode objects it creates stay in the test dashboard.
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-test-purchase.mjs --account acct_... \
 *     [--amount 1065] [--fee 98] [--refund 500] [--out run.json]
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-test-purchase.mjs --create-account DE
 *
 * --account is a TEST connected account onboarded the way creators are (sign
 * up on a preview deployment that uses test keys and finish Storelib
 * Payments). --create-account <country> instead opens one the way onboarding
 * does now (lib/payments/stripe/account-attempts.ts: transfers only on the
 * full agreement across borders, cards + transfers at home) and fills it with
 * Stripe's documented test identity and test bank, so it can be paid out.
 * Use one per country you want to prove: Romania (the platform's) and
 * another country in the region (DE, FR, US, GB).
 */
import { writeFileSync } from "node:fs"

const args = process.argv.slice(2)
const opt = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const KEY = process.env.STRIPE_SECRET_KEY || ""
const API = (process.env.STRIPE_API_BASE || "https://api.stripe.com").replace(/\/$/, "")
const ACCOUNT = opt("--account")
const AMOUNT = Number(opt("--amount", "1065"))
const FEE = Number(opt("--fee", String(Math.round(AMOUNT * 0.05) + 45)))
const REFUND = Number(opt("--refund", "500"))
const OUT = opt("--out")
const CREATE = (opt("--create-account") || "").toUpperCase()

/* Same list as lib/payments/stripe/payout-regions.ts (tests/round-ap keeps them equal). */
export const CROSS_BORDER_REGION = new Set([
  "US", "GB", "CA", "CH",
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
])

/* Stripe's documented TEST values (docs.stripe.com/connect/testing): an address
   and dob that verify, and a test bank that pays out. Test mode only. */
export const TEST_COUNTRIES = {
  RO: { currency: "ron", city: "Bucharest", postal: "010011", phone: "+40712345678", bank: { account_number: "RO49AAAA1B31007593840000" } },
  DE: { currency: "eur", city: "Berlin", postal: "10115", phone: "+4915112345678", bank: { account_number: "DE89370400440532013000" } },
  FR: { currency: "eur", city: "Paris", postal: "75001", phone: "+33612345678", bank: { account_number: "FR1420041010050500013M02606" } },
  US: { currency: "usd", city: "San Francisco", postal: "94103", state: "CA", phone: "+14155550100", bank: { routing_number: "110000000", account_number: "000123456789" }, ssn: true },
  GB: { currency: "gbp", city: "London", postal: "EC1A 1BB", phone: "+447700900123", bank: { routing_number: "108800", account_number: "00012345" } },
}

/** The shapes onboarding asks for, in order (mirrors lib/payments/stripe/account-attempts.ts storelibOnly). */
export function testAccountShapes(platform, country) {
  const cross = platform !== country
  if (cross && !(CROSS_BORDER_REGION.has(platform) && CROSS_BORDER_REGION.has(country))) return []
  const controller = { stripe_dashboard: { type: "none" }, fees: { payer: "application" }, losses: { payments: "application" }, requirement_collection: "application" }
  const transfers = { transfers: { requested: true } }
  const full = { card_payments: { requested: true }, transfers: { requested: true } }
  return cross ? [{ capabilities: transfers, controller }] : [{ capabilities: full, controller }, { capabilities: transfers, controller }]
}

const form = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k
    if (v === undefined || v === null) return []
    if (typeof v === "object" && !Array.isArray(v)) return form(v, key)
    if (Array.isArray(v)) return v.map((x, i) => `${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`)
    return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`]
  })

async function call(method, path, body, account) {
  const headers = { Authorization: `Bearer ${KEY}`, ...(account ? { "Stripe-Account": account } : {}) }
  if (body) headers["content-type"] = "application/x-www-form-urlencoded"
  const res = await fetch(`${API}/v1/${path}`, { method, headers, body: body ? form(body).join("&") : undefined })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Stripe ${res.status} on ${method} ${path.split("?")[0]}: ${json?.error?.message ?? ""}`)
  return json
}

async function createTestAccount(platformCountry, country) {
  const shapes = testAccountShapes(platformCountry, country)
  if (!shapes.length) throw new Error(`Storelib does not open accounts in ${country} from a ${platformCountry} platform (no Stripe payouts there).`)
  const t = TEST_COUNTRIES[country]
  if (!t) throw new Error(`--create-account knows ${Object.keys(TEST_COUNTRIES).join(", ")}; for another country pass --account.`)
  let acct = null
  let last = null
  for (const shape of shapes) {
    try {
      acct = await call("POST", "accounts", { country, business_type: "individual", email: `test+${country.toLowerCase()}@storelib.com`, ...shape, business_profile: { url: "https://storelib.com", mcc: "5818", product_description: "Digital products sold on Storelib" }, metadata: { storelib_test_run: "marketplace-usd" } })
      break
    } catch (e) {
      last = e
    }
  }
  if (!acct) throw last
  const individual = {
    first_name: "Test", last_name: "Creator", email: `test+${country.toLowerCase()}@storelib.com`, phone: t.phone,
    dob: { day: 1, month: 1, year: 1901 },
    address: { line1: "address_full_match", city: t.city, postal_code: t.postal, country, ...(t.state ? { state: t.state } : {}) },
    ...(t.ssn ? { ssn_last_4: "0000", id_number: "000000000" } : {}),
  }
  await call("POST", `accounts/${acct.id}`, {
    individual,
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" },
    external_account: { object: "bank_account", country, currency: t.currency, ...t.bank },
    settings: { payouts: { schedule: { interval: "manual" } } },
  })
  return acct.id
}

async function main() {
  if (!/^(sk|rk)_test_/.test(KEY)) {
    console.error("TEST MODE ONLY: set STRIPE_SECRET_KEY to an sk_test_ (or rk_test_) key. A live key is refused. Nothing was called.")
    process.exit(2)
  }
  if (!CREATE && (!ACCOUNT || !/^acct_\w+$/.test(ACCOUNT))) {
    console.error("--account acct_... (a test connected account onboarded like a creator) or --create-account <country>. Nothing was called.")
    process.exit(2)
  }
  if (!(AMOUNT >= 50 && FEE >= 0 && FEE < AMOUNT && REFUND > 0 && REFUND < AMOUNT)) {
    console.error("Amounts must be cents: --amount >= 50, 0 <= --fee < amount, 0 < --refund < amount.")
    process.exit(2)
  }
  const checks = []
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail })

  const platform = await call("GET", "account")
  const platformCountry = String(platform.country ?? "").toUpperCase()
  const accountId = CREATE ? await createTestAccount(platformCountry, CREATE) : ACCOUNT
  if (CREATE) console.log(`Opened test account ${accountId} in ${CREATE}, the way onboarding does.`)
  let acct = await call("GET", `accounts/${accountId}`)
  /* Stripe verifies test identities in a moment; wait for transfers to turn on (at most ~30 s). */
  for (let i = 0; i < 10 && acct.capabilities?.transfers !== "active"; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    acct = await call("GET", `accounts/${accountId}`)
  }
  const agreement = acct.tos_acceptance?.service_agreement ?? "full"
  const acctCountry = String(acct.country ?? "").toUpperCase()
  const crossBorder = acctCountry !== platformCountry
  check("the connected account can receive transfers", acct.capabilities?.transfers === "active", { capabilities: acct.capabilities, due: acct.requirements?.currently_due ?? [] })
  check("the connected account is not on the recipient agreement (no cross-border payouts on it)", agreement !== "recipient", { agreement, country: acct.country, platform: platform.country })
  check("its country is one Stripe pays out to from the platform's", !crossBorder || (CROSS_BORDER_REGION.has(platformCountry) && CROSS_BORDER_REGION.has(acctCountry)), { country: acctCountry, platform: platformCountry })
  check("a cross-border account cannot take cards itself (so no sale is ever on_behalf_of it)", !crossBorder || acct.capabilities?.card_payments !== "active", { card_payments: acct.capabilities?.card_payments ?? null })

  const pi = await call("POST", "payment_intents", {
    amount: AMOUNT,
    currency: "usd",
    /* bypassPending: the test funds are available at once, so the payout below can run now. */
    payment_method: "pm_card_bypassPending",
    payment_method_types: ["card"],
    confirm: true,
    application_fee_amount: FEE,
    transfer_data: { destination: accountId },
    metadata: { storelib_test_run: "marketplace-usd", pricing: `marketplace|ron|4900|converted|${new Date().toISOString().slice(0, 10)}|0.2173` },
  })
  check("the USD destination charge succeeded", pi.status === "succeeded" && pi.currency === "usd" && pi.amount === AMOUNT, { status: pi.status, currency: pi.currency, amount: pi.amount })

  const charge = await call("GET", `charges/${pi.latest_charge}?expand[]=balance_transaction`)
  const bt = charge.balance_transaction ?? {}
  check("the platform's settlement is recorded (currency, rate)", !!bt.currency, { settlement_currency: bt.currency, amount: bt.amount, exchange_rate: bt.exchange_rate ?? null, stripe_fee: bt.fee })

  const transfer = charge.transfer ? await call("GET", `transfers/${charge.transfer}`) : null
  check("a transfer went to the creator for the charge less Storelib's fee", transfer && transfer.destination === accountId && transfer.amount === AMOUNT - FEE && transfer.currency === "usd", transfer && { amount: transfer.amount, currency: transfer.currency, destination: transfer.destination })
  let settledForCreator = null
  if (transfer?.destination_payment) {
    const py = await call("GET", `charges/${transfer.destination_payment}?expand[]=balance_transaction`, null, accountId)
    const cbt = py.balance_transaction ?? {}
    settledForCreator = { currency: cbt.currency ?? null, amount: cbt.amount ?? null, exchange_rate: cbt.exchange_rate ?? null }
    check("on the creator's account it settled in their currency (converted when not usd)", !!cbt.currency, settledForCreator)
  }

  const refund = await call("POST", "refunds", { payment_intent: pi.id, amount: REFUND, reverse_transfer: true, reason: "requested_by_customer", metadata: { storelib_test_run: "marketplace-usd" } })
  check("the partial refund succeeded in usd", refund.status === "succeeded" && refund.currency === "usd" && refund.amount === REFUND, { status: refund.status, amount: refund.amount, currency: refund.currency })
  const after = transfer ? await call("GET", `transfers/${transfer.id}`) : null
  const expectedReversal = transfer ? Math.round((transfer.amount * REFUND) / AMOUNT) : null
  check("the creator's share was reversed in proportion to the refund", after && Math.abs((after.amount_reversed ?? 0) - expectedReversal) <= 1, after && { reversed: after.amount_reversed, expected: expectedReversal })

  const banks = await call("GET", `accounts/${accountId}/external_accounts?limit=10`).catch(() => ({ data: [] }))
  check("the creator can be paid out", !!acct.payouts_enabled && (banks.data ?? []).length > 0, { payouts_enabled: acct.payouts_enabled, banks: (banks.data ?? []).map((b) => ({ currency: b.currency, country: b.country })) })

  /* A real test payout: everything now available to the creator, in the currency it settled in, to their bank. */
  let payout = null
  if (acct.payouts_enabled) {
    const bal = await call("GET", "balance", null, accountId)
    const avail = (bal.available ?? []).filter((b) => b.amount > 0).sort((a, b) => b.amount - a.amount)[0]
    if (avail) {
      try {
        const p = await call("POST", "payouts", { amount: avail.amount, currency: avail.currency, metadata: { storelib_test_run: "marketplace-usd" } }, accountId)
        payout = { id: p.id, amount: p.amount, currency: p.currency, status: p.status }
      } catch (e) {
        payout = { error: e instanceof Error ? e.message : String(e) }
      }
    } else payout = { error: "nothing available to pay out yet", balance: bal.available }
  }
  check("a payout to the creator's bank was accepted (in the currency the sale settled in)", !!payout?.id && ["pending", "in_transit", "paid"].includes(payout.status) && (!settledForCreator?.currency || payout.currency === settledForCreator.currency), payout)

  const report = {
    ran_at: new Date().toISOString(),
    platform: { id: platform.id, country: platform.country, default_currency: platform.default_currency },
    account: { id: acct.id, country: acct.country, agreement, default_currency: acct.default_currency },
    payment_intent: pi.id,
    charge: charge.id,
    transfer: transfer?.id ?? null,
    settled_for_creator: settledForCreator,
    payout,
    refund: refund.id,
    checks,
    passed: checks.every((c) => c.ok),
  }
  if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(`Stripe TEST mode. Platform ${platform.id} (${platform.country}) -> ${acct.id} (${acct.country}, ${agreement} agreement).`)
  for (const c of checks) console.log(`  ${c.ok ? "ok  " : "FAIL"}  ${c.name}${c.ok ? "" : `   ${JSON.stringify(c.detail)}`}`)
  console.log(`\n${report.passed ? "Every check passed." : "Some checks failed: see above."} PaymentIntent ${pi.id}, refund ${refund.id}.`)
  process.exit(report.passed ? 0 : 1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
