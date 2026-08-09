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

console.log("\nThe keyboard")

check(
  "the action bar collapses while somebody is typing",
  (() => {
    // Writing a description on a phone leaves about four visible lines. Two
    // buttons and a checkbox pinned under it took a third of what was left, to
    // offer an action nobody wants mid-sentence — and neither is reachable
    // without dismissing the keyboard anyway.
    return (
      /\.sell-sheet\.sell-typing \.sell-actions,[\s\S]{0,140}?grid-template-rows: 0fr;/.test(css) &&
      /className="sell-actions shrink-0 grid md:hidden"/.test(form)
    )
  })(),
)

check(
  "it is driven by FOCUS, not by measuring the keyboard",
  (() => {
    // Both keyboard detectors here compute innerHeight - visualViewport.height.
    // In a browser the layout viewport stays tall while the visual one shrinks,
    // so that difference IS the keyboard. In the Capacitor WebView the plugin
    // resizes the web view itself, so innerHeight shrinks WITH it and the
    // difference stays near zero — the attribute is never set, and the bar sat
    // under the keyboard exactly as before. Focus needs no arithmetic.
    return (
      /onFocus=\{onFieldFocus\}/.test(form) &&
      /onBlur=\{onFieldBlur\}/.test(form) &&
      /classList\.toggle\("sell-typing", on\)/.test(form)
    )
  })(),
)

check(
  "a checkbox does not count as typing",
  // It takes focus and opens no keyboard, and the one on this screen lives ON
  // the bar — collapsing the bar because somebody ticked it would be absurd.
  /type !== "checkbox"/.test(form),
)

check(
  "moving between two fields does not flash the bar back",
  // focusout fires before focusin, so a blur followed immediately by a focus
  // would collapse and re-expand between two taps.
  /blurTimer/.test(form) && /window\.clearTimeout\(blurTimer\.current\)/.test(form),
)

check(
  "focus is tracked without re-rendering a 1,400-line form",
  /const typing = useRef\(false\)/.test(form),
)

check(
  "it collapses to a height nobody had to measure",
  (() => {
    const rule = css.slice(css.indexOf(".sell-actions {"), css.indexOf(".sell-actions {") + 260)
    // A pixel value is a guess that clips the row the moment the safe-area
    // inset differs; `height: auto` does not transition at all.
    return /grid-template-rows: 1fr;/.test(rule) && /transition: grid-template-rows/.test(rule)
  })(),
)

check(
  "the space goes to the field being typed into, not into a gap",
  (() => {
    // The sheet is a flex column, so a shrinking last row hands its height to
    // the scroller above rather than leaving a hole where the bar was.
    const markup = form.slice(form.indexOf('className="sell-actions'))
    return /<div className="overflow-hidden">/.test(markup.slice(0, 220))
  })(),
)

check(
  "a hidden control cannot be pressed by accident",
  // It is clipped, not removed, so without this a thumb on the edge of the
  // keyboard could still publish a listing.
  /html\[data-keyboard="open"\] \.sell-actions \{[\s\S]{0,140}?pointer-events: none;/.test(css),
)

check(
  "none of it applies where there is no keyboard taking half the screen",
  (() => {
    const at = css.indexOf(".sell-actions {")
    const before = css.slice(Math.max(0, at - 400), at)
    return /@media \(width < 48rem\)/.test(before)
  })(),
)

console.log("\nPublishing, and what happens straight afterwards")

check(
  "nothing shows through under the action bar",
  (() => {
    // `.sell-sheet` is sized to the VISIBLE viewport so the buttons clear the
    // keyboard. When --vv-top + --vv-h is short of the screen, whatever is
    // behind shows in the band below — and on the feed that is a reels card
    // with a black gradient along its bottom edge. The dark smudge under the
    // Publish button was that, read as a shadow the bar was casting.
    return /\.sell-sheet::after \{[\s\S]{0,260}?top: 100%;[\s\S]{0,200}?background: #f6f6f7;/.test(css)
  })(),
)

check(
  "the bar behind the sheet cannot be a grey smudge",
  (() => {
    // WHAT THE "SHADOW" ACTUALLY WAS. The tab bar is fixed at the bottom, z-80,
    // UNDER the sell sheet at z-95 — and `--vv-h` is visualViewport.height,
    // which on iOS can fall short of the screen by roughly the home-indicator
    // strip. So a band of 95%-white-with-a-backdrop-blur showed under the
    // Publish button, over a full-bleed reels photograph. A smudged grey fade
    // that reads unmistakably as a shadow the button is casting.
    //
    // Opaque white cannot do that whatever ends up behind it. It also stops a
    // backdrop-filter being recomputed against fresh content on every frame of
    // every scroll on every page, which is the same argument the sell form's
    // own action bar makes about itself.
    return /border-t border-neutral-200 bg-white"/.test(bar) && !/backdrop-blur/.test(bar)
  })(),
)

check(
  "the strip travels with the sheet rather than sitting still under it",
  (() => {
    const rule = css.slice(css.indexOf(".sell-sheet::after"), css.indexOf(".sell-sheet::after") + 320)
    // Fixed would stay put and be visible under a sheet that had already left.
    return /position: absolute;/.test(rule) && !/position: fixed;/.test(rule)
  })(),
)

check(
  "the confirmation says what actually happened",
  (() => {
    // It said "Anunț publicat / Te ducem la anunțul tău" for all three
    // outcomes — including saving a DRAFT, which publishes nothing, and
    // including "add another", where nothing takes you anywhere.
    return (
      /Ciornă salvată/.test(form) &&
      /Poți adăuga următorul articol/.test(form) &&
      /Te ducem la anunțul tău/.test(form)
    )
  })(),
)

check(
  "the veil fades away instead of being deleted",
  // Unmounting a full-screen white overlay between two frames is the most
  // visible possible hard cut, because at that moment it is the only thing on
  // screen.
  /useState<false \| "in" \| "out">\(false\)/.test(form) &&
    /posted-out \$\{POSTED_OUT_MS\}ms/.test(form) &&
    /@keyframes posted-out/.test(css),
)

check(
  "the emptied form is reset behind the veil, not in front of it",
  (() => {
    // A SMOOTH scroll fired on the tick the veil was removed meant watching a
    // form that had just lost most of its height slide back to the top, with
    // the offset clamping under it as the content shrank. That is the layout
    // shift.
    const branch = form.slice(form.indexOf("if (postAnother && !draft)"))
    return /scrollTo\(\{ top: 0, behavior: "auto" \}\)/.test(branch.slice(0, 1600))
  })(),
)

check(
  "the checkbox is actually read at submit time",
  // `submit` is a useCallback; without postAnother in its dependencies it would
  // close over whatever the box was when the form first rendered.
  /postAnother, router, setMotion(, [a-zA-Z]+)*\]/.test(form),
)

check(
  "no full-screen blur under the confirmation",
  (() => {
    const veil = form.slice(form.indexOf("fixed inset-0 z-[130]"))
    // A backdrop-filter is recomputed on every frame of the fade it sits
    // under, and there is nothing worth seeing through it.
    return /bg-white\n/.test(veil.slice(0, 200)) || !/backdrop-blur/.test(veil.slice(0, 200))
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
