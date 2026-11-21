/**
 * GROW IS $14, AND PHYSICAL PRODUCTS HAVE THEIR OWN CARD RATES (the owner).
 *
 *   plan   digital        physical       under $4.00 (no fixed part)
 *   Free   5% + $0.25     3% + $0.25     digital 11.25%, physical 9.25% (PAID_MICRO_RATE)
 *   Grow   3% + $0.25     1.5% + $0.25   digital 9.25%, physical 7.75% (SCALE_MICRO_RATE)
 *   Pro    1.5% + $0.25   1.5% + $0.25   7.75% on both
 *
 * This file holds: the engine for each plan and kind at $3, $10 and $100 in
 * USD and EUR; a basket with both kinds; a database fee version without the
 * physical rates falling back to the code's; the plan card lines and the
 * comparison; the $14 price and both Grow Stripe prices read as `growth`;
 * and scripts/migrate-grow-price.mjs in a dry run (and a real one) against a
 * stubbed Stripe client.
 */
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { readFileSync } from "node:fs"
import { codeDefaultFeeConfig, CODE_FEE_RULE_VERSION } from "@/lib/payments/fees/defaults"
import { FREE_PHYSICAL_MICRO_RATE, FREE_PHYSICAL_STANDARD_RATE, PAID_MICRO_RATE, PAID_PHYSICAL_MICRO_RATE, PAID_PHYSICAL_STANDARD_RATE, SCALE_MICRO_RATE, SCALE_PHYSICAL_MICRO_RATE, SCALE_PHYSICAL_STANDARD_RATE } from "@/lib/payments/fees/config"
import { calculateStorelibFeeWithConfig } from "@/lib/payments/fees/engine"
import { validateFeeConfig } from "@/lib/payments/fees/validate"
import { clearActiveFeeConfigCache, loadActiveFeeConfig } from "@/lib/payments/fees/active"
import type { StorelibFeeConfig, StorelibProductKind, StorelibSellerPlan } from "@/lib/payments/fees/types"
import { cardRateLabel, computeApplicationFee, getFeeDescription, getFeePreview, physicalPartCents, productKindOf, sameRateForBothKinds } from "@/lib/billing/fee-calculator"
import { MAX_PLAN_LINES, planLineText, publicPlanLines } from "@/components/marketing/pricing-lines"
import { OFFERED_PLANS, PRO_PRICE_CENTS, PRO_YEARLY_MONTHLY_CENTS, PRO_YEARLY_TOTAL_CENTS, YEARLY_SAVING_PERCENT, formatPlanPrice, planComparison, planQuestions, pricedFor, withCodePrice } from "@/lib/billing/plans"
import { LEGACY_GROWTH_PRICE_ID, growthPriceId, growthPriceIds, legacyGrowthPriceIds, planFromPriceId } from "@/lib/billing/stripe-prices"
import { priceChargesShownGrow, growPriceMatchesShown, clearGrowPriceCheck } from "@/lib/billing/grow-price-guard"
import { paidPlanFromPrice, paidPlanFromSubscription } from "@/lib/billing/subscription-state"
import { PLANS, saleBreakdown } from "@/lib/marketing/facts"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const cfg = codeDefaultFeeConfig()
const fee = (gross: number, currency: string, plan: StorelibSellerPlan, productKind: StorelibProductKind, config: StorelibFeeConfig = cfg) =>
  calculateStorelibFeeWithConfig({ grossMinor: gross, currency, sellerPlan: plan, productKind }, config).totalStorelibFeeMinor

console.log("\n1. The engine, each plan and kind, at 3, 10 and 100")
{
  check("a new rule, so orders show which rule charged them", CODE_FEE_RULE_VERSION === "2026-11-storelib-v5-physical-rates" && cfg.versionKey === CODE_FEE_RULE_VERSION)
  check("physical rates: Free 3%, Grow 1.5%, Pro 1.5%", FREE_PHYSICAL_STANDARD_RATE === 0.03 && PAID_PHYSICAL_STANDARD_RATE === 0.015 && SCALE_PHYSICAL_STANDARD_RATE === 0.015)
  check("physical under the line is the next plan's small-order rate: Free 9.25% (PAID_MICRO_RATE), Grow 7.75% (SCALE_MICRO_RATE), Pro 7.75%", FREE_PHYSICAL_MICRO_RATE === PAID_MICRO_RATE && PAID_PHYSICAL_MICRO_RATE === SCALE_MICRO_RATE && SCALE_PHYSICAL_MICRO_RATE === SCALE_MICRO_RATE)
  /* [plan, kind, $3, $10, $100] in cents. USD: line $4.00, fixed 25c. */
  const usd: [StorelibSellerPlan, StorelibProductKind, number, number, number][] = [
    ["free", "digital", 34, 75, 525],
    ["free", "physical", 28, 55, 325],
    ["paid", "digital", 28, 55, 325],
    ["paid", "physical", 23, 40, 175],
    ["scale", "digital", 23, 40, 175],
    ["scale", "physical", 23, 40, 175],
  ]
  for (const [plan, kind, a, b, c] of usd) {
    const got = [fee(300, "USD", plan, kind), fee(1000, "USD", plan, kind), fee(10000, "USD", plan, kind)]
    check(`USD ${plan} ${kind}: ${a}c, ${b}c, ${c}c`, got.join() === [a, b, c].join(), got)
  }
  /* EUR: line 3.68, fixed 23c. 3.00 is a small order, 10 and 100 are not. */
  const eur: [StorelibSellerPlan, StorelibProductKind, number, number, number][] = [
    ["free", "digital", 34, 73, 523],
    ["free", "physical", 28, 53, 323],
    ["paid", "digital", 28, 53, 323],
    ["paid", "physical", 23, 38, 173],
    ["scale", "digital", 23, 38, 173],
    ["scale", "physical", 23, 38, 173],
  ]
  for (const [plan, kind, a, b, c] of eur) {
    const got = [fee(300, "EUR", plan, kind), fee(1000, "EUR", plan, kind), fee(10000, "EUR", plan, kind)]
    check(`EUR ${plan} ${kind}: ${a}c, ${b}c, ${c}c`, got.join() === [a, b, c].join(), got)
  }
  check("no kind given is digital, as every sale was before", fee(1000, "USD", "free", "digital") === calculateStorelibFeeWithConfig({ grossMinor: 1000, currency: "USD", sellerPlan: "free" }, cfg).totalStorelibFeeMinor)
  for (const plan of ["free", "paid", "scale"] as const) {
    check(`${plan} physical never falls as a price rises past $4.00 ($3.99 and $4.00)`, fee(399, "USD", plan, "physical") <= fee(400, "USD", plan, "physical"), [fee(399, "USD", plan, "physical"), fee(400, "USD", plan, "physical")])
  }
  const r = calculateStorelibFeeWithConfig({ grossMinor: 1000, currency: "USD", sellerPlan: "paid", productKind: "physical" }, cfg)
  check("the result says its kind and the rate it charged", r.productKind === "physical" && r.physicalMinor === 1000 && r.percentageRate === 0.015 && r.feeRuleVersion === CODE_FEE_RULE_VERSION)
  check("the fee-calculator wrappers take the kind", computeApplicationFee({ unitAmount: 1000, sellerPlan: "growth", currency: "USD", productKind: "physical" }) === 40 && getFeePreview(1000, "free", "USD", "physical").platformFeeCents === 55 && getFeePreview(1000, "free", "USD").platformFeeCents === 75)
  check("a product row's kind: physical ships, anything else is digital", productKindOf("physical") === "physical" && productKindOf("digital") === "digital" && productKindOf("course") === "digital" && productKindOf(null) === "digital")
}

console.log("\n2. A basket with both kinds")
{
  /* Free: $50 of goods that ship and a $10 download. 3% of 5000 + 5% of 1000 + 25c, one fixed fee for the charge. */
  check("Free, $50 physical + $10 digital: 150 + 50 + 25 = 225c", computeApplicationFee({ unitAmount: 6000, sellerPlan: "free", currency: "USD", productKind: { physicalCents: 5000 } }) === 225)
  check("Grow, the same basket: 75 + 30 + 25 = 130c", computeApplicationFee({ unitAmount: 6000, sellerPlan: "growth", currency: "USD", productKind: { physicalCents: 5000 } }) === 130)
  const mixed = calculateStorelibFeeWithConfig({ grossMinor: 6000, currency: "USD", sellerPlan: "free", physicalMinor: 5000 }, cfg)
  check("  said as mixed, with its weighted rate", mixed.productKind === "mixed" && mixed.physicalMinor === 5000 && Math.abs(mixed.percentageRate - (5000 * 0.03 + 1000 * 0.05) / 6000) < 1e-12)
  check("a basket of one kind is worked out exactly as a single sale", computeApplicationFee({ unitAmount: 6000, sellerPlan: "free", currency: "USD", productKind: { physicalCents: 6000 } }) === fee(6000, "USD", "free", "physical") && computeApplicationFee({ unitAmount: 6000, sellerPlan: "free", currency: "USD", productKind: { physicalCents: 0 } }) === fee(6000, "USD", "free", "digital"))
  check("a small basket is a small order as a whole: $2 physical + $1 digital on Free = 9.25% of 200 + 11.25% of 100 = 30c", computeApplicationFee({ unitAmount: 300, sellerPlan: "free", currency: "USD", productKind: { physicalCents: 200 } }) === 30)
  /* The physical checkout's split: a tee twice, a download, and $6 of delivery that stays with the goods. */
  const lines = [
    { type: "physical", unitCents: 2500, quantity: 2, discountCents: 0 },
    { type: "digital", unitCents: 1200, quantity: 1, discountCents: 200 },
  ]
  check("physicalPartCents: the total less the downloads after their discount", physicalPartCents(lines, 6600) === 5600)
  check("  the fee on that order: 3% of 5600 + 5% of 1000 + 25c = 243c", computeApplicationFee({ unitAmount: 6600, sellerPlan: "free", currency: "USD", productKind: { physicalCents: physicalPartCents(lines, 6600) } }) === 243)
  check("  never more than the total, never below zero", physicalPartCents(lines, 500) === 0 && physicalPartCents([{ type: "physical", unitCents: 100, quantity: 1, discountCents: 0 }], 100) === 100)
  check("the physical checkout passes its physical part", /calculatePlatformFeeForCheckout\(totals\.totalCents, priced\.creatorId, db, chargeCurrency, \{ physicalCents: physicalPartCents\(q\.lines, totals\.totalCents\) \}\)/.test(read("lib/physical/checkout-server.ts")))
  const server = read("lib/billing/platform-fee-server.ts")
  check("every checkout must say its kind: the split is a required argument", /currency: string \| undefined,\s*split: FeeKindSplit,\s*\)/.test(server))
  for (const [file, kind] of [
    ["app/api/checkout/cart/route.ts", '"digital"'],
    ["app/api/checkout/site/route.ts", '"digital"'],
    ["app/api/checkout/stripe-session/route.ts", "productKindOf(product.type)"],
    ["lib/memberships/billing.ts", '"digital"'],
    ["app/api/onepage/tip/route.ts", '"digital"'],
    ["lib/communities/server/library-checkout-deps.ts", '"digital"'],
    ["app/api/community/[communityId]/events/[eventId]/checkout/route.ts", '"digital"'],
    ["app/api/community/[communityId]/learn/[programId]/checkout/route.ts", '"digital"'],
  ] as const) {
    check(`  ${file} says ${kind}`, new RegExp(`calculatePlatformFeeForCheckout\\([^)]*, ${kind.replace(/[().]/g, "\\$&")}\\)`).test(read(file)))
  }
}

console.log("\n3. A database fee version without the physical rates")
{
  /* The shape run-now part 80 wrote: digital rates and currencies, nothing for Scale or physical sales. */
  const { scaleStandardRate: _a, scaleMicroRate: _b, freePhysicalStandardRate: _c, freePhysicalMicroRate: _d, paidPhysicalStandardRate: _e, paidPhysicalMicroRate: _f, scalePhysicalStandardRate: _g, scalePhysicalMicroRate: _h, ...old } = cfg
  const v3: StorelibFeeConfig = { ...old, versionKey: "2026-10-storelib-v3-free-5pct" }
  check("validates: the physical rates are optional", validateFeeConfig(v3).length === 0)
  for (const plan of ["free", "paid", "scale"] as const) {
    for (const gross of [300, 1000, 10000]) {
      check(`${plan} physical at ${gross}c falls back to the code's physical rates`, fee(gross, "USD", plan, "physical", v3) === fee(gross, "USD", plan, "physical"))
    }
  }
  check("digital still reads the stored rates", fee(1000, "USD", "free", "digital", { ...v3, freeStandardRate: 0.04 }) === 65)
  check("the version key charged is the stored one", calculateStorelibFeeWithConfig({ grossMinor: 1000, currency: "USD", sellerPlan: "free", productKind: "physical" }, v3).feeRuleVersion === "2026-10-storelib-v3-free-5pct")
  check("a stored physical rate is used when it is there", fee(1000, "USD", "free", "physical", { ...v3, freePhysicalStandardRate: 0.02 }) === 45)
  const broken = { ...v3, freePhysicalStandardRate: "3" as unknown as number, paidPhysicalStandardRate: 2, scalePhysicalMicroRate: Number.NaN }
  let threw = false
  let got: number[] = []
  try {
    got = [fee(1000, "USD", "free", "physical", broken), fee(1000, "USD", "paid", "physical", broken), fee(300, "USD", "scale", "physical", broken)]
  } catch {
    threw = true
  }
  check("a broken stored physical rate falls back too, and never throws", !threw && got.join() === [55, 40, 23].join(), got)
  check("  and validation names it", validateFeeConfig({ ...v3, paidPhysicalStandardRate: 2 }).some((i) => i.field === "paidPhysicalStandardRate"))
  /* loadActiveFeeConfig with a database whose active version is the old one. */
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "1", version_key: "2026-10-storelib-v3-free-5pct", status: "active", effective_at: "", created_at: "", created_by: "", config: old, change_summary: null }, error: null }) }) }) }) }
  clearActiveFeeConfigCache()
  const loaded = await loadActiveFeeConfig(db)
  clearActiveFeeConfigCache()
  check("loaded from the database, it charges a physical sale the code's physical rate", loaded.source === "database" && fee(1000, "USD", "paid", "physical", loaded.config) === 40 && fee(1000, "USD", "paid", "digital", loaded.config) === 55)
  const part = read("supabase/sql/run-now/476_physical_card_rates.sql")
  check("run-now part 476 writes this version once, with the code's physical rates", part.includes("'2026-11-storelib-v5-physical-rates'") && /'freePhysicalStandardRate', 0\.03, 'freePhysicalMicroRate', 0\.0925, 'paidPhysicalStandardRate', 0\.015, 'paidPhysicalMicroRate', 0\.0775, 'scalePhysicalStandardRate', 0\.015, 'scalePhysicalMicroRate', 0\.0775/.test(part) && /IF EXISTS \(SELECT 1 FROM public\.storelib_fee_rule_versions WHERE version_key = '2026-11-storelib-v5-physical-rates'\) THEN .*RETURN; END IF;/.test(part))
  check("  and its migration copy is the same file", read("supabase/migrations/20271476_physical_card_rates.sql") === part)
  const after = read("supabase/sql/run-now/99_check_after.sql")
  check("  the check after has its column, before the one that stays last", after.indexOf("as p476_physical_card_rates") > 0 && after.indexOf("as p476_physical_card_rates") < after.indexOf("as p465_onepage_drafts_owner_only") && /as p465_onepage_drafts_owner_only;\s*$/.test(after))
}

console.log("\n4. The card lines and the comparison")
{
  const lines = publicPlanLines()
  const rate = (id: "free" | "growth" | "pro") => lines[id].find((l) => l.icon === "rate")!
  check("Free: Card rates: 5% + $0.25, with 3% + $0.25 physical", rate("free").text === "Card rates: 5% + $0.25" && rate("free").detail === "3% + $0.25 on physical products", rate("free"))
  check("Grow: Lower card rates: 3% + $0.25, with 1.5% + $0.25 physical", rate("growth").text === "Lower card rates: 3% + $0.25" && rate("growth").detail === "1.5% + $0.25 on physical products", rate("growth"))
  check("Pro: one rate for both, no detail", rate("pro").text === "Lowest card rates: 1.5% + $0.25" && rate("pro").detail === undefined && sameRateForBothKinds("pro") && !sameRateForBothKinds("free"))
  check("no card gains a line: six each, at most MAX_PLAN_LINES", (["free", "growth", "pro"] as const).every((id) => lines[id].length === 6 && lines[id].length <= MAX_PLAN_LINES), (["free", "growth", "pro"] as const).map((id) => lines[id].length))
  check("as one sentence", planLineText(rate("free")) === "Card rates: 5% + $0.25, 3% + $0.25 on physical products")
  check("written from the fee rules, never typed", cardRateLabel("free", "physical") === "3% + $0.25" && cardRateLabel("growth", "physical") === "1.5% + $0.25" && getFeeDescription("growth") === "3% + $0.25 per sale" && getFeeDescription("growth", "physical") === "1.5% + $0.25 per sale")
  const cards = read("components/billing/plan-cards.tsx")
  check("the card draws the detail on the same line, muted and kept whole", /data-plan-line-detail=""/.test(cards) && /whitespace-nowrap/.test(cards) && /tt\(line\.detail\)/.test(cards))
  const selling = planComparison()[0].rows
  const dig = selling.find((r) => r.label === "Fee per digital sale")
  const phy = selling.find((r) => r.label === "Fee per physical sale")
  check("the comparison lists digital and physical per plan", !!dig && !!phy && dig.free === "5% + $0.25" && dig.pro === "3% + $0.25" && dig.scale === "1.5% + $0.25" && phy!.free === "3% + $0.25" && phy!.pro === "1.5% + $0.25" && phy!.scale === "1.5% + $0.25", { dig, phy })
  const fees = planQuestions().find((q) => q.q === "What fees are taken from a sale?")!.a
  check("the fee question names both kinds on every plan", /Digital products: 5% \+ \$0\.25 on Free, 3% \+ \$0\.25 on Grow, 1\.5% \+ \$0\.25 on Pro\. Products that ship: 3% \+ \$0\.25 on Free, 1\.5% \+ \$0\.25 on Grow, 1\.5% \+ \$0\.25 on Pro\./.test(fees), fees)
  check("facts carry the physical labels", PLANS.free.physicalFeeLabel === "3% + $0.25" && PLANS.pro.physicalFeeLabel === "1.5% + $0.25" && saleBreakdown(1000, "free", "USD", "physical").storelibFeeCents === 55)
}

console.log("\n5. Grow is $14, and both Grow prices are Grow")
{
  check("PRO_PRICE_CENTS is 1400, written $14", PRO_PRICE_CENTS === 1400 && formatPlanPrice(PRO_PRICE_CENTS) === "$14")
  check("the cards say $0, $14, $99", OFFERED_PLANS.map((p) => p.price).join() === "$0,$14,$99")
  const grow = OFFERED_PLANS.find((p) => p.id === "growth")!
  check("yearly is $11 a month, $132 a year, 21% less, and still not on sale", PRO_YEARLY_MONTHLY_CENTS === 1100 && PRO_YEARLY_TOTAL_CENTS === 13200 && YEARLY_SAVING_PERCENT === 21 && pricedFor(grow, "yearly").price === "$11", pricedFor(grow, "yearly"))
  check("a stored plan row still at $29 is read at $14", withCodePrice({ id: "growth", price_cents: 2900 }).price_cents === 1400 && withCodePrice({ id: "pro", price_cents: 9900 }).price_cents === 9900)

  const env = { PRICE_GROWTH_MONTHLY: "price_NEW14", PRICE_GROWTH_MONTHLY_LEGACY: "price_OLDER, price_OLD29b" }
  check("the new price is the checkout's", growthPriceId(env) === "price_NEW14")
  check("every Grow price is known", growthPriceIds(env).join() === ["price_NEW14", "price_OLDER", "price_OLD29b", LEGACY_GROWTH_PRICE_ID].join())
  check("the old ones are what the migration moves", legacyGrowthPriceIds(env).join() === ["price_OLDER", "price_OLD29b", LEGACY_GROWTH_PRICE_ID].join())
  check("both read as growth", planFromPriceId("price_NEW14", env) === "growth" && planFromPriceId(LEGACY_GROWTH_PRICE_ID, env) === "growth" && planFromPriceId("price_OLDER", env) === "growth")
  check("Pro is still pro, an unknown price is nobody's", planFromPriceId("price_1SzBXSBYevnBVyznYjXfOOXX", env) === "pro" && planFromPriceId("price_other", env) === null)
  check("with no env the old price is still Grow", growthPriceId({}) === LEGACY_GROWTH_PRICE_ID && planFromPriceId(LEGACY_GROWTH_PRICE_ID, {}) === "growth")
  const saved = { a: process.env.PRICE_GROWTH_MONTHLY, b: process.env.PRICE_GROWTH_MONTHLY_LEGACY }
  process.env.PRICE_GROWTH_MONTHLY = "price_NEW14"
  delete process.env.PRICE_GROWTH_MONTHLY_LEGACY
  check("the webhook's reading: a subscription on either price is growth", paidPlanFromPrice("price_NEW14") === "growth" && paidPlanFromPrice(LEGACY_GROWTH_PRICE_ID) === "growth" && paidPlanFromSubscription({ id: "sub_1", status: "active", customer: "cus_1", items: { data: [{ price: { id: "price_NEW14" } }] } }) === "growth" && paidPlanFromSubscription({ id: "sub_2", status: "active", customer: "cus_2", items: { data: [{ price: { id: LEGACY_GROWTH_PRICE_ID } }] } }) === "growth")
  if (saved.a === undefined) delete process.env.PRICE_GROWTH_MONTHLY
  else process.env.PRICE_GROWTH_MONTHLY = saved.a
  if (saved.b !== undefined) process.env.PRICE_GROWTH_MONTHLY_LEGACY = saved.b

  const p14 = { unit_amount: 1400, currency: "usd", recurring: { interval: "month", interval_count: 1 }, active: true }
  check("the guard takes only $14.00 a month in dollars", priceChargesShownGrow(p14) && !priceChargesShownGrow({ ...p14, unit_amount: 2900 }) && !priceChargesShownGrow({ ...p14, currency: "eur" }) && !priceChargesShownGrow({ ...p14, recurring: { interval: "year" } }) && !priceChargesShownGrow(null))
  clearGrowPriceCheck()
  const stub = (amount: number) => ({ prices: { retrieve: async () => ({ ...p14, unit_amount: amount }) } })
  const quiet = console.error
  console.error = () => {}
  const old29 = await growPriceMatchesShown(stub(2900), "price_A")
  clearGrowPriceCheck()
  const new14 = await growPriceMatchesShown(stub(1400), "price_B")
  clearGrowPriceCheck()
  const failing = await growPriceMatchesShown({ prices: { retrieve: async () => Promise.reject(new Error("down")) } }, "price_C")
  console.error = quiet
  check("a checkout is refused while the Grow price is $29, allowed at $14, refused when Stripe cannot say", !old29 && new14 && !failing)
  const create = read("app/api/billing/subscription/create/route.ts")
  const change = read("app/api/billing/subscription/change/route.ts")
  check("checkout and the upgrade both ask before charging", /planId === "growth" && !\(await growPriceMatchesShown\(stripe, stripePriceId\)\)/.test(create) && create.indexOf("growPriceMatchesShown(") < create.indexOf("stripe.checkout.sessions.create") && /newPlanId === "growth" && !\(await growPriceMatchesShown\(stripe, stripePriceId\)\)/.test(change))
}

console.log("\n6. scripts/migrate-grow-price.mjs")
{
  const { migrateGrowPrice } = (await import(pathToFileURL(join(root, "scripts/migrate-grow-price.mjs")).href)) as {
    migrateGrowPrice: (o: { stripe: unknown; oldPriceIds: string[]; newPriceId: string; dryRun?: boolean; log?: (l: string) => void }) => Promise<{ seen: number; moved: number; wouldMove: number; alreadyMoved: number; skipped: unknown[]; failed: { subscription: string | null }[] }>
  }
  const OLD = LEGACY_GROWTH_PRICE_ID
  const NEW = "price_NEW14"
  type Sub = { id: string; status: string; customer: string; schedule?: string | null; metadata: Record<string, string>; items: { data: { id: string; price: { id: string } }[] } }
  const make = (n: number, status = "active"): Sub => ({ id: `sub_${status}_${n}`, status, customer: `cus_${n}`, metadata: { plan_id: "growth", creator_id: `c${n}` }, items: { data: [{ id: `si_${status}_${n}`, price: { id: OLD } }] } })
  function stubStripe(subs: Sub[], opts: { failOn?: string; newAmount?: number } = {}) {
    const calls = { list: [] as Record<string, unknown>[], update: [] as { id: string; params: Record<string, any>; options: Record<string, unknown> }[] }
    return {
      calls,
      prices: { retrieve: async (id: string) => ({ id, unit_amount: id === NEW ? opts.newAmount ?? 1400 : 2900, currency: "usd", recurring: { interval: "month", interval_count: 1 }, active: true, product: "prod_grow" }) },
      subscriptions: {
        list: async (params: { price: string; status: string; limit: number; starting_after?: string }) => {
          calls.list.push(params)
          const all = subs.filter((s) => s.status === params.status && s.items.data.some((i) => i.price.id === params.price))
          const from = params.starting_after ? all.findIndex((s) => s.id === params.starting_after) + 1 : 0
          const page = all.slice(from, from + 2)
          return { data: page, has_more: from + 2 < all.length }
        },
        update: async (id: string, params: Record<string, any>, options: Record<string, unknown>) => {
          calls.update.push({ id, params, options })
          if (id === opts.failOn) throw new Error("card_declined")
          const sub = subs.find((s) => s.id === id)!
          sub.items.data = sub.items.data.map((i) => (i.id === params.items[0].id ? { ...i, price: { id: params.items[0].price } } : i))
          return sub
        },
      },
    }
  }
  const subs = [make(1), make(2), make(3), make(4, "trialing"), { ...make(5), schedule: "sub_sched_5" }, { ...make(6), items: { data: [{ id: "si_6", price: { id: NEW } }] } }]
  const s1 = stubStripe(subs)
  const logs: string[] = []
  const dry = await migrateGrowPrice({ stripe: s1, oldPriceIds: [OLD], newPriceId: NEW, dryRun: true, log: (l) => logs.push(l) })
  check("dry run: changes nothing", s1.calls.update.length === 0)
  check("  reads every page of active and trialing subscriptions on the old price", s1.calls.list.some((c) => c.status === "active" && c.starting_after) && s1.calls.list.some((c) => c.status === "trialing") && s1.calls.list.every((c) => c.price === OLD && c.limit === 100), s1.calls.list)
  check("  says what it would move, skips a scheduled one, ignores one already moved", dry.wouldMove === 4 && dry.seen === 5 && dry.skipped.length === 1 && dry.failed.length === 0, dry)
  check("  prints each change and a summary", logs.filter((l) => l.startsWith("would move ")).length === 4 && logs.some((l) => /^DRY RUN\. 5 subscription\(s\) found/.test(l)), logs)

  const s2 = stubStripe(subs, { failOn: "sub_active_2" })
  const run = await migrateGrowPrice({ stripe: s2, oldPriceIds: [OLD], newPriceId: NEW, log: () => {} })
  const u = s2.calls.update[0]
  check("a real run moves each item with no proration and the same billing date", u.params.proration_behavior === "none" && u.params.billing_cycle_anchor === "unchanged" && u.params.items[0].price === NEW && u.params.items[0].id === "si_active_1" && u.params.metadata.plan_id === "growth" && typeof u.options.idempotencyKey === "string", u)
  check("  a failure is reported and the rest go on", run.moved === 3 && run.failed.length === 1 && run.failed[0].subscription === "sub_active_2", run)
  const s3 = stubStripe(subs)
  const again = await migrateGrowPrice({ stripe: s3, oldPriceIds: [OLD], newPriceId: NEW, log: () => {} })
  check("run again, it moves only what is left (the one that failed)", again.moved === 1 && s3.calls.update.length === 1 && s3.calls.update[0].id === "sub_active_2", again)
  const s4 = stubStripe([make(9)], { newAmount: 2900 })
  let refused = ""
  try {
    await migrateGrowPrice({ stripe: s4, oldPriceIds: [OLD], newPriceId: NEW, log: () => {} })
  } catch (e) {
    refused = (e as Error).message
  }
  check("a new price that is not $14.00 a month moves nobody", /not \$14\.00 a month/.test(refused) && s4.calls.update.length === 0 && s4.calls.list.length === 0, refused)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
