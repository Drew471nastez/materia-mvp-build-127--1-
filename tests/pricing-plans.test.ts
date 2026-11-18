/**
 * ===========================================================================
 *  THREE PLANS: FREE, PRO AT $29 A MONTH, SCALE AT $99 A MONTH
 * ===========================================================================
 * Wave 13: the owner re-opened the $99 plan (internal id `pro`) under the name
 * Scale. The sections below that held "two plans only" now hold three, and
 * each change says so where it is made.
 *
 * Pricing was three plans (Free, Growth at $29, Professional at $99) and is now
 * two. What is offered as "Pro" is the internal plan id `growth`, because that
 * is the only $29 price in Stripe. The $99 plan (id `pro`) is not sold any
 * more, but the people on it are still billed, still charged its fee and still
 * see it on their billing screens.
 *
 * So this suite holds four things in place:
 *
 *   1. Only Free and Pro are offered, on every surface that offers a plan.
 *   2. Choosing Pro sends planId "growth" to checkout, never "pro".
 *   3. Every line on the Pro card is something `growth` really gets, read from
 *      the tables that enforce it rather than restated here.
 *   4. The old plan still resolves wherever money or limits are decided.
 *
 * The pixels (two cards, equal heights, touch sizes, contrast) are measured by
 * scripts/check-pricing-cards.mjs in a real browser; the Monthly and Yearly
 * switch frame by frame, the Billing tab's order and the pictures' brightness
 * and grain by scripts/check-billing-tab.mjs.
 */
import { readCode, readSource } from "./_source"
import {
  OFFERED_PLANS,
  OFFERED_PLAN_IDS,
  PRO_CHECKOUT_PLAN_ID,
  SCALE_CHECKOUT_PLAN_ID,
  SCALE_PRICE_CENTS,
  PRO_PRICE_CENTS,
  planDisplayName,
  planHighlights,
  planComparison,
  formatPlanPrice,
  withPlanLabel,
  pricedFor,
  PRO_YEARLY_MONTHLY_CENTS,
  PRO_YEARLY_TOTAL_CENTS,
  YEARLY_BILLING_LIVE,
  YEARLY_SAVING_PERCENT,
} from "@/lib/billing/plans"
import { getFeePreview, formatFeePercent, getFeeDescription, computeApplicationFee, calculateFeeWithPlan, toStorelibPlan } from "@/lib/billing/fee-calculator"
import { calculateStorelibFeeWithConfig } from "@/lib/payments/fees/engine"
import { codeDefaultFeeConfig } from "@/lib/payments/fees/defaults"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS, formatBytes } from "@/lib/storage/plans"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? `: ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`) }
}

/** Surfaces whose only job is offering plans. Nothing of the old line-up may appear in their code. */
const OFFER_SURFACES = [
  "lib/billing/plans.ts",
  "components/billing/plan-cards.tsx",
  "components/marketing/pricing-section.tsx",
  "app/(storelib)/(marketing)/pricing/pricing-client.tsx",
  "app/(storelib)/(marketing)/pricing/loading.tsx",
  "components/app/billing/upgrade-page-client.tsx",
  "components/app/billing/billing-page-client.tsx",
  "components/billing/compare-plans.tsx",
  "components/billing/plan-faq.tsx",
]

/**
 * Other screens that mention plans among other things. These can use the word
 * "Growth" for something else (a blog category, "LinkedIn Growth"), so they are
 * checked for the exact old phrases instead.
 */
const MENTION_SURFACES: Record<string, string[]> = {
  "components/onepage/tabs/settings-tab.tsx": ["Growth", "Professional", "$99", "29.90"],
  "components/app/dashboard-client.tsx": ["Growth plan"],
  "components/app/settings-form-new.tsx": ["Growth &amp; Pro"],
  "components/app/creator-onboarding-modal.tsx": ["Get Growth", "Get Professional", "unlock more"],
  "components/onepage/onepage-editor.tsx": ["Upgrade to Growth", "Upgrade to unlock"],
  "components/marketing/faq-section.tsx": ["Growth", "Professional"],
  "components/marketing/faq-page-client.tsx": ["Growth and Professional", "zero platform fees", "unlock"],
  "lib/help/articles.ts": ["\"Growth\"", "\"Professional\"", "$99", "Growth and Professional"],
  /* Changed on purpose (r40): the legal text moved to components/legal, shared by the pages and a OnePage's sheet. */
  "components/legal/terms-body.tsx": ["Growth Plan", "Professional Plan"],
  "components/legal/privacy-body.tsx": ["Growth plan", "Professional plan", "Growth, or Professional"],
  "app/(storelib)/(marketing)/blog/[slug]/page.tsx": ["Growth Plan", "$19/mo", "$49/mo", "3% on Growth"],
}

function main() {
  console.log("\nExactly three plans are offered")

  /* Changed on purpose (wave 13): the owner re-opened the $99 plan, id `pro`, sold as Scale. */
  check("the offered ids are free, growth and pro, in that order", JSON.stringify(OFFERED_PLAN_IDS) === '["free","growth","pro"]', JSON.stringify(OFFERED_PLAN_IDS))
  check("the cards are drawn from those same three", OFFERED_PLANS.map((p) => p.id).join() === OFFERED_PLAN_IDS.join())
  /* Changed on purpose (pricing round 5): the $29 plan is named Grow and the $99 plan Pro; the ids are unchanged. */
  check("named Free, Grow and Pro", OFFERED_PLANS.map((p) => p.name).join() === "Free,Grow,Pro", OFFERED_PLANS.map((p) => p.name).join())
  check("priced $0, $29 and $99", OFFERED_PLANS.map((p) => p.price).join() === "$0,$29,$99", OFFERED_PLANS.map((p) => p.price).join())
  check("Scale checks out as the existing pro plan, at the $99 the Stripe price charges", SCALE_CHECKOUT_PLAN_ID === "pro" && SCALE_PRICE_CENTS === 9900 && OFFERED_PLANS[2].period === "/month")
  check("Pro is $29 a month, not $29.90", PRO_PRICE_CENTS === 2900 && formatPlanPrice(PRO_PRICE_CENTS) === "$29")
  check("and says so per month", OFFERED_PLANS[1].period === "/month")
  check("Pro checks out as the growth plan", PRO_CHECKOUT_PLAN_ID === "growth")

  console.log("\nEvery Pro line is something growth really gets")

  const pro = OFFERED_PLANS[1].features
  const free = OFFERED_PLANS[0].features
  /* The cards are in US dollars, so the rate a $10 sale pays is read in USD (the platform default is RON, where $10 worth is under the small-order line). */
  const growthFee = formatFeePercent(getFeePreview(1000, "growth", "USD").feePercent).replace(".0%", "%")
  const freeFee = formatFeePercent(getFeePreview(1000, "free", "USD").feePercent).replace(".0%", "%")
  check("the Pro card starts with Everything in Free", pro[0] === "Everything in Free", pro[0])
  check(`the Pro fee line, next, is growth's charged rate (${growthFee})`, pro[1].startsWith(`${growthFee} + $0.25 per sale`), pro[1])
  check(`the Free fee line is free's charged rate (${freeFee})`, free[0].startsWith(`${freeFee} + $0.25 per sale`), free[0])
  check("the $0.25 is the fixed fee the calculator adds", getFeePreview(1000, "growth", "USD").feeFixedCents === 25)

  const g = siteLimits("growth")
  check("own domain is claimed only because growth has it", pro.includes("Your own domain") === g.customDomain)
  check("no branding is claimed only because growth has it", pro.includes("No Storelib branding") === g.removeBranding)
  check("the website line matches the site limits", pro.includes(`${g.maxSites} websites, ${g.maxPages} pages each`))
  check("the AI edit line matches the site limits", pro.includes(`${g.aiEditsPerMonth} AI edits a month`))
  check(
    "the storage line matches the storage limits",
    pro.includes(`${formatBytes(PLAN_LIMITS.growth.storageQuotaBytes)} of file storage`),
    formatBytes(PLAN_LIMITS.growth.storageQuotaBytes),
  )
  check("Free does not claim a domain", !free.includes("Your own domain") && !siteLimits("free").customDomain)
  check(
    "the free storage line matches too",
    free.includes(`${formatBytes(PLAN_LIMITS.free.storageQuotaBytes)} of file storage`),
  )

  /**
   * Things the old cards promised that nothing in the code delivers, or that
   * only the $99 plan gets. None may come back on a card that sells growth.
   */
  const notGrowth = [/priority/i, /emails?\s*\//i, /api access/i, /white.?label/i, /custom code/i, /shopify/i, /1\.5%/, /advanced analytics/i, /physical/i]
  for (const line of [...pro, ...free]) {
    const bad = notGrowth.find((re) => re.test(line))
    check(`"${line}" is a real entitlement`, !bad, bad ? `matches ${bad}` : undefined)
  }

  /**
   * EVERY LINE IS ONE OF THESE. A line that comes from a table is checked
   * against the table above; the others name something every plan has, and
   * each is tied here to the code that provides it. A new line with nothing
   * behind it fails, rather than slipping onto a card.
   */
  const exists = (file: string) => {
    try {
      return readSource(file).length > 0
    } catch {
      return false
    }
  }
  const products = readCode("app/(storelib)/app/products/new/product-editor.tsx")
  const analytics = readCode("app/(storelib)/app/analytics/page.tsx") + readCode("app/(storelib)/app/analytics/analytics-client.tsx")
  const fromTables = new Set([
    getFeeDescription("free"),
    getFeeDescription("growth"),
    "Your own domain",
    "No Storelib branding",
    `${g.maxSites} websites, ${g.maxPages} pages each`,
    `${formatBytes(PLAN_LIMITS.free.storageQuotaBytes)} of file storage`,
    `${formatBytes(PLAN_LIMITS.growth.storageQuotaBytes)} of file storage`,
    `${g.aiEditsPerMonth} AI edits a month`,
  ])
  const namedClaims: [string, boolean][] = [
    ["Everything in Free", true],
    /* Digital files and courses are the two product types there are, and no plan caps how many. */
    ["Unlimited digital products and courses", /"digital" \| "course"/.test(products) && !/maxProducts|max_products|productLimit/.test(readCode("lib/billing/plans.ts") + readCode("lib/storage/plans.ts"))],
    [`A creator page and ${siteLimits("free").maxSites} websites`, exists("app/(storelib)/creator-page/page.tsx") && siteLimits("free").maxSites > 0],
    ["Payouts to your bank through Stripe", /stripe_account_id/.test(readCode("lib/checkout/fulfil-payment.ts")) && exists("app/(storelib)/app/payouts/payouts-client.tsx")],
    ["Email your buyers and subscribers", exists("app/(storelib)/app/emails/page.tsx") && exists("app/api/email/send/route.ts")],
    ["Sales and visitor analytics", /\S/.test(analytics) && !/subscription_plan_id|userPlan|isPro\b/.test(analytics)],
    ["Verified badge", true],
  ]
  for (const [line, backed] of namedClaims) check(`"${line}" is backed by the code`, backed)
  const named = new Set(namedClaims.map(([line]) => line))
  for (const line of [...pro, ...free, ...OFFERED_PLANS[0].excluded]) {
    check(`"${line}" is a table line or a backed claim`, fromTables.has(line) || named.has(line))
  }

  console.log("\nThe two cards compare line for line, and say nothing that is not so")
  const [freePlan, proPlan] = OFFERED_PLANS
  check(
    "the same number of lines on both cards",
    freePlan.features.length + freePlan.excluded.length === proPlan.features.length + proPlan.excluded.length,
    `${freePlan.features.length + freePlan.excluded.length} and ${proPlan.features.length + proPlan.excluded.length}`,
  )
  check("what Free is shown without is its own domain, which it lacks and Pro has", freePlan.excluded.join() === "Your own domain" && !siteLimits("free").customDomain && g.customDomain)
  check("Pro claims nothing as missing", proPlan.excluded.length === 0)
  /* "Start here" and "For growing stores" read as if Free were somewhere to stay.
     Changed on purpose (wave 13): with Scale above it, Pro no longer has "Everything included"; it is the plan for your own brand. */
  check("the labels are plain facts: Basics on Free, Your own brand on Pro, Most room on Scale", freePlan.pill === "Basics" && proPlan.pill === "Your own brand" && OFFERED_PLANS[2].pill === "Most room")
  check("under the price: no fee, or per month", freePlan.priceNote === "No monthly fee" && proPlan.priceNote === "per month")
  check(
    "Free's small print: no card, because Free never reaches a checkout",
    freePlan.note === "No card needed" && /return \{ label: DEFAULT_CTA\[id\], href: "\/signup" \}/.test(readCode("components/marketing/pricing-section.tsx")),
  )
  check(
    "Pro's small print: monthly, and cancelled from Billing, which a route does",
    proPlan.note === "Billed monthly. Cancel anytime." && proPlan.period === "/month" && exists("app/api/billing/subscription/cancel/route.ts"),
  )
  const cardWords = OFFERED_PLANS.flatMap((p) => [p.pill, p.priceNote, p.summary, p.note, ...p.features, ...p.excluded]).join(" | ")
  for (const invented of [/save \$/i, /one.?time/i, /no subscription/i, /most (chosen|popular)/i, /best value/i, /% off/i, /\blimited\b/i]) {
    check(`no invented offer on the cards (${invented})`, !invented.test(cardWords), cardWords.match(invented)?.[0])
  }

  /**
   * The verified badge is gated in the OnePage editor, not in a table. Read
   * the gate itself: growth must be one of the plans it lets through.
   */
  const editor = readCode("components/onepage/onepage-editor.tsx")
  check(
    "the verified badge gate lets growth through",
    /verified_badge_enabled/.test(editor) && /* Changed on purpose (OnePage production audit, ED-1): a plan that could not be read lets the save through; the route asks the plan itself. */ /const userHasPro = !planConfirmed \|\| userPlan === "growth" \|\| userPlan === "pro"/.test(editor),
  )

  console.log("\nThe offer surfaces show nothing of the old line-up")

  for (const file of OFFER_SURFACES) {
    const code = readCode(file)
    for (const word of ["$99", "Growth", "Professional", "29.90", "Most Popular", "Recommended"]) {
      check(`${file}: no "${word}"`, !code.includes(word))
    }
  }
  for (const [file, phrases] of Object.entries(MENTION_SURFACES)) {
    const code = readCode(file)
    const found = phrases.filter((p) => code.includes(p))
    check(`${file}: none of the old plan phrases`, found.length === 0, found.join(", "))
  }

  console.log("\nEvery offer surface draws the same two cards")

  for (const file of [
    "components/marketing/pricing-section.tsx",
    "components/app/billing/upgrade-page-client.tsx",
    "components/app/billing/billing-page-client.tsx",
  ]) {
    const code = readCode(file)
    check(`${file} renders PlanCards`, /<PlanCards\b/.test(code))
    check(`${file} does not map over every plan row`, !/plans\.map\(\(plan: any\)/.test(code))
  }
  const cards = readCode("components/billing/plan-cards.tsx")
  check("the cards come from OFFERED_PLANS", /OFFERED_PLANS\.map\(/.test(cards))
  /* Changed on purpose (wave 13): three plans, three across from md up, in a wider row. */
  check("three columns from md up, one on a phone, in a row up to 1180px", /md:grid md:grid-cols-3/.test(cards) && /max-md:overflow-x-auto/.test(cards) && /max-w-\[1180px\]/.test(cards)) /* Changed on purpose (landing round 15): on a phone a sideways row with scroll snap, not one column. */
  /* The headers are the owner's pictures, not a CSS gradient, and nothing floats over a card.
     The one gradient allowed is the fade laid over the bottom of the picture, which the owner asked for. */
  /* Changed on purpose (landing round 15): the owner asked for a faint light crossing a button on hover, a white to clear band on the button (.plan-shine), not a gradient on a card. */
  const gradientLines = cards.split("\n").filter((l) => /bg-gradient|linear-gradient/.test(l) && !/^\.plan-shine::before\{/.test(l))
  /* Added (wave 13): the owner asked for the checks simpler and lighter: thin, not bold, not in filled circles. */
  /* Changed on purpose (pricing round 5): each line has a small thin line icon, as in the owner's reference. */
  check("the plan lines carry thin line icons, not filled circles", /strokeWidth=\{1\.5\} aria-hidden="true" \/>/.test(cards) && !/rounded-full \$\{look/.test(cards) && !/strokeWidth=\{3\.25\}/.test(cards))
  check("no glow or floated badge on the cards", !/radial-gradient|glow|btn-shine|absolute -top-3/.test(cards))
  /* Changed on purpose (pricing round 5): the cards have no cover picture, so no gradient at all. */
  check("no gradients on the cards", gradientLines.length === 0, gradientLines.join(" | "))
  /* Safari draws a backdrop blur but not the mask that fades it, so a blurred band ended in a hard edge across the picture. */
  check("no backdrop blur over the pictures", !/backdrop-blur/.test(cards))
  /* Grain in overlay all but vanished over the dark pictures, and a blended layer is one a phone composites against the picture under every animation. */
  /* Changed on purpose (pricing round 5): no cover picture, so no grain over one. */
  check("no film grain and nothing blended", !/feTurbulence|data-plan-grain/.test(cards) && !/mix-blend/.test(cards))
  check("monthly and yearly are both laid out, so switching never resizes a card", /<TextSwap value=\{interval\} items=\{\{ monthly: monthly\.price, yearly: yearly\.price \}\} \/>/.test(cards) && !/key=\{priced\.price\}/.test(cards))
  /* Changed on purpose (pricing round 5): no header pictures; the top of a card is a soft grey panel. */
  check("no header pictures to fetch: a grey panel instead", !/next\/image/.test(cards) && /data-plan-panel=""/.test(cards))
  /* Storelib's own address for the pictures (lib/storage/media-url.ts), a host next.config lets the optimizer fetch under /media/. */
  /* Changed on purpose (pricing round 5): no pictures, so nothing for the optimizer to fetch. */
  check("no picture hosts on the cards", (cards.match(/https:\/\/storelib\.com\/media\//g) ?? []).length === 0 && !/supabase\.co/.test(cards))
  check("the billing tab no longer upsells from Pro to the $99 plan", !/nextUpgradePlan/.test(readCode("components/app/billing/billing-page-client.tsx")))

  console.log("\nChoosing Pro checks out as growth")

  const section = readCode("components/marketing/pricing-section.tsx")
  check("the pricing section starts checkout with PRO_CHECKOUT_PLAN_ID", /onPlanSelect\(PRO_CHECKOUT_PLAN_ID\)/.test(section))
  check("and never names the pro id", !/["']pro["']/.test(section))
  const client = readCode("app/(storelib)/(marketing)/pricing/pricing-client.tsx")
  check("/pricing posts the plan it was handed as planId", /body: JSON\.stringify\(\{\s*planId,/.test(client))
  /* Changed on purpose (wave 13): /pricing checks out Scale too, typed to the two paid ids through their constants. */
  check("and is typed to the two paid ids, named by their constants", /type CheckoutPlanId = PaidCheckoutPlanId/.test(client) && /export type PaidCheckoutPlanId = typeof PRO_CHECKOUT_PLAN_ID \| typeof SCALE_CHECKOUT_PLAN_ID/.test(section) && !/["']pro["']/.test(client))
  /* Changed on purpose (pricing round 5): the $99 plan's button reads Get Pro. */
  check("the pricing section starts Pro's checkout with SCALE_CHECKOUT_PLAN_ID", /onPlanSelect\(SCALE_CHECKOUT_PLAN_ID\)/.test(section) && /\[SCALE_CHECKOUT_PLAN_ID\]: "Get Pro"/.test(section))
  const upgrade = readCode("components/app/billing/upgrade-page-client.tsx")
  /* Changed on purpose (wave 13): the upgrade page offers Scale (id pro) as well. */
  check("the upgrade page offers free, growth and pro", /actionFor\("free"\)/.test(upgrade) && /actionFor\("growth"\)/.test(upgrade) && /actionFor\("pro"\)/.test(upgrade))
  check("the Billing tab offers the same three", /actions=\{\{ free: actionFor\("free"\), growth: actionFor\("growth"\), pro: actionFor\("pro"\) \}\}/.test(readCode("components/app/billing/billing-page-client.tsx")))
  check("and posts that id to checkout", /body: JSON\.stringify\(\{\s*planId,/.test(upgrade))
  const onboarding = readCode("components/app/creator-onboarding-modal.tsx")
  /* Changed on purpose (wave 13): onboarding offers Scale too. */
  /* Changed on purpose (pricing round 5): Grow and Pro. */
  check("onboarding labels Free, Grow and Pro", /growth: (tt\()?"Get Grow"/.test(onboarding) && /pro: (tt\()?"Get Pro"/.test(onboarding))

  console.log("\nThe $99 plan, sold again as Scale, still works for the people already on it")

  /* Changed on purpose (wave 13): owner set Scale to 1.5% + $0.25. Until now the fee engine had one paid rate and the $99 plan paid Pro's 3% (2a8b4df92). In dollars, as this suite is written. */
  {
    const usd = (cents: number, plan: "free" | "growth" | "pro") => getFeePreview(cents, plan, "USD")
    check("Scale (pro) is charged 1.5% + $0.25 on a $10 sale: 40c", usd(1000, "pro").feePercent === 0.015 && usd(1000, "pro").feeFixedCents === 25 && usd(1000, "pro").platformFeeCents === 40 && usd(1000, "pro").planId === "pro", JSON.stringify(usd(1000, "pro")))
    check("Pro (growth) stays 3% + $0.25 on a $10 sale: 55c", usd(1000, "growth").feePercent === 0.03 && usd(1000, "growth").feeFixedCents === 25 && usd(1000, "growth").platformFeeCents === 55)
    check("Free stays 5% + $0.25 on a $10 sale: 75c", usd(1000, "free").feePercent === 0.05 && usd(1000, "free").feeFixedCents === 25 && usd(1000, "free").platformFeeCents === 75)
    check("Scale's small orders pay 7.75% and no fixed fee, meeting the standard fee at $4.00 (31c either side)", usd(100, "pro").feePercent === 0.0775 && usd(100, "pro").feeFixedCents === 0 && usd(399, "pro").platformFeeCents === 31 && usd(400, "pro").platformFeeCents === 31)
    check("the old id professional is charged as Scale", usd(1000, "professional" as "pro").feePercent === 0.015)
    /* Every path a seller's fee is worked out on: the pure fee, the one for a stored plan row, the application fee, and the engine's tier for each id. */
    check("computeApplicationFee: free 75c, growth 55c, pro 40c on $10", computeApplicationFee({ unitAmount: 1000, sellerPlan: "free", currency: "USD" }) === 75 && computeApplicationFee({ unitAmount: 1000, sellerPlan: "growth", currency: "USD" }) === 55 && computeApplicationFee({ unitAmount: 1000, sellerPlan: "pro", currency: "USD" }) === 40)
    check("calculateFeeWithPlan reads the id, not the row's fee_percent", calculateFeeWithPlan(1000, { id: "pro", name: "x", fee_percent: 0.5, fee_fixed_cents: 0 }, "USD").platformFeeCents === 40 && calculateFeeWithPlan(1000, { id: "growth", name: "x", fee_percent: 0.5, fee_fixed_cents: 0 }, "USD").platformFeeCents === 55)
    check("the plan ids map to the engine's tiers: free, paid, scale", toStorelibPlan("free") === "free" && toStorelibPlan("growth") === "paid" && toStorelibPlan("pro") === "scale")
    check("the engine charges a stored fee version without Scale rates Scale's code rate", calculateStorelibFeeWithConfig({ grossMinor: 1000, currency: "USD", sellerPlan: "scale" }, { ...codeDefaultFeeConfig(), scaleStandardRate: undefined, scaleMicroRate: undefined }).totalStorelibFeeMinor === 40)
    check("the engine honours a version's own Scale rate", calculateStorelibFeeWithConfig({ grossMinor: 1000, currency: "USD", sellerPlan: "scale" }, { ...codeDefaultFeeConfig(), scaleStandardRate: 0.02 }).totalStorelibFeeMinor === 45)
    check("getFeeDescription: Free 5%, Pro 3%, Scale 1.5%, each + $0.25 per sale", getFeeDescription("free") === "5% + $0.25 per sale" && getFeeDescription("growth") === "3% + $0.25 per sale" && getFeeDescription("pro") === "1.5% + $0.25 per sale")
    check("the Scale card and the comparison table say 1.5% + $0.25", OFFERED_PLANS[2].features[1] === "1.5% + $0.25 per sale" && planComparison()[0].rows[0].scale === "1.5% + $0.25 per sale" && planComparison()[0].rows[0].pro === "3% + $0.25 per sale")
    check("checkout's fee for a stored plan goes through the same mapping", /sellerPlan: toStorelibPlan\(effectivePlan\)/.test(readCode("lib/billing/fee-calculator.ts")) && /calculatePlatformFee\(amountCents, creatorId, admin, currency, config\)/.test(readCode("lib/billing/platform-fee-server.ts")))
    check("the payouts screen names a Scale fee", /\["free", "paid", "scale"\] as const/.test(readCode("app/(storelib)/app/payouts/payouts-client.tsx")))
    check("the admin simulator charges pro as Scale", /body\.plan === "scale" \|\| body\.plan === "pro" \? "scale"/.test(readCode("app/api/admin/payments/simulate/route.ts")))
  }
  check("its site limits are untouched", siteLimits("pro").customCode === true && siteLimits("pro").maxSites === 10)
  /* Changed on purpose (wave 13): the $99 plan is named Scale everywhere, its existing subscribers included. */
  /* Changed on purpose (pricing round 5): the $99 plan is named Pro. */
  check("its name on billing screens is Pro", planDisplayName("pro") === "Pro" && planDisplayName("professional") === "Pro")
  {
    const scale = OFFERED_PLANS[2]
    const sl = siteLimits("pro")
    /* Changed on purpose (pricing round 5): it adds to Grow. */
    check("the Pro card (id pro) starts with Everything in Grow, then its own fee from the fee table", scale.features[0] === "Everything in Grow" && scale.features[1] === getFeeDescription("pro"), scale.features.join(" | "))
    check("the Scale card's websites, storage and AI lines come from its tables", scale.features.includes(`${sl.maxSites} websites, ${sl.maxPages} pages each`) && scale.features.includes(`${formatBytes(PLAN_LIMITS.pro.storageQuotaBytes)} of file storage`) && scale.features.includes(`${sl.aiEditsPerMonth} AI edits a month`))
    check("the Scale card claims nothing the code does not enforce (no custom code, Shopify, API or priority lines)", !scale.features.some((l) => /custom code|shopify|api access|priority|white.?label/i.test(l)))
    check("Scale has no yearly price, so yearly shows its monthly price and says yearly opens soon", pricedFor(scale, "yearly").price === "$99" && /opens soon/.test(pricedFor(scale, "yearly").note))
    /* Changed on purpose (pricing round 5): Pro, $99. */
    check("the admin plan picker names it Pro", /\{ id: "pro", label: "Pro, \$99" \}/.test(readCode("lib/billing/plan-override.ts")))
  }
  /* Changed on purpose (pricing round 5): growth is named Grow. */
  check("growth is named Grow", planDisplayName("growth") === "Grow" && withPlanLabel({ id: "growth", name: "Growth" })!.name === "Grow")
  /* Changed on purpose: the card's fee line is the plan's own rate, read from
     the fee table, and only "per sale" (the under $4 tier is in the terms). */
  const proRate = getFeeDescription("pro")
  check("its highlights describe its own fee", planHighlights("pro")[0] === proRate && /^\d+(\.\d+)?% \+ \$0\.25 per sale$/.test(proRate), `${planHighlights("pro")[0]} vs ${proRate}`)
  for (const route of ["app/api/billing/subscription/create/route.ts", "app/api/billing/subscription/change/route.ts"]) {
    check(`${route} still maps pro to its price`, /if \(planId === "pro"\) return PRICE_PRO/.test(readCode(route)))
  }
  for (const file of ["lib/billing/overview.ts", "app/(storelib)/app/settings/billing/upgrade/page.tsx", "app/api/billing/subscription/route.ts"]) {
    const code = readCode(file)
    check(`${file}: the pro fallback is still there`, /id: "pro",[\s\S]{0,40}price_cents: 9900/.test(code))
    /* Added (wave 13): the stored fallback's fee is the engine's Scale rate, so the Billing tab says what checkout charges. */
    check(`${file}: the pro fallback's fee is SCALE_STANDARD_RATE`, /price_cents: 9900,\s*billing_period: "month",\s*fee_percent: SCALE_STANDARD_RATE,/.test(code))
    check(`${file}: growth's fallback is 2900, not 2990`, /id: "growth",[\s\S]{0,40}price_cents: 2900/.test(code) && !/2990/.test(code))
  }

  console.log("\nMonthly or yearly")
  {
    const pro = OFFERED_PLANS.find((p) => p.id === PRO_CHECKOUT_PLAN_ID)!
    const free = OFFERED_PLANS.find((p) => p.id === "free")!
    const y = pricedFor(pro, "yearly")
    check("yearly Pro is $22 a month, $264 a year, 24% less than monthly", y.price === "$22" && PRO_YEARLY_TOTAL_CENTS === 26400 && PRO_YEARLY_MONTHLY_CENTS * 12 === 26400 && YEARLY_SAVING_PERCENT === 24, JSON.stringify(y))
    check("monthly is the plan as it always was", JSON.stringify(pricedFor(pro, "monthly")) === JSON.stringify({ price: pro.price, priceNote: pro.priceNote, note: pro.note }))
    check("Free is the same either way", pricedFor(free, "yearly").price === "$0")
    const cards = readCode("components/billing/plan-cards.tsx")
    check("until a yearly Stripe price exists, yearly is shown but never sold: Pro's button says it opens soon",
      YEARLY_BILLING_LIVE === false && /opens soon/.test(y.note) && /held \? \{ label: "Yearly opens soon", settled: true \}/.test(cards))
    check("one pill switches it for every place the cards are drawn", /role="radiogroup"/.test(cards) && /<IntervalSwitch value=\{interval\}/.test(cards))
  }

  console.log("\nThe new copy reads like Storelib")

  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  for (const file of ["lib/billing/plans.ts", "components/billing/plan-cards.tsx", "components/marketing/pricing-section.tsx", "components/ui/text-swap.tsx"]) {
    /* The words are about copy. `transform` is also the CSS property the switch moves on, which is not copy. */
    const src = readSource(file).replace(/\btransform(?=\s*:|-none|\s+\$\{)/g, "")
    check(`${file}: no banned words`, !banned.test(src), src.match(banned)?.[0])
    check(`${file}: no em dashes, in copy or comments`, !src.includes("—"))
  }
  for (const line of [...pro, ...free, ...OFFERED_PLANS.flatMap((p) => [p.summary, p.pill, p.priceNote, p.note, ...p.excluded])]) {
    check(`"${line}" has no banned word or em dash`, !banned.test(line) && !line.includes("—"))
  }

  console.log("\nThe Billing tab, the switch and the pictures")
  {
    const billing = readCode("components/app/billing/billing-page-client.tsx")
    const overview = billing.indexOf(">Subscription Overview</h2>")
    const history = billing.indexOf(">Billing History</h2>")
    const plansAt = billing.indexOf("<PricingTiers")
    /* Changed on purpose (round U): the owner's order is the plans first, then the overview, then the history. */
    check("the Billing tab reads Plans, then Subscription Overview, then Billing History", plansAt > 0 && overview > plansAt && history > overview, JSON.stringify({ overview, history, plansAt }))
    /* Changed on purpose (round R1): the owner asked for the left aligned "Plans" to go, for a centred header in the plans page's type. */
    check("the plans have a centred header in the plans page's type, handed to the cards' row",
      /data-plans-header=""/.test(billing) && /className="mx-auto max-w-\[560px\] pt-1 text-center/.test(billing) && /tracking-\[-0\.02em\] text-\[#1a1a2e\] sm:text-\[24px\]">Plans and pricing<\/h2>/.test(billing) && /\n\s*compact\n/.test(billing) && !/>Plans<\/h2>/.test(billing)
        /* Round 22: centred on a phone under the centred plans, on the left from 640. */
        && /<h2 className="mb-4 text-center text-\[17px\] font-bold text-\[#1a1a2e\] sm:text-left">Subscription Overview<\/h2>/.test(billing)
        && /<h2 className="text-\[17px\] font-bold text-\[#1a1a2e\]">Billing History<\/h2>/.test(billing))
    check("inside Settings the tab adds no second column, gutter or clip of its own", /<div className=\{embedded \? "" : "max-w-4xl mx-auto/.test(billing))

    /* Changed on purpose: beside the heading the pill wrapped flush left on a phone and the cards stretched the section's width. */
    /* Changed on purpose (pricing round 5): one pill row, drawn whether or not there is a heading; the cards sit on their grey ground. */
    check("with a heading, the heading has its own row and the pill is centred over the cards",
      /<div data-plan-heading-row="" className="mb-4">\{heading\}<\/div>/.test(cards) && (cards.match(/<div data-plan-interval-row="" className="flex justify-center mb-5 sm:mb-6">/g) ?? []).length === 1)
    /* Changed on purpose (pricing round 5): one pill size, restyled to the cards (a white track, a grey thumb), each option 36px tall. */
    check("the pill is one size, 36px options with 13.5px words",
      /h-9 cursor-pointer/.test(cards) && /text-\[13\.5px\] font-medium/.test(cards))
    check("without one, the pill stays centred over the cards (upgrade page, landing page, onboarding)", /<div data-plan-interval-row="" className="flex justify-center mb-5 sm:mb-6">/.test(cards))

    /* The switch: nothing is remounted, nothing is laid out again, and only position and opacity move. */
    check("nothing in the cards is keyed to the interval, so the switch remounts nothing", !/key=\{(interval|value|`\$\{interval)/.test(cards))
    check("a button that differs by interval is two buttons in one cell, each kept for good, not a link swapped for a button",
      /monthlyAction === yearlyAction \?/.test(cards) && /<TextSwap\s+fill\s+lift="[^"]+"\s+value=\{interval\}/.test(cards))
    check("the thumb slides by its own width on a transform, one column wide by construction",
      /transform: `translate3d\(\$\{yearly \? "100%" : "0"\}, 0, 0\)`/.test(cards) && /grid-cols-2/.test(cards) && !/transition-\[(left|width|translate)\]/.test(cards))
    /*
      "When switching monthly/yearly it should animate the text change smoothly. It should NOT try to change
      the Free plan price since it doesn't change, only Pro changes." One shared swap (components/ui/text-swap):
      a line that reads the same either way is plain text, the part two versions share holds still, and the
      rest crossfades, old and new on the same curve so they always add up to one line, with a short roll.
    */
    const swap = readCode("components/ui/text-swap.tsx")
    /* Changed on purpose (pricing round 5): the price and its period swap; the description is the same either way. */
    check("every changing line on a card goes through the shared TextSwap, and plan-cards has no swap of its own",
      /import \{ SWAP_EASE, SWAP_MS, TextSwap \} from "@\/components\/ui\/text-swap"/.test(cards) && !/function Morph\b/.test(cards) && (cards.match(/<TextSwap\b/g) ?? []).length === 4) /* Changed on purpose (onboarding round 3): the fourth is Pay monthly / Pay yearly beside the onboarding's switch. */
    check("a line that is the same either way (Free) is drawn as plain text, with nothing to fade or move",
      /keys\.every\(\(k\) => items\[k\] === first\)\) return <>\{first\}<\/>/.test(swap))
    check("only the part that changes swaps: a shared start stays as plain text, never split inside a word",
      /prefix = texts\[0\]\.slice\(0, n\)/.test(swap) && /\\p\{L\}/.test(swap) && /return prefix \? <>\{prefix\}\{swap\}<\/> : swap/.test(swap))
    check("old and new fade on the same curve and time (a true crossfade, no blank frame) and roll on translate",
      /export const SWAP_MS = 260/.test(swap) && /export const SWAP_FADE_MS = 200/.test(swap)
        && /transition: `opacity \$\{SWAP_FADE_MS\}ms \$\{FADE_EASE\}, translate \$\{SWAP_MS\}ms \$\{SWAP_EASE\}`/.test(swap)
        && !/opacity \d+ms linear \d+ms/.test(swap))
    check("the pill's thumb moves on the same time and curve as the lines", /const SWITCH_MS = SWAP_MS/.test(cards) && /const SWITCH_EASE = SWAP_EASE/.test(cards))
    check("the words in the pill ease their colour with the thumb, not at once",
      /style=\{\{ transition: `color \$\{SWITCH_MS\}ms \$\{SWITCH_EASE\}` \}\}/.test(cards.slice(cards.indexOf("function IntervalSwitch"))))
    check("with reduced motion the lines, the words and the thumb do not animate",
      /motion-reduce:!transition-none motion-reduce:!translate-none/.test(swap) && /data-interval-thumb=""[\s\S]{0,400}motion-reduce:!transition-none/.test(cards)
        && /z-\[1\] inline-flex h-9 cursor-pointer motion-reduce:!transition-none/.test(cards))

    /* One source for the art. */
    /* Changed on purpose (pricing round 5): no art on the cards any more; the only colour is the purple of the middle card's button. */
    check("no pictures, dimming or grain on the cards",
      !/PLAN_ART|filter: look\.filter/.test(cards) && /export const PLAN_PURPLE = "#7c3aed"/.test(cards))
    const elsewhere = ["components/app/billing/billing-page-client.tsx", "components/app/billing/upgrade-page-client.tsx", "components/marketing/pricing-section.tsx", "components/app/creator-onboarding-modal.tsx", "app/(storelib)/(marketing)/pricing/pricing-client.tsx"]
      .filter((f) => /ChatGPT%20Image%20Sep%2025|PLAN_GRAIN|feTurbulence/.test(readCode(f)))
    check("no other offer surface draws its own picture or grain", elsewhere.length === 0, elsewhere.join(", "))
    const free = /free: \{[\s\S]*?filter: "([^"]+)"/.exec(cards)?.[1]
    const growth = /growth: \{[\s\S]*?filter: "([^"]+)"/.exec(cards)?.[1]
    // Changed on purpose (landing round 8): the owner asked for more contrast in the pictures; lifted and above 1.
    // Changed on purpose (landing round 9): the owner asked for the covers a step darker with a little more contrast.
    /* Changed on purpose (pricing round 5): no covers, so no picture filters. */
    check("no cover filters left", free === undefined, free)
    check("none on Grow either", growth === undefined, growth)
  }

  console.log("\nThe probe that measures the cards is on disk")
  check("scripts/check-billing-tab.mjs exists", (() => { try { return readSource("scripts/check-billing-tab.mjs").length > 0 } catch { return false } })())
  check("scripts/check-pricing-cards.mjs exists", (() => { try { return readSource("scripts/check-pricing-cards.mjs").length > 0 } catch { return false } })())

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
