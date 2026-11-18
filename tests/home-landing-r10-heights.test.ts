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
  // Changed on purpose (landing round 11): the owner: "the height is too short now, make it a little more natural": every line of the run at line height 1.7, the card padding a little more by the screen's height (about 590px at 1440x800, was about 500).
  check("the card pads a little less there, by the screen's height", /\.ait-card\{padding:clamp\(40px,7svh,64px\) clamp\(40px,4\.4vw,64px\)\}/.test(block))
  check("the terminal keeps all its lines there, at line height 1.7", !/\.ait-nophone\{display:none\}/.test(block) && /\.ait-body\{padding:16px 18px 18px;line-height:1\.7\}/.test(block) && /\.ait-line\{min-height:1\.7em\}/.test(block))
  check("so the lines keep the desktop's timing there", !/animation-name:ait-m/.test(block) && AI_TOOLS_SCRIPT.length === 18)
  check("its type stays the desktop's 13px", !/font-size/.test(block) && /\.ait-body\{padding:16px 18px 20px;font:13px\/1\.75/.test(css))
}

// Changed on purpose (landing round 11): the stage is gone (the owner's photograph is back, at its own 4:3, so its height follows its width and never the screen's).
console.log("\n── the app: the photograph at its own 4:3 ──")
{
  const css = read(`${DIR}/app-anywhere.module.css`)
  check("no stage held to the screen's height; the photograph's box is its own 4:3", !/--h: clamp/.test(css) && /\.photo \{[^}]*aspect-ratio: 4 \/ 3;/.test(css))
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
  check("a smaller product card, the copy closer, less padding", /\.cmm-stage\{--cmm-w:204px;--cmm-peek:72px\}/.test(block) && /\.cmm-copy\{margin-top:32px\}/.test(block) && /\.cmm-card\{min-height:540px;padding:36px 0 34px\}/.test(block)) // Changed on purpose (landing round 11): the owner: the map "too short now"; 540px on a short laptop, the heading on one line.
  check("elsewhere a 220px card and 560px", /\.cmm-stage\{position:relative;--cmm-w:220px;/.test(src) && /\.cmm-copy\{position:relative;z-index:2;margin:40px 0 0 /.test(src) && /padding:44px 0 40px;min-height:560px/.test(src)) // Changed on purpose (landing round 11): the stack and a taller card.
}

console.log("\n── pricing and earnings ──")
{
  const home = renderToStaticMarkup(createElement(PricingSection, { editorial: true, hideDetailsLink: true }))
  const page = renderToStaticMarkup(createElement(PricingSection, {}))
  check("the home section pads 64px a side on a short laptop", /class="py-20 sm:py-24 \[@media\(min-width:1024px\)_and_\(max-height:900px\)\]:!py-16"/.test(home) /* Changed on purpose (landing round 15): no ground of its own on the home page (the sheet is white), so its square corners never show inside the sheet's rounded ones. */)
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
