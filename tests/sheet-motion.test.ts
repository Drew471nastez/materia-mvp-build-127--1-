/**
 * ===========================================================================
 *  THE SELL SHEET MOVES ON THE COMPOSITOR, OR IT DOES NOT MOVE WELL
 * ===========================================================================
 *
 * The slide up from the + in the tab bar, and the slide back down, were both
 * stuttering. The animation itself was never the problem — it is a single
 * `transform`, on the right curves, with the class present from the first
 * painted frame so there is no flash.
 *
 * What was wrong was everything ELSE happening during those frames:
 *
 *   1. FIVE backdrop-filters inside the moving element. A `backdrop-filter`
 *      under a transformed ancestor cannot be composited once and reused — the
 *      browser re-samples and re-blurs its backdrop on every single frame the
 *      ancestor moves. The header had one, and each photo tile had four, so a
 *      listing with six photos was fighting twenty-five live blur passes.
 *      Which is why it felt worse the more you had uploaded.
 *
 *   2. The close animation had to BUILD its compositor layer. `will-change`
 *      lived only on the two animation classes, and the enter class comes off
 *      once the sheet has arrived — so pressing X asked for a full-screen layer
 *      on the very frame the movement started.
 *
 * Both are the kind of thing that comes back the moment somebody adds a
 * tasteful blur to a chip, so they are written down here.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const css = strip(read("app/globals.css"))
const form = strip(read("components/sell/new-listing-form.tsx"))

console.log("\nThe sell sheet: what happens during the 400ms it is moving")

check(
  "every blur inside the sheet is suspended while it travels",
  /\.sell-sheet-enter \*,\s*\.sell-sheet-leave \*,\s*\.sell-sheet-armed \* \{[\s\S]{0,200}?backdrop-filter: none !important/.test(css),
  "        A backdrop-filter under a moving ancestor is re-blurred every frame.\n" +
    "        Six photos meant twenty-five of them against a 420ms slide.",
)

check(
  "the webkit prefix is there too",
  // Safari on iOS is the platform this was stuttering on. Unprefixed alone
  // would have suspended nothing where it actually mattered.
  /-webkit-backdrop-filter: none !important/.test(css),
)

check(
  "the header does not blur a background that is not there",
  (() => {
    // It sits directly on the sheet's own opaque colour, so the filter cost a
    // full re-composite per frame and bought no visual difference at all.
    const header = form.slice(form.indexOf("shrink-0 border-b border-neutral-200/80"))
    return /bg-white md:hidden/.test(header.slice(0, 120))
  })(),
)

check(
  "the compositor layer exists BEFORE the close starts moving",
  /\.sell-sheet-armed \{[\s\S]{0,80}?will-change: transform/.test(css) &&
    /setArmed\(true\)\s*\n\s*requestAnimationFrame\(\(\) => setLeaving\(true\)\)/.test(form),
  "        Otherwise the browser builds a full-screen layer on the very frame\n" +
    "        the animation begins, which is the hitch at the start of a close.",
)

check(
  "both ways out of the sheet are armed, not just the X",
  // Closing by pressing X and closing by publishing are two different code
  // paths, and only one of them used to exist when this was written.
  (form.match(/setArmed\(true\)/g) ?? []).length >= 2,
)

check(
  "arming is a frame, not a guessed delay",
  // rAF is precisely "after the browser has had a chance to act on the class I
  // just set", which is the entire requirement. A timeout would be a number
  // somebody picked.
  !/setTimeout\([^)]*setLeaving\(true\)/.test(form),
)

check(
  "the navigation still lands inside the slide, not on top of it",
  (() => {
    // The animation now begins one frame later than the timer that fires the
    // route change, so the old 280 landed 36ms inside a 300ms slide instead of
    // the 20 it was tuned for — the screen behind appearing while the sheet
    // still had visible travel left.
    const back = /}, 296\)/.test(form)
    const publish = /}, 316\)/.test(form)
    return back && publish
  })(),
)

check(
  "it animates transform and nothing else",
  (() => {
    const enter = css.slice(css.indexOf("@keyframes sell-sheet-enter"), css.indexOf("@keyframes sell-sheet-leave"))
    // Anything else — height, top, opacity over a full-screen subtree — drops
    // the whole animation onto the main thread, where it competes with a
    // 1,300-line form mounting.
    return /translate3d/.test(enter) && !/(height|top|left|width|opacity):/.test(enter)
  })(),
)

check(
  "none of this runs on a desktop, where it is a page rather than a sheet",
  /\.sell-sheet-enter,\s*\.sell-sheet-leave,\s*\.sell-sheet-armed \{ animation: none; will-change: auto; \}/.test(css),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
