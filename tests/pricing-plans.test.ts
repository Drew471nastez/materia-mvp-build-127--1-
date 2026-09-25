/**
 * ===========================================================================
 *  TWO PLANS: FREE, AND PRO AT $29 A MONTH
 * ===========================================================================
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
 * scripts/check-pricing-cards.mjs in a real browser.
 */
import { readCode, readSource } from "./_source"
import {
  OFFERED_PLANS,
  OFFERED_PLAN_IDS,
  PRO_CHECKOUT_PLAN_ID,
  PRO_PRICE_CENTS,
  planDisplayName,
  planHighlights,
  formatPlanPrice,
  withPlanLabel,
} from "@/lib/billing/plans"
import { getFeePreview, formatFeePercent } from "@/lib/billing/fee-calculator"
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
  "app/(marketing)/pricing/pricing-client.tsx",
  "app/(marketing)/pricing/loading.tsx",
  "components/app/billing/upgrade-page-client.tsx",
  "components/app/billing/billing-page-client.tsx",
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
  "app/terms/page.tsx": ["Growth Plan", "Professional Plan"],
  "app/privacy/page.tsx": ["Growth plan", "Professional plan", "Growth, or Professional"],
  "app/(marketing)/blog/[slug]/page.tsx": ["Growth Plan", "$19/mo", "$49/mo", "3% on Growth"],
}

function main() {
  console.log("\nExactly two plans are offered")

  check("the offered ids are free and growth, in that order", JSON.stringify(OFFERED_PLAN_IDS) === '["free","growth"]', JSON.stringify(OFFERED_PLAN_IDS))
  check("the cards are drawn from those same two", OFFERED_PLANS.map((p) => p.id).join() === OFFERED_PLAN_IDS.join())
  check("named Free and Pro", OFFERED_PLANS.map((p) => p.name).join() === "Free,Pro", OFFERED_PLANS.map((p) => p.name).join())
  check("priced $0 and $29", OFFERED_PLANS.map((p) => p.price).join() === "$0,$29", OFFERED_PLANS.map((p) => p.price).join())
  check("Pro is $29 a month, not $29.90", PRO_PRICE_CENTS === 2900 && formatPlanPrice(PRO_PRICE_CENTS) === "$29")
  check("and says so per month", OFFERED_PLANS[1].period === "/month")
  check("Pro checks out as the growth plan", PRO_CHECKOUT_PLAN_ID === "growth")

  console.log("\nEvery Pro line is something growth really gets")

  const pro = OFFERED_PLANS[1].features
  const free = OFFERED_PLANS[0].features
  const growthFee = formatFeePercent(getFeePreview(1000, "growth").feePercent).replace(".0%", "%")
  const freeFee = formatFeePercent(getFeePreview(1000, "free").feePercent).replace(".0%", "%")
  check("the Pro card starts with Everything in Free", pro[0] === "Everything in Free", pro[0])
  check(`the Pro fee line, next, is growth's charged rate (${growthFee})`, pro[1] === `${growthFee} + $0.25 per sale`, pro[1])
  check(`the Free fee line is free's charged rate (${freeFee})`, free[0] === `${freeFee} + $0.25 per sale`, free[0])
  check("the $0.25 is the fixed fee the calculator adds", getFeePreview(1000, "growth").feeFixedCents === 25)

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
  const products = readCode("app/app/products/new/product-editor.tsx")
  const analytics = readCode("app/app/analytics/page.tsx") + readCode("app/app/analytics/analytics-client.tsx")
  const fromTables = new Set([
    `${freeFee} + $0.25 per sale`,
    `${growthFee} + $0.25 per sale`,
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
    [`A creator page and ${siteLimits("free").maxSites} websites`, exists("app/creator-page/page.tsx") && siteLimits("free").maxSites > 0],
    ["Payouts to your bank through Stripe", /stripe_account_id/.test(readCode("lib/checkout/fulfil-payment.ts")) && exists("app/app/payouts/payouts-client.tsx")],
    ["Email your buyers and subscribers", exists("app/app/emails/page.tsx") && exists("app/api/email/send/route.ts")],
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
  check("the labels are about who a plan is for", freePlan.pill === "Start here" && proPlan.pill === "For growing stores")
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
    /verified_badge_enabled/.test(editor) && /const userHasPro = userPlan === "growth" \|\| userPlan === "pro"/.test(editor),
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
  check("two columns from md up, one on a phone", /grid-cols-1 md:grid-cols-2/.test(cards))
  /* The headers are the owner's pictures, not a CSS gradient, and nothing floats over a card. */
  check("no CSS gradient, glow or floated badge on the cards", !/bg-gradient|linear-gradient|radial-gradient|glow|btn-shine|absolute -top-3/.test(cards))
  check("the header pictures go through next/image, sized to the card", /import Image from "next\/image"/.test(cards) && /<Image[\s\S]*?fill[\s\S]*?sizes=\{PLAN_PICTURE_SIZES\}/.test(cards) && /PLAN_PICTURE_SIZES = "\(min-width: 768px\) 440px, calc\(100vw - 32px\)"/.test(cards))
  check("both pictures are on the host next.config lets the optimizer fetch", (cards.match(/skgtqglupjcnfhfscink\.supabase\.co/g) ?? []).length === 1 && /hostname: 'skgtqglupjcnfhfscink\.supabase\.co'/.test(readSource("next.config.mjs")))
  check("the billing tab no longer upsells from Pro to the $99 plan", !/nextUpgradePlan/.test(readCode("components/app/billing/billing-page-client.tsx")))

  console.log("\nChoosing Pro checks out as growth")

  const section = readCode("components/marketing/pricing-section.tsx")
  check("the pricing section starts checkout with PRO_CHECKOUT_PLAN_ID", /onPlanSelect\(PRO_CHECKOUT_PLAN_ID\)/.test(section))
  check("and never names the pro id", !/["']pro["']/.test(section))
  const client = readCode("app/(marketing)/pricing/pricing-client.tsx")
  check("/pricing posts the plan it was handed as planId", /body: JSON\.stringify\(\{\s*planId,/.test(client))
  check("and is typed to the growth id only", /type CheckoutPlanId = typeof PRO_CHECKOUT_PLAN_ID/.test(client) && !/["']pro["']/.test(client))
  const upgrade = readCode("components/app/billing/upgrade-page-client.tsx")
  check("the upgrade page offers growth and free only", /actionFor\("free"\)/.test(upgrade) && /actionFor\("growth"\)/.test(upgrade) && !/actionFor\("pro"\)/.test(upgrade))
  check("and posts that id to checkout", /body: JSON\.stringify\(\{\s*planId,/.test(upgrade))
  const onboarding = readCode("components/app/creator-onboarding-modal.tsx")
  check("onboarding labels only Free and Pro", /growth: "Get Pro"/.test(onboarding) && !/pro: "Get/.test(onboarding))

  console.log("\nThe $99 plan still works for the people on it")

  check("its fee still resolves to 1.5%", getFeePreview(1000, "pro").feePercent === 0.015 && getFeePreview(1000, "pro").planId === "pro")
  check("its site limits are untouched", siteLimits("pro").customCode === true && siteLimits("pro").maxSites === 10)
  check("its name on billing screens is Pro", planDisplayName("pro") === "Pro" && planDisplayName("professional") === "Pro")
  check("growth is also named Pro", planDisplayName("growth") === "Pro" && withPlanLabel({ id: "growth", name: "Growth" })!.name === "Pro")
  check("its highlights describe its own fee", planHighlights("pro")[0] === "1.5% + $0.25 per sale", planHighlights("pro")[0])
  for (const route of ["app/api/billing/subscription/create/route.ts", "app/api/billing/subscription/change/route.ts"]) {
    check(`${route} still maps pro to its price`, /if \(planId === "pro"\) return PRICE_PRO/.test(readCode(route)))
  }
  for (const file of ["lib/billing/overview.ts", "app/app/settings/billing/upgrade/page.tsx", "app/api/billing/subscription/route.ts"]) {
    const code = readCode(file)
    check(`${file}: the pro fallback is still there`, /id: "pro",[\s\S]{0,40}price_cents: 9900/.test(code))
    check(`${file}: growth's fallback is 2900, not 2990`, /id: "growth",[\s\S]{0,40}price_cents: 2900/.test(code) && !/2990/.test(code))
  }

  console.log("\nThe new copy reads like Storelib")

  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  for (const file of ["lib/billing/plans.ts", "components/billing/plan-cards.tsx", "components/marketing/pricing-section.tsx"]) {
    const src = readSource(file)
    check(`${file}: no banned words`, !banned.test(src), src.match(banned)?.[0])
    check(`${file}: no em dashes, in copy or comments`, !src.includes("—"))
  }
  for (const line of [...pro, ...free, ...OFFERED_PLANS.flatMap((p) => [p.summary, p.pill, p.priceNote, p.note, ...p.excluded])]) {
    check(`"${line}" has no banned word or em dash`, !banned.test(line) && !line.includes("—"))
  }

  console.log("\nThe probe that measures the cards is on disk")
  check("scripts/check-pricing-cards.mjs exists", (() => { try { return readSource("scripts/check-pricing-cards.mjs").length > 0 } catch { return false } })())

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
