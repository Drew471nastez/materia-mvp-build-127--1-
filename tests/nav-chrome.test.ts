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

import { createTapRescue } from "../lib/tap-rescue"
import { isSellFormRoute } from "../lib/marketplace/sell-route"

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
  "an entrance is never declared on whatever happens to be in <main>",
  (() => {
    // A route with a loading boundary paints TWO elements into that slot, one
    // after the other: the Suspense shell, then the real page. An entrance
    // declared on `main > *` is therefore declared on both and plays twice —
    // the screen slides in, is replaced, and slides in again. That is the
    // "doubles on back" exactly, and app/(marketing)/messages/loading.tsx
    // carries no `data-primary` specifically so the narrow rule cannot match
    // it. The shells are indistinguishable from the pages they stand in for,
    // so this must always be opt-in.
    const css = read("app/globals.css")
    const rules = [...css.matchAll(/html\.pop-return[^{]*\{[^}]*animation:[^}]*\}/g)].map((m) => m[0])
    return rules.length > 0 && rules.every((r) => !/> main > \*\s*(:not\([^)]*\))?\s*\{/.test(r))
  })(),
  "        app/globals.css — a wildcard here animates the loading shell AND the\n" +
    "        page that replaces it.",
)

check(
  "and only one element carries the sell sheet's entrance",
  (() => {
    // The intercepted route had a loading shell with `sell-sheet-enter` on it
    // and the form applies the same class on mount — two elements, two slides,
    // one press. Its own header claimed "one arrival instead of two", which was
    // true only if the form did not re-animate, and the form does.
    const shells = [
      "app/(marketing)/@modal/(.)products/new/loading.tsx",
      "app/(marketing)/products/new/loading.tsx",
    ].filter((f) => existsSync(join(process.cwd(), f)))
    return shells.every((f) => !/sell-sheet-enter/.test(read(f)))
  })(),
  "        A Suspense shell that animates in is a second opening of the sheet.",
)

check(
  "the keyboard closing is carried rather than stepped",
  (() => {
    // iOS animates the keyboard down over ~250ms and reports the new viewport
    // ONCE, at the end. Everything sized from --vv-h is correct, then correct at
    // a different size, with nothing in between. The layout is never wrong; it
    // arrives in one frame, and that is the bump.
    const vars = read("components/viewport-vars.tsx")
    const css = read("app/globals.css")
    return (
      /Math\.abs\(h - lastH\) > 80/.test(vars) &&
      /classList\.add\("vv-settling"\)/.test(vars) &&
      /html\.vv-settling \.thread-shell/.test(css)
    )
  })(),
  "        components/viewport-vars.tsx — the intermediate sizes are never\n" +
    "        reported, so CSS has to carry the one step that is.",
)

check(
  "and the transition is in effect before the value it transitions changes",
  (() => {
    // A transition only runs if the property was already in effect at the
    // previous style resolution. Set the class and the variable in the same
    // frame and the browser has nothing to interpolate from — the value snaps
    // and the class does nothing at all, which looks exactly like not having
    // written this.
    const vars = read("components/viewport-vars.tsx")
    const addAt = vars.indexOf('classList.add("vv-settling")')
    const flushAt = vars.indexOf("void root.offsetHeight")
    const setAt = vars.indexOf('root.style.setProperty("--vv-h"')
    return addAt > 0 && flushAt > addAt && setAt > flushAt
  })(),
)

check(
  "a toolbar or a dragged page is NOT transitioned",
  (() => {
    // Those change the same variables continuously, and transitioning them
    // would make the screen lag a finger actively moving it — a worse fault
    // than the one being fixed.
    const vars = read("components/viewport-vars.tsx")
    // The settle is reached only through the jump test, never unconditionally.
    return /if \(lastH >= 0 && Math\.abs\(h - lastH\) > 80\) settle\(\)/.test(vars)
  })(),
)

check(
  "what the cover uncovers has moved, not just brightened",
  (() => {
    // A fade is a change in opacity and nothing else, so a correctly fading
    // cover can still leave the conversation feeling switched on. The travel is
    // the other half — and it is a TRANSFORM against the cover's opacity, since
    // two opacity ramps on nested elements multiply into a fade that changes
    // pace partway through.
    const thread = read("components/messages/thread.tsx")
    const css = read("app/globals.css")
    return (
      /!covered && "thread-reveal"/.test(thread) &&
      /@keyframes thread-reveal/.test(css) &&
      /translate3d\(0, 10px, 0\)/.test(css) &&
      !/opacity/.test(/\.thread-reveal \{[\s\S]*?\n  \}/.exec(css)?.[0] ?? "opacity")
    )
  })(),
)

check(
  "and it rides on the message column, not on the scroll container",
  (() => {
    // A transform on the scroller would make it the containing block for
    // anything fixed inside it and would move its scrollbar; on the column it
    // changes no layout at all.
    const thread = read("components/messages/thread.tsx")
    const scroller = /ref=\{scrollerRef\}[\s\S]*?className="thread-surface[^"]*"/.exec(thread)?.[0] ?? ""
    return scroller.length > 0 && !/thread-reveal/.test(scroller)
  })(),
)

// ── THE + THAT STOPPED OPENING ANYTHING ─────────────────────────────────────

check(
  "a listing whose slug begins with new is not mistaken for the sell form",
  (() => {
    // DRIVEN, because this one is a pure function and there is no excuse not to.
    // `sheetOpen` is what the + checks before it opens anything, so an unbounded
    // prefix match means the button silently refuses every press on any listing
    // called "New Balance…", for as long as that page is open, with nothing
    // anywhere to suggest why.
    return (
      isSellFormRoute("/products/new") &&
      isSellFormRoute("/products/new/") &&
      isSellFormRoute("/products/edit/abc") &&
      !isSellFormRoute("/products/newbalance-97") &&
      !isSellFormRoute("/products/new-era-cap") &&
      // The note in that file already made this argument about `edit` — it just
      // was not applied to `new`.
      !isSellFormRoute("/products/editorial-picks") &&
      !isSellFormRoute("/products/eu-2") &&
      !isSellFormRoute(null)
    )
  })(),
  "        lib/marketplace/sell-route.ts — an unbounded prefix disables the +\n" +
    "        on every listing whose slug starts with the route name.",
)

check(
  "both ways of leaving the sell form re-resolve the route tree",
  (() => {
    // The form is reached through an INTERCEPTED route, and leaving one with
    // `replace` rewrites the history entry while the router still holds the tree
    // in which that interception is what is being shown. The screen you land on
    // is correct, so nothing looks wrong — what is left behind is a @modal slot
    // the router considers already resolved, and the next push of the same URL
    // matches a tree that already contains it and renders nothing.
    //
    // The edit branch has had the refresh since it was written and the publish
    // branch never did, which is the whole of why one leaves the + working and
    // the other kills it.
    const form = read("components/sell/new-listing-form.tsx")
    // Split on the timeout each exit ends with, and look at the block before
    // each one. Matching the whole block with a bounded regex failed on the
    // edit branch, whose explanatory comment is longer than any window worth
    // writing — and a length-limited pattern that silently stops matching is
    // the exact failure mode these checks exist to avoid.
    // Each exit is a `window.setTimeout(() => { … }, 316)`. Split on the tail,
    // then take everything after the LAST timeout opened in each piece — that
    // is the body of the exit, however long the reasoning inside it grows.
    // A fixed-width window was tried first and failed the moment a comment
    // outgrew it, which is the failure mode these checks exist to avoid.
    // COMMENTS STRIPPED FIRST, and this is not a detail: verifying this check
    // by commenting the call out left `// router.refresh()` in the file, which
    // the pattern matched happily. A test that a commented-out fix satisfies is
    // a test of nothing at all — the third time this exact trap has been walked
    // into in this file, hence `strip`, which is defined at the top for it.
    const bodies = strip(form)
      .split("}, 316)")
      .slice(0, -1)
      .map((b) => b.slice(b.lastIndexOf("window.setTimeout(")))
    const exits = bodies.filter((b) => /router\.replace\(/.test(b))
    return exits.length >= 2 && exits.every((b) => /router\.refresh\(\)/.test(b))
  })(),
  "        components/sell/new-listing-form.tsx — a replace out of an intercepted\n" +
    "        route leaves the slot resolved unless the tree is refreshed.",
)

check(
  "the watchdog stops the moment the navigation is proven, not when the sheet is gone",
  (() => {
    // THE THIRD DISTINCT WAY THIS WATCHDOG HAS PRODUCED THE BUG IT PREVENTS,
    // and the pattern is always the same: it reads "the sheet is not on screen
    // right now" as "the sheet never opened". Those are different states, and
    // the gap between them is everything a person does in the four seconds
    // after pressing + — open it and change their mind, open it and publish,
    // open it and go back. In all of those the sheet opened perfectly and is
    // legitimately gone by the deadline, and the escalation then hard-loads
    // /products/new on top of whatever screen they had settled on. The sell
    // page appearing out of nowhere seconds after being dismissed is exactly
    // "it appears, then closes, then appears randomly".
    const nav = read("components/explore/mobile-bottom-nav.tsx")
    const sell = strip(nav).slice(strip(nav).indexOf("const onSell = useCallback("))
    const body = sell.slice(0, sell.indexOf("}, [sheetOpen, router])"))
    return (
      // A baseline to compare against at all.
      /const from = /.test(body) &&
      // Moved somewhere that is NOT the sell form -> delivered, and the person
      // has since gone elsewhere. Nothing to do.
      /now !== from && !isSellFormRoute\(now\)/.test(body) &&
      // BUT being ON the sell route with no sheet is not success. That hole is
      // the size of "press +, the URL changes, and no sheet ever appears" —
      // which is a dead button with nothing left to catch it. Closing a sheet
      // moves the URL OFF this route, so this shape is unambiguously broken.
      /!open\(\) && \(at === from \|\| isSellFormRoute\(at\)\)/.test(body)
    )
  })(),
  "        components/explore/mobile-bottom-nav.tsx — a pathname that MOVED is\n" +
    "        proof the push landed. Only one that never changed is a dead end.",
)

check(
  "an intercepted modal can never swallow the screen by hiding on its first render",
  (() => {
    // The guard that stops a stale slot drawing the wrong listing returned null
    // whenever the pathname disagreed — which made a first-render disagreement
    // fatal rather than cosmetic, and shipped as "I press + and nothing
    // happens". A comparison that is right on every subsequent render and wrong
    // on the first now costs a frame instead of the feature: it renders, and an
    // effect removes it if it turns out to be stale.
    const guard = strip(read("components/sell/intercepted-only.tsx"))
    return (
      /useState\(false\)/.test(guard) &&
      /useEffect\(\(\) => \{\s*\n\s*setStale\(pathname !== path\)/.test(guard) &&
      // And nothing may return null straight out of the render again.
      !/if \(pathname !== path\) return null/.test(guard)
    )
  })(),
  "        components/sell/intercepted-only.tsx — hiding during render makes a\n" +
    "        first-frame disagreement fatal. Hide from an effect.",
)

check(
  "scrolling a list of conversations does not dim the screen",
  (() => {
    // The dip takes <main> to 0.88 so the screen is already moving when a route
    // commits. On a TAB BAR that is right, because a press there is always a
    // press. A conversation row lives inside a scroller, where a finger landing
    // is as likely to be the start of a drag as a tap — so starting it on
    // pointerdown dimmed the entire list on every attempt to scroll, and
    // undimmed it a few pixels later when the gesture turned out to be a scroll.
    const inbox = strip(read("components/messages/inbox.tsx"))
    const press = /onPress: \(id\) => \{[\s\S]*?\n      \},/.exec(inbox)?.[0] ?? ""
    return (
      press.length > 0 &&
      !/beginTabLeave/.test(press) &&
      // Nor a buzz, for the same reason: it fired on every row touched while
      // scrolling past it.
      !/triggerHaptic/.test(press) &&
      // The row highlight stays — one row, under the finger, taken back the
      // instant the gesture becomes a drag, which is what a native list does.
      /setPressed\(id\)/.test(press)
    )
  })(),
  "        components/messages/inbox.tsx — a press inside a scroller is a bet on\n" +
    "        the gesture, and the bet is wrong every time somebody scrolls.",
)

check(
  "and the dip still happens, once the gesture is certainly a tap",
  (() => {
    // Removing it outright would take the handover off the one navigation that
    // most needs it. It moves to the click — a tap that has already happened —
    // and to the rescue, which only runs when the click was swallowed.
    const inbox = strip(read("components/messages/inbox.tsx"))
    const onClick = /onClick: \(\) => \{[\s\S]*?\n    \},/.exec(inbox)?.[0] ?? ""
    return (
      /if \(rescue\.current\?\.click\(\) === false\) return/.test(onClick) &&
      /beginTabLeave\(\)/.test(onClick) &&
      // And in the rescue, which is the swallowed-click path.
      /onRescue: \(id\) => \{[\s\S]*?beginTabLeave\(\)/.test(inbox) &&
      // A late click after a rescue must not start a second one.
      /=== false\) return/.test(onClick)
    )
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
