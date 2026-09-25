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
  EXAMPLE_SALE_CENTS,
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
  check(`the Pro fee line is growth's charged rate (${growthFee})`, pro[0] === `${growthFee} + $0.25 per sale`, pro[0])
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
   * THE SALE EACH CARD WORKS THROUGH comes from the table that charges it.
   * A card that says "you keep $48.25 of $50" has to be the fee calculator's
   * own answer, or it is a number somebody typed.
   */
  for (const plan of OFFERED_PLANS) {
    const preview = getFeePreview(EXAMPLE_SALE_CENTS, plan.id)
    check(`${plan.name}: what you keep of $50 is the calculator's (${preview.sellerReceivesCents})`, plan.keepsCents === preview.sellerReceivesCents, String(plan.keepsCents))
    check(`${plan.name}: the fee line is the first highlight`, plan.fee === plan.features[0], plan.fee)
    check(`${plan.name}: says who it is for`, plan.audience.length > 10 && plan.audience.length <= 70, plan.audience)
  }
  check("the example sale is over the $3.00 threshold, so it carries the $0.25", EXAMPLE_SALE_CENTS >= 300 && getFeePreview(EXAMPLE_SALE_CENTS, "free").feeFixedCents === 25)
  check("Pro keeps more of the same sale", OFFERED_PLANS[1].keepsCents > OFFERED_PLANS[0].keepsCents)

  /**
   * Things the old cards promised that nothing in the code delivers, or that
   * only the $99 plan gets. None may come back on a card that sells growth.
   */
  const notGrowth = [/priority/i, /emails?\s*\//i, /api access/i, /white.?label/i, /custom code/i, /shopify/i, /1\.5%/, /analytics/i]
  for (const line of [...pro, ...free]) {
    const bad = notGrowth.find((re) => re.test(line))
    check(`"${line}" is a real entitlement`, !bad, bad ? `matches ${bad}` : undefined)
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
  check("no gradient, glow or badge on the cards", !/gradient|glow|btn-shine|absolute -top-3/.test(cards))
  check("Pro on Storelib's near-black, Free on white, one flat colour each", /border-\[#1a1a2e\] bg-\[#1a1a2e\]/.test(cards) && /border-\[#e5e7eb\] bg-white/.test(cards))
  check("each card works a sale through", /<SaleExample plan=\{plan\}/.test(cards) && /plan\.keepsCents - free\.keepsCents/.test(cards))
  check("the plan somebody is on is marked in line, not floated", /action\.current &&/.test(cards) && /aria-current=\{action\.current \|\| undefined\}/.test(cards))
  check("the upgrade and billing screens say which plan is current", /current: isCurrentPlan,/.test(readCode("components/app/billing/upgrade-page-client.tsx")) && /current: isCurrentPlan,/.test(readCode("components/app/billing/billing-page-client.tsx")))
  check("the upgrade page leads with Pro on a phone for somebody on Free", /lead=\{currentPlanId === "free" \? "growth" : undefined\}/.test(readCode("components/app/billing/upgrade-page-client.tsx")) && /order-first md:order-none/.test(cards))
  check("a loading button keeps its place and says so", /Loader2 className="h-4 w-4 animate-spin"/.test(cards) && /Processing/.test(cards) && /aria-busy=\{action\.loading \|\| undefined\}/.test(cards))
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
  for (const line of [...pro, ...free, ...OFFERED_PLANS.map((p) => p.summary), ...OFFERED_PLANS.map((p) => p.audience)]) {
    check(`"${line}" has no banned word or em dash`, !banned.test(line) && !line.includes("—"))
  }

  console.log("\nThe plans page itself")
  {
    const page = readCode("components/app/billing/upgrade-page-client.tsx")
    check("the mark is a fixed square that cannot be squeezed", /data-upgrade-logo=""/.test(page) && /h-7 w-7 shrink-0 -translate-x-1\/2 rounded-\[7px\] object-contain/.test(page))
    check("the bar is solid white, not see-through", /data-upgrade-bar="" className="sticky top-0 z-10 border-b border-\[#e5e7eb\]\/60 bg-white"/.test(page) && !/backdrop-blur/.test(page))
    check("the page paints its own grey, so the layer's white top only shows in a pull", /data-upgrade-page="" className="min-h-full bg-\[#f8f9fa\]"/.test(page))
    const layer = readCode("components/app/page-layer.tsx")
    check("a white topped layer shows white past its top and grey past its bottom", /inset === "white" && "bg-\[linear-gradient\(#ffffff_50%,#f8f9fa_50%\)\]"/.test(layer))
    check("scripts/check-upgrade-page.mjs reads the pixel a pull reveals", /pulled\.top !== "rgb\(255, 255, 255\)"/.test(readSource("scripts/check-upgrade-page.mjs")))
  }

  console.log("\nThe probe that measures the cards is on disk")
  check("scripts/check-pricing-cards.mjs exists", (() => { try { return readSource("scripts/check-pricing-cards.mjs").length > 0 } catch { return false } })())

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
