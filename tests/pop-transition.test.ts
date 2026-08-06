/**
 * ===========================================================================
 *  THE VIEW-TRANSITION POP CAN NEVER LEAVE THE PAGE FROZEN
 * ===========================================================================
 * `startViewTransition` suppresses rendering until the promise its callback
 * returns settles. That is the whole reason it works — nothing paints while the
 * DOM is being swapped, so there is no half-updated frame — and it is also the
 * only way this can fail badly. A promise that never settles is an app that has
 * stopped drawing, on the back button of a screen used constantly.
 *
 * Everything else degrades quietly: no support, reduced motion, a wide screen,
 * a snapshot that looks wrong — all of those are a worse transition. Only the
 * freeze is a broken app. So the three independent ways out are asserted here,
 * along with the two rules that stop the pop being drawn twice.
 *
 * These are structural checks on a browser API that cannot be exercised in
 * node. They are worth having anyway: every one of them corresponds to a
 * mistake made in an earlier version of this transition, and each is invisible
 * in review — a missing timeout looks exactly like a present one until the
 * route is slow.
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

const root = process.cwd()
const mod = readFileSync(join(root, "lib/messages/pop-transition.ts"), "utf8")
const inbox = readFileSync(join(root, "components/messages/inbox.tsx"), "utf8")
const thread = readFileSync(join(root, "components/messages/thread.tsx"), "utf8")
const css = readFileSync(join(root, "app/globals.css"), "utf8")

console.log("\nThe pop: it may be ugly, it may not be frozen\n")

// ── Three independent ways for the held frame to be released ────────────────
check(
  "1. the destination can signal that it has mounted",
  /export function signalPopArrived/.test(mod) && /signalPopArrived\(\)/.test(inbox),
)
check(
  "the signal is sent before any early return in the inbox",
  (() => {
    const i = inbox.indexOf("signalPopArrived()")
    const guard = inbox.indexOf('consumeNavHint() !== "back"')
    return i !== -1 && guard !== -1 && i < guard
  })(),
  "        Behind a guard, a navigation that did not carry the hint holds the\n" +
    "        page until the timeout rescues it — 400ms of frozen frame.",
)
check(
  "2. a URL change releases it too",
  /window\.location\.pathname\s*!==\s*from/.test(mod),
  "        For a back that lands somewhere the inbox is not. The history entry\n" +
    "        under a conversation is usually /messages; it does not have to be.",
)
check(
  "3. an unconditional timeout releases it regardless",
  /setTimeout\(finish,\s*HOLD_MS\)/.test(mod),
)
check(
  "the timeout is armed BEFORE the navigation runs",
  (() => {
    const t = mod.indexOf("setTimeout(finish, HOLD_MS)")
    const g = mod.indexOf("go()")
    return t !== -1 && g !== -1 && t < g
  })(),
  "        `go` can throw. Armed after it, a throw leaves a promise nobody will\n" +
    "        ever settle and a page that never paints again.",
)
const hold = /const HOLD_MS\s*=\s*(\d+)/.exec(mod)
check("the hold is bounded and short", hold !== null && Number(hold[1]) <= 600, hold ? `        HOLD_MS = ${hold[1]}ms` : undefined)

// ── It must never navigate twice ────────────────────────────────────────────
check(
  "the caller only navigates itself when popBack declined",
  /if \(!popBack\(go\)\) go\(\)/.test(thread),
)
check(
  "popBack never reports failure after it has navigated",
  /let navigated = false/.test(mod) && /return navigated/.test(mod),
  "        Two router.back() calls pop two history entries and land you two\n" +
    "        screens away from where you pressed back.",
)

// ── It must never draw the pop twice ────────────────────────────────────────
check(
  "the inbox skips its own arrival while a transition is running",
  /popIsViewTransitioning\(\)/.test(inbox),
  "        ::view-transition-new(root) is a live view of the new DOM, so an\n" +
    "        animation inside it plays INSIDE the transition — the parallax\n" +
    "        would run twice, over itself, at two different offsets.",
)
check(
  "the running flag is cleared when the transition finishes",
  /finished\.then\(done, done\)/.test(mod),
)
check(
  "and cleared by a timer even if `finished` never settles",
  /setTimeout\(done,\s*CLEANUP_MS\)/.test(mod),
  "        Left set, every later arrival on the inbox would skip its animation\n" +
    "        forever, on the strength of a transition that ended long ago.",
)

// ── It declines rather than degrading ───────────────────────────────────────
check(
  "unsupported browsers are detected, not assumed",
  /startViewTransition!==?\s*"function"|typeof \(document as \{ startViewTransition\?: unknown \}\)\.startViewTransition !== "function"/.test(
    mod.replace(/\s+/g, " "),
  ) || /startViewTransition\s*!==\s*"function"/.test(mod),
)
check("reduced motion declines", /prefers-reduced-motion: reduce/.test(mod))
check(
  "a wide screen declines",
  /max-width: 767px/.test(mod),
  "        A conversation is a pane beside the list there, not a screen over it.",
)

// ── The stylesheet must actually replace the default cross-fade ─────────────
check(
  "the default blending is undone",
  /view-transition-image-pair\(root\)/.test(css) && /isolation:\s*auto/.test(css),
  "        The UA cross-fade relies on plus-lighter over isolate so two fading\n" +
    "        layers sum to 1. With opaque sliding layers the overlap glows.",
)
check(
  "the leaving screen is on top of the arriving one",
  /::view-transition-old\(root\)\s*\{[^}]*z-index:\s*2/.test(css),
  "        It is the screen that was on top. Underneath, it slides out of view\n" +
    "        behind the inbox and nothing appears to move at all.",
)
/**
 * The body of a @keyframes rule.
 *
 * Not a regex, because a keyframes block contains nested `{ }` for each stop —
 * `[^}]*` stops at the end of `from` and can never see what `to` says, which is
 * exactly where the interesting half of a slide lives. Counting braces from the
 * opening one is the only reading of this that is not accidentally about the
 * first keyframe.
 */
function keyframes(name: string): string {
  const at = css.indexOf(`@keyframes ${name}`)
  if (at === -1) return ""
  const open = css.indexOf("{", at)
  if (open === -1) return ""
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i)
  }
  return ""
}

const out = keyframes("vt-pop-out")
const into = keyframes("vt-pop-in")

check("vt-pop-out is defined", out !== "")
check(
  "the leaving screen travels the full width",
  /to\s*\{[^}]*translate3d\(\s*100%/.test(out),
  `        vt-pop-out ends at: ${(/to\s*\{([^}]*)\}/.exec(out)?.[1] ?? "?").trim()}\n` +
    "        Anything less leaves part of the conversation on screen when the\n" +
    "        transition ends, and it disappears rather than finishing its exit.",
)
check("vt-pop-in is defined", into !== "")
check(
  "the arriving screen parallaxes rather than sitting still",
  /from\s*\{[^}]*translate3d\(\s*-\d/.test(into),
)
check(
  "the arriving screen ends where it belongs",
  /to\s*\{[^}]*translate3d\(\s*0\s*,\s*0\s*,\s*0\s*\)/.test(into) &&
    /to\s*\{[^}]*opacity:\s*1/.test(into),
  "        `both` holds the last frame. Ending anywhere but 0 and full opacity\n" +
    "        leaves the inbox permanently offset or permanently dim.",
)

// ── The fallback is a transition, not an absence ────────────────────────────
//
// Most of the world reaches the CSS below rather than the view transition
// above: any browser without `startViewTransition`, and any phone with Reduce
// Motion switched on. For a long time both of those got a hard cut — the
// fallback was a 22px nudge and the reduced-motion branch was `animation: none`
// — which means every version of this transition was invisible on those
// devices no matter what was built. That is the failure mode with no symptom to
// debug: it looks exactly like nothing having been done.
const back = keyframes("pop-return")
check("the no-snapshot fallback is defined", back !== "")
check(
  "the fallback actually travels",
  /from\s*\{[^}]*translate3d\(\s*-\d+%/.test(back),
  "        A pixel nudge is not a transition. The strip it exposes on the right\n" +
    "        is the page's own white background, so there is nothing bought by\n" +
    "        keeping it small.",
)
check(
  "the fallback and the view transition share a curve",
  /animation:\s*pop-return 340ms cubic-bezier\(0\.32, 0\.72, 0, 1\)/.test(css),
  "        One gesture described twice — for browsers that can draw both screens\n" +
    "        and browsers that can only draw one. They should not feel different.",
)
const calm = keyframes("pop-return-calm")
check("reduced motion still gets a transition", calm !== "")
check(
  "and it is opacity only",
  calm !== "" && !/transform/.test(calm),
  "        The preference is about travel, parallax and zoom, not about change\n" +
    "        itself. A cross-fade is the documented substitute for a slide.",
)
check(
  "reduced motion is not `animation: none` anywhere in the pop",
  !/html\.pop-return[^{]*\{\s*animation:\s*none/.test(css),
  "        That is what made every earlier version of this invisible on a phone\n" +
    "        with Reduce Motion on — the harshest possible answer to somebody who\n" +
    "        asked for calmer animation.",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
