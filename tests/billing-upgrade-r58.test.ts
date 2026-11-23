/**
 * ===========================================================================
 *  THE PLANS PAGE IN THE APP IS /pricing'S OWN SECTIONS (round 58)
 * ===========================================================================
 * The owner, on /app/settings/billing/upgrade:
 *   1. it opens and closes smoothly and cleanly
 *   2. an X button, and a back link to Billing
 *   3. the current plan's button never turns white or outlined
 *   4. the cards, buttons, compare table and questions match /pricing, from
 *      the same components and data, with checkout, plan changes, trials and
 *      the current plan logic exactly as they were
 *   5. on a phone: no sideways scroll, a close that stays, safe areas
 *
 *   ONE SOURCE  both pages render PricingSection, ComparePlans (with
 *               CompareLink) and FaqSection; the cards and the table drawn
 *               with the app's actions say word for word what /pricing's do;
 *               the upgrade page's separate table and questions are gone
 *   LOGIC       the Stripe calls, their bodies and addresses, the native
 *               in-app browser, and the current plan, pending and downgrade
 *               rules are all still there
 *   BAR         Billing at the left, X at the right, both the same way back,
 *               sticky, clear of the side safe areas
 *   SETTLED     a settled button keeps its plan's fill (cards and table)
 *   MOTION      the layer rises and drops on a phone (`moves`), the cards do
 *               not rise inside it as well, and a press repaints only the bar
 *
 * scripts/check-upgrade-r58.mjs measures it in Chromium at 360, 390, 768 and
 * 1280 (pictures, sideways scroll, the X at the foot, safe areas, the current
 * plan's colours, the two pages' text read from the DOM, the open and close).
 */
import { existsSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readCode, readSource } from "./_source"
import { PricingSection } from "@/components/marketing/pricing-section"
import { ComparePlans, COMPARE_CSS } from "@/app/(storelib)/(marketing)/pricing/compare-plans"
import type { PlanCardAction } from "@/components/billing/plan-cards"
/* PricingSection with its props named, so createElement checks them (its own signature defaults them to {}). */
const Section = PricingSection as (p: NonNullable<Parameters<typeof PricingSection>[0]>) => ReturnType<typeof PricingSection>
import { OFFERED_PLANS, PRO_PRICE_CENTS, SCALE_PRICE_CENTS, formatPlanPrice } from "@/lib/billing/plans"

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

const UPGRADE = "components/app/billing/upgrade-page-client.tsx"
const LAYOUT = "app/(storelib)/app/settings/billing/upgrade/layout.tsx"
const PRICING = "app/(storelib)/(marketing)/pricing/pricing-client.tsx"
const COMPARE = "app/(storelib)/(marketing)/pricing/compare-plans.tsx"
const CARDS = "components/billing/plan-cards.tsx"
const SECTION = "components/marketing/pricing-section.tsx"

const upgrade = readCode(UPGRADE)
const pricing = readCode(PRICING)

/* The words of a render, without its markup. */
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
/* A render's price, plan and line text only: every button taken out, since the buttons are the one thing each page decides. */
const withoutButtons = (html: string) => html.replace(/<(a|button)\b[^>]*data-plan-action[\s\S]*?<\/\1>/g, "").replace(/<(a|button)\b[^>]*class="pz-cmp-btn[\s\S]*?<\/\1>/g, "")

section("1. One source: the same sections on both pages")
{
  check("the upgrade page draws PricingSection, ComparePlans with CompareLink, and FaqSection", /<PricingSection\b/.test(upgrade) && /<ComparePlans actions=/.test(upgrade) && /cardsAside=\{<CompareLink \/>\}/.test(upgrade) && /<FaqSection editorial \/>/.test(upgrade))
  check("from /pricing's own modules", /from "@\/components\/marketing\/pricing-section"/.test(upgrade) && /from "@\/app\/\(storelib\)\/\(marketing\)\/pricing\/compare-plans"/.test(upgrade) && /from "@\/components\/marketing\/faq-section"/.test(upgrade))
  check("/pricing draws the same three", /<PricingSection\b/.test(pricing) && /<ComparePlans actions=/.test(pricing) && /cardsAside=\{<CompareLink \/>\}/.test(pricing) && /<FaqSection editorial \/>/.test(pricing) && /import \{ ComparePlans, CompareLink \} from "\.\/compare-plans"/.test(pricing))
  check("the upgrade page's own table and questions are gone", !existsSync("components/billing/compare-plans.tsx") && !existsSync("components/billing/plan-faq.tsx") && !/PlanFaq|billing\/compare-plans/.test(upgrade))
  check("no price or rate typed in the upgrade page (one comes from formatPlanPrice)", !/\$\d|\d+(\.\d+)?%/.test(upgrade) && /formatPlanPrice\(PRO_PRICE_CENTS\)/.test(upgrade))
  check("PricingSection hands the page's actions and lead to the same PlanCards", /actions: actionsGiven/.test(readCode(SECTION)) && /= actionsGiven \?\? \{/.test(readCode(SECTION)) && /<PlanCards actions=\{actions\} lead=\{lead\}/.test(readCode(SECTION)))

  /* The app's actions, as the upgrade page builds them for somebody on Grow. */
  const app: Record<"free" | "growth" | "pro", PlanCardAction> = {
    free: { label: "Downgrade to Free", onClick: () => {} },
    growth: { label: "Current plan", settled: true, current: true, onClick: () => {} },
    pro: { label: "Upgrade to Pro", onClick: () => {} },
  }
  const pub = renderToStaticMarkup(createElement(Section, { headingLevel: 1 as const, hideDetailsLink: true }))
  const inApp = renderToStaticMarkup(createElement(Section, { headingLevel: 1 as const, hideDetailsLink: true, actions: app, lead: "growth" as const }))
  const cardsOf = (html: string) => words(withoutButtons(html.slice(html.lastIndexOf("<", html.indexOf("data-plan-cards")))))
  check("the cards say the same, word for word, apart from their buttons", cardsOf(pub) === cardsOf(inApp) && cardsOf(pub).length > 200, { pub: cardsOf(pub).slice(0, 120), app: cardsOf(inApp).slice(0, 120) })
    check("every offered price is on both, as the checkout's tables say", [pub, inApp].every((html) => { const t = cardsOf(html).replace(/\s/g, ""); return OFFERED_PLANS.every((p) => t.includes(p.price)) && t.includes(formatPlanPrice(PRO_PRICE_CENTS)) && t.includes(formatPlanPrice(SCALE_PRICE_CENTS)) }))

  const pubTable = renderToStaticMarkup(createElement(ComparePlans, { actions: { free: { label: "Start free", href: "/signup" }, growth: { label: "Get Grow", href: "/signup" }, pro: { label: "Get Pro", href: "/signup" } } }))
  const appTable = renderToStaticMarkup(createElement(ComparePlans, { actions: { ...app, growth: { ...app.growth, label: "Current plan" }, free: { ...app.free, label: "Move to Free" }, pro: { ...app.pro, label: "Get Pro" } } }))
  check("the compare table says the same, row for row, apart from its buttons", words(withoutButtons(pubTable)) === words(withoutButtons(appTable)) && (pubTable.match(/role="row"/g) ?? []).length > 10)
}

section("2. The billing logic is the one it was")
{
  check("a new subscription: /api/billing/subscription/create with the plan, success and cancel addresses", /fetch\("\/api\/billing\/subscription\/create", \{/.test(upgrade) && /successUrl: `\$\{origin\}\/app\/settings\/billing\?success=1`/.test(upgrade) && /cancelUrl: `\$\{origin\}\/app\/settings\/billing\/upgrade`/.test(upgrade))
  check("a running subscription changes plan (proration is the route's): /change with newPlanId", /fetch\("\/api\/billing\/subscription\/change", \{/.test(upgrade) && /JSON\.stringify\(\{ newPlanId: planId \}\)/.test(upgrade) && /if \(hasActiveSubscription\) \{/.test(upgrade))
  check("Free cancels through /cancel", /fetch\("\/api\/billing\/subscription\/cancel", \{ method: "POST" \}\)/.test(upgrade))
  check("in the native app checkout opens in the in-app browser", /Browser\.open\(\{/.test(upgrade) && /presentationStyle: "popover"/.test(upgrade) && /addListener\("browserFinished"/.test(upgrade))
  check("the current plan, a scheduled change and a scheduled cancellation stay settled", /const settled = isCurrentPlan \|\| \(cancelAtPeriodEnd && isFree\) \|\| \(isPendingPlan && !isUpgrade\)/.test(upgrade) && /if \(planId === currentPlanId \|\| loading\) return/.test(upgrade) && /current: isCurrentPlan/.test(upgrade))
  check("the labels: Current plan, Downgrade scheduled, Switch scheduled, Cancellation scheduled, Downgrade to, Upgrade to, Get", ["Current plan", "Downgrade scheduled", "Switch scheduled", "Cancellation scheduled", "Downgrade to ${offered.name}", "Upgrade to ${offered.name}", "Get ${offered.name}"].every((l) => upgrade.includes(l)))
  check("the compare table's buttons are the cards' actions with shorter words", /const card = actionFor\(id\)/.test(upgrade) && /return \{ \.\.\.card, label \}/.test(upgrade))
}

section("3. The bar: Billing, the mark, X")
{
  check("a back link that says Billing", /data-upgrade-back=""/.test(upgrade) && /data-upgrade-back=""[\s\S]{0,800}<ArrowLeft[^>]*\/>\s*\{?(tt\()?"?Billing/.test(upgrade))
  check("an X, named Close, 44px", /data-upgrade-close=""/.test(upgrade) && /aria-label=\{?(tt\()?"Close"/.test(upgrade) && /h-11 w-11/.test(upgrade) && /<X className=/.test(upgrade))
  check("both go back the same way, to the Billing tab", (upgrade.match(/href=\{BILLING_HREF\}\s*onClick=\{goBack\}/g) ?? []).length === 2 && /const BILLING_HREF = "\/app\/settings\?tab=billing"/.test(upgrade))
  check("the back stays the browser's back with a fallback (backThen), dropped as a layer", /moveLayer\("leave", \(\) => backThen\(\(\) => router\.replace\(BILLING_HREF\)\), false\)/.test(upgrade))
  check("sticky at the top, its sides clear of the safe areas, the foot too", /data-upgrade-bar="" className="sticky top-0/.test(upgrade) && /env\(safe-area-inset-left, 0px\)/.test(upgrade) && /env\(safe-area-inset-right, 0px\)/.test(upgrade) && /pb-\[env\(safe-area-inset-bottom,0px\)\]/.test(upgrade))
  check("one number for the bar's height, shared with the table's sticky plan row", /\[--upgrade-bar:56px\] \[--pz-head:var\(--upgrade-bar\)\] sm:\[--upgrade-bar:64px\]/.test(upgrade) && /h-\[var\(--upgrade-bar\)\]/.test(upgrade) && /top:var\(--pz-head,0px\)/.test(COMPARE_CSS))
  check("the Compare all features link scrolls the layer's own scroller in the app", /closest<HTMLElement>\("\[data-page-layer-scroll\]"\)/.test(readCode(COMPARE)) && /box\.scrollTo\(\{ top, behavior \}\)/.test(readCode(COMPARE)))
}

section("4. A settled button keeps its fill")
{
  const cards = readCode(CARDS)
  check("the cards: a settled button is the plan's own fill, never white or outlined", /\$\{featured \? "bg-\[#7c3aed\]" : "bg-\[#0f0e13\]"\} font-semibold text-white opacity-70 cursor-default/.test(cards) && !/border border-\[#e4e4e7\] bg-white font-medium/.test(cards))
  check("the current plan carries a check", /action\.settled && action\.current \? <Check /.test(cards))
  const settled = renderToStaticMarkup(createElement(Section, { headingLevel: 1 as const, hideDetailsLink: true, actions: { free: { label: "Get Free" }, growth: { label: "Current plan", settled: true, current: true }, pro: { label: "Get Pro" } } }))
  const grow = settled.slice(settled.indexOf('data-plan-card="growth"'), settled.indexOf('data-plan-card="pro"'))
  const btn = grow.slice(grow.indexOf("<button"), grow.indexOf("</button>"))
  check("drawn: Grow's Current plan is purple, disabled, with no border class", /bg-\[#7c3aed\]/.test(btn) && /disabled=""/.test(btn) && !/(^|\s)(border|bg-white)(\s|$)/.test(btn.match(/class="([^"]*)"/)?.[1] ?? "") && /Current plan/.test(btn))
  const table = renderToStaticMarkup(createElement(ComparePlans, { actions: { free: { label: "Get Free" }, growth: { label: "Current plan", settled: true, current: true }, pro: { label: "Get Pro" } } }))
  check("the table: Current plan is the same filled button, disabled", /class="pz-cmp-btn pz-cmp-btn-on pz-cmp-btn-settled"[^>]*disabled=""/.test(table) && /\.pz-cmp-btn-settled,\.pz-cmp-btn-settled:disabled\{opacity:\.7;cursor:default\}/.test(COMPARE_CSS))
  check("a settled table button is never a link", /if \(action\.href && !action\.disabled && !action\.settled\)/.test(readCode(COMPARE)))
}

section("5. Opening and closing")
{
  const layout = readCode(LAYOUT)
  check("the layer rises and drops on a phone (moves), white under the status bar", /<PageLayer inset="white" moves>/.test(layout))
  check("on a phone the cards do not rise inside the rising layer", /@media \(max-width:767px\)\{\s*\[data-upgrade-page\] \[data-pricing-enter\][^{]*\{animation:none\}/.test(upgrade))
  check("a press repaints only the bar: leaving lives in UpgradeBar, the page dims by CSS", /function UpgradeBar\(\)/.test(upgrade) && /const \[leaving, setLeaving\] = useState\(false\)/.test(upgrade.slice(upgrade.indexOf("function UpgradeBar"))) && !/leaving/.test(upgrade.slice(upgrade.indexOf("export function UpgradePageClient"), upgrade.indexOf("function UpgradeBar"))) && /:has\(\[data-upgrade-bar\] \[data-leaving\]\) \[data-upgrade-body\]\{opacity:\.6;pointer-events:none\}/.test(upgrade))
}

section("6. Words")
{
  const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b|—/i
  check("no AI words or em dashes in what this round wrote", [readCode(UPGRADE), readCode(LAYOUT)].every((s) => !BANNED.test(s)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
