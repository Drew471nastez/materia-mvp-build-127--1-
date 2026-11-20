/**
 * ===========================================================================
 *  PRICING ROUND 5: THE PLAN CARDS DRAWN LIKE THE OWNER'S REFERENCE
 * ===========================================================================
 *   cards     three white cards on a light grey ground, each with a soft grey
 *             top panel (a pill with the plan's icon and name, the price with
 *             "/month", one line of at most seven words, a full width rounded
 *             button), the plan's lines under it with a small line icon each;
 *             the middle card raised with a soft shadow; a wide "Contact
 *             sales" bar under them on the public pages and the upgrade page.
 *   middle    Grow (id `growth`, $29), its button filled in Storelib purple;
 *             the side cards' buttons outlined.
 *   names     Free, Grow ($29) and Pro ($99) wherever a person reads them;
 *             the ids, the Stripe prices and the checkout ids unchanged.
 *   lines     five at most, "card rates" in place of "fees", no storage
 *             numbers, one shared set on every surface.
 *   ollie     "Build a store that looks like you": Ollie Brandt's picture is
 *             a real 160 x 160 webp, replaced in place.
 *
 * Run: node scripts/run-push-tests.mjs (or the single-suite runner).
 */
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FEATURED_PLAN_ID, PLAN_PURPLE, PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { MAX_PLAN_LINES, publicPlanLines } from "@/components/marketing/pricing-lines"
import {
  OFFERED_PLAN_IDS,
  OFFERED_PLANS,
  PRO_CHECKOUT_PLAN_ID,
  PRO_PRICE_CENTS,
  SCALE_CHECKOUT_PLAN_ID,
  SCALE_PRICE_CENTS,
  planDisplayName,
  type OfferedPlanId,
} from "@/lib/billing/plans"
import { getFeeDescription } from "@/lib/billing/fee-calculator"
import { ASSIGNABLE_PLANS } from "@/lib/billing/plan-override"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform|passive income)\b|—/i

const actions: Record<OfferedPlanId, PlanCardAction> = {
  free: { label: "Start free", href: "/signup" },
  growth: { label: "Get Grow", href: "/signup" },
  pro: { label: "Get Pro", href: "/signup" },
}
const html = renderToStaticMarkup(createElement(PlanCards, { actions, contactSales: true }))
const compact = renderToStaticMarkup(createElement(PlanCards, { actions, compact: true }))
const cardHtml = (id: string) => {
  const start = html.indexOf(`data-plan-card="${id}"`)
  const next = html.indexOf("data-plan-card=", start + 20)
  return html.slice(start, next < 0 ? undefined : next)
}

console.log("\n── Three plans, Grow in the middle ──")
{
  const order = [...html.matchAll(/data-plan-card="([a-z]+)"/g)].map((m) => m[1])
  check("three cards: free, growth, pro, in that order", order.join() === "free,growth,pro", order)
  check("the middle card is Grow (id growth)", FEATURED_PLAN_ID === "growth" && order[1] === FEATURED_PLAN_ID)
  check("only the middle card is raised", (html.match(/data-plan-featured=""/g) ?? []).length === 1 && /data-plan-card="growth" data-plan-featured=""/.test(html))
  // Changed on purpose (landing round 13): the owner: "Get Grow" is a solid Storelib purple button, no white pill and no round arrow. The side cards keep the earnings section's dark button with its arrow.
  // Changed on purpose (landing round 14): Get Grow carries a white disc with a purple arrow at its right (tests/home-landing-r14-pricing.test.ts).
  check("Grow's button is solid Storelib purple, with the white disc and purple arrow", PLAN_PURPLE === "#7c3aed" && /data-plan-button="purple"/.test(cardHtml("growth")) && /class="[^"]*bg-\[#7c3aed\][^"]*text-white/.test(cardHtml("growth")) && /data-plan-arrow="disc"/.test(cardHtml("growth")))
  check("the side cards' buttons are dark with an arrow, never purple", ["free", "pro"].every((id) => /data-plan-button="dark"[^>]*>|class="[^"]*bg-\[#0f0e13\][^"]*"[^>]*data-plan-button="dark"/.test(cardHtml(id)) && /<path d="M4 10h12M11 5l5 5-5 5"><\/path>/.test(cardHtml(id)) && !/bg-\[#7c3aed\]/.test(cardHtml(id))))
  check("the hero's primary button is the same purple", /background: #7c3aed/.test(read("components/marketing/hero.tsx")))
  check("no grey ground behind the cards any more", (html.match(/data-plan-ground=""/g) ?? []).length === 1 && !/data-plan-ground="" class="[^"]*bg-/.test(html)) // Changed on purpose (landing round 12): the owner: no light grey background behind the cards.
  check("each card has a top panel with a pill (white since landing round 12)", (html.match(/data-plan-panel=""/g) ?? []).length === 3 && (html.match(/data-plan-pill=""/g) ?? []).length === 3)
  /* Changed on purpose (landing round 15): on a phone the cards are a sideways row with scroll snap, a card and a fifth of the next in view; three columns from md up. */
  check("a sideways snapping row on a phone, three from md up", /max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto/.test(html) && /md:grid md:grid-cols-3/.test(html) && (html.match(/max-md:w-\[82%\] max-md:shrink-0 max-md:snap-start/g) ?? []).length === 3)
  check("the price reads with /month beside it", (html.match(/\/month/g) ?? []).length >= 3)
  check("the price one step heavier than the reference (semibold), not bold", /data-plan-price=""[^>]*>\s*<span class="[^"]*font-semibold/.test(html) && !/data-plan-price=""[^>]*>\s*<span class="[^"]*font-(bold|extrabold)/.test(html))
}

console.log("\n── Names: Free, Grow, Pro ──")
{
  check("named Free, Grow and Pro", OFFERED_PLANS.map((p) => p.name).join() === "Free,Grow,Pro", OFFERED_PLANS.map((p) => p.name))
  /* Changed on purpose (pricing: Grow $14, physical rates). */
  check("priced $0, $14 and $99", OFFERED_PLANS.map((p) => p.price).join() === "$0,$14,$99")
  check("the pills name them", ["Free", "Grow", "Pro"].every((n) => new RegExp(`<h3[^>]*>${n}</h3>`).test(html)))
  check("planDisplayName: growth is Grow, pro (and professional) is Pro", planDisplayName("growth") === "Grow" && planDisplayName("pro") === "Pro" && planDisplayName("professional") === "Pro" && planDisplayName("free") === "Free")
  /* Changed on purpose (pricing: Grow $14, physical rates). */
  check("the admin picker names them Grow and Pro", ASSIGNABLE_PLANS.map((p) => p.label).join() === "Free,Grow, $14,Pro, $99")
  check("no Scale left on a plan surface", !/\bScale\b/.test(html + compact) && !OFFERED_PLANS.some((p) => /\bScale\b/.test([p.name, p.summary, ...p.features].join(" "))))
  const fees = read("lib/billing/fee-calculator.ts")
  check("the fee calculator's names are Grow and Pro", /growth: "Grow",\s*pro: "Pro",/.test(fees))
  for (const f of ["lib/billing/overview.ts", "app/api/billing/subscription/route.ts", "app/(storelib)/app/settings/billing/upgrade/page.tsx"]) {
    const s = read(f)
    check(`${f}: the fallback rows read Grow and Pro`, /id: "growth",[\s\S]{0,140}name: "Grow",/.test(s) && /id: "pro",\s*name: "Pro",/.test(s) && !/name: "Scale"/.test(s))
  }
}

console.log("\n── Internal ids and prices unchanged ──")
{
  check("offered ids are free, growth, pro", OFFERED_PLAN_IDS.join() === "free,growth,pro")
  check("Grow checks out as growth, Pro as pro", PRO_CHECKOUT_PLAN_ID === "growth" && SCALE_CHECKOUT_PLAN_ID === "pro")
  /* Changed on purpose (pricing: Grow $14, physical rates). */
  check("the Stripe prices: 1400 and 9900 cents", PRO_PRICE_CENTS === 1400 && SCALE_PRICE_CENTS === 9900)
  const section = read("components/marketing/pricing-section.tsx")
  check("the pricing section still starts checkout with the constants", /onPlanSelect\(PRO_CHECKOUT_PLAN_ID\)/.test(section) && /onPlanSelect\(SCALE_CHECKOUT_PLAN_ID\)/.test(section))
  check("its buttons read Get Grow and Get Pro", /\[PRO_CHECKOUT_PLAN_ID\]: "Get Grow"/.test(section) && /\[SCALE_CHECKOUT_PLAN_ID\]: "Get Pro"/.test(section))
  for (const route of ["app/api/billing/checkout/route.ts", "app/api/billing/subscription/route.ts"]) {
    let s = ""
    try { s = read(route) } catch { continue }
    check(`${route} still maps the pro id to its price`, !/planId === "scale"/.test(s))
  }
}

console.log("\n── Lines and description ──")
{
  const lines = publicPlanLines()
  for (const plan of OFFERED_PLANS) {
    const l = lines[plan.id]
    check(`${plan.name}: at most ${MAX_PLAN_LINES} lines`, MAX_PLAN_LINES === 6 && l.length > 0 && l.length <= 6, l.length) // Changed on purpose (landing round 14): six lines a card.
    check(`${plan.name}: every line drawn with its icon`, (cardHtml(plan.id).match(/data-plan-line="/g) ?? []).length === l.length && (cardHtml(plan.id).match(/<li[^>]*><svg/g) ?? []).length === l.length)
    const words = plan.summary.trim().split(/\s+/).length
    check(`${plan.name}: the description is 5 to 7 words ("${plan.summary}")`, words >= 5 && words <= 7, words)
  }
  const all = Object.values(lines).flat().map((l) => l.text)
  /* Changed on purpose (pricing tooltip): the lines say "Rates from 3% + $0.25" so each stays one row on a phone; "Card rates" is the title of the tip behind the circle. */
  check("card rates, never fees", all.some((t) => /\brates (from|: )/i.test(t)) && /tt\("Card rates"\)/.test(read("components/billing/card-rates-tip.tsx")) && !all.some((t) => /\bfees?\b/i.test(t)))
  /* Changed on purpose (pricing tooltip): each rate line starts from the plan's lowest rate, Free's and Grow's on a physical sale. */
  check("each rate is the fee table's", lines.free.some((l) => l.text === `Rates from ${getFeeDescription("free", "physical").replace(" per sale", "")}`) && lines.growth.some((l) => l.text === `Rates from ${getFeeDescription("growth", "physical").replace(" per sale", "")}`) && lines.pro.some((l) => l.text === `Lowest rates: ${getFeeDescription("pro").replace(" per sale", "")}`))
  check("no storage numbers or technical limits", !all.some((t) => /\b\d+\s*(GB|MB|TB)\b|pages each|\d+\s*AI edits|file storage/i.test(t)), all)
  check("Grow's card adds to Free, Pro's to Grow", lines.growth[0].text === "Everything in Free" && lines.pro[0].text === "Everything in Grow")
  check("no banned words or em dashes in the lines or descriptions", ![...all, ...OFFERED_PLANS.map((p) => p.summary)].some((t) => BANNED.test(t)))
  /* Changed on purpose (pricing: Grow $14, physical rates). */
  /* Changed on purpose (pricing tooltip): a rate is drawn whole ("5%\u00a0+\u00a0$0.25", components/billing/plan-cards keepRateWhole) in one run with its info circle, so the line's text is read without the tags; no second row. */
  const drawn = compact.replace(/<[^>]+>/g, "").replace(/\u00a0/g, " ")
  check("one set of lines on every surface: the compact cards draw the same", Object.values(lines).flat().every((l) => drawn.includes(l.text.replace(/&/g, "&amp;"))) && !/data-plan-line-detail/.test(compact))
  check("every card's rate line carries its info circle", (compact.match(/data-plan-info=""/g) ?? []).length === 3)
}

console.log("\n── Contact sales ──")
{
  check("the bar under the cards, typos fixed", /data-plan-contact=""/.test(html) && html.includes("Want a unique solution to meet your needs?") && />Contact sales</.test(html))
  check("it opens the contact form on Plan and billing", /href="\/help\/contact\?about=billing"/.test(html))
  check("not on the compact cards (onboarding, Billing tab, OnePage settings)", !/data-plan-contact/.test(compact))
  check("the home page, /pricing and the upgrade page ask for it", /contactSales( aside=\{cardsAside\})? \/>/.test(read("components/marketing/pricing-section.tsx")) /* Changed on purpose (landing round 14): /pricing hands the cards its Compare all features link. */ && /contactSales\n/.test(read("components/app/billing/upgrade-page-client.tsx")))
}

console.log("\n── Monthly and yearly kept ──")
{
  const cards = read("components/billing/plan-cards.tsx")
  check("the pill is still there, restyled to the cards", /role="radiogroup"/.test(html) && /data-interval-thumb=""/.test(html) && /bg-white p-1 ring-1/.test(cards))
  check("the home page still hides it", /hideInterval=\{editorial\}/.test(read("components/marketing/pricing-section.tsx")))
}

console.log("\n── Ollie Brandt's picture ──")
{
  const file = "public/home/everything/stores/ollie-av.webp"
  const buf = readFileSync(join(root, file))
  check("a webp, replaced in place under the same name", buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP" && /ollie-av\.webp/.test(read("components/marketing/home/everything-in-one-place.tsx")))
  const vp8 = buf.indexOf("VP8 ")
  const w = vp8 > 0 ? buf.readUInt16LE(vp8 + 14) & 0x3fff : 0
  const h = vp8 > 0 ? buf.readUInt16LE(vp8 + 16) & 0x3fff : 0
  check("160 x 160", w === 160 && h === 160, { w, h })
  check("small", statSync(join(root, file)).size < 40_000)
}

console.log("\n── Copy and the push suite ──")
{
  for (const f of ["components/billing/plan-cards.tsx", "components/marketing/pricing-lines.ts"]) {
    const s = read(f)
    check(`${f}: no em dash`, !s.includes("—"))
  }
  check("registered in the push suite, after pricing-plans", /"tests\/pricing-plans\.test\.ts",\s*"tests\/pricing-cards-r5\.test\.ts",/.test(read("scripts/run-push-tests.mjs")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
