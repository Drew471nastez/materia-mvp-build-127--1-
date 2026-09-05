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

import {
  BUYER_PROTECTION_FIXED_BY_CURRENCY,
  BUYER_PROTECTION_LADDER_BY_CURRENCY,
  MIN_LISTING_PRICE_BY_CURRENCY,
} from "../lib/checkout/currency"
import { buyerPaysCents } from "../lib/marketplace/display-price"
import {
  BUYER_PROTECTION_FIXED,
  SELLER_COMMISSION_PERCENT,
  breakdownLines,
  buyerProtectionFee,
  priceCheckout,
  sellerCommissionCents,
  sellerReceivesCents,
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
/**
 * The buyer's fee is a FLAT amount by band, not a percentage. It replaced
 * "5% + 4 lei", which at ten lei charged 4.50 on a ten-lei item — a 45%
 * surcharge on exactly the orders a second-hand marketplace lives on. The 5%
 * did not go away; it moved to the side of the transaction it always described
 * and is the seller's commission now.
 */
const LADDER_RON = [
  // [order value in bani, fee in bani] — one row per band, plus the edges.
  [1, 100],
  [799, 100],
  [800, 125],
  [999, 125],
  [1000, 150],
  [1199, 150],
  [1200, 175],
  [1499, 175],
  [1500, 400],
  [34537, 400],
] as const

check(
  "the FIXED part is exactly what the table says, at every boundary",
  (() => {
    // Boundaries are where a ladder goes wrong, so every one of them is here
    // twice: the last value of a band and the first value of the next.
    const ron = BUYER_PROTECTION_LADDER_BY_CURRENCY.ron
    const fixedFor = (cents: number) => {
      for (const band of ron) if (cents < band.upTo) return band.fee
      return BUYER_PROTECTION_FIXED_BY_CURRENCY.ron
    }
    return LADDER_RON.every(([cents, fee]) => fixedFor(cents) === fee)
  })(),
  "        0.01–7.99 → 1 leu · 8–9.99 → 1.25 · 10–11.99 → 1.50 ·\n" +
    "        12–14.99 → 1.75 · 15+ → 4 lei",
)

check(
  "and the fee is that PLUS five percent of the item",
  (() => {
    // Both halves. A flat fee alone takes four lei on a 350-lei order, which
    // does not cover the risk carried on it; a percentage alone takes fifty
    // bani on a ten-lei one, which does not cover one dispute about it.
    //
    // 350 lei → 17.50 + 4.00 = 21.50.
    return (
      buyerProtectionFee(35000) === 1750 + BUYER_PROTECTION_FIXED &&
      buyerProtectionFee(34537) === Math.round(34537 * 0.05) + BUYER_PROTECTION_FIXED
    )
  })(),
)

check(
  "the fee tracks whatever currency is configured",
  (() => {
    // The ladder is per-currency for the same reason the flat fee was: 400
    // minor units is four lei in one configuration and four dollars in the
    // other. Reading it rather than pinning one side.
    const ladder = BUYER_PROTECTION_LADDER_BY_CURRENCY
    return (
      ladder.ron.length === ladder.usd.length &&
      ladder.ron.every((b, i) => b.upTo > ladder.usd[i].upTo && b.fee > ladder.usd[i].fee)
    )
  })(),
)

check(
  "a ten-lei order is not charged a 45% surcharge",
  (() => {
    // A flat 4 lei made this 4.50 on a 10-lei item. The graduated fixed part
    // makes it 2.00: 50 bani of percentage plus 1.50 of floor.
    const small = buyerProtectionFee(1000)
    return small === 50 + 150 && small < 450
  })(),
)

/* ── THE SELLER'S SIDE ───────────────────────────────────────────────────── */
check(
  "the platform's cut is taken ONCE, from the buyer",
  (() => {
    // The five percent is charged inside the protection fee. Charging the same
    // five percent again on the seller's side would be taking it twice from one
    // transaction — and would contradict the buyer-protection page, which has
    // told people "5% din prețul articolului, plus 4 lei" the whole time.
    //
    // The constant survives at zero rather than being deleted: a commission is
    // a commercial decision, and a zero with the reasoning beside it can be
    // revisited in one line where a removed concept has to be rediscovered.
    return (
      (SELLER_COMMISSION_PERCENT as number) === 0 &&
      sellerCommissionCents(10000) === 0 &&
      sellerCommissionCents(35000) === 0
    )
  })(),
)

check(
  "so a seller types 350 and is paid 350",
  (() => {
    // Nothing is deducted from a number they chose. This is what lets the sell
    // form state their own figure without a second, smaller one beside it.
    return (
      sellerReceivesCents(35000) === 35000 &&
      sellerReceivesCents(10000) === 10000 &&
      sellerReceivesCents(0) === 0
    )
  })(),
)

check(
  "a listing has a floor, and it is above the band where the fee is a fifth of the order",
  (() => {
    // Five lei. Below it the protection fee is a fifth of the order and the
    // courier costs several times the item.
    const floor = MIN_LISTING_PRICE_BY_CURRENCY.ron
    return floor === 500 && buyerProtectionFee(floor) / floor <= 0.3
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
    // `sellerSideCents` is the item plus any tip. Charging the commission on
    // the inflated total would tax the seller on the buyer's protection fee and
    // on the postage, neither of which was ever theirs.
    /sellerCommissionCents\(sellerSideCents\)/.test(session),
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
    "it defaults to LEI, because the catalogue was never in dollars",
    /=== "usd" \? "usd" : "ron"/.test(cur),
    "        `price_cents` is written by one screen — the sell form — which\n" +
      "        multiplies a seller-typed number by 100. A seller typing 360\n" +
      "        means 360 lei. Defaulting to usd quoted every price 4.6x high\n" +
      "        and charged the raw number in dollars. The env var still\n" +
      "        overrides for a deployment that really does hold USD rows.",
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


/* ===========================================================================
 *  THE NUMBER ON THE CARD IS THE NUMBER YOU PAY
 * ===========================================================================
 *
 * A listing priced at 130 cost 141 at the till. Every price in the catalogue
 * was wrong in the same direction, and only stopped being wrong once somebody
 * had committed to it — which is the single worst place for a price to change.
 */

const cardSrc = read("components/explore/product-card.tsx")
const detailSrc = read("components/product/product-detail.tsx")
const displaySrc = read("lib/marketplace/display-price.ts")
const protectionSrc = read("components/marketplace/buyer-protection.tsx")
const currencySrc = read("lib/i18n/currency.ts")
const localeSrc = read("components/locale-provider.tsx")
const guardSrc = read("lib/checkout/currency-guard.ts")
const stripeRoute = read("app/api/checkout/stripe-session/route.ts")

console.log("\nPrices are quoted inclusive")

check(
  "the display price is the checkout's own arithmetic, not a second copy",
  (() => {
    // Two copies of "5% and 4 lei" is one bug away from the card showing one
    // total and the bank taking another — which is exactly what quoting
    // inclusively is meant to close, reintroduced from the other end.
    return /import \{ buyerProtectionFee \} from "@\/lib\/checkout\/pricing"/.test(displaySrc)
  })(),
)

check(
  "a 130-lei listing is quoted at what it actually costs",
  (() => {
    // 13000 * 0.05 = 650, + the flat part. The assertion is written against
    // the same constants the checkout uses so it survives the currency switch.
    const item = 13000
    const expected = item + buyerProtectionFee(item)
    return buyerPaysCents(item) === expected && expected > item
  })(),
)

check(
  "free is still free, and a nonsense price does not become 4 lei",
  buyerPaysCents(0) === 0 && buyerPaysCents(-5) === 0 && buyerPaysCents(NaN) === 0,
)

check(
  "shipping is deliberately not in it",
  (() => {
    // It depends on a courier and a locker nobody has chosen yet. Protection is
    // knowable from the price alone, which is why hiding THAT was indefensible.
    return !/shipping/i.test(displaySrc.replace(/\*[\s\S]*?\*\//g, "")) 
  })(),
)



check(
  "the mark is pressable everywhere, including on a grid card",
  (() => {
    // It was inert on cards to avoid mounting sixty subpages for one tap. But a
    // shield that does nothing where people actually meet the price is a
    // promise the feed does not keep — the feed IS where somebody first wonders
    // why the number is what it is.
    return /<button/.test(protectionSrc) && /onClick=\{onClick\}/.test(protectionSrc)
  })(),
)

check(
  "and there is exactly ONE subpage for the whole application",
  (() => {
    // Sixty cards must not mean sixty stage machines and sixty matchMedia
    // listeners. A store rather than a context, so opening the panel re-renders
    // the panel and not every card that could have opened it.
    const layout = read("app/layout.tsx")
    return (
      /<BuyerProtectionHost \/>/.test(layout) &&
      /useSyncExternalStore/.test(protectionSrc) &&
      !/createContext/.test(protectionSrc)
    )
  })(),
)

check(
  "the mark is not nested inside the card's own link",
  (() => {
    // A button inside an anchor is invalid nesting and the browser is entitled
    // to take the tap for the link — which is exactly what it did.
    const meta = cardSrc.slice(cardSrc.indexOf("{/* THE PRICE A BUYER WILL"), cardSrc.indexOf("{(sizeLabel || detailLine)"))
    const markAt = meta.indexOf("<ProtectionMark")
    const linkCloses = meta.indexOf("</SmartLink>")
    return markAt > 0 && linkCloses > 0 && markAt > linkCloses
  })(),
)

check(
  "it is a footnote: no chip, and no call to action either",
  (() => {
    // A filled pill beside every price turned the grid into two columns of
    // badges. Colouring the shield purple instead was worse the other way:
    // purple is what this interface uses for the thing it wants you to press,
    // and sixty of them down a feed drowns the numbers they qualify.
    return !/bg-neutral-100/.test(protectionSrc) && !/#7c3aed/.test(protectionSrc)
  })(),
)

check(
  "and its hit area is bigger than the mark",
  (() => {
    // At 11px the glyph and the word are about forty by twelve pixels, which is
    // half of what a thumb needs.
    return /after:-inset-x-2 after:-inset-y-2\.5/.test(protectionSrc)
  })(),
)

check(
  "what it opens is the app's existing subpage, not a second one",
  (() => {
    // Two grammars for "a screen deeper into the same task" inside one app is
    // precisely what reads as unfinished.
    return /<PickerPage/.test(protectionSrc) && /Am înțeles/.test(protectionSrc)
  })(),
)


check(
  "the six-currency switcher is gone",
  (() => {
    // It relabelled every price against a static rate table while the card was
    // charged in one currency regardless — so a shopper who chose GBP read
    // pounds everywhere and got a lei charge. A control that moves the label
    // and not the money is worse than no control.
    //
    // The file this used to read was language-currency-modal.tsx, which had
    // already lost its currency tab and was never imported anywhere. It is gone
    // now, replaced by the language picker that IS wired into the account
    // menus — so the guard follows the live file. The property under test is
    // unchanged: whatever modal the menus open must not offer a currency.
    const modal = read("components/platform/language-modal.tsx")
    return !/setCurrency/.test(modal) && !/currencies\.map/.test(modal)
  })(),
)

check(
  "formatting follows the same switch that tells Stripe what to charge",
  (() => {
    // It read the environment variable directly and inverted the default the
    // charge side used, so the two halves of "what does price_cents mean" were
    // separate expressions kept in agreement by hand — and they were not:
    // display multiplied by 4.6 while the card was charged the raw number in
    // dollars. One listing typed at 360 lei was quoted at ~1656 and billed $360.
    //
    // Reading PLATFORM_CURRENCY is the fix, and it is stronger than agreeing:
    // there is now no second expression that CAN disagree.
    return (
      /const storedIsLei = PLATFORM_CURRENCY === "ron"/.test(currencySrc) &&
      !/NEXT_PUBLIC_PLATFORM_CURRENCY/.test(currencySrc) &&
      /storedIsLei \? 1 : USD_RATES\.RON/.test(currencySrc) &&
      /formatPlatformMoney\(cents\)/.test(localeSrc)
    )
  })(),
)

check(
  "the guard accepts both honest routes into lei",
  (() => {
    // It was written assuming the only road to lei was a conversion, and that is
    // not the road this product took. Demanding the conversion marker demands a
    // migration that must never run here — RUN_CURRENCY_RON.sql multiplies by
    // 4.6, which against a catalogue already in bani is the display bug made
    // permanent and written to the data.
    const guard = read("lib/checkout/currency-guard.ts")
    return (
      /\.in\("key", \["currency_ron_2026", "currency_ron_native"\]\)/.test(guard) &&
      // And it still refuses when NEITHER has been stated.
      /if \(error \|\| !data\) \{/.test(guard) &&
      /if \(PLATFORM_CURRENCY !== "ron"\) return \{ ok: true \}/.test(guard)
    )
  })(),
)

check(
  "and the native marker changes no prices at all",
  (() => {
    // Its entire job is to state the unit. A file called RUN_CURRENCY_* that
    // quietly repriced a catalogue would be the most dangerous thing in the
    // repository.
    const sql = read("supabase/sql/RUN_CURRENCY_RON_NATIVE.sql")
    return (
      /currency_ron_native/.test(sql) &&
      /on conflict \(key\) do nothing/.test(sql) &&
      !/update\s+public\.products/i.test(sql) &&
      !/\*\s*4\.6/.test(sql) &&
      // And it says, in the file, not to run the other one.
      /DO NOT RUN RUN_CURRENCY_RON\.sql/.test(sql)
    )
  })(),
)

check(
  "the wishlist stopped formatting in dollars",
  (() => {
    // Hard-coded en-US/USD, on a Romanian marketplace, on the one screen a
    // buyer keeps things they intend to buy.
    const wish = read("components/wishlist/wishlist-content.tsx")
    return !/currency: "USD"/.test(wish) && /formatPlatformMoney/.test(wish)
  })(),
)

console.log("\nFlipping the currency in the wrong order is refused, not charged")

check(
  "checkout will not charge lei against un-migrated prices",
  (() => {
    // Flag first, migration later: a $100 item sells for 100 lei, a 78%
    // discount applied silently, and nothing errors because both halves work
    // exactly as written. A comment in a SQL file is not a safeguard.
    return (
      /platform_migrations/.test(guardSrc) &&
      /currency_ron_2026/.test(guardSrc) &&
      /assertChargeCurrencyReady/.test(stripeRoute)
    )
  })(),
)

check(
  "and it refuses BEFORE the PaymentIntent is built",
  (() => {
    const at = stripeRoute.indexOf("assertChargeCurrencyReady()")
    const intent = stripeRoute.indexOf("currency: PLATFORM_CURRENCY")
    return at > 0 && intent > at
  })(),
)

check(
  "it costs nothing while the platform is still in dollars",
  /if \(PLATFORM_CURRENCY !== "ron"\) return \{ ok: true \}/.test(guardSrc),
)

check(
  "a confirmed migration is cached; a missing one is not",
  (() => {
    // The marker can only go from absent to present, so `true` is safe to keep.
    // `false` is the state somebody is actively fixing, and caching it would
    // mean the fix does not take effect until the next deployment.
    const fn = guardSrc.slice(guardSrc.indexOf("export async function assertChargeCurrencyReady"))
    return (fn.match(/migrationConfirmed = true/g) ?? []).length === 1 && !/migrationConfirmed = false/.test(fn)
  })(),
)

console.log("\nThe comparison price is gone from the marketplace")



check(
  "the save control is not drawn on your own card",
  /\{cornerAction \?\?\s*\n\s*\(known && !mine \? \(/.test(cardSrc),
)

check(
  "and it is answered from a localStorage read, not a request per card",
  (() => {
    // The feed is cached and auth-free on purpose; a grid card deciding whether
    // to draw a heart must not cost a round trip sixty times.
    //
    // `getSession` was once banned here outright. It is now the fallback for a
    // route where nothing writes a snapshot — but it reads the session already
    // persisted on the device rather than asking the auth server, it is guarded
    // to run at most once per page however many cards mount, and the snapshot is
    // still what answers whenever there is one. What the ban was protecting
    // against was a request PER CARD, and that is still what is asserted.
    const hook = read("lib/marketplace/use-my-username.ts")
    return (
      /readAuthSnapshot/.test(hook) &&
      !/fetch\(/.test(hook) &&
      // Never the auth server, and never more than once.
      !/auth\.getUser\(\)/.test(hook) &&
      [...hook.matchAll(/auth\.getSession\(\)/g)].length === 1 &&
      /if \(sessionChecked \|\| asking\) return/.test(hook)
    )
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log(`Failing: ${failures.join(", ")}`)
  process.exit(1)
}
