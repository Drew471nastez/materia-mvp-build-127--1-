/**
 * LANDING ROUND 15, PRICING (the plan buttons everywhere, /pricing's bento,
 * and the questions on the home page and /pricing)
 *
 * The owner:
 *   1. Start free, Get Grow and Get Pro: the light that crosses them on hover
 *      much fainter, smoother and slower; Get Grow's white arrow disc takes
 *      a soft, clean outline that eases in on hover, not a jump
 *   2. /pricing's "Sell anything you make" tile: the Digital slide without
 *      the "sending a download link" notice (the home page keeps it)
 *   3. the questions: no light grey panel and no dots behind them; the rows
 *      on the page's own background, opening as before
 *
 * Measured on the dev server with Playwright (1440 and 1920, hovering Get
 * Grow): the outline goes from opacity 0 at scale .88 to 1 at scale 1 in
 * about half a second; the light takes 1.6s to cross; on /pricing the
 * products tile holds no .ev-p-dl at 390, 1440 and 1920; the FAQ section's
 * ::before and ::after paint nothing on either page.
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { DELIVERY_FILE, ProductSlides } from "@/components/marketing/home/everything-in-one-place"
import { BENTO_CSS } from "@/app/(storelib)/(marketing)/pricing/pricing-bento"
import { FaqSection } from "@/components/marketing/faq-section"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`, detail ?? "") }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")

const CARDS = code("components/billing/plan-cards.tsx")
const css = /const PLAN_BUTTON_CSS = `([\s\S]*?)`/.exec(CARDS)?.[1] ?? ""
const go = (label: string): PlanCardAction => ({ label, href: "/signup" })
const cards = renderToStaticMarkup(createElement(PlanCards, { actions: { free: go("Start free"), growth: go("Get Grow"), pro: go("Get Pro") }, hideInterval: true }))

console.log("\n1. The plan buttons' hover")
{
  const band = /\.plan-shine::before\{[^}]*\}/.exec(css)?.[0] ?? ""
  const peak = Math.max(...[...band.matchAll(/rgba\(255,255,255,([\d.]+)\)/g)].map((m) => Number(m[1])))
  check("the light is half as bright as before: a peak of 8% white (was 16%)", peak === 0.08, peak)
  check("  and softer at its edges (a 60% band, eased in and out by its stops)", /width:60%/.test(band) && /\.035\) 30%/.test(band) && /\.035\) 70%/.test(band))
  const hover = /\.plan-shine:hover::before\{[^}]*\}/.exec(css)?.[0] ?? ""
  check("it takes 1.6s to cross (was .85s) on an even ease in and out", /transition:translate 1\.6s cubic-bezier\(\.45,\.05,\.35,1\)/.test(hover))
  check("leaving fades it first, then puts it back hidden (no jump, no sweep backwards)", /opacity:0;transition:opacity \.3s ease,translate 0s linear \.3s/.test(band) && /opacity:1/.test(hover))
  check("only with a pointer that hovers and motion allowed", /@media \(hover:hover\) and \(prefers-reduced-motion:no-preference\)\{\s*\.plan-shine:hover::before/.test(css))
  // Changed on purpose (landing round 17): Get Grow turns into an outline button on hover instead, so the light crosses Start free and Get Pro only (tests/home-landing-r17-small.test.ts).
  // Changed on purpose (landing round 19): Get Grow stays purple and carries the light again, so all three live buttons do (tests/home-landing-r19-grow.test.ts).
  check("every live button carries it: Start free, Get Grow, Get Pro", (cards.match(/class="[^"]* plan-shine( plan-grow)?"/g) ?? []).length === 3, (cards.match(/class="[^"]* plan-shine( plan-grow)?"/g) ?? []).length)

  // Changed on purpose (landing round 17): the owner asked for no ring round the disc any more; the button itself becomes the outline (tests/home-landing-r17-small.test.ts).
  // Changed on purpose (landing round 19): the owner wants a ring round the white disc only, so .plan-grow's disc has an ::after again (tests/home-landing-r19-grow.test.ts).
  check("Get Grow's disc ring belongs to .plan-grow only", /\.plan-grow \.plan-disc::after\{/.test(css) && !/plan-shine[^{]*\.plan-disc/.test(css))
  check("the box shadow ring that stepped in is gone", !/group-hover:shadow-\[0_1px_2px_rgba\(46,16,101,0\.18\),0_0_0_3px/.test(CARDS))
  check("the disc is on Get Grow only", (cards.match(/class="plan-disc /g) ?? []).length === 1 && /data-plan-card="growth"[\s\S]*class="plan-disc /.test(cards))
}

console.log("\n2. /pricing's products tile")
{
  const bento = code("app/(storelib)/(marketing)/pricing/pricing-bento.tsx")
  check("/pricing draws the product slides without the download notice", /sell: <ProductSlides delivery=\{false\} \/>/.test(bento))
  const calm = renderToStaticMarkup(createElement(ProductSlides, { delivery: false }))
  check("  so no notice, no file name, no download line", !/ev-p-dl/.test(calm) && !calm.includes(DELIVERY_FILE) && !/Download link/.test(calm))
  check("  the Digital slide and its tab are still there", /Cine Tones LUT Pack/.test(calm) && /<span class="ev-tab-label">Digital<\/span>/.test(calm) && /data-no-delivery=""/.test(calm))
  check("  on a phone the card stands where it does on a computer", /@media\(max-width:479px\)\{\.pz-bento \[data-no-delivery\] \.ev-p-stage\{top:44%\}\}/.test(BENTO_CSS))
  const home = renderToStaticMarkup(createElement(ProductSlides))
  // Changed on purpose (landing round 18): the owner wants no download notice on the home page either, so it is off by default.
  check("the home page has no download notice either", !/class="ev-p-dl"/.test(home) && !home.includes(DELIVERY_FILE))
}

console.log("\n3. The questions")
{
  const src = code("components/marketing/faq-section.tsx")
  const html = renderToStaticMarkup(createElement(FaqSection, { editorial: true }))
  check("no grey panel and no dots: the ground's stylesheet is gone", !/faq-ground|FAQ_GROUND_CSS|radial-gradient|#f1f1f3/.test(src) && !/faq-ground/.test(html))
  check("the section is on the page's own background, padded as in round 14", /<section data-story-section="faq" data-faq-plain="" class="py-20 sm:py-28 home-wrap/.test(html) && /style="background:transparent"/.test(html))
  check("the rows keep their soft grey and open as before", /\.faq-rows \.faq-item\{border-bottom:0;border-radius:10px;background:#f5f5f6\}/.test(src) && /\.faq-a\{display:grid;grid-template-rows:0fr;transition:grid-template-rows \.4s cubic-bezier\(\.22,1,\.36,1\)\}/.test(src) && (html.match(/class="faq-item"/g) ?? []).length === 7)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
