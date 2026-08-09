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
const bar = strip(read("components/explore/mobile-bottom-nav.tsx"))

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
    /setMotion\("armed"\)\s*\n\s*requestAnimationFrame\(\(\) => setMotion\("leave"\)\)/.test(form),
  "        Otherwise the browser builds a full-screen layer on the very frame\n" +
    "        the animation begins, which is the hitch at the start of a close.",
)

check(
  "both ways out of the sheet are armed, not just the X",
  // Closing by pressing X and closing by publishing are two different code
  // paths, and only one of them used to exist when this was written.
  (form.match(/setMotion\("armed"\)/g) ?? []).length >= 2,
)

check(
  "starting the animation does not re-render the form",
  (() => {
    // Every motion class used to be React state, so beginning the close
    // reconciled a 1,381-line component on the very frame the animation
    // started — main-thread work in the worst possible frame. The ref is the
    // source of truth now and the class goes straight onto the node.
    const usesRef = /const motion = useRef<SheetMotion>\("enter"\)/.test(form)
    const writesDirect = /el\.classList\.(add|remove)\(/.test(form)
    const noMotionState =
      !/useState\(false\)[\s\S]{0,40}leaving/.test(form) && !/setLeaving|setArmed|setEntering/.test(form)
    return usesRef && writesDirect && noMotionState
  })(),
)

check(
  "a re-render for any other reason cannot wipe the class mid-slide",
  // An upload finishing or a brand search returning re-renders this component
  // while the sheet is moving. className reads the same ref, so it recomputes
  // the class the animation is already using instead of clearing it.
  /MOTION_CLASS\[motion\.current\]/.test(form),
)

check(
  "the enter animation ends on an identity transform, not `none`",
  (() => {
    const enter = css.slice(css.indexOf("@keyframes sell-sheet-enter"), css.indexOf("@keyframes sell-sheet-leave"))
    // `none` removes the transform outright, which takes the element off its
    // compositor layer ON THE LAST FRAME — the slide finishing with a promotion
    // torn down and a full-screen repaint, exactly where it should settle.
    return /to\s*\{ transform: translate3d\(0, 0, 0\); \}/.test(enter) && !/transform: none/.test(enter)
  })(),
)

check(
  "the layer is released when the browser says it finished, not on a timer",
  // A timer set to 460 for a 420ms animation was both a guess and 40ms of a
  // full-screen layer nobody needed.
  /onAnimationEnd=\{onSheetAnimationEnd\}/.test(form) && !/setTimeout\(\(\) => setEntering/.test(form),
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

check(
  "the screen behind the sheet does not dip",
  (() => {
    const press = bar.slice(bar.indexOf("onPress: (intent)"), bar.indexOf("onAbandon:"))
    // THE FLASH. The dip exists because a tab change is a HANDOVER — the screen
    // you are on is going away, so it starts moving under your finger. None of
    // that is true of the sell sheet: it slides up OVER a screen that stays
    // mounted and that you come back to. Dipping it to 0.88 and releasing it on
    // commit is the page behind visibly dimming and brightening again while the
    // sheet travels across it.
    return /if \(intent\.key === "sell"\) return/.test(press) &&
      press.indexOf('intent.key === "sell"') < press.indexOf("beginTabLeave()")
  })(),
  "        Otherwise the listings behind the rising sheet change brightness\n" +
    "        for a reason nobody can name.",
)

check(
  "the dip is still armed for the four tabs that really do hand over",
  /if \(intent\.href && intent\.key !== nav\.current\.here\) nav\.current\.beginTabLeave\(\)/.test(bar),
)

check(
  "the sheet route is exempt from the tab fade as well",
  // Two different animations, both of which would have played over the slide.
  /pathname\.startsWith\("\/products\/new"\)\) return null/.test(
    strip(read("components/marketing/tab-transition.tsx")),
  ),
)

check(
  "and the screen underneath is not scrolled to the top while it is covered",
  // Closing the sheet would otherwise drop you at the top of a profile you had
  // scrolled halfway down — a navigation you never made.
  /pathname\?\.startsWith\("\/products\/new"\)\) return/.test(
    strip(read("components/marketing/shell-scroll-reset.tsx")),
  ),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
