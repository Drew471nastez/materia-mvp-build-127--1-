/**
 * LANDING ROUND 14, PRICING (the plan cards everywhere, the home page's
 * pricing sheet, and /pricing)
 *
 * The owner, after round 13:
 *   1. plan cards on every surface: Get Grow keeps its solid purple and gains
 *      the creators section's round arrow at its right, the other way round
 *      (a white disc, a purple arrow); six true lines on every card (the
 *      sixth from the plan tables); no "Prices in US dollars. Stripe's
 *      payment processing fees apply on every plan." anywhere; the Free,
 *      Grow and Pro pills a hair of Polaris-like depth
 *   2. home: the pricing sheet arrives as a modal sheet, the showcase above
 *      holding (sticky) while it rises (compositor only)
 *   3. /pricing: a home-sized heading; "Compare all features" at the top
 *      right of the cards, gliding to the table; the bento a plain section
 *      with a new heading; the order plans, compare, what you get, questions,
 *      the home page's closing call; the compare table's sticky plan row one
 *      compact row; the domain reel a cleaner name, smoother, usable anywhere
 *
 * Geometry and frame times were measured on the dev server with scratch
 * Playwright scripts (numbers in the round's report).
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { MAX_PLAN_LINES, publicPlanLines } from "@/components/marketing/pricing-lines"
import { PricingSection } from "@/components/marketing/pricing-section"
import { SheetHold, SHEET_HOLD_CSS } from "@/components/marketing/home/sheet-hold"
import { BENTO_HEADING, BENTO_CSS } from "@/app/(storelib)/(marketing)/pricing/pricing-bento"
import { DomainReel, DOMAIN_CSS, DOMAIN_ENDINGS, DOMAIN_NAME } from "@/app/(storelib)/(marketing)/pricing/domain-reel"
import { ComparePlans, COMPARE_CSS } from "@/app/(storelib)/(marketing)/pricing/compare-plans"
import { SHEETS_CSS } from "@/app/(storelib)/(marketing)/pricing/pricing-sheets"
import { hostnameProblem } from "@/lib/custom-domains/hostname"
import * as plans from "@/lib/billing/plans"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS } from "@/lib/storage/plans"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")
const DIR = "app/(storelib)/(marketing)/pricing"
const actions: Record<plans.OfferedPlanId, PlanCardAction> = { free: { label: "Start free", href: "/signup" }, growth: { label: "Get Grow", href: "/signup" }, pro: { label: "Get Pro", href: "/signup" } }
const cards = renderToStaticMarkup(createElement(PlanCards, { actions }))
const cardOf = (id: string) => cards.slice(cards.indexOf(`data-plan-card="${id}"`), id === "pro" ? undefined : cards.indexOf(`data-plan-card="${id === "free" ? "growth" : "pro"}"`))

console.log("\n1a. Get Grow: solid purple, with a white disc and a purple arrow at its right")
{
  const grow = cardOf("growth")
  const btn = grow.slice(grow.indexOf("<a"), grow.indexOf("</a>") + 4)
  check("still the solid Storelib purple", /data-plan-button="purple"/.test(btn) && /bg-\[#7c3aed\] font-semibold text-white/.test(btn))
  check("a white disc at the right end, its arrow purple", /data-plan-arrow="disc"/.test(btn) && /absolute right-\[5px\] top-1\/2[^"]*rounded-full bg-white text-\[#7c3aed\]/.test(btn) && /<path d="M3\.5 8h8\.5M8\.5 4\.5 12 8l-3\.5 3\.5"><\/path>/.test(btn))
  check("the label stays centred (equal room either side of it)", /rounded-full px-12 /.test(btn))
  check("the arrow nudges on hover by translate only, still under reduced motion", /group-hover:translate-x-\[2px\] motion-reduce:transition-none/.test(btn))
  check("Start free and Get Pro keep their dark button and plain arrow", ["free", "pro"].every((id) => /data-plan-button="dark"/.test(cardOf(id)) && /<path d="M4 10h12M11 5l5 5-5 5"><\/path>/.test(cardOf(id)) && !/data-plan-arrow="disc"/.test(cardOf(id))))
  const settled = renderToStaticMarkup(createElement(PlanCards, { actions: { ...actions, growth: { label: "Current plan", settled: true } } }))
  check("a settled Grow button carries no disc", !/data-plan-arrow="disc"/.test(settled))
}

console.log("\n1b. Six true lines on every card, on every surface")
{
  const lines = publicPlanLines()
  check("six on each card", MAX_PLAN_LINES === 6 && Object.values(lines).every((l) => l.length === 6), Object.values(lines).map((l) => l.length))
  check("each card draws all six with an icon", ["free", "growth", "pro"].every((id) => (cardOf(id).match(/data-plan-line="/g) ?? []).length === 6 && (cardOf(id).match(/<li[^>]*><svg/g) ?? []).length === 6))
  const free = siteLimits("free")
  const grow = siteLimits("growth")
  const pro = siteLimits("pro")
  /* Changed on purpose (pricing one row): the sixth lines said short so every line is one row ("Sales analytics", "More room for files", "Most pages per site"). */
  check("Free's sixth: Sales analytics, the compare table's row every plan has", lines.free[5]?.text === "Sales analytics" && plans.planComparison().flatMap((g) => g.rows).some((r) => r.label === "Sales and visitor analytics" && r.free === true && r.pro === true && r.scale === true))
  check("Grow's sixth: More room for files, because its storage is more than Free's", lines.growth[5]?.text === "More room for files" && PLAN_LIMITS.growth.storageQuotaBytes > PLAN_LIMITS.free.storageQuotaBytes)
  check("Pro's sixth: Most pages per site, because its pages are the most", lines.pro[5]?.text === "Most pages per site" && pro.maxPages > grow.maxPages && pro.maxPages > free.maxPages)
  check("the analytics the line names exist", read("app/(storelib)/app/analytics/page.tsx").length > 0)
  const compact = renderToStaticMarkup(createElement(PricingSection, { compact: true }))
  /* Changed on purpose (pricing: Grow $14, physical rates). */
  /* Changed on purpose (pricing tooltip): the rate and its info circle are one run of their own, so the text is read without the tags. */
  check("the compact cards (onboarding) draw the same six", Object.values(lines).flat().every((l) => compact.replace(/<[^>]+>/g, "").replace(/\u00a0/g, " ").includes(l.text)))
  for (const f of ["components/app/billing/billing-page-client.tsx", "components/app/billing/upgrade-page-client.tsx", "components/onepage/tabs/settings-tab.tsx", "components/marketing/pricing-section.tsx"]) {
    check(`${f} draws the shared cards, no lines of its own`, /<PlanCards\b/.test(read(f)) && !/lines=\{/.test(read(f)))
  }
}

console.log("\n1c. No \"Prices in US dollars\" line anywhere")
{
  const files = ["components/marketing/pricing-section.tsx", "components/billing/plan-cards.tsx", "lib/billing/plans.ts", `${DIR}/pricing-client.tsx`, "components/app/billing/billing-page-client.tsx", "components/app/billing/upgrade-page-client.tsx", "components/onepage/tabs/settings-tab.tsx"]
  check("not in the code that draws pricing", files.every((f) => !/Prices in US dollars|PLAN_FOOTNOTE/.test(code(read(f)))))
  check("the constant is gone", !("PLAN_FOOTNOTE" in plans))
  const home = renderToStaticMarkup(createElement(PricingSection, { editorial: true, hideDetailsLink: true }))
  const onboarding = renderToStaticMarkup(createElement(PricingSection, { compact: true }))
  check("not in the home section, /pricing's or onboarding's", ![home, onboarding, renderToStaticMarkup(createElement(PricingSection, { headingLevel: 1, hideDetailsLink: true }))].some((h) => /US dollars|processing fees/.test(h)))
}

console.log("\n1d. The pills: a hair of depth")
{
  const pill = cards.match(/<span data-plan-pill="" class="([^"]+)"/)?.[1] ?? ""
  check("a white top edge inside, a faint shade along the foot, one pixel under", /shadow-\[inset_0_1px_0_#fff,inset_0_-1px_0_rgba\(24,24,27,0\.05\),0_1px_1px_rgba\(24,24,27,0\.05\)\]/.test(pill), pill)
  check("on the same hairline ring, plain white (no gradient on the cards)", /ring-1 ring-\[#e4e4e7\]/.test(pill) && /rounded-full bg-white /.test(pill))
  check("very little: no shade stronger than 5%", !/rgba\(24,24,27,0\.(0[6-9]|[1-9])/.test(pill))
}

console.log("\n2. Home: the pricing sheet rises over the held showcase")
{
  const page = read("app/(storelib)/(marketing)/page.tsx")
  check("the sheet holding the pricing starts with <SheetHold />, right after the showcase's ground", /<LazyBuildShowcase \/>\s*<\/ScrollRevealBackdrop>[\s\S]{0,400}<ScrollRevealPanel tone="white">\s*<SheetHold \/>/.test(page))
  check("the held block sticks once its height is known, its foot at the foot of the screen (svh)", /\[data-sheet-hold\]\[data-hold-ready\]\{position:sticky;top:min\(0px,calc\(100svh - var\(--hold-h,100svh\)\)\)\}/.test(SHEET_HOLD_CSS))
  check("only with motion allowed", /@media \(prefers-reduced-motion:no-preference\)\{\s*\[data-sheet-hold\]\[data-hold-ready\]\{position:sticky/.test(SHEET_HOLD_CSS))
  check("the shade is opacity on the rising sheet's view timeline, inside @supports", /\[data-hold-rise\]\{view-timeline:--home-hold block\}/.test(SHEET_HOLD_CSS) && /animation-timeline:--home-hold;animation-range:entry 0% entry 100%/.test(SHEET_HOLD_CSS) && /@keyframes sheet-hold-dim\{to\{opacity:\.45\}\}/.test(SHEET_HOLD_CSS) && /\[data-landing-story\]\{timeline-scope:--home-hold\}/.test(SHEET_HOLD_CSS))
  check("covered, the held block is not drawn", /\[data-sheet-hold\]\[data-hold-covered\]\{visibility:hidden\}/.test(SHEET_HOLD_CSS))
  check("on a phone, 32px more room under the showcase before the pricing sheet, from the markup", /@media \(max-width:767px\)\{\s*\[data-sheet-backdrop\]:has\(\+\[data-sheet\] > \.sheet-hold-line\)\{padding-bottom:calc\(var\(--srp-r\) \+ var\(--srp-next-rise\) \+ 32px\)\}/.test(SHEET_HOLD_CSS))
  const src = code(read("components/marketing/home/sheet-hold.tsx"))
  check("no scroll listener, no requestAnimationFrame, no scroll reads: a ResizeObserver and an IntersectionObserver", !/addEventListener\(\s*["']scroll|onScroll|requestAnimationFrame|scrollY|pageYOffset/.test(src) && /new ResizeObserver/.test(src) && /new IntersectionObserver/.test(src) && !/useState/.test(src))
  check("it draws only its 1px line", /<span aria-hidden="true" class="sheet-hold-line" data-sheet-hold-line=""><\/span>/.test(renderToStaticMarkup(createElement(SheetHold))))
}

console.log("\n3a. /pricing: the heading, home sized")
{
  const section = read("components/marketing/pricing-section.tsx")
  check("the title runs to 68px, not 112px", /data-pricing-title="" className="text-\[clamp\(38px,5vw,68px\)\]/.test(section) && !/7\.4vw,112px/.test(section))
  check("its line to 20px", /text-\[clamp\(16px,1\.4vw,20px\)\]/.test(section))
}

console.log("\n3b. Compare all features, at the top right of the cards")
{
  const client = read(`${DIR}/pricing-client.tsx`)
  check("handed to the cards as their aside", /cardsAside=\{<CompareLink \/>\}/.test(client) && /aside=\{cardsAside\}/.test(read("components/marketing/pricing-section.tsx")))
  const withAside = renderToStaticMarkup(createElement(PlanCards, { actions, aside: createElement("a", { href: "#compare" }, "Compare all features") }))
  check("in the cards' own width, level with the pill, at the right edge", /data-plan-ground=""[^>]*><div data-plan-interval-row="" class="[^"]*sm:grid sm:grid-cols-\[1fr_auto_1fr\]/.test(withAside) && /data-plan-aside="" class="self-end sm:self-auto sm:justify-self-end"><a href="#compare">Compare all features<\/a>/.test(withAside) && (withAside.match(/data-billing-interval=/g) ?? []).length === 1)
  check("a real link to #compare that glides there (smooth, or at once under reduced motion)", /<a href="#compare" onClick=\{go\}/.test(client) && /behavior: reduceMotion\(\) \? "auto" : "smooth"/.test(client))
}

console.log("\n3c. The order, and the bento a plain section")
{
  const client = code(read(`${DIR}/pricing-client.tsx`))
  check("one sheet stack: the plans, then compare rising over them", /sheets=\{\[\s*\{\s*id: "plans"[\s\S]*?\},\s*\{ id: "compare", tone: "light", node: <ComparePlans actions=\{compareActions\} \/> \},\s*\]\}/.test(client))
  check("then the bento in the page's flow, the questions, and the home closing call", /\]\}\s*\/>(\s|\{\})*<PricingBento \/>(\s|\{\})*<FaqSection editorial \/>(\s|\{\})*<div className="pz-close" data-pz-close="">\s*<FinalCta \/>/.test(client) && !/id: "included"|id: "faq"/.test(client))
  check("\"Turn your ideas into income\" is gone (CtaSection)", !/CtaSection/.test(client))
  check("the bento's heading is not about your store", BENTO_HEADING === "What you get with Storelib." && !/your store/i.test(BENTO_HEADING))
  check("on white, nothing of the dark sheet left", /\.ev\.pz-bento\{background:#fff;color:#18181b/.test(BENTO_CSS) && !/data-pz-covered|#9d9ba6/.test(BENTO_CSS) && !/useSheetCovered/.test(read(`${DIR}/pricing-bento.tsx`)))
  check("the stores tile is the home page's Storefronts", /<Storefronts live=\{live\} \/>/.test(read(`${DIR}/pricing-bento.tsx`)))
  check("the close: rounded top by white fillets over the dot field, no rounded clip", /\.pz-close\{--pz-cr:clamp\(22px,3vw,44px\);position:relative;isolation:isolate;margin-top:calc\(-1 \* var\(--pz-cr\)\)/.test(SHEETS_CSS) && /\.pz-close::before\{/.test(SHEETS_CSS) && !/\.pz-close\{[^}]*overflow/.test(SHEETS_CSS))
}

console.log("\n3d. The compare table's sticky row: one compact row")
{
  const cmp = renderToStaticMarkup(createElement(ComparePlans, { actions }))
  /* Changed on purpose (pricing: Grow $14, physical rates). */
  check("name and price share one line, the button beside them", /<div role="columnheader" class="pz-cmp-plan" data-pz-plan="growth"><span class="pz-cmp-id"><span class="pz-cmp-name">Grow<\/span><span class="pz-cmp-price">\$14<span class="pz-cmp-per">\/month<\/span><\/span><\/span><a [^>]*class="pz-cmp-btn pz-cmp-btn-on"[^>]*><span class="pz-cmp-btn-t">Get Grow<\/span>/.test(cmp))
  /* Changed on purpose (landing round 15): the owner wants each plan's button on a second line under its name and price in the row that sticks. */
  check("the button on a second line under the name and price", /\.pz-cmp-plan\{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:8px\}/.test(COMPARE_CSS))
  check("little padding (10px, 12px from 768px)", /\.pz-cmp-plans\{padding:10px 0\}/.test(COMPARE_CSS) && /\.pz-cmp-plans\{padding:12px 0\}/.test(COMPARE_CSS))
  /* Changed on purpose (landing round 15): on its own line the button has room for its words at every width, so it is never an arrow alone. */
  check("the button's words at every width, 30px tall (34px from 768px)", /\.pz-cmp-btn\{[^}]*height:30px;padding:0 12px/.test(COMPARE_CSS) && /\.pz-cmp-btn-t\{min-width:0;overflow:hidden;text-overflow:ellipsis\}/.test(COMPARE_CSS) && /\.pz-cmp-btn\{height:34px;padding:0 15px;font-size:13\.5px\}/.test(COMPARE_CSS) && !/min-width:1280px/.test(COMPARE_CSS))
}

console.log("\n3e. The domain reel")
{
  check("a cleaner name, and junokada gone from the page's code", DOMAIN_NAME === "mayalane" && ![`${DIR}/domain-reel.tsx`, `${DIR}/pricing-bento.tsx`].some((f) => /junokada|Juno Kada/i.test(read(f))))
  check("every ending still one Storelib connects", DOMAIN_ENDINGS.every((e) => hostnameProblem(`${DOMAIN_NAME}.${e}`) === null))
  const reel = renderToStaticMarkup(createElement(DomainReel))
  check("it brings its own stylesheet, so any page can import it", /<style data-precedence="w13-home" data-href="pz-domain">|<style[^>]*pz-domain/.test(reel) || /<style href="pz-domain" precedence="w13-home">/.test(read(`${DIR}/domain-reel.tsx`)))
  check("by default it fills its box (at least 220px), every size a share of it", /:where\(\.pz-d\)\{position:relative;overflow:hidden;width:100%;height:100%;min-height:220px/.test(DOMAIN_CSS) && /container-type:size/.test(DOMAIN_CSS))
  check("a box class of the caller's own", /<div class="my-card pz-d" aria-hidden="true">/.test(renderToStaticMarkup(createElement(DomainReel, { className: "my-card" }))))
  // Changed on purpose (landing round 16): no holds, a 2.6s glide a row that starts and ends at rest (tests/home-landing-r16-how.test.ts).
  check("smoother: 3s steps, the move 40% of each on a soft curve", /animation:pz-reel 18\.2s cubic-bezier\(\.7,0,\.3,1\) infinite/.test(DOMAIN_CSS))
  check("still transform only", (DOMAIN_CSS.match(/@keyframes [\s\S]*?\}\}/g) ?? ([] as string[])).every((k) => !/(top|left|height|width|margin|opacity|filter)\s*:/.test(k.replace(/transform:[^}]*/g, ""))))
  // Changed on purpose (landing round 16): the pointer no longer moves, so only the lists stop.
  check("still under reduced motion", /@media \(prefers-reduced-motion:reduce\)\{\.pz-d-track\{animation:none/.test(DOMAIN_CSS))
}

console.log("\nCopy")
{
  const all = [words(cards), BENTO_HEADING, ...Object.values(publicPlanLines()).flat().map((l) => l.text)].join(" ")
  check("no banned words, no em dashes", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(all) && !/—/.test(all))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
