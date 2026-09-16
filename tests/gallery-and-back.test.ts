/**
 * ===========================================================================
 *  THE PICTURE FOLLOWS THE FINGER, AND THE BACK ARROW SAYS IT IS GOING
 * ===========================================================================
 * Both of these are about feel, so both are measured in a browser rather than
 * argued about here:
 *
 *   scripts/check-gallery-swipe    touches the real gallery and watches where
 *                                  the strip is while the finger moves
 *   scripts/check-back-control     presses the real back control and watches
 *                                  the two icons either side of the delay
 *
 * Those need a build and a browser, so they do not run on a push. What is
 * here is the shape of each fix, so that putting one back is loud.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import { COMMIT_RATIO, FLICK_VELOCITY } from "../lib/gestures/use-swipe-track"

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

const root = process.cwd()
const code = (p: string) => stripComments(readFileSync(join(root, p), "utf8"))

console.log("\nThe gallery swipe\n")

{
  const gallery = code("components/product/product-gallery.tsx")

  /*
    The gallery already changed slide on a swipe, so "does swiping work" was
    the wrong question and answered yes. It stacked its slides and crossfaded,
    which leaves nothing to move: a finger could travel a hundred pixels with
    nothing happening, then the picture jumped at the fiftieth.
  */
  check(
    "the slides are a strip, not a stack",
    /transform: `translate3d\(calc\(\$\{-currentIndex \* 100\}% \+ \$\{swipe\.dragX\}px\)/.test(gallery),
    "an absolutely-stacked crossfade has no position, so it cannot follow a finger",
  )
  check(
    "and the drag is part of that position",
    /swipe\.dragX/.test(gallery),
    "without it the strip only moves when the gesture has already ended",
  )
  /*
    `minSwipeDistance` is deliberately still here: a mouse drag on a desktop
    has no finger to follow and still commits on distance. What must be gone
    is the gallery's own TOUCH handling, which is the part the shared gesture
    replaced.
  */
  check(
    "it uses the shared gesture rather than its own",
    /useSwipeTrack\(\{/.test(gallery) && !/const onTouchMove = /.test(gallery),
    "the full-screen viewer had this working already; two copies drift",
  )
  check(
    "a jump of more than one slide does not animate",
    /animateSlide/.test(gallery) && /step <= 1/.test(gallery),
    "a thumbnail four along would smear every picture in between across the box",
  )
  check(
    "the page still scrolls under a finger that starts on a picture",
    /touchAction: "pan-y"/.test(gallery),
    "`none` would stop the browser's horizontal pan and vertical scrolling with it",
  )
}

{
  const hook = code("lib/gestures/use-swipe-track.ts")
  check("the gesture locks to an axis", /axis\.current = Math\.abs\(dx\) > Math\.abs\(dy\)/.test(hook),
    "without it a vertical scroll drags the strip sideways and springs back")
  check("it rubber-bands at the two ends", /dx \/ 3/.test(hook))
  check("and a flick commits on speed as well as distance", /velocity > FLICK_VELOCITY/.test(hook))
  /** Run, not read: the two numbers a release is decided by. */
  check("the commit point is about a fifth of the width", COMMIT_RATIO > 0.15 && COMMIT_RATIO < 0.35, `${COMMIT_RATIO}`)
  check("and a flick is measured in px per ms", FLICK_VELOCITY > 0.1 && FLICK_VELOCITY < 1.5, `${FLICK_VELOCITY}`)

  /*
    The release reads the drag from a ref rather than from state. A state
    value read in the same tick it was set is the PREVIOUS value, so the
    commit would be decided on where the finger was one move ago.
  */
  check(
    "the release reads the live drag, not last render's",
    /const travelled = dragRef\.current/.test(hook),
    "reading the state value here decides the commit on a stale position",
  )
}

console.log("\nThe back arrow\n")

{
  const bar = code("components/store-builder/product-creator-bar.tsx")

  check(
    "the fallback is a route change, not a new document",
    /router\.push\(creatorHref\)/.test(bar) && !/window\.location\.href = creatorHref/.test(bar),
    "assigning location throws the page away and loads the shell again, which is the flash",
  )
  check(
    "the wait is reported by React rather than guessed",
    /startBackTransition\(\(\) => \{/.test(bar) && /useTransition\(\)/.test(bar),
    "without a pending signal the control must flash a spinner at everybody or show one to nobody",
  )
  check(
    "going back holds its own state, because a popstate has no completion event",
    /setLeaving\(true\)\s*\n\s*window\.history\.back\(\)/.test(bar),
  )
  check(
    "and gives up rather than spinning for ever",
    /BACK_GIVE_UP_MS/.test(bar),
    "a back that does nothing would otherwise leave a spinner on the screen permanently",
  )

  /*
    THE DELAY IS THE WHOLE CRAFT. Most backs land in under a tenth of a
    second; a spinner shown at once is a flicker nobody can read, which is
    worse than showing none.
  */
  const delay = Number(bar.match(/const SPINNER_DELAY_MS = (\d+)/)?.[1])
  check(
    "the spinner waits before it appears",
    Number.isFinite(delay) && delay >= 60 && delay <= 200,
    `SPINNER_DELAY_MS is ${delay}. Under 60 flashes on a fast back; over 200 and a slow one has no answer.`,
  )
  check(
    "the two icons share a centre",
    /relative block h-\[19px\] w-\[19px\]/.test(bar) && (bar.match(/absolute inset-0/g) ?? []).length >= 2,
    "laid out in flow, the arrow shifts by a pixel as the spinner mounts",
  )
  check(
    "and the control says it is busy",
    /aria-busy=\{showSpinner \|\| undefined\}/.test(bar),
    "a spinner that only exists visually tells a screen reader nothing",
  )
}

{
  const css = readFileSync(join(root, "app/globals.css"), "utf8")
  check("the spinner turns", /@keyframes bar-control-spin/.test(css))
  check(
    "it takes the bar's own colour",
    /\.bar-control-spinner[\s\S]*?border-top-color: currentColor/.test(css),
    "a fixed colour is wrong on every scheme a creator can pick",
  )
  check(
    "and it stops turning when motion is turned down",
    /prefers-reduced-motion[\s\S]*?\.bar-control-spinner \{\s*animation: none/.test(css),
    "a complete ring still reads as waiting; a static gap reads as broken",
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
