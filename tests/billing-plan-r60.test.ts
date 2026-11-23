/**
 * ===========================================================================
 *  SETTINGS > PLAN DRAWS /pricing'S CARDS, AND THE PLANS PAGE'S LOGO (round 60)
 * ===========================================================================
 * The owner:
 *   1. Settings > Plan's cards were cramped, "Downgrade to Fr..." was cut,
 *      and they did not look like /pricing's. Draw /pricing's cards as
 *      /pricing does, at /pricing's card width, a sideways row where three
 *      do not fit, never squashed, no label cut off; the billing actions and
 *      logic exactly as they were.
 *   2. On the plans page (/app/settings/billing/upgrade) the logo moves from
 *      the centre to the left, on the page content's edge, with Billing after
 *      it and X at the right, clear of the safe areas.
 *
 * scripts/check-billing-plan-r60.mjs measures it in Chromium at 360, 390, 768
 * and 1280 (card widths beside /pricing's, every label's room, the current
 * plan's fill, sideways scroll, the logo's edge, 47px side insets).
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readCode, readSource } from "./_source"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import type { OfferedPlanId } from "@/lib/billing/plans"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
function section(name: string) {
  console.log(`\n${name}`)
}

const BILLING = "components/app/billing/billing-page-client.tsx"
const UPGRADE = "components/app/billing/upgrade-page-client.tsx"
const CARDS = "components/billing/plan-cards.tsx"
const SECTION = "components/marketing/pricing-section.tsx"
const billing = readCode(BILLING)
const upgrade = readCode(UPGRADE)
const cards = readCode(CARDS)
const pricingSection = readCode(SECTION)

const tiers = billing.slice(billing.indexOf("function PricingTiers"))

const actions: Record<OfferedPlanId, PlanCardAction> = {
  free: { label: "Downgrade to Free", onClick: () => {} },
  growth: { label: "Current plan", settled: true, current: true, onClick: () => {} },
  pro: { label: "Upgrade to Pro", onClick: () => {} },
}

section("1. Settings > Plan: /pricing's cards, laid out by the room they have")
{
  check("PricingTiers draws PlanCards with fit=\"sheet\", not the compact cards", /<PlanCards\s+fit="sheet"/.test(tiers) && !/\n\s*compact\n/.test(tiers))
  check("the plans take the panel's width; the overview and the history keep the 720px column", /data-billing-column="" className="w-full space-y-10 sm:space-y-12"/.test(billing) && /data-billing-overview="" className=\{PLAN_COLUMN\}/.test(billing) && /data-billing-history="" className=\{cn\(PLAN_COLUMN, CARD/.test(billing))
  check("on a phone the row runs to the screen's edges (the gutter is the bleed)", /data-billing-plans="" className="\[--plan-bleed:var\(--app-gutter\)\] lg:\[--plan-bleed:0px\]"/.test(billing))

  const html = renderToStaticMarkup(createElement(PlanCards, { actions, fit: "sheet" }))
  check("the ground is a container, so the row follows its own width", /data-plan-fit="sheet"/.test(html) && /@container/.test(html))
  check("three across only from 1180px of row (380px each, /pricing's computer card)", /@min-\[1180px\]:grid @min-\[1180px\]:grid-cols-3/.test(html))
  check("under that, /pricing's sideways snapping row", /snap-x snap-mandatory overflow-x-auto/.test(html) && (html.match(/shrink-0 snap-start w-\[min\(calc\(\(100vw-32px\)\*0\.82\),380px\)\]/g) ?? []).length === 3)
  check("no window rule left on a fitted row", !/max-md:|md:grid/.test(html.slice(html.indexOf("data-plan-cards"), html.indexOf("data-plan-card="))))
  check("/pricing's full size cards, not the compact ones", /text-\[42px\] sm:text-\[44px\]/.test(html) && !/text-\[36px\]/.test(html))
  check("the current plan's button keeps its fill and says so", /data-plan-button="settled"[^>]*data-plan-current=""/.test(html) && /bg-\[#7c3aed\] font-semibold text-white opacity-70/.test(html))
  check("a mouse sees the row's thin scrollbar", /@media \(hover:hover\) and \(pointer:fine\)\{\s*\[data-plan-fit\] \[data-plan-cards\]\{scrollbar-width:thin/.test(cards))

  const plain = renderToStaticMarkup(createElement(PlanCards, { actions }))
  check("/pricing (no fit) is untouched: three from md, the phone row by the window", /md:grid md:grid-cols-3/.test(plain) && (plain.match(/max-md:w-\[82%\] max-md:shrink-0 max-md:snap-start/g) ?? []).length === 3 && !/data-plan-fit="/.test(plain))
}

section("2. The billing actions are as they were")
{
  check("every plan change still goes to the plans page", /router\.push\("\/app\/settings\/billing\/upgrade"\)/.test(tiers))
  check("Downgrade to Free on a paid plan still opens Cancel plan", /onClick: isFree && !isCurrentPlan && onCancelClick \? onCancelClick : handlePlanAction/.test(tiers))
  check("settled and current rules unchanged", /settled: isCurrentPlan \|\| \(isCanceling && isFree\) \|\| \(isPendingPlan && !isUpgrade\)/.test(tiers) && /current: isCurrentPlan/.test(tiers))
}

section("3. The plans page: the logo at the left")
{
  const bar = upgrade.slice(upgrade.indexOf("function UpgradeBar"))
  check("the bar is laid out on the page's width (1240px, 16/24px sides, then the cards' 1180px)", /mx-auto max-w-\[1240px\] px-4 sm:px-6/.test(bar) && /mx-auto flex h-\[var\(--upgrade-bar\)\] max-w-\[1180px\] items-center justify-between/.test(bar))
  check("the logo is not centred any more", !/left-1\/2 -translate-x-1\/2/.test(bar))
  check("the logo, a hairline, then Billing, then X", bar.indexOf("data-upgrade-logo") < bar.indexOf("data-upgrade-back") && bar.indexOf("data-upgrade-back") < bar.indexOf("data-upgrade-close") && /h-5 w-px shrink-0 bg-\[#e5e7eb\]/.test(bar))
  check("the bar clears the side safe areas", /paddingLeft: "env\(safe-area-inset-left, 0px\)"/.test(bar) && /paddingRight: "env\(safe-area-inset-right, 0px\)"/.test(bar))
  check("the plans page's cards fit by their row too, so 768px cuts no label", /fit="page"/.test(upgrade) && /fit=\{fit\}/.test(pricingSection))
  const page = renderToStaticMarkup(createElement(PlanCards, { actions, fit: "page" }))
  check("  three across from 780px of row (each card 245px or more)", /@min-\[780px\]:grid @min-\[780px\]:grid-cols-3/.test(page))
}

section("4. Words")
{
  const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b|—/i
  /* What round 60 wrote: each of its notes, from its heading on. */
  const notes = [BILLING, UPGRADE, CARDS, SECTION].map(readSource).flatMap((s) => [...s.matchAll(/(ROUND|Round) 60/g)].map((m) => s.slice(m.index, (m.index ?? 0) + 1200)))
  check("no AI words or em dashes in what this round wrote", notes.length >= 5 && notes.every((s) => !BANNED.test(s)), notes.length)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
