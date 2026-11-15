/**
 * ===========================================================================
 *  HOME, LANDING ROUND 10: HEIGHTS ON A LAPTOP SCREEN
 * ===========================================================================
 * The owner: "On a Mac, for example an Air, at 100% page zoom in Chrome,
 * certain things occupy too much height." That screen is about 1440x800 to
 * 1470x830 CSS px. Measured in dev at 1440x800 (section / main visual):
 *   AI tools    780 / 620 (78% of the screen)  ->  663 / 503
 *   the app     976 / 547                       ->  924 / 496
 *   analytics  1189 / two rows of 400           -> 1077 / two rows of 352
 *   the map     893 / 524                       ->  815 / 466
 *   pricing     962                             ->  930
 *   earnings    871 at 1470 ("earn." alone)     ->  791 at 1470
 * Every cap is a min() or clamp() against svh (the small viewport, which
 * never moves with a phone's URL bar) or a media query on a short laptop
 * (1024px wide or more, 900px high or less), so 1920x1080 and phones draw
 * as before. No text is made smaller than it was on a phone.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AI_TOOLS_STYLES, AI_TOOLS_SCRIPT } from "@/components/marketing/home/ai-tools-section"
import { PricingSection } from "@/components/marketing/pricing-section"

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
const DIR = "components/marketing/home"
const LAPTOP = "@media (min-width:1024px) and (max-height:900px){"

console.log("\n── AI tools: the card fits a laptop screen with room to spare ──")
{
  const css = AI_TOOLS_STYLES.map((s) => s.css).join("")
  const at = css.indexOf(LAPTOP)
  const block = at < 0 ? "" : css.slice(at, css.indexOf("\n}\n", at))
  check("a short laptop has its own block", block.length > 0)
  check("the card pads less there, by the screen's height", /\.ait-card\{padding:clamp\(32px,5\.5svh,64px\) clamp\(40px,4\.4vw,64px\)\}/.test(block))
  check("the terminal runs the phone's 16 lines at the phone's line height", /\.ait-nophone\{display:none\}/.test(block) && /\.ait-body\{padding:14px 18px 16px;line-height:1\.62\}/.test(block) && /\.ait-line\{min-height:1\.62em\}/.test(block))
  const last = AI_TOOLS_SCRIPT.map((l) => l.phone === false).lastIndexOf(true)
  check("with the phone's timing for the lines after the gap", AI_TOOLS_SCRIPT.every((_, i) => (i > last) === new RegExp(`\\.ait-l${i}\\{animation-name:ait-m${i}\\}`).test(block)))
  check("its type stays the desktop's 13px", !/font-size/.test(block) && /\.ait-body\{padding:16px 18px 20px;font:13px\/1\.75/.test(css))
}

console.log("\n── the app: the stage held to 62svh ──")
{
  const css = read(`${DIR}/app-anywhere.module.css`)
  check("min(38vw, 62svh) between 440 and 620px: 496px at 1440x800, 620 at 1920x1080", /--h: clamp\(440px, min\(38vw, 62svh\), 620px\);/.test(css))
  check("a phone keeps its own fixed stage", /@media \(max-width: 899px\) \{\s*\.card \{\s*--h: 580px;/.test(css))
}

console.log("\n── analytics: two rows that fit ──")
{
  const css = read(`${DIR}/analytics-showcase.module.css`)
  const src = read(`${DIR}/analytics-showcase.tsx`)
  check("each card 44svh, 340 to 400px", /\.globeCard,\s*\.fixed \{\s*height: clamp\(340px, 44svh, 400px\);/.test(css))
  check("a phone keeps its own heights", /@media \(max-width: 639px\) \{\s*\.globeCard \{\s*height: 470px;\s*\}\s*\.fixed \{\s*height: auto;/.test(css))
  check("the heading sits 40px over the cards on a short laptop, 56 elsewhere", /mb-10 max-w-\[920px\] sm:mb-14 \[@media\(min-width:1024px\)_and_\(max-height:900px\)\]:!mb-10/.test(src))
}

console.log("\n── the map: heading and card in one screen ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const at = src.indexOf(LAPTOP)
  const block = at < 0 ? "" : src.slice(at, src.indexOf("\n}\n", at))
  check("a short laptop block", block.length > 0)
  check("a smaller product card, the copy closer, less padding", /\.cmm-prod\{width:196px\}/.test(block) && /\.cmm-copy\{margin-top:28px\}/.test(block) && /\.cmm-card\{min-height:0;padding:24px 0 28px\}/.test(block) && /\.cmm-head\{margin-bottom:32px\}/.test(block))
  check("elsewhere as before", /\.cmm-prod\{width:224px;/.test(src) && /\.cmm-copy\{position:relative;z-index:2;margin:44px 0 0 /.test(src) && /padding:30px 0 36px;min-height:500px\}/.test(src))
}

console.log("\n── pricing and earnings ──")
{
  const home = renderToStaticMarkup(createElement(PricingSection, { editorial: true, hideDetailsLink: true }))
  const page = renderToStaticMarkup(createElement(PricingSection, {}))
  check("the home section pads 64px a side on a short laptop", /class="bg-white py-20 sm:py-24 \[@media\(min-width:1024px\)_and_\(max-height:900px\)\]:!py-16"/.test(home))
  check("/pricing is untouched", !/max-height:900px/.test(page))
  const earn = read(`${DIR}/earnings-calculator.tsx`)
  check("the earnings heading has room for its one line (it broke at 1460px, leaving \"earn.\" alone)", /\[data-landing-story\] \.cme \.story-section-heading\{max-width:1240px\}/.test(earn))
}

console.log("\n── no copy of the old 100vh habit ──")
{
  const files = ["ai-tools-section.tsx", "app-anywhere.module.css", "analytics-showcase.module.css", "sell-everywhere-map.tsx", "earnings-calculator.tsx"].map((f) => read(`${DIR}/${f}`))
  check("nothing sized by vh, which moves with a phone's URL bar", files.every((s) => !/\d(vh|dvh)\b/.test(s)))
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after the round 9 suites", /"tests\/home-landing-r9-[\w-]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r10-heights\.test\.ts",/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
