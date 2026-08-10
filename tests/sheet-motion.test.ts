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

import { existsSync, readFileSync } from "node:fs"
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

import {
  DEPARTMENTS,
  LISTING_CATEGORIES,
  categoryShortLabel,
  departmentForGroup,
  groupsForDepartment,
} from "../lib/marketplace/listing-taxonomy"

const css = strip(read("app/globals.css"))
const taxonomy = strip(read("lib/marketplace/listing-taxonomy.ts"))
const form = strip(read("components/sell/new-listing-form.tsx"))
const bar = strip(read("components/explore/mobile-bottom-nav.tsx"))
const page = strip(read("components/sell/picker-page.tsx"))

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

console.log("\nThe + turning, where somebody can actually see it")

check(
  "the turn starts on the FINGER, not on the route",
  (() => {
    // THE BUG. The rotation was keyed to `sheetOpen`, which is the URL — so it
    // could not begin until the navigation committed, and the sheet starts
    // climbing on that same commit. This bar is at the bottom of the screen and
    // the sheet rises from below it, so it covers the + within a frame or two
    // of starting. The turn was played, in full, behind the thing hiding it.
    // What you saw was a + that sat still and then was gone.
    const press = bar.slice(bar.indexOf("onPress: (intent)"), bar.indexOf("onAbandon:"))
    return /if \(intent\.key === "sell"\) setTurning\(true\)/.test(press)
  })(),
  "        A turn keyed to the route is a turn nobody sees.",
)

check(
  "the icon reads the press, and the press falls back to the route",
  (() => {
    // Optimistic first, truth behind it — the same shape as `pressed` for the
    // tab fills, and for the same reason.
    return (
      /const plusOpen = sheetOpen \|\| turning/.test(bar) &&
      /data-open=\{plusOpen \? "true" : "false"\}/.test(bar)
    )
  })(),
)

check(
  "the optimistic flag is never READ by the press it belongs to",
  (() => {
    // The whole reason the + used to go dead was a `launching` boolean that the
    // press branched on: any moment it disagreed with the route was a tap that
    // returned at the guard and opened nothing. This flag is written by the
    // press and read only by a transform. Nothing branches on it, so no value it
    // can hold costs you a tap — the worst it can do is turn an icon.
    const sell = bar.slice(bar.indexOf("const onSell = useCallback"), bar.indexOf("}, [sheetOpen, router])"))
    return sell.length > 100 && !/turning/.test(sell)
  })(),
  "        An optimistic flag that a guard reads is the dead-+ bug coming back.",
)

check(
  "a turn that the sheet never justifies takes itself back",
  (() => {
    // A cancelled tap, or a push that was dropped. Both would otherwise leave an
    // × sitting over a screen with no sheet on it, for the rest of the session.
    const abandon = bar.slice(bar.indexOf("onAbandon:"), bar.indexOf("onRescue:"))
    return (
      /setTurning\(false\)/.test(abandon) &&
      /const give = window\.setTimeout\(\(\) => setTurning\(false\), 2400\)/.test(bar)
    )
  })(),
)

check(
  "there is no bounce at the end of it",
  (() => {
    // `cubic-bezier(0.34, 1.5, 0.64, 1)` — 1.5 on a control point carries the
    // icon past 135° and lets it fall back. On a 24px glyph turning in half a
    // second that is not weight, it is a twitch, and it lands at the exact
    // moment the rising sheet reaches the icon. A transition overshoots when a
    // control point's y leaves the 0..1 range; neither of these may.
    const pts = /\.plus-turn \{[\s\S]{0,120}?cubic-bezier\(([^)]+)\)/
      .exec(css)?.[1]
      .split(",")
      .map((n) => Number(n.trim()))
    return !!pts && pts.length === 4 && pts[1] <= 1 && pts[3] <= 1
  })(),
  "        The bounce is in the curve, so no duration can fix it.",
)

check(
  "the + and the sheet move on ONE curve, not two",
  (() => {
    // They are one movement seen in two places. Two easings for one movement is
    // the same mistake the pickers are checked for above.
    const plus = /\.plus-turn \{[\s\S]{0,120}?transition: transform \d+ms (cubic-bezier\([^)]+\))/.exec(css)?.[1]
    const sheet = /\.sell-sheet-enter \{ animation: sell-sheet-enter \d+ms (cubic-bezier\([^)]+\))/.exec(css)?.[1]
    return !!plus && plus === sheet
  })(),
)

check(
  "the icon is the slowest thing in the gesture, on purpose",
  (() => {
    // It is still easing when the sheet passes over it, so the turn is covered
    // mid-movement rather than caught stopping. A rotation you never see end
    // never reads as having stopped short.
    const plus = Number(/\.plus-turn \{[\s\S]{0,120}?transition: transform (\d+)ms/.exec(css)?.[1])
    const sheet = Number(/\.sell-sheet-enter \{ animation: sell-sheet-enter (\d+)ms/.exec(css)?.[1])
    return plus > sheet && plus >= 480
  })(),
)

check(
  "nothing about the purple circle scales under a finger",
  (() => {
    // `group-active:scale-95` on a 200ms transform: two and a half pixels of
    // squash on a 48px circle, fired by `:active` — which the browser sets and
    // clears on its own schedule, not the gesture's. So it arrived a beat late,
    // ran across the rotation, and snapped back with no easing at all on a
    // cancelled press. Two transforms of different lengths on nested elements,
    // started by different events, is the whole recipe for cheap.
    const sell = bar.slice(bar.indexOf('key: "sell", href:'), bar.indexOf('href="/messages"'))
    return sell.length > 100 && !/scale-/.test(sell) && !/group-active:/.test(sell)
  })(),
  "        The press is already answered by a haptic and a rotation, both on\n" +
    "        the frame the finger lands. A squash is a third answer.",
)

check(
  "and the platform cannot paint its own grey plate over it either",
  (() => {
    // The other half of "cheap", and it is not on any curve: a WebView flashes
    // its tap highlight over an untreated button, so the purple circle went dull
    // under the finger and lit again on release. The sell button was the one tab
    // in this bar not carrying the suppression the other four share.
    const sell = bar.slice(bar.indexOf('key: "sell", href:'), bar.indexOf('href="/messages"'))
    return (
      /className=\{TAB\}/.test(sell) &&
      /const TAB =[\s\S]{0,40}"[^"]*\[-webkit-tap-highlight-color:transparent\][^"]*touch-manipulation/.test(bar)
    )
  })(),
)

check(
  "somebody who has asked for less motion gets none of it",
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,60}?\.plus-turn \{ transition: none; \}/.test(css),
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

console.log("\nThe pickers are subpages now")

check(
  "they arrive from the right, the way a deeper screen arrives",
  (() => {
    // A sheet is the right shape for a short, self-contained decision that
    // belongs to the screen behind it, and none of these are that: category is
    // three questions deep, brand means searching, and every one of them is a
    // step IN the task rather than an aside from it.
    return (
      /translate3d\(100%, 0, 0\)/.test(page) &&
      /transform \$\{up \? IN_MS : OUT_MS\}ms \$\{EASE\}/.test(page)
    )
  })(),
)

check(
  "the direction and the curve are the checkout's, not a second grammar",
  (() => {
    // Two easings for "deeper into the same task" inside one app is precisely
    // what reads as unfinished.
    const checkout = strip(read("components/checkout/full-screen-sheet.tsx"))
    const ease = /const EASE = "(cubic-bezier\([^"]+\))"/.exec(page)?.[1]
    return !!ease && checkout.includes(ease)
  })(),
)

check(
  "what a panel is doing is ONE variable, not three booleans in agreement",
  (() => {
    // Painted-or-not, mounted-or-not and moving-or-not are the same question
    // asked three ways.
    return /type Stage = "closed" \| "arming" \| "open" \| "leaving"/.test(page)
  })(),
)

check(
  "the list is built in a frame where nothing is moving",
  (() => {
    // Mounting a hundred rows and starting a transform on the SAME frame spends
    // the animation's opening on building DOM. offsetHeight is the forced
    // flush: two style changes inside one frame collapse into one, and the
    // panel appears in place instead of sliding.
    const armed = page.slice(page.indexOf('if (stage !== "arming") return'))
    return (
      /void panelRef\.current\?\.offsetHeight/.test(armed.slice(0, 400)) &&
      /requestAnimationFrame\(\(\) => setStage\(\(s\) => \(s === "arming" \? "open" : s\)\)\)/.test(
        armed.slice(0, 400),
      )
    )
  })(),
)

check(
  "and `arming` is not painted, so nothing flashes at the margin",
  /visibility: up \|\| stage === "leaving" \? "visible" : "hidden"/.test(page),
)

check(
  "leaving is what keeps it painted for exactly as long as it moves",
  (() => {
    // The alternative is a hand-written delay equal to the animation only by
    // coincidence.
    return /leaveTimer\.current = window\.setTimeout\(\(\) => setStage\("closed"\), OUT_MS\)/.test(page)
  })(),
)

check(
  "the close gets its own clean frame, the way the open does",
  (() => {
    // Closing is always triggered by a state change in the caller — picking a
    // category re-renders the form — and a transition begins on the frame its
    // starting value is computed.
    const fx = page.slice(page.indexOf('if (stageRef.current === "closed") return'))
    return /requestAnimationFrame\(\(\) => \{\s*\n\s*setStage\("leaving"\)/.test(fx.slice(0, 700))
  })(),
)

check(
  "re-opening catches a panel that is still on its way out",
  /if \(stageRef\.current === "leaving"\) setStage\("open"\)/.test(page),
)

check(
  "it is portalled out of the form that declares it",
  (() => {
    // The sell form is itself a full-screen fixed panel that runs its own
    // transform animation. A `fixed` child of a transformed element is
    // positioned against THAT element and joins its compositing context.
    return /createPortal\(/.test(page) && /document\.body,/.test(page)
  })(),
)

check(
  "a closed picker's contents are not even BUILT",
  (() => {
    // As a node, the caller constructs the whole picker on every one of its own
    // renders — a hundred and sixty React elements per keystroke in the title
    // field, eight panels over, thrown away unread.
    return (
      /children: \(\) => React\.ReactNode/.test(page) &&
      /\{live\}/.test(page) &&
      /const live = painted \? children\(\) : null/.test(page) &&
      (form.match(/<PickerPage\b/g) ?? []).length === 8 &&
      (form.match(/>\{\(\) => \(/g) ?? []).length === 8
    )
  })(),
)

check(
  "the compositor layer is held only while the panel is on screen",
  /willChange: painted \? "transform" : "auto"/.test(page),
)

check(
  "there is a way back that is not a 40px arrow in the far corner",
  (() => {
    // The sheet this replaces could be pulled down. On a screen people hold in
    // one hand, the top-left corner is the last place the thumb reaches — so
    // the edge swipe the platform already trained them on has to work.
    return /const EDGE_PX = \d+/.test(page) && /if \(t\.clientX > EDGE_PX\) return/.test(page)
  })(),
)

check(
  "the swipe paints once per frame, and measures once per gesture",
  (() => {
    // Touch events outrun the compositor, and reading a layout property
    // mid-gesture forces a synchronous flush per event.
    const move = page.slice(page.indexOf("const onTouchMove"), page.indexOf("const onTouchEnd"))
    return (
      /if \(!frameId\.current\) frameId\.current = requestAnimationFrame\(paint\)/.test(move) &&
      !/offsetWidth/.test(move) &&
      /width: el\?\.offsetWidth \|\| 1/.test(page)
    )
  })(),
)

check(
  "a swipe that goes back does not unmount the panel under itself",
  (() => {
    const end = page.slice(page.indexOf("const onTouchEnd"))
    return !/setStage/.test(end.slice(0, 900)) && /\(onBack \?\? onClose\)\(\)/.test(end.slice(0, 900))
  })(),
)

check(
  "the subpage wears the form's own chrome",
  (() => {
    // A subpage that restyles the header is a subpage that reads as a different
    // app. Same 56px bar, same centred title, same status-bar inset.
    return /env\(safe-area-inset-top, 0px\)/.test(page) && /h-14 items-center justify-center/.test(page)
  })(),
)

check(
  "choosing an option does not throw you out of the picker",
  (() => {
    // A tap that both records the answer AND slams the screen shut gives you
    // no frame in which to see that it landed — and it makes changing your
    // mind a second trip through the same three levels. The panel stays; the
    // back arrow and the edge swipe are what leave it, which is the same way
    // out you already had.
    // `onClose` legitimately closes it; nothing else may.
    const pickers = form.slice(form.indexOf("<PickerPage"))
    return pickers
      .split("\n")
      .filter((l) => !l.includes("onClose="))
      .every((l) => !l.includes("setSheet(null)"))
  })(),
  "        setSheet(null) inside an option handler is the auto-close.",
)

check(
  "and the choice is visible on the row you just tapped",
  (() => {
    // The only reason auto-closing looked acceptable was that it doubled as
    // the confirmation. Without it, the tick IS the confirmation.
    const pickers = form.slice(form.indexOf("<PickerPage"))
    return /selected=\{condition === c\.id\}/.test(pickers) && /selected=\{colour === c\.id\}/.test(pickers)
  })(),
)

console.log("\nA push, not a rectangle over a rectangle")

check(
  "the screen behind travels while the panel comes across",
  (() => {
    // A subpage sliding in over a form sitting perfectly still is two
    // unrelated frames, and no amount of extra duration fixes that — which is
    // why it read as abrupt even when it was slow. What makes a push a push is
    // that the thing you were on goes AWAY.
    return (
      /\.sell-sheet\.sell-pushed \{[\s\S]{0,120}?transform: translate3d\(-\d+%, 0, 0\)/.test(css) &&
      /sheet !== null && "sell-pushed"/.test(form)
    )
  })(),
)

check(
  "it moves on the compositor and nothing else moves at all",
  (() => {
    const rule = css.slice(css.indexOf(".sell-sheet.sell-pushable"), css.indexOf(".sell-sheet.sell-pushable") + 400)
    return /transition: transform \d+ms/.test(rule) && !/(width|height|left|margin|opacity):/.test(rule)
  })(),
)

check(
  "the page and the panel end together, in both directions",
  (() => {
    // Two animations meant to be one movement have to share their numbers, and
    // the asymmetry is deliberate: arriving gets the full glide, leaving is
    // getting out of the way of a decision already made.
    const inMs = /const IN_MS = (\d+)/.exec(page)?.[1]
    const outMs = /const OUT_MS = (\d+)/.exec(page)?.[1]
    const pushed = /\.sell-sheet\.sell-pushed \{[\s\S]{0,160}?transition-duration: (\d+)ms/.exec(css)?.[1]
    const base = /\.sell-sheet\.sell-pushable \{[\s\S]{0,120}?transition: transform (\d+)ms/.exec(css)?.[1]
    return !!inMs && inMs === pushed && !!outMs && outMs === base && Number(inMs) > Number(outMs)
  })(),
)

check(
  "the push is a phone thing only",
  (() => {
    // On a monitor the picker is a centred dialog over a dimmed page, and
    // shoving the page sideways under it would be motion with nothing behind
    // it.
    const at = css.indexOf(".sell-sheet.sell-pushable")
    return /@media \(width < 48rem\)/.test(css.slice(Math.max(0, at - 400), at))
  })(),
)

check(
  "the transition is long enough to be read as travel",
  (() => {
    // 340/280 was the right curve at the wrong length: fast enough that the
    // panel was simply THERE, which is the same information a hard cut carries.
    const inMs = Number(/const IN_MS = (\d+)/.exec(page)?.[1])
    return inMs >= 400
  })(),
)

check(
  "a phone gets a subpage; a monitor gets a dialog",
  (() => {
    // Sliding a full-screen panel in from the right is the grammar of a device
    // you hold in one hand and navigate a screen at a time. On a 27-inch
    // monitor it is a whole desktop being replaced to pick a colour, with no
    // back gesture to leave it by.
    return /const \[isDesktop, setIsDesktop\] = useState\(false\)/.test(page) && /isDesktop\s*$/m.test(page.slice(page.indexOf("const panelStyle")))
  })(),
)

check(
  "the desktop centring is in the same declaration as the animation",
  (() => {
    // An inline transform replaces the class one outright, so a
    // `-translate-x-1/2` in the className would simply be gone and the dialog
    // would open in the bottom-right quadrant.
    return (
      /transform: up \? "translate\(-50%, -50%\)"/.test(page) &&
      !/md:-translate-x-1\/2/.test(page)
    )
  })(),
)

check(
  "the phone subpage has no scrim to composite",
  (() => {
    // It covers the screen completely, so there is nothing behind it to dim —
    // and an invisible full-screen layer composited on every frame of the slide
    // is the cost of forgetting that.
    return /className="absolute inset-0 hidden bg-black\/45 md:block"/.test(page)
  })(),
)

check(
  "the edge swipe does not arm for a mouse",
  /const onTouchStart = \(e: React\.TouchEvent\) => \{\s*\n\s*if \(isDesktop\) return/.test(page),
)

check(
  "the bottom sheet it replaces is gone, not left behind unused",
  !existsSync(join(process.cwd(), "components/ui/drag-sheet.tsx")),
)

check(
  "the other bottom sheet was already fine and is left alone",
  // components/ui/bottom-sheet.tsx unmounts once its exit animation finishes,
  // so it has nothing parked off-screen to cast anything.
  /if \(!mounted \|\| typeof document === "undefined"\) return null/.test(
    strip(read("components/ui/bottom-sheet.tsx")),
  ),
)

console.log("\nAnd the levels inside the panel push too")

check(
  "a change of level is animated, not a content swap",
  (() => {
    // Three lists deep, and moving between them used to mean the rows were
    // simply different on the next frame. That is the same hard cut the panel
    // itself used to be, one level down — and worse there, because the chrome
    // does not move at all, so nothing on the screen says a navigation
    // happened.
    return (
      /const LEVEL_MS = \d+/.test(page) &&
      /level=\{catLevel\}/.test(form) &&
      /depth=\{catDepth\}/.test(form)
    )
  })(),
)

check(
  "depth is what decides the direction",
  (() => {
    // Without it a push and a pop are the same event, and every level would
    // arrive from the same side however you got there.
    return (
      /forward: depth >= depthRef\.current/.test(page) &&
      /const catDepth = catSearching \? 0 : catItems \? 2 : catDep \? 1 : 0/.test(form)
    )
  })(),
)

check(
  "clearing the search walks you back rather than sideways",
  // A search is depth 0 whatever you had drilled to.
  /const catLevel = catSearching \? "search"/.test(form),
)

check(
  "the leaving list is a snapshot; the live one never is",
  (() => {
    // The outgoing layer has to keep painting rows for a state that has already
    // moved past it — but the live layer must not, because ticking a row has to
    // show on the row you ticked.
    return (
      /const live = painted \? children\(\) : null/.test(page) &&
      /setOut\(\{ key: levelRef\.current, node: lastNode\.current, forward: /.test(page)
    )
  })(),
)

check(
  "the start state is computed before the move, or the lists just swap",
  (() => {
    const fx = page.slice(page.indexOf("useLayoutEffect(() => {\n    if (!out) return"))
    return /void i\.offsetHeight/.test(fx.slice(0, 1600)) && /requestAnimationFrame/.test(fx.slice(0, 1900))
  })(),
)

check(
  "both layers move on the compositor, and hand the layer back",
  (() => {
    const fx = page.slice(page.indexOf("useLayoutEffect(() => {\n    if (!out) return"))
    const body = fx.slice(0, 2400)
    return (
      /willChange = "transform, opacity"/.test(body) &&
      /i\.style\.willChange = ""/.test(body) &&
      !/(height|width|left|top):/.test(body)
    )
  })(),
)

check(
  "the outgoing list cannot be tapped while it is leaving",
  /pointer-events-none absolute inset-0 overflow-hidden bg-white/.test(page),
)

check(
  "the search field does not slide away with the level it was sitting in",
  (() => {
    // It belongs to the picker, not to whichever list it happens to be
    // filtering — and it was inside the scroller, so it left with it.
    return /\{painted && sticky \? <div className="shrink-0">\{sticky\(\)\}<\/div> : null\}/.test(page) &&
      /sticky=\{\(\) => <SheetSearch/.test(form)
  })(),
)

check(
  "the header catches up with the list under it",
  (() => {
    // The header is the only chrome a subpage has, and a breadcrumb that swaps
    // instantly while the list underneath travels for a third of a second is
    // the one part of the push that was still a cut. Keyed on the title so
    // React replaces the node and the animation plays again.
    return (
      /key=\{title\}/.test(page) &&
      /className="picker-title /.test(page) &&
      /@keyframes picker-title-in/.test(css) &&
      /\.picker-title \{[\s\S]{0,120}?animation: picker-title-in/.test(css)
    )
  })(),
)

check(
  "and it rises rather than sliding, because it moves in both directions",
  (() => {
    // Picking a side would be wrong half the time.
    const kf = css.slice(css.indexOf("@keyframes picker-title-in"), css.indexOf("@keyframes picker-title-in") + 260)
    return /translate3d\(0, 4px, 0\)/.test(kf) && !/translate3d\([^0]/.test(kf)
  })(),
)

check(
  "the title animation is opacity and transform only",
  (() => {
    const kf = css.slice(css.indexOf("@keyframes picker-title-in"), css.indexOf("@keyframes picker-title-in") + 260)
    return !/(height|width|top|left|margin|color):/.test(kf)
  })(),
)

check(
  "somebody who has asked for less motion gets less motion",
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,120}?\.picker-title \{[\s\S]{0,60}?animation: none/.test(css),
)

console.log("\nThe mark on a chosen row")

check(
  "it is a ring that fills, not a tick that appears",
  (() => {
    // A bare check has no unselected state to animate FROM, so it can only pop.
    // A ring is always there: selecting it is a colour and a check growing into
    // a shape that already existed, and every row now carries a visible "not
    // this one" as well.
    const row = form.slice(form.indexOf("function OptionRow("), form.indexOf("function DrillRow("))
    return (
      /rounded-full border-2/.test(row) &&
      /transition-\[background-color,border-color\] duration-200/.test(row) &&
      !/selected && <Check/.test(row)
    )
  })(),
)

check(
  "the check is in the DOM even when it is not showing",
  (() => {
    // A transition needs something to transition from; mounting the check on
    // select is the pop this replaces.
    const row = form.slice(form.indexOf("function OptionRow("), form.indexOf("function DrillRow("))
    return /selected \? "scale-100 opacity-100" : "scale-50 opacity-0"/.test(row)
  })(),
)

console.log("\nWhat is inside a picker")

check(
  "a one-word choice is a chip, not a 56px row",
  (() => {
    // Thirty-one styles, nineteen colours and nine sizes were nine hundred
    // pixels of identical rows each, every one of them containing a single
    // word. A list is the right shape for a choice you have to READ; for one
    // you RECOGNISE it puts most of the vocabulary below the fold and makes
    // comparing two of them a scroll.
    const chipped = ["size", "colour", "source", "era", "style"]
    return chipped.every((k) => {
      const at = form.indexOf(`open={sheet === "${k}"}`)
      return at > 0 && /<ChipField>/.test(form.slice(at, at + 900))
    })
  })(),
)

check(
  "the condition ladder stays a list, and each rung says what it means",
  (() => {
    // The five labels are a database constraint and cannot change; on their own
    // they are five synonyms for "used", and the difference between them is the
    // difference between an accurate listing and a return.
    const at = form.indexOf('open={sheet === "condition"}')
    return /<OptionRow/.test(form.slice(at, at + 500)) && /const CONDITION_HINTS: Record<string, string> = \{/.test(form)
  })(),
)

check(
  "the six pickers share one row and one chip, not six near-copies",
  (() => {
    // Every sheet used to write its own — a rounded box, a hover tint, a check
    // floated right, 2px of padding so the rows sat in from the edges — and no
    // two were quite the same.
    return (
      /function OptionRow\(/.test(form) &&
      /function OptionChip\(/.test(form) &&
      /function SheetSearch\(/.test(form) &&
      !/rounded-lg px-3 py-2\.5 text-left/.test(form)
    )
  })(),
)

check(
  "no picker row carries a hover style",
  // A phone has no hover, and these produced a highlight that stuck after a tap
  // on iOS.
  !/hover:bg-neutral-50/.test(form),
)

check(
  "the multi-select limit is a line of its own, not crammed into the title",
  // "Stil · alege până la 3" put two different things on the one line a phone
  // sheet gives a title.
  /function PickerNote\(/.test(form) && !/alege până la 3"/.test(form),
)

check(
  "the rare case is what gets marked, not the common one",
  (() => {
    // First an asterisk after every label, then a coloured dot before every
    // heading. Both are the same mistake: on a form where eleven of fourteen
    // fields are required, marking the required ones puts a badge on almost
    // every line and tells you nothing. A mark is only information where it is
    // rare — so the three OPTIONAL fields say so and nothing else does.
    return (
      /function OptionalTag\(\)/.test(form) &&
      !/function Req\(\)/.test(form) &&
      !/text-\[#7c3aed\]">\*<\/span>/.test(form) &&
      (form.match(/<Field label="[^"]+" optional/g) ?? []).length === 3
    )
  })(),
)

console.log("\nFinding a category")

check(
  "the picker asks who it is for before it asks what it is",
  (() => {
    // Twenty-two groups and about a hundred and sixty leaves arrived as one
    // flat scroll, every heading repeating the department because that was the
    // only thing telling "Bărbați · Încălțăminte" from "Damă · Încălțăminte".
    return /DEPARTMENTS\.map\(\(d\) => \(/.test(form) && /catGroups\.map\(\(g\) => \(/.test(form)
  })(),
)

check(
  "the department is a route, not a value",
  (() => {
    // products.category still stores the group id and products.subcategory the
    // leaf. Persisting the department would mean a migration and a second
    // source of truth for something derivable from the group.
    const submit = form.slice(form.indexOf("const submit ="), form.indexOf("const submit =") + 3000)
    return !/catDep/.test(submit) && /export function departmentForGroup/.test(taxonomy)
  })(),
)

check(
  "a group that is sold for everyone appears under every department",
  (() => {
    // Accessories, bags, sportswear, swimwear and underwear are not a fourth
    // department nobody would think to open.
    const women = groupsForDepartment("women").map((g) => g.id)
    const men = groupsForDepartment("men").map((g) => g.id)
    const kids = groupsForDepartment("kids").map((g) => g.id)
    return (
      women.includes("accessories") && men.includes("accessories") && kids.includes("accessories") &&
      women.includes("women-dresses") && !men.includes("women-dresses") && !kids.includes("women-dresses")
    )
  })(),
)

check(
  "every group is reachable from some department",
  (() => {
    // A group nobody can drill into is a category that can never be chosen
    // again — including on listings that already use it.
    const reachable = new Set(
      DEPARTMENTS.flatMap((d) => groupsForDepartment(d.id).map((g) => g.id)),
    )
    return LISTING_CATEGORIES.every((g) => reachable.has(g.id))
  })(),
)

check(
  "re-opening lands where the choice was made",
  (() => {
    // Coming back to change "Rochii midi" to "Rochii maxi" and being asked who
    // it is for again is the drill-down charging you for a decision you have
    // already made.
    return (
      /const dep = departmentForGroup\(group\)/.test(form) &&
      departmentForGroup("women-dresses") === "women" &&
      departmentForGroup("men-suits") === "men" &&
      departmentForGroup("kids") === "kids" &&
      departmentForGroup(null) === null
    )
  })(),
)

check(
  "the department is not repeated inside its own list",
  categoryShortLabel({ id: "women-dresses", label: "Damă · Rochii și salopete", items: [] }) ===
    "Rochii și salopete" &&
    categoryShortLabel({ id: "bags", label: "Genți", items: [] }) === "Genți",
)

check(
  "search cuts across the whole tree, and replaces the drill-down while it is on",
  (() => {
    // Somebody who already knows the word should not have to walk three levels
    // to reach it — and a back button pointing at a level the search is hiding
    // is a control that lies.
    return /onBack=\{!catSearching && \(catDep \|\| catGroup\) \? categoryBack : undefined\}/.test(form)
  })(),
)

check(
  "going down and choosing look different",
  (() => {
    // One closes the sheet with an answer, the other asks the next question.
    // Getting that wrong is how a drill-down feels like a trap.
    const drill = form.slice(form.indexOf("function DrillRow("), form.indexOf("function OptionChip("))
    return /<ChevronRight/.test(drill) && !/<Check/.test(drill)
  })(),
)

check(
  "a selected row is tinted edge to edge, with no line drawn through it",
  (() => {
    // The hairline used to be `border-b` on an inner box carrying the row's
    // padding, with the tint on the button around it — so the tint reached
    // further than the content did, and a selected row was a violet band with a
    // grey line INSIDE it and a strip of untinted row below that line. That was
    // the white gap along the bottom edge of a highlighted row.
    return (
      /function Divider\(\{ hidden \}: \{ hidden\?: boolean \}\)/.test(form) &&
      /absolute bottom-0 left-4 right-4 h-px bg-neutral-100/.test(form) &&
      (form.match(/<Divider hidden=\{selected\} \/>/g) ?? []).length === 2
    )
  })(),
)

check(
  "the row's own padding is on the row, not on a box inside it",
  (() => {
    // Which is the whole reason the tint can reach the edges.
    const row = form.slice(form.indexOf("function OptionRow("), form.indexOf("function OptionChip("))
    return /relative flex min-h-\[58px\] w-full items-center gap-3 px-4 py-3\.5/.test(row) && !/border-b border-neutral-100/.test(row)
  })(),
)

check(
  "removing the line does not change the row's height",
  (() => {
    // A separator that is part of the box would take a pixel of height with it
    // when it went, and the selected row would sit one pixel out of line with
    // every other row in the list.
    const div = form.slice(form.indexOf("function Divider("), form.indexOf("function Divider(") + 400)
    return /absolute/.test(div) && !/border/.test(div)
  })(),
)

console.log("\nHow fast a picker fills")

check(
  "the brand list is fetched while the form mounts, not when the sheet opens",
  (() => {
    // Brand is required, so the picker WILL be opened, and a request that
    // starts when the sheet does is a request the animation has to wait for.
    // `}, [])` is the whole claim: a mount effect, not one keyed on the sheet.
    return /fetch\("\/api\/brands\?q=", \{ credentials: "include" \}\)[\s\S]{0,420}?\}, \[\]\)/.test(form)
  })(),
)

check(
  "warming never overwrites a search result that came back first",
  /setBrands\(\(b\) => \(b\.length \? b : d\.brands\)\)/.test(form),
)

check(
  "opening the sheet is not debounced; only typing is",
  // 180ms is for a keystroke another keystroke is about to replace. Opening the
  // picker, or clearing the field, wants the answer now.
  /\}, brandQuery \? 180 : 0\)/.test(form),
)

check(
  "an unfilled brand list shows that it is loading, not that there are none",
  (() => {
    const at = form.indexOf('open={sheet === "brand"}')
    const sheetBody = form.slice(at, at + 1400)
    return /brands\.length === 0 &&/.test(sheetBody) && /animate-pulse/.test(sheetBody)
  })(),
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
  "typing does not put the bar back",
  (() => {
    // React owns this className, so every render rewrites the whole attribute
    // and wipes a class written straight onto the node with classList. This
    // form re-renders on every keystroke — title and description are state — so
    // the bar collapsed on focus and came back on the first character. Which is
    // exactly "sometimes it appears".
    const at = form.indexOf('"sell-sheet fixed inset-0')
    const cn = form.slice(at, at + 700)
    return /typing\.current && "sell-typing"/.test(cn) && /MOTION_CLASS\[motion\.current\]/.test(cn)
  })(),
  "        The same trap the motion classes are read from a ref to avoid.",
)

check(
  "two independent signals, because a false negative is the bug",
  (() => {
    // Focus is the one that works in the app. The two keyboard classes are kept
    // because they are correct on the mobile web, and hiding a bar is something
    // where a false positive costs nothing.
    return (
      /\.sell-sheet\.sell-typing \.sell-actions,/.test(css) &&
      /html\[data-keyboard="open"\] \.sell-actions,/.test(css) &&
      /html\.keyboard-open \.sell-actions \{/.test(css)
    )
  })(),
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
  /html\.keyboard-open \.sell-actions \{[\s\S]{0,140}?pointer-events: none;/.test(css),
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
