/**
 * LANDING ROUND 13, /PRICING (storelib.com/pricing)
 *
 * The owner, after round 12:
 *   1. no "Compare Storelib" line of links (vs Gumroad, Stan Store, ...) and no
 *      "Launch in minutes / Cancel anytime / No coding / Get paid directly" row
 *   2. the plan cards not on a light grey ground
 *   3. the heading and its line much bigger
 *   4. as you scroll past the cards, the next section rises over them as a
 *      rounded sheet (sticky stacking panels): a bento of what comes with a
 *      store (two wide tiles over three, the fifth a domain reel), then
 *      "Compare all features" from the real plans, then the questions
 *   5. "Get Grow" a solid Storelib purple button, no pill, no round arrow
 *
 *   sheets   app/(storelib)/(marketing)/pricing/pricing-sheets.tsx: position
 *            sticky with a top that stops each sheet when its foot reaches the
 *            foot of the screen; heights from a ResizeObserver, no scroll
 *            listener; the shade a scroll driven animation; plain column under
 *            reduced motion
 *   bento    ./pricing-bento.tsx, the home "Everything" section's own pictures
 *            and captions by import, only the layout new
 *   domain   ./domain-reel.tsx, endings that hostnameProblem accepts
 *   compare  ./compare-plans.tsx, planComparison() and OFFERED_PLANS only
 *
 * Measured on the dev server with scratch Playwright scripts (numbers in the round's report).
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SheetStack, SHEETS_CSS } from "@/app/(storelib)/(marketing)/pricing/pricing-sheets"
import { PricingBento, BENTO_CARDS, BENTO_CSS, BENTO_HEADING } from "@/app/(storelib)/(marketing)/pricing/pricing-bento"
import { DomainReel, DOMAIN_CSS, DOMAIN_ENDINGS, DOMAIN_NAME } from "@/app/(storelib)/(marketing)/pricing/domain-reel"
import { ComparePlans, COMPARE_CSS, COMPARE_HEADING } from "@/app/(storelib)/(marketing)/pricing/compare-plans"
import { PlanCards, PLAN_PURPLE, type PlanCardAction } from "@/components/billing/plan-cards"
import { EVERYTHING_CARDS, EVERYTHING_SUPPORT } from "@/components/marketing/home/everything-in-one-place"
import { hostnameProblem, servingHost } from "@/lib/custom-domains/hostname"
import { OFFERED_PLANS, planComparison, type OfferedPlanId } from "@/lib/billing/plans"

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
const page = read(`${DIR}/page.tsx`)
const client = read(`${DIR}/pricing-client.tsx`)

console.log("\n1. Gone: the Compare Storelib links and the four badges")
check("the page no longer renders CompareStrip", !/CompareStrip|compare-strip/.test(code(page)) && !/compare=/.test(code(page)))
check("the client no longer renders the badges, the marquee, the split features or the tool stack", !/FeaturesBadgesSection|ProductMarquee|SplitFeaturesSection|ToolStackSection/.test(code(client)))

console.log("\n2 and 3. The cards on white under a much bigger heading")
const section = read("components/marketing/pricing-section.tsx")
/* Changed on purpose (landing round 15): a little more room under the whole section (the owner): pb-24 sm:pb-32, was pb-16 sm:pb-24. */
check("/pricing's section is white, no grey, no rules", /: "bg-white pt-\[clamp\(48px,7vw,112px\)\] pb-24 sm:pb-32"/.test(section) && !/py-20 sm:py-24 bg-\[#f8f9fa\] border-y/.test(section))
// Changed on purpose (landing round 14): the owner found the 112px title too big; it is home sized now (tests/home-landing-r14-pricing.test.ts).
check("the heading is home sized now", /data-pricing-title="" className="text-\[clamp\(38px,5vw,68px\)\]/.test(section))
check("the home page's editorial heading is untouched", /editorial \? "mt-3 text-\[16px\] leading-relaxed text-\[#6b7280\] text-balance"/.test(section) && /<StoryHeading text=\{headingOverride \|\| "Pricing & Plans"\}/.test(section))

console.log("\n4. The sheets")
const stack = renderToStaticMarkup(
  createElement(SheetStack, {
    sheets: [
      { id: "plans", tone: "light", node: createElement("p", null, "a") },
      { id: "included", tone: "dark", node: createElement("p", null, "b") },
      { id: "faq", tone: "light", node: createElement("p", null, "c") },
    ],
  }),
)
// Changed on purpose (landing round 14): one sheet stack, the plans then compare; the bento and the questions follow in the page's flow (tests/home-landing-r14-pricing.test.ts).
check("the client stacks plans then compare", /id: "plans"[\s\S]*id: "compare"/.test(client) && !/id: "included"|id: "faq"/.test(client))
check("each sheet carries its line, every one but the last its shade", (stack.match(/data-pz-line=""/g) ?? []).length === 3 && (stack.match(/class="pz-dim"/g) ?? []).length === 2)
check("sticky only once its height is known, stopping at the foot of the screen (svh)", /\.pz-stack\[data-pz-ready\] > \.pz-sheet:not\(:last-child\)\{position:sticky;top:min\(0px,calc\(100svh - var\(--pz-h,100svh\)\)\)\}/.test(SHEETS_CSS))
check("rounded top corners, each sheet tucked under the one before", /\.pz-sheet \+ \.pz-sheet\{margin-top:calc\(-1 \* var\(--pz-r\)\);border-radius:var\(--pz-r\) var\(--pz-r\) 0 0;overflow:clip/.test(SHEETS_CSS))
check("the shade is opacity on a view timeline, inside @supports", /@supports \(animation-timeline:view\(\)\)\{\s*\.pz-dim\{animation:pz-dim linear both;animation-range:entry 0% entry 100%\}/.test(SHEETS_CSS) && /@keyframes pz-dim\{to\{opacity:var\(--pz-shade,\.12\)\}\}/.test(SHEETS_CSS))
check("reduced motion: nothing sticks, nothing shades", /@media \(prefers-reduced-motion:reduce\)\{\s*\.pz-stack\[data-pz-ready\] > \.pz-sheet:not\(:last-child\)\{position:relative;top:auto\}\s*\.pz-dim\{display:none\}/.test(SHEETS_CSS))
const sheetsSrc = code(read(`${DIR}/pricing-sheets.tsx`))
check("no scroll listener, no layout read on scroll, no requestAnimationFrame", !/addEventListener\(\s*["']scroll|onScroll|requestAnimationFrame|scrollY|pageYOffset/.test(sheetsSrc) && /new ResizeObserver/.test(sheetsSrc) && /new IntersectionObserver/.test(sheetsSrc))
check("no overflow on the page wrapper (it would stop the sheets sticking)", /<div className="bg-white">/.test(client) && !/overflow-x-hidden/.test(code(client)))

console.log("\n4a. The bento")
const bento = renderToStaticMarkup(createElement(PricingBento))
const bentoWords = words(bento)
// Changed on purpose (landing round 14): a heading not about "your store".
check("a heading of its own, not \"Always included\"", BENTO_HEADING === "What you get with Storelib." && !/Always included/i.test(bentoWords))
check("two wide tiles, then three", BENTO_CARDS.map((c) => c.size).join() === "wide,wide,third,third,third" && BENTO_CARDS.map((c) => c.key).join() === "sell,store,world,support,domain")
check("the four captions are the home section's own, word for word", EVERYTHING_CARDS.every((c) => bentoWords.includes(`${c.lead} ${c.rest}`)))
check("the support tile is the home section's three conversations, each with its answer", EVERYTHING_SUPPORT.length === 3 && EVERYTHING_SUPPORT.every((r) => bentoWords.includes(r.ask.replace(/'/g, "'")) && bentoWords.includes(r.reply)) && /Moving my subscribers over/.test(bentoWords) && /Fell Sweater pattern/.test(bentoWords) && /My own domain/.test(bentoWords))
// Changed on purpose (landing round 14): the reel's name is mayalane.
check("the fifth tile: Connect your own domain, on the plans that have one", /Connect your own domain\. Your store at an address you already own, like mayalane\.com, on Grow and Pro\./.test(bentoWords))
check("one column on a phone, 3+3 from 768px, 2+2+2 from 1024px", /\.pz-grid\{display:grid;grid-template-columns:minmax\(0,1fr\)/.test(BENTO_CSS) && /@media\(min-width:768px\)\{\s*\.pz-grid\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/.test(BENTO_CSS) && /@media\(min-width:1024px\)\{\s*\.pz-third,\.pz-third:last-child\{grid-column:span 2\}/.test(BENTO_CSS))
// Changed on purpose (landing round 14): the bento is no sheet any more, so nothing covers it; usePlatformSection still pauses it off screen.
check("no sheet covers it any more", !/data-pz-covered/.test(BENTO_CSS))
check("covering a sheet re-renders nothing but the section that asks (no React state in the stack)", !/useState|startTransition|createContext/.test(sheetsSrc.slice(sheetsSrc.indexOf("export function SheetStack"))) && /new MutationObserver\(read\)/.test(sheetsSrc))

console.log("\n4a. The domain reel")
check("every ending is one Storelib connects, at www", DOMAIN_ENDINGS.every((e) => hostnameProblem(`${DOMAIN_NAME}.${e}`) === null && servingHost(`${DOMAIN_NAME}.${e}`) === `www.${DOMAIN_NAME}.${e}`), DOMAIN_ENDINGS.map((e) => [e, hostnameProblem(`${DOMAIN_NAME}.${e}`)]))
const reel = renderToStaticMarkup(createElement(DomainReel))
check("a column and the pill, each the list twice over, all loops .ev-loop", (reel.match(/class="pz-d-row"/g) ?? []).length === DOMAIN_ENDINGS.length * 4 && (reel.match(/ev-loop/g) ?? []).length === 3 && /class="pz-d-pill"/.test(reel) && /class="pz-d-globe"/.test(reel) && /pz-d-cursor/.test(reel))
check("the pill's ending in Storelib violet", /\.pz-d-end-on\{font-weight:650;color:#7c3aed\}/.test(DOMAIN_CSS))
const keyframes = DOMAIN_CSS.match(/@keyframes [\s\S]*?\}\}/g) ?? []
check("only transform moves, by translate3d and scale", keyframes.length === 2 && keyframes.every((k) => !/(top|left|height|width|margin|opacity|filter)\s*:/.test(k.replace(/transform:[^}]*/g, ""))))
check("the reel ends where it began (-50% is the second copy's first row)", /100%\{transform:translate3d\(0,-50%,0\)\}/.test(DOMAIN_CSS))
check("aria hidden: it is a picture", /<div class="ev-vis pz-d" aria-hidden="true">/.test(reel))

console.log("\n4b. Compare all features")
const actions: Record<OfferedPlanId, PlanCardAction> = { free: { label: "Start free", href: "/signup" }, growth: { label: "Get Grow", href: "/signup" }, pro: { label: "Get Pro", href: "/signup" } }
const cmp = renderToStaticMarkup(createElement(ComparePlans, { actions }))
const groups = planComparison()
check("the heading", COMPARE_HEADING === "Compare all features" && /<h2 id="pz-cmp-title" class="pz-cmp-title">Compare all features<\/h2>/.test(cmp))
check("a plan header per offered plan, its real price and button", OFFERED_PLANS.every((p) => cmp.includes(`data-pz-plan="${p.id}"`) && words(cmp).includes(`${p.name} ${p.price}`)) && /Start free/.test(cmp) && /Get Grow/.test(cmp) && /Get Pro/.test(cmp))
check("every group and row from planComparison(), nothing else", groups.every((g) => cmp.includes(`>${g.title}<`)) && (cmp.match(/class="pz-cmp-row pz-cmp-line"/g) ?? []).length === groups.reduce((n, g) => n + g.rows.length, 0))
check("a black round check per true value", (cmp.match(/class="pz-cmp-yes"/g) ?? []).length === groups.flatMap((g) => g.rows).reduce((n, r) => n + [r.free, r.pro, r.scale].filter((v) => v === true).length, 0) && /\.pz-cmp-yes\{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#0f0e13/.test(COMPARE_CSS))
check("the plan row sticks under the site's bar", /\.pz-cmp-head\{position:sticky;top:var\(--pz-head,0px\);z-index:2;background:#fff/.test(COMPARE_CSS))
check("at 390 the label takes its own line and the three plans keep their columns", /\.pz-cmp-row\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(COMPARE_CSS) && /\.pz-cmp-label\{grid-column:1\/-1;/.test(COMPARE_CSS))
check("Grow's compare button is the same purple", /\.pz-cmp-btn-on\{background:#7c3aed\}/.test(COMPARE_CSS) && /class="pz-cmp-btn pz-cmp-btn-on"[^>]*><span class="pz-cmp-btn-t">Get Grow/.test(cmp))
check("no number typed by hand in the table", !/\$\d|\d+ ?GB|\d%/.test(code(read(`${DIR}/compare-plans.tsx`)).split("export const COMPARE_CSS")[0]))

console.log("\n4c. The questions rise the same way")
// Changed on purpose (landing round 14): the questions are a plain section after the bento, no longer a sheet.
check("the questions follow, the existing FaqSection", /<FaqSection editorial \/>/.test(client))

console.log("\n5. Get Grow: solid purple")
const cards = renderToStaticMarkup(createElement(PlanCards, { actions }))
const growCard = cards.slice(cards.indexOf('data-plan-card="growth"'), cards.indexOf('data-plan-card="pro"'))
// Changed on purpose (landing round 14): Get Grow carries a white disc with a purple arrow (tests/home-landing-r14-pricing.test.ts).
check("Grow's button is solid Storelib purple", PLAN_PURPLE === "#7c3aed" && /data-plan-button="purple"/.test(growCard) && /bg-\[#7c3aed\] font-semibold text-white/.test(growCard))
check("Start free and Get Pro stay dark with the arrow", (cards.match(/data-plan-button="dark"/g) ?? []).length === 2 && (cards.match(/<path d="M4 10h12M11 5l5 5-5 5"><\/path>/g) ?? []).length === 2)

console.log("\nCopy")
const all = [bentoWords, words(cmp), BENTO_CARDS.map((c) => `${c.lead} ${c.rest}`).join(" ")].join(" ")
check("no banned words, no em dashes", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(all) && !/—/.test(all))
check("no memberships, no Shopify", !/memberships|Shopify|Liquid/i.test(all) && !/memberships/.test(read("components/marketing/faq-section.tsx")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
