/**
 * ===========================================================================
 *  THE CHROME AROUND A NAVIGATION
 * ===========================================================================
 *
 * Two things sit outside every screen in the marketplace and are therefore
 * never anybody's feature: the purple progress bar at the top of the document,
 * and the round icon buttons in the mobile web header. Both were reported as
 * "buggy" rather than as anything specific, which is what chrome faults always
 * look like — you notice the app feels unfinished without being able to point at
 * the screen that did it.
 *
 * ---------------------------------------------------------------------------
 * THE BAR
 * ---------------------------------------------------------------------------
 * Three faults, and together they meant the bar was wrong on essentially every
 * navigation:
 *
 *   1. IT MEASURED ITSELF AFTER DESTROYING WHAT IT WAS MEASURING. The
 *      completion read `getBoundingClientRect().width` one line AFTER
 *      `fill.cancel()`. Cancelling a Web Animation removes its effect, so the
 *      element snapped back to `width:100%` with no transform and the read was
 *      always the full viewport. `current` was 1 every single time, the
 *      `< 0.02` early return could never fire, and every navigation ended with a
 *      full-width purple bar sweeping across and fading out — including the ones
 *      where the bar had never been visible at all.
 *
 *   2. IT WAS VISIBLE IN FORTY MILLISECONDS. The fade-in was supposed to mean a
 *      fast navigation showed nothing, but `cubic-bezier(0.1, 0.8, 0.2, 1)` is
 *      so front-loaded that the keyframe where opacity reaches 1 arrived at
 *      about 1.4% of a 3000ms animation. Every warm prefetched route flashed.
 *
 *   3. TWO NAVIGATIONS SHARED ONE ELEMENT AND ONE RESOLVER. `arrive` was a
 *      single module slot, so a second push overwrote the first one's resolver;
 *      the first could then only end at its 4-second ceiling, and ran its
 *      completion over a bar the second push was still using. A purple line
 *      sweeping the top of a screen that finished loading four seconds ago is
 *      unattributable to anything the user did, which is why it read as random.
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

import { createTapRescue } from "../lib/tap-rescue"

const nav = strip(read("lib/screen-transition.ts"))
const header = strip(read("components/marketing/mobile-web-header.tsx"))

console.log("\nThe purple bar at the top")

check(
  "it measures its own width BEFORE it cancels the animation holding it",
  (() => {
    // The whole bug. After `cancel()` the element is back to width:100% with no
    // transform, so the measurement is always the viewport and `current` is
    // always 1 — which is a full-width purple flash at the end of every
    // navigation, including the ones where nothing was ever drawn.
    const at = nav.indexOf("const current = node.getBoundingClientRect().width")
    const cancelAt = nav.indexOf("node.getAnimations().forEach((a) => a.cancel())", at)
    return at > 0 && cancelAt > at
  })(),
  "        Cancelling first destroys the value the next line reads.",
)

check(
  "and the guard it feeds can now actually fire",
  // `< 0.02` was dead code for as long as the measurement above it was taken
  // from a cancelled animation.
  /if \(current < 0\.02\) \{[\s\S]{0,120}?return/.test(nav),
)

check(
  "nothing is drawn at all for a navigation faster than the delay",
  (() => {
    // Not "fades in slowly" — says nothing yet. The element is not created, not
    // animated and not appended until the delay has actually elapsed, so a warm
    // route shows no bar rather than a faint one.
    return (
      /const BAR_DELAY_MS = \d+/.test(nav) &&
      /const start = window\.setTimeout\(\(\) => \{/.test(nav) &&
      /window\.clearTimeout\(start\)\s*\n\s*if \(!el\) return/.test(nav)
    )
  })(),
)

check(
  "the delay is long enough to cover a prefetched route",
  (() => {
    const ms = Number(/const BAR_DELAY_MS = (\d+)/.exec(nav)?.[1])
    return ms >= 150
  })(),
)

check(
  "a second navigation takes the bar off the first",
  (() => {
    // One element, one `arrive` slot, no guard: the second push overwrote the
    // first's resolver, and the first then finished at its 4s ceiling — over a
    // bar somebody else was using.
    return (
      /let ticket = 0/.test(nav) &&
      /const mine = \+\+ticket/.test(nav) &&
      /finishPending\?\.\(\)/.test(nav)
    )
  })(),
)

check(
  "and a stale one cannot finish a bar it no longer owns",
  /if \(mine !== ticket\) return/.test(nav),
)

check(
  "finishing twice does nothing the second time",
  // The ceiling and the early handover can both reach the same run.
  /if \(closed\) return\s*\n\s*closed = true/.test(nav),
)

check(
  "it is left in a known state rather than parked on its last keyframe",
  (() => {
    // `fill: forwards` holds scaleX(1) after the fade-out, so the next thing to
    // touch the element gets one frame of a full-width bar.
    const tail = nav.slice(nav.indexOf(".finished.catch"))
    return /node\.style\.transform = "scaleX\(0\)"/.test(tail) && /node\.style\.opacity = "0"/.test(tail)
  })(),
)

check(
  "going back still draws no bar at all",
  // The screen is already in the client router cache; there is no load to
  // report, and a bar over it can only be a line appearing and vanishing.
  /if \(kind === "pop"\) \{\s*\n\s*go\(\)\s*\n\s*return\s*\n\s*\}/.test(nav),
)

console.log("\nOne press opens the sell sheet once")

/**
 * DRIVEN, NOT GREPPED.
 *
 * tap-rescue takes its timers by injection precisely so its behaviour can be
 * exercised without a router, a renderer or a real bottom bar — and the last
 * two bugs of this kind were both missed by checks that asserted the wiring
 * looked right rather than that the thing did the right thing. These run it.
 */
function harness() {
  const timers = new Map<number, () => void>()
  let next = 1
  const ran: string[] = []
  const r = createTapRescue<string>({
    onPress: () => undefined,
    onAbandon: () => undefined,
    onRescue: (t) => ran.push(`rescue:${t}`),
    setTimer: (fn) => {
      const id = next++
      timers.set(id, fn)
      return id
    },
    clearTimer: (id) => void timers.delete(id),
  })
  /** Fire every timer that is still armed, as the grace period expiring would. */
  const elapse = () => {
    const due = [...timers.values()]
    timers.clear()
    due.forEach((fn) => fn())
  }
  /** What the bottom bar's onClick does with the answer. */
  const click = (t: string) => {
    if (r.click() === false) return
    ran.push(`click:${t}`)
  }
  return { r, ran, elapse, click }
}

check(
  "the ordinary path acts once, through the click",
  (() => {
    const h = harness()
    h.r.down("sell", 0, 0)
    h.r.up()
    h.click("sell") // click arrives inside the grace period
    h.elapse() // …and the timer, had it not been cleared, would fire here
    return h.ran.length === 1 && h.ran[0] === "click:sell"
  })(),
)

check(
  "a swallowed click acts once, through the rescue",
  (() => {
    const h = harness()
    h.r.down("sell", 0, 0)
    h.r.up()
    h.elapse() // grace expires with no click
    return h.ran.length === 1 && h.ran[0] === "rescue:sell"
  })(),
)

check(
  "and a click arriving AFTER the rescue does not open it a second time",
  (() => {
    // THE DOUBLE-OPEN. The grace period is 220ms and a synthesised click can
    // arrive later than that on a busy frame — a scroll settling, a route
    // committing. The rescue had already run the action; the late click found no
    // live gesture to disarm, returned silently, and the caller ran it again.
    // Two pushes, two history entries, and a visible glitch as the second landed
    // on the first.
    const h = harness()
    h.r.down("sell", 0, 0)
    h.r.up()
    h.elapse() // rescue fires
    h.click("sell") // …and the real click turns up late
    return h.ran.length === 1 && h.ran[0] === "rescue:sell"
  })(),
)

check(
  "the memory of that is consumed, not left to swallow the next press",
  (() => {
    // A guard that suppressed every later click would be a worse bug than the
    // one it fixed: the button would work once and then stop.
    const h = harness()
    h.r.down("sell", 0, 0)
    h.r.up()
    h.elapse() // rescue #1
    h.click("sell") // suppressed
    h.r.down("sell", 0, 0) // a NEW press
    h.r.up()
    h.click("sell") // must act
    return h.ran.length === 2 && h.ran[1] === "click:sell"
  })(),
)

check(
  "a press that never got a click, then a new press, still acts exactly once each",
  (() => {
    const h = harness()
    h.r.down("home", 0, 0)
    h.r.up()
    h.elapse()
    h.r.down("inbox", 0, 0)
    h.r.up()
    h.elapse()
    return h.ran.length === 2 && h.ran[0] === "rescue:home" && h.ran[1] === "rescue:inbox"
  })(),
)

check(
  "a drag is not a tap and opens nothing",
  (() => {
    const h = harness()
    h.r.down("sell", 0, 0)
    h.r.move(0, 40) // past the slop
    h.r.up()
    h.elapse()
    return h.ran.length === 0
  })(),
)

check(
  "and the bar honours the answer rather than calling run() regardless",
  (() => {
    // The machine can only report; the caller is what acts.
    const bar = strip(read("components/explore/mobile-bottom-nav.tsx"))
    return /if \(rescue\.current\?\.click\(\) === false\) return/.test(bar)
  })(),
)

check(
  "with a floor under it that expires rather than latches",
  (() => {
    // The note in that file records why a `launching` boolean had to be deleted:
    // set on press, cleared on a route change, so any moment the two disagreed
    // left it stuck true and the + dead for the session. A timestamp cannot
    // stick — it expires by wall clock whatever else goes wrong.
    const bar = strip(read("components/explore/mobile-bottom-nav.tsx"))
    return (
      /const now = Date\.now\(\)/.test(bar) &&
      /if \(now - lastSell\.current < 700\) return/.test(bar) &&
      /lastSell\.current = now/.test(bar) &&
      !/const \[launching/.test(bar)
    )
  })(),
)

console.log("\nThe round icon buttons in the mobile web header")

check(
  "nothing in this header scales under a finger",
  (() => {
    // Three percent of a 44px button is a pixel and a third: too small to read
    // as deliberate, too large to be nothing. What it looks like is a wobble.
    // The whole file, not just the icon row — leaving the pills bumping beside
    // icons that no longer do is one row with two grammars in it, which is worse
    // than the bump was.
    return !/active:scale/.test(header) && !/transition-transform/.test(header)
  })(),
)

check(
  "a filled pill darkens instead of borrowing the icons' grey",
  (() => {
    // Grey over brand purple is a different button, not a pressed one. #6d28d9
    // is not a new colour either — it is the last stop of the gradient the sell
    // button already uses.
    const cls = header.slice(header.indexOf("const PILL_FILLED"), header.indexOf("export function MobileWebHeader"))
    return /active:bg-\[#6d28d9\]/.test(cls) && /bg-\[#7c3aed\]/.test(cls)
  })(),
)

check(
  "and every control on the surface shares one press rule",
  (() => {
    // One constant both families are built from, so a future control cannot
    // quietly invent a third behaviour.
    return (
      /const PRESS =/.test(header) &&
      /const ICON_BTN =[\s\S]{0,200}?\$\{PRESS\}/.test(header) &&
      /const PILL_FILLED = [\s\S]{0,200}?\$\{PRESS\}/.test(header) &&
      /const PILL_QUIET = [\s\S]{0,200}?\$\{PRESS\}/.test(header)
    )
  })(),
)

check(
  "the menu, search, messages, wishlist, cart and avatar all share ONE class",
  (() => {
    // Six buttons in one row, and the complaint was about exactly one of them.
    // Fixing that one alone would leave it behaving differently from the five
    // beside it, which is worse than the bump.
    return (header.match(/\bICON_BTN\b/g) ?? []).length >= 7
  })(),
)

check(
  "the press is a tint, and it arrives instantly and leaves eased",
  (() => {
    const cls = header.slice(header.indexOf("const PRESS"), header.indexOf("export function MobileWebHeader"))
    return (
      /active:bg-neutral-100/.test(cls) &&
      /active:duration-0/.test(cls) &&
      /transition-colors duration-200 ease-out/.test(cls)
    )
  })(),
)

check(
  "and the platform's own tap flash is suppressed on them",
  (() => {
    // Otherwise the WebView paints a grey plate over the button underneath
    // whatever we do, and the tint is the second thing you see.
    const cls = header.slice(header.indexOf("const PRESS"), header.indexOf("export function MobileWebHeader"))
    return /\[-webkit-tap-highlight-color:transparent\]/.test(cls) && /touch-manipulation/.test(cls)
  })(),
)

check(
  "the hit target is still 44px, which is what the scale was shrinking",
  (() => {
    const cls = header.slice(header.indexOf("const PRESS"), header.indexOf("export function MobileWebHeader"))
    return /h-11 w-11/.test(cls)
  })(),
)

// ── THE + THAT DID NOT TURN ─────────────────────────────────────────────────

check(
  "the rotation is driven by an attribute on a real element",
  (() => {
    // `data-open` was on <Plus>, which is a COMPONENT. Whether an unknown prop
    // reaches the DOM at all is that library's decision — and when it does not,
    // the selector never matches, the icon never turns, and the CSS reads
    // perfectly correct. No error, no warning, nothing to find.
    const nav = read("components/explore/mobile-bottom-nav.tsx")
    return (
      /<span\s+className="plus-turn[^"]*"\s+data-open=\{plusOpen \? "true" : "false"\}/.test(nav) &&
      // And nothing may put it back on the icon.
      !/<Plus[^>]*data-open/.test(nav)
    )
  })(),
  "        components/explore/mobile-bottom-nav.tsx — data-open has to sit on an\n" +
    "        element, not on a component that may or may not forward it.",
)

check(
  "a sell navigation that is merely slow is not reloaded on top of",
  (() => {
    // THE DOUBLE OPEN. The watchdog gave the route 700ms and then called
    // location.assign — but 700ms is a timeout for "this phone has not finished
    // rendering a long form", not for "the push was dropped", and from here the
    // two look identical. A working navigation got a full document load dropped
    // on it, and the page opened twice because this opened it twice.
    const nav = read("components/explore/mobile-bottom-nav.tsx")
    const sell = /const onSell = useCallback\([\s\S]*?\n  \}, \[sheetOpen, router\]\)/.exec(nav)?.[0] ?? ""
    if (!sell) return false
    // ONE PRESS IS ONE PUSH. `router.push` is asynchronous, so a slow phone, a
    // cold route and a genuinely dropped push are indistinguishable from here —
    // every retry therefore fires on top of navigations that were working, and
    // every version of this double-open has been the recovery rather than the
    // press. There is exactly one push in the whole handler.
    const pushes = [...sell.matchAll(/router\.push\(/g)].length
    // The only terminal case left replaces the document, which cannot open
    // anything twice, and is four seconds out so no working navigation reaches
    // it.
    const terminal = /waited < 4000/.test(sell) && /window\.location\.assign/.test(sell)
    return pushes === 1 && terminal && !/waited > 700/.test(sell) && !/waited > 900/.test(sell)
  })(),
)

check(
  "and the watchdog cannot outlive the press that started it",
  (() => {
    // This bar is mounted on every screen for the whole session; an interval
    // per press would accumulate one per tap.
    const nav = read("components/explore/mobile-bottom-nav.tsx")
    return (
      /window\.clearInterval\(watch\)/.test(nav) &&
      /setTimeout\(\(\) => window\.clearInterval\(watch\), 6000\)/.test(nav)
    )
  })(),
)

// ── OPENING A CONVERSATION ──────────────────────────────────────────────────

check(
  "a conversation is pushed in, not faded in",
  (() => {
    // A fade IS the flash: nothing travels, so the only signal is brightness
    // changing on a screen whose content has just been replaced.
    const css = read("app/globals.css")
    return (
      /@keyframes thread-push-in/.test(css) &&
      /translate3d\(100%, 0, 0\)/.test(css) &&
      !/@keyframes thread-arrive/.test(css)
    )
  })(),
)

check(
  "and it travels on the same curve as the picker levels it was copied from",
  (() => {
    // components/sell/picker-page.tsx — choosing a brand pushes a panel in over
    // the level above it. Same easing, same distance, same duration, or the app
    // has two different ideas of what "one level deeper" looks like.
    const css = read("app/globals.css")
    const picker = read("components/sell/picker-page.tsx")
    const ease = /const EASE = "([^"]+)"/.exec(picker)?.[1]
    const inMs = /const IN_MS = (\d+)/.exec(picker)?.[1]
    const arrive = /\.thread-arrive \{[\s\S]*?\}/.exec(css)?.[0] ?? ""
    return (
      !!ease && !!inMs && arrive.includes(ease) && arrive.includes(`${inMs}ms`)
    )
  })(),
)

check(
  "the transformed ancestor is the viewport rectangle, or the screen jumps",
  (() => {
    // A transform makes this element the containing block for the fixed
    // .thread-shell inside it — which is why every earlier attempt at this
    // jumped. `inset: 0` makes that containing block exactly the viewport, so
    // the shell resolves to the identical pixels.
    const css = read("app/globals.css")
    const arrive = /\.thread-arrive \{[\s\S]*?\}/.exec(css)?.[0] ?? ""
    return /position: fixed/.test(arrive) && /inset: 0/.test(arrive)
  })(),
)

check(
  "going back is the same movement in reverse, not its own idea",
  (() => {
    // A scale-and-fade on the way back would mean the screen left one way and
    // returned another.
    const css = read("app/globals.css")
    return (
      /@keyframes pop-return-list/.test(css) &&
      /translate3d\(-25%, 0, 0\)/.test(css) &&
      /animation: pop-return-list 360ms cubic-bezier\(0\.32, 0\.72, 0, 1\)/.test(css)
    )
  })(),
)

check(
  "the profile header arrives at a lower peak speed than it did",
  (() => {
    // "Too fast" on a strip this size is peak velocity, not duration: a short
    // animation on a decisive curve covers most of its distance in the first
    // third and reads as being flung into place.
    const css = read("app/globals.css")
    const shown = /\.profile-pinned\[data-shown="true"\] \{[\s\S]*?\}/.exec(css)?.[0] ?? ""
    const ms = Number(/transform (\d+)ms/.exec(shown)?.[1])
    const fade = Number(/opacity (\d+)ms/.exec(shown)?.[1])
    // The fade still trails the travel, which is what makes it land as one
    // movement rather than two things happening.
    return Number.isFinite(ms) && ms >= 420 && Number.isFinite(fade) && fade < ms
  })(),
)

check(
  "nothing else animates the same pixels while a conversation pushes in",
  (() => {
    // <main> fades 0.88 -> 1 over 240ms on every arrival, and the push runs
    // 420ms. Both correct alone; together they are two animations of different
    // lengths on different curves on the same pixels — and an opacity below 1
    // on an ancestor forces the whole subtree into a transparency group, so the
    // compositor blends an entire screen WHILE translating a full-screen layer
    // inside it. That is the frame cost, and it looks like a stutter.
    const css = read("app/globals.css")
    return (
      /main:has\(> \.thread-arrive\)/.test(css) &&
      /html\.tab-arriving [^{]*main:has\(> \.thread-arrive\)/.test(css) &&
      /html\.pop-return [^{]*main:has\(> \[data-primary="list"\]\)/.test(css)
    )
  })(),
  "        app/globals.css — the push is the transition; the fade underneath it\n" +
    "        has to be switched off, not matched to it.",
)

check(
  "neither travelling layer is held on the GPU after it has stopped",
  (() => {
    // `will-change` on these would hold a full-screen compositor layer for the
    // whole visit — through every message scrolled, on top of the fixed shell
    // inside it — to buy one frame the translate3d already buys.
    const css = read("app/globals.css")
    // Declarations only. An absence assertion has to read CSS and not prose —
    // this first failed on the comment explaining why the property was removed,
    // which is a test marking its own fix as the bug. Second time; hence the
    // helper rather than another one-off.
    const decls = (block: string) => block.replace(/\/\*[\s\S]*?\*\//g, "")
    const arrive = decls(/\.thread-arrive \{[\s\S]*?\n  \}/.exec(css)?.[0] ?? "")
    const list = decls(/html\.pop-return [^{]*\[data-primary="list"\] \{[\s\S]*?\n  \}/.exec(css)?.[0] ?? "")
    return (
      arrive.length > 0 &&
      list.length > 0 &&
      !/will-change/.test(arrive) &&
      !/will-change/.test(list) &&
      // The promotion still happens, from the keyframes themselves.
      /translate3d/.test(css)
    )
  })(),
)

check(
  "the full-screen layer does not cover the header or swallow taps",
  (() => {
    // It spans the viewport so the fixed shell inside resolves to the same
    // pixels — which also means it spans the mobile web header, which sits
    // above this screen rather than inside it. A background would paint over
    // it; a transparent one still eats every tap on it.
    const css = read("app/globals.css")
    // Comments stripped for the same reason as the check above: the block
    // explains in prose why it has no background, and this asserts it has none.
    const strip = (b: string) => b.replace(/\/\*[\s\S]*?\*\//g, "")
    const arrive = strip(/\.thread-arrive \{[\s\S]*?\n  \}/.exec(css)?.[0] ?? "")
    const shell = strip(/@media \(width < 48rem\) \{\s*\.thread-shell \{[\s\S]*?\n  \}/.exec(css)?.[0] ?? "")
    return (
      /pointer-events: none/.test(arrive) &&
      !/background/.test(arrive) &&
      // Given back by the one element that holds everything interactive.
      /pointer-events: auto/.test(shell) &&
      // And it keeps the layer the shell used to claim for itself, or the
      // conversation silently re-orders against the header.
      /z-index: 45/.test(arrive)
    )
  })(),
)

check(
  "the loading cover actually fades instead of being switched off",
  (() => {
    // `visibility` was toggled but never transitioned, and an untransitioned
    // property applies on the frame it changes — so the cover became `hidden`
    // instantly and the opacity ramp beside it animated something nobody could
    // see. The conversation appeared in one frame.
    const thread = read("components/messages/thread.tsx")
    return (
      /transitionProperty: "opacity, visibility"/.test(thread) &&
      // Visibility flips at once on the way in and is DELAYED by the length of
      // the fade on the way out, so the element outlives its own animation.
      /transitionDelay: covered \? "0s, 0s" : "0s, 560ms"/.test(thread) &&
      /transitionDuration: "560ms, 0s"/.test(thread)
    )
  })(),
  "        components/messages/thread.tsx — an untransitioned visibility cancels\n" +
    "        the opacity fade it is paired with.",
)

check(
  "the content is not revealed while the screen is still travelling",
  (() => {
    // A cover that lifted at 150ms on a warm route revealed the messages
    // mid-slide, so the content arrived separately from the thing carrying it.
    const thread = read("components/messages/thread.tsx")
    const css = read("app/globals.css")
    const hold = Number(/setTravelled\(true\), (\d+)\)/.exec(thread)?.[1])
    const push = Number(/animation: thread-push-in (\d+)ms/.exec(css)?.[1])
    return (
      /!dataReady \|\| !pixelsReady \|\| !travelled/.test(thread) &&
      // Exactly the push, not a guessed number — and phone only, because the
      // push is phone only.
      hold === push &&
      /window\.innerWidth >= 768/.test(thread)
    )
  })(),
)

check(
  "opening a conversation does not buzz",
  (() => {
    // Haptics are for acts, not arrivals. This one also fired on every row
    // touched while scrolling a list of them.
    const inbox = read("components/messages/inbox.tsx")
    const press = /onPress: \(id\) => \{[\s\S]*?\n      \},/.exec(inbox)?.[0] ?? ""
    return press.length > 0 && !/triggerHaptic/.test(press)
  })(),
)

check(
  "back is the same movement wherever it is pressed",
  (() => {
    // Leaving a conversation slid the level above back into place and leaving a
    // listing did not move at all — two answers to one gesture.
    const css = read("app/globals.css")
    return (
      /html\.pop-return [^{]*> main > \* \{\s*\n\s*animation: pop-return-list 360ms/.test(css) &&
      // And the fade under it is off, for the same reason it is off on the
      // conversation: one movement on one set of pixels.
      /html\.pop-return [^{]*> main \{\s*\n\s*opacity: 1;/.test(css)
    )
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
