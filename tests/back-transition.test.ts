/**
 * ===========================================================================
 *  GOING BACK HAS TO BE A TRANSITION, NOT A CUT
 * ===========================================================================
 * `window.history.back()` on the frame of the press is instant, because the
 * route it returns to is already in the client router's cache. That is not a
 * fast transition; it is the absence of one. The product page and the grid
 * meet at a hard edge, and neither side has an animation to soften it:
 *
 *     the product page has no exit animation
 *     the creator page has no entrance animation
 *
 * components/navigation/page-leave-veil.tsx is the answer, and the parts of
 * it that can silently come apart are checked here.
 *
 * WHAT ACTUALLY BREAKS THIS, in the order it is likely to happen:
 *
 *   1. Somebody "simplifies" a back control back to a bare router.back(),
 *      and the transition is gone with no error anywhere.
 *   2. The veil gets mounted by the product page instead of the layout, and
 *      unmounts halfway through its own fade.
 *   3. The resting state moves into an animation's fill-mode, and a back
 *      that never happened leaves an opaque sheet over somebody's shop.
 *   4. A transform lands on the veil, which would make it the containing
 *      block for the two `position: fixed` bars on the page below.
 *
 * scripts/check-back-transition.mjs is the other half: it films the opacity
 * curve in a real browser. This is the cheap net that runs on every push.
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"

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
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(p, "utf8")

const VEIL = "components/navigation/page-leave-veil.tsx"
const veil = read(VEIL)
const veilCode = stripComments(veil)
const css = read("app/globals.css")
const layout = stripComments(read("app/(marketing)/layout.tsx"))
const bar = stripComments(read("components/store-builder/product-creator-bar.tsx"))
const crumb = stripComments(read("components/product/discover-back-breadcrumb.tsx"))

console.log("\nEvery back control waits for the transition\n")

/**
 * The shape that matters is: ask for the veil, then navigate on the delay it
 * gives back. A control that calls the navigation unconditionally, outside
 * that delay, has the old behaviour however much else is around it.
 */
/*
  ONE PATTERN PER CONTROL, AND NO SHARED FALLBACK.

  The first version of this accepted `setTimeout(push, wait)` as an
  alternative for either control. Break-testing it showed why that is worth
  nothing: deleting the timeout around the bar's `history.back()` left the
  check green, because the bar's OTHER navigation still matched the
  alternative. A check that one control can satisfy on behalf of another is
  not checking either of them.
*/
for (const [name, src, pattern] of [
  ["the product page's back control", bar, /setTimeout\(\(\) => window\.history\.back\(\), wait\)/],
  ["the native back breadcrumb", crumb, /setTimeout\(\(\) => router\.back\(\), wait\)/],
] as const) {
  check(`${name} asks for the transition`, /beginPageLeave\(\)/.test(src), name)
  check(
    `${name} navigates on the delay it is given`,
    pattern.test(src),
    "the navigation has to be inside the wait, or the sheet never gets up",
  )
}

/** The fallback path, where there is no history entry, gets it too. */
check(
  "the push fallback also waits",
  /const push = \(\) => startBackTransition/.test(bar) && /setTimeout\(push, wait\)/.test(bar),
  "components/store-builder/product-creator-bar.tsx",
)

console.log("\nThe veil outlives the navigation\n")

check(
  "it is mounted by the marketing layout",
  /<PageLeaveVeil \/>/.test(layout),
  "a veil owned by the page being left unmounts in the middle of its own fade",
)

/**
 * Both sides of the press carry the marker the colour is read from. Without
 * it the sheet falls back to the body's colour, which is not what a creator
 * painted, and the transition flashes at one end or the other.
 */
for (const page of [
  "app/(marketing)/p/[slug]/page.tsx",
  "app/(marketing)/u/[username]/page.tsx",
]) {
  check(`${page.split("/").slice(-2)[0]} marks its page root`, /data-page-root/.test(read(page)), page)
}

check(
  "the colour is measured rather than assumed",
  /getComputedStyle\(root\)\.backgroundColor/.test(veilCode),
  VEIL,
)

check(
  "and measured again at the swap, for the page arrived at",
  (veilCode.match(/paintedPageColor\(\)/g) || []).length >= 2,
  "the sheet went up in the leaving page's colour; it has to come off in the arriving page's",
)

console.log("\nA veil that is never told to clear is invisible, not opaque\n")

const veilBase = css.match(/\n  \.page-leave-veil \{([\s\S]*?)\n  \}/)?.[1] ?? ""
check("the base rule was found", veilBase.length > 0)
check(
  "its resting opacity is 0, in the base rule",
  /opacity:\s*0/.test(veilBase),
  "not at the end of an animation with fill-mode: both — that pins it opaque when the animation never runs",
)
check(
  "it never takes a tap",
  /pointer-events:\s*none/.test(veilBase),
  "a stuck sheet must not be able to swallow a press",
)
check(
  "no animation with a fill mode holds its state",
  !/\.page-leave-veil[^{]*\{[^}]*animation:/.test(css),
  "the two states are transitions on an attribute, which cannot strand a value",
)
check(
  "it gives the page back on its own if the route never changes",
  /GIVE_UP_MS/.test(veilCode) && /stateRef\.current === "rising"/.test(veilCode),
  VEIL,
)

console.log("\nAnd it cannot unfix the bars underneath it\n")

/**
 * transform, filter and will-change on an ancestor make it the containing
 * block for `position: fixed` descendants. The product page has two fixed
 * bars. The same constraint is written above .app-page-enter, for the same
 * reason, and it has been broken before.
 */
const veilRules = (css.match(/\.page-leave-veil[^{]*\{[^}]*\}/g) || []).join("\n")
check(
  "the veil's rules are opacity only",
  veilRules.length > 0 && !/(transform|filter|will-change|perspective)\s*:/.test(veilRules),
  veilRules,
)

console.log("\nLeaving and arriving are not the same motion\n")

const rise = css.match(/\[data-state="rising"\][^}]*transition: opacity (\d+)ms ([^;]+);/)
const clear = css.match(/\[data-state="clearing"\][^}]*transition: opacity (\d+)ms ([^;]+);/)
check("both states carry a duration", !!rise && !!clear)
check(
  "arriving is slower than leaving",
  !!rise && !!clear && Number(clear[1]) > Number(rise[1]),
  `rise ${rise?.[1]}ms, clear ${clear?.[1]}ms — symmetrical timing is what makes a transition feel mechanical`,
)
check(
  "and they use opposite curves",
  !!rise && !!clear && rise[2] !== clear[2],
  `${rise?.[2]} vs ${clear?.[2]}`,
)

/**
 * The wait has to outlast the rise, or the sheet is still translucent at the
 * instant the route swaps underneath it — which is the one frame the whole
 * thing exists to hide, and also when it repaints to the arriving colour.
 */
const waitMs = Number(veil.match(/export const PAGE_LEAVE_MS = (\d+)/)?.[1])
check(
  "the navigation waits longer than the sheet takes to rise",
  Number.isFinite(waitMs) && !!rise && waitMs > Number(rise[1]),
  `wait ${waitMs}ms against a ${rise?.[1]}ms rise`,
)

console.log("\nIt respects a visitor who asked for less motion\n")

check(
  "the delay is zero under reduced motion, so callers navigate at once",
  /prefersReducedMotion\(\)\) return 0/.test(veilCode),
  VEIL,
)
check(
  "and the CSS refuses to show one anyway",
  /prefers-reduced-motion: reduce\)\s*\{[\s\S]{0,400}?\.page-leave-veil/.test(css),
  "app/globals.css",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
