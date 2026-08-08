/**
 * ===========================================================================
 *  WHAT THE BUYER PAYS, AND WHO GETS IT
 * ===========================================================================
 * Money arithmetic fails silently. A checkout that displays one total and
 * charges another, or that quietly pays the seller a share of the buyer's
 * protection fee, produces no error and no red screen — it produces a
 * discrepancy somebody notices weeks later in a payout.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { BUYER_PROTECTION_FIXED_BY_CURRENCY } from "../lib/checkout/currency"
import {
  BUYER_PROTECTION_FIXED,
  BUYER_PROTECTION_PERCENT,
  breakdownLines,
  buyerProtectionFee,
  priceCheckout,
} from "../lib/checkout/pricing"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nCheckout pricing: what the buyer pays, and who gets it\n")

/* ── THE FEE ─────────────────────────────────────────────────────────────── */
check(
  "the fee is 5% of the item plus a flat amount",
  // The FIXED part follows the currency being charged — 400 bani in lei, its
  // equivalent in cents until the migration runs — so the test reads it rather
  // than pinning one side and failing on the other.
  BUYER_PROTECTION_PERCENT === 0.05 && BUYER_PROTECTION_FIXED > 0,
)
check(
  "in lei, a 345,37 order is charged 21,27 protection",
  (() => {
    // 34537 * 0.05 = 1726.85, + 400 = 2126.85 → 2127
    const inRon = Math.round(34537 * BUYER_PROTECTION_PERCENT + BUYER_PROTECTION_FIXED_BY_CURRENCY.ron)
    return inRon === 2127
  })(),
)
check(
  "the fee tracks whatever currency is configured",
  buyerProtectionFee(34537) === Math.round(34537 * BUYER_PROTECTION_PERCENT + BUYER_PROTECTION_FIXED),
)
check(
  "the flat part is what makes a small order viable",
  (() => {
    // A percentage alone earns 50 bani on a 10-lei sale, which does not cover
    // the cost of handling one dispute about it.
    const small = buyerProtectionFee(1000)
    return small === 50 + BUYER_PROTECTION_FIXED && small > 1000 * BUYER_PROTECTION_PERCENT
  })(),
)
check(
  "a free or invalid item carries no fee",
  buyerProtectionFee(0) === 0 &&
    buyerProtectionFee(-100) === 0 &&
    buyerProtectionFee(NaN) === 0,
)
check(
  "the fee is a whole minor unit, always",
  [1, 7, 33, 999, 34537, 123456].every((c) => Number.isInteger(buyerProtectionFee(c))),
  "        Stripe rejects a fractional amount outright.",
)

/* ── THE TOTAL ───────────────────────────────────────────────────────────── */
check(
  "the printed lines add up to the printed total",
  (() => {
    // A buyer who sums the visible numbers and gets a different answer stops
    // trusting the page, and they are right to.
    const cases = [
      { itemCents: 34537, shippingCents: 1621 },
      { itemCents: 1000 },
      { itemCents: 999999, shippingCents: 4231, tipCents: 500 },
      { itemCents: 1, shippingCents: 1 },
    ]
    return cases.every((c) => {
      const b = priceCheckout(c)
      const sum = breakdownLines(b).reduce((n, l) => n + l.cents, 0)
      return sum === b.totalCents
    })
  })(),
)
check(
  "the total is item + protection + shipping + tip",
  (() => {
    const b = priceCheckout({ itemCents: 34537, shippingCents: 1621, tipCents: 0 })
    return b.totalCents === 34537 + buyerProtectionFee(34537) + 1621
  })(),
)
check(
  "shipping is omitted rather than shown as zero",
  (() => {
    // "Expediere 0,00" invites the question of whether shipping is free or
    // simply not chosen yet.
    const lines = breakdownLines(priceCheckout({ itemCents: 1000 }))
    return !lines.some((l) => l.label === "Expediere")
  })(),
)
check(
  "the protection line carries an explanation",
  breakdownLines(priceCheckout({ itemCents: 1000 })).some(
    (l) => l.label.startsWith("Taxă de protecție") && Boolean(l.info),
  ),
  "        'Why am I paying this' is the question it raises, and an unanswered\n" +
    "        one is why people abandon a basket.",
)

/* ── WHO GETS THE MONEY ──────────────────────────────────────────────────── */
check(
  "the seller is never paid a share of the protection fee",
  (() => {
    // THE EXPENSIVE BUG. Computing the platform's cut as a percentage of the
    // TOTAL hands the seller part of the buyer's protection fee and part of
    // the postage, on every order, forever.
    const commission = 2072 // 6% of the item
    const b = priceCheckout({ itemCents: 34537, shippingCents: 1621, platformCommissionCents: commission })
    return b.sellerReceivesCents === 34537 - commission
  })(),
)
check(
  "the seller is never paid the postage either",
  (() => {
    const withShipping = priceCheckout({ itemCents: 5000, shippingCents: 1621, platformCommissionCents: 300 })
    const without = priceCheckout({ itemCents: 5000, shippingCents: 0, platformCommissionCents: 300 })
    // The platform pays the courier, so shipping changes what the platform
    // takes and never what the seller receives.
    return withShipping.sellerReceivesCents === without.sellerReceivesCents
  })(),
)
check(
  "the platform takes commission + protection + postage",
  (() => {
    const b = priceCheckout({ itemCents: 34537, shippingCents: 1621, platformCommissionCents: 2072 })
    return b.platformTakesCents === 2072 + buyerProtectionFee(34537) + 1621
  })(),
)
check(
  "every minor unit is accounted for",
  (() => {
    // Nothing is created and nothing vanishes: what the buyer pays is exactly
    // what the platform keeps plus what the seller gets.
    const cases = [
      { itemCents: 34537, shippingCents: 1621, platformCommissionCents: 2072 },
      { itemCents: 1000, platformCommissionCents: 60 },
      { itemCents: 7, shippingCents: 3, tipCents: 11, platformCommissionCents: 1 },
      { itemCents: 999999, shippingCents: 9999, tipCents: 4321, platformCommissionCents: 59999 },
    ]
    return cases.every((c) => {
      const b = priceCheckout(c)
      return b.totalCents === b.platformTakesCents + b.sellerReceivesCents
    })
  })(),
)
check(
  "a tip goes to the seller, not the platform",
  (() => {
    const withTip = priceCheckout({ itemCents: 5000, tipCents: 700, platformCommissionCents: 300 })
    const without = priceCheckout({ itemCents: 5000, tipCents: 0, platformCommissionCents: 300 })
    return withTip.sellerReceivesCents === without.sellerReceivesCents + 700
  })(),
)
check(
  "a commission larger than the item cannot produce a negative payout",
  (() => {
    // Stripe rejects a negative transfer, and the order would be paid with no
    // payout attached to it.
    const b = priceCheckout({ itemCents: 1000, platformCommissionCents: 99999 })
    return b.sellerReceivesCents === 0
  })(),
)
check(
  "negative and fractional inputs are absorbed, not propagated",
  (() => {
    const b = priceCheckout({ itemCents: -50, shippingCents: -10, tipCents: 12.7 })
    return b.itemCents === 0 && b.shippingCents === 0 && Number.isInteger(b.tipCents)
  })(),
)

/* ── ONE ARITHMETIC, SHARED ──────────────────────────────────────────────── */
{
  const session = read("app/api/checkout/stripe-session/route.ts")
  const ui = read("components/checkout/price-breakdown.tsx")

  check(
    "the charged amount comes from the shared module",
    /priceCheckout\(/.test(session) && /pricing\.totalCents/.test(session),
    "        A checkout that displays one total and charges another is the worst\n" +
      "        bug this file could have.",
  )
  check(
    "the platform's Stripe fee is the computed share, not the bare commission",
    /const platformFee = pricing\.platformTakesCents/.test(session),
  )
  check(
    "the commission is computed on the seller's money only",
    /calculatePlatformFee\(sellerSideCents/.test(session),
    "        Charging it on the inflated total would tax the seller on the\n" +
      "        buyer's protection fee.",
  )
  check(
    "the breakdown component computes nothing",
    !/BUYER_PROTECTION|0\.05|\* 0\.05/.test(ui) && /breakdownLines\(/.test(ui),
    "        It renders a breakdown; it must never derive one, or the two can\n" +
      "        disagree.",
  )
  check(
    "the fixed fee is a named constant, not a scattered number",
    (() => {
      // The app displays RON and the PaymentIntent is created in USD — a
      // mismatch that predates this work. When it is settled, exactly one line
      // should need to change.
      // Defined once, from the currency module, so switching currency is one
      // env var rather than a hunt through the codebase for the number 400.
      // Comments stripped: the file NAMES 400 in order to explain why it is not
      // written there, and matching that is matching the documentation.
      const p = read("lib/checkout/pricing.ts")
      const code = p.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      return (
        /export const BUYER_PROTECTION_FIXED = BUYER_PROTECTION_FIXED_BY_CURRENCY/.test(code) &&
        !/\b400\b/.test(code)
      )
    })(),
  )
}

/* ── CURRENCY ────────────────────────────────────────────────────────────── */
{
  const cur = read("lib/checkout/currency.ts")
  const sql = read("supabase/sql/RUN_CURRENCY_RON.sql")

  check(
    "the charge currency is one constant, not a string in every route",
    (() => {
      const routes = [
        "app/api/checkout/stripe-session/route.ts",
        "app/api/checkout/confirm-payment/route.ts",
        "app/api/checkout/process/route.ts",
        "app/api/checkout/complete/route.ts",
        "app/api/checkout/route.ts",
        "app/api/checkout/quick-free/route.ts",
      ]
      return routes.every((f) => {
        const s = read(f)
        return !/currency: "usd"/.test(s) && /PLATFORM_CURRENCY/.test(s)
      })
    })(),
  )
  check(
    "it defaults to the historical value until the migration has run",
    /=== "ron" \? "ron" : "usd"/.test(cur),
    "        A deployment that has not migrated must not start quoting lei\n" +
      "        against dollar-denominated rows.",
  )
  check(
    "the fixed fee follows the currency being charged",
    (() => {
      // 400 minor units is four LEI in one configuration and four DOLLARS in
      // the other — roughly an eighteen-lei fee. This was a real bug in the
      // first version of the protection fee.
      const p = read("lib/checkout/pricing.ts")
      return (
        /BUYER_PROTECTION_FIXED_BY_CURRENCY\[PLATFORM_CURRENCY\]/.test(p) &&
        /ron: 400/.test(cur) &&
        /usd: 87/.test(cur)
      )
    })(),
  )
  check(
    "the two fixed amounts are the same size in real terms",
    (() => {
      const ron = Number(cur.match(/ron: (\d+)/)?.[1] ?? 0)
      const usd = Number(cur.match(/usd: (\d+)/)?.[1] ?? 0)
      // 4 lei at the 4.6 rate the display has always used.
      return ron === 400 && Math.abs(usd * 4.6 - ron) < 20
    })(),
  )
  check(
    "the migration cannot be applied twice",
    /platform_migrations where key = 'currency_ron_2026'/.test(sql) && /if already then/.test(sql),
    "        Running it twice multiplies the whole catalogue by 4.6 again.",
  )
  check(
    "the migration reprices variants and PWYW floors, not just products",
    /product_variants/.test(sql) && /pwyw_min_price_cents/.test(sql),
    "        A half-migration shows up as one listing costing a fifth of what\n" +
      "        its own variants do.",
  )
  check(
    "historical orders are left alone",
    /orders\.amount_cents` records what was actually charged/.test(sql) &&
      !/update public\.orders/.test(sql),
    "        Rewriting them would falsify receipts and make past payouts\n" +
      "        irreconcilable with Stripe.",
  )
  check(
    "the migration states the order of operations",
    /Run this migration\.[\s\S]{0,200}?THEN set NEXT_PUBLIC_PLATFORM_CURRENCY/.test(sql),
    "        Flag first charges lei against dollar rows — a 78% discount applied\n" +
      "        silently to the entire catalogue.",
  )
}

/* ── THE CHECKOUT SURFACE ────────────────────────────────────────────────── */
{
  const bar = read("components/checkout/sticky-pay-bar.tsx")
  const opts = read("components/checkout/delivery-options.tsx")

  check(
    "the pay bar is sticky, not fixed",
    /sticky bottom-0/.test(bar) && !/\bfixed bottom-0\b/.test(bar),
    "        A fixed element inside a transformed ancestor is positioned against\n" +
      "        that ancestor rather than the viewport, and this app transforms\n" +
      "        page containers during navigation.",
  )
  check(
    "the bar adds the safe-area inset rather than ignoring it",
    /max\(0\.75rem, env\(safe-area-inset-bottom\)\)/.test(bar),
    "        A button flush to the bottom of a phone with a home indicator is a\n" +
      "        button people miss and a gesture they fire by accident.",
  )
  check(
    "the page is given a way to reserve room for the bar",
    /export const PAY_BAR_SPACER/.test(bar),
    "        Without it the bar permanently covers the last section and whatever\n" +
      "        is there can never be read.",
  )
  check(
    "the total sits beside the button, not at the end of a scroll",
    (() => {
      // Every choice on a checkout changes the total; making the consequence
      // visible at the moment of the choice is the whole point.
      const i = bar.indexOf("totalLabel}")
      const j = bar.indexOf("actionLabel}")
      return i > -1 && j > i
    })(),
  )
  check(
    "both delivery options show their price at the same time",
    /o\.unavailable \? "Indisponibil" : o\.price/.test(opts),
    "        A choice presented without its price is not a choice — locker\n" +
      "        against courier is 16 lei against 118.",
  )
  check(
    "the selected option is marked by more than colour",
    /active && <Check/.test(opts) && /aria-checked=\{active\}/.test(opts),
  )
  check(
    "the delivery options are a real radio group",
    /role="radiogroup"/.test(opts) && /role="radio"/.test(opts),
  )
  check(
    "the address card looks the same whether filled or empty",
    /const filled = Boolean\(name\)/.test(opts),
    "        So the section does not jump around between states.",
  )
  check(
    "these components price nothing themselves",
    (() => {
      // They render numbers the caller formatted, so they obey whatever
      // currency is configured and cannot disagree with the charge.
      return !/0\.05|BUYER_PROTECTION|toFixed\(2\)/.test(bar + opts)
    })(),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log(`Failing: ${failures.join(", ")}`)
  process.exit(1)
}
