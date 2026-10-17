/**
 * ===========================================================================
 *  OPENING THE KEYBOARD IS AN EVENT. BEING OPEN IS NOT.
 * ===========================================================================
 * Reported: focus the search on /explore and the page drifts, slowly and
 * continuously, "like it is trying to pull out something".
 *
 * Measured off the screen recording, 60fps, by correlating a band of the page
 * against itself across samples 835ms apart: the content moved more than 60px
 * every sample from 2.4s to 9.8s and never settled. Not a one-off jump — a
 * drift for as long as the field was focused.
 *
 * KeyboardGuard listened to BOTH `resize` and `scroll` on the visual viewport
 * and, on every one of those, did a SMOOTH scroll to centre the focused
 * input. A smooth scroll moves the visual viewport. Moving the visual viewport
 * fires `scroll` on it. That arrives at the same handler, which starts another
 * smooth scroll.
 *
 * The listeners are right and stay: the class and the height variable have to
 * track every change, and they are idempotent. What had to move is the part
 * that MOVES THE PAGE, which belongs to the transition into keyboard-open.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const guard = read("components/platform/keyboard-guard.tsx")
const explore = read("components/explore/explore-page-client.tsx")

function main() {
  console.log("\nThe keyboard does not chase its own tail")

  /* ---------------------------------------------------------------------
     THE SCROLL IS ON THE TRANSITION
     --------------------------------------------------------------------- */
  console.log("\n  centring happens when the keyboard opens, not while it is open")

  check("there is a flag for the previous reading", /let keyboardWasOpen = false/.test(guard))
  check(
    "opening is the difference between the two",
    /const opening = kbHeight > 0 && !keyboardWasOpen/.test(guard),
  )
  /*
    THE ASSERTION THAT MATTERS. The call that moves the page must be inside
    the transition branch; outside it, it runs on every scroll the keyboard
    itself caused.
  */
  check(
    "the centring sits inside the transition branch",
    /if \(opening\) \{[\s\S]{0,400}?scrollFocusedInputIntoView\(\)\s*\n\s*\}/.test(guard),
  )
  check("and the flag is cleared when the keyboard goes", /keyboardWasOpen = false\s*\n\s*writeRootLater\(\{ classes: \{ "keyboard-open": false \}/.test(guard))

  /*
    THE LISTENERS STAY. Dropping the `scroll` one would stop --vvh tracking a
    viewport that moves while the keyboard is up, which is a different bug
    with the same cause. They are cheap and idempotent; only the scroll was
    not.
  */
  check("it still listens to resize", /vv\.addEventListener\("resize", onViewportChange\)/.test(guard))
  check("and to scroll", /vv\.addEventListener\("scroll", onViewportChange\)/.test(guard))
  check("both are removed on unmount", (guard.match(/vv\.removeEventListener\(/g) ?? []).length === 2)

  /* One pass on focus, not three. */
  check(
    "focus schedules a single centring",
    /focusTimers = \[setTimeout\(scrollFocusedInputIntoView, 500\)\]/.test(guard),
  )
  const timers = (guard.match(/setTimeout\(scrollFocusedInputIntoView/g) ?? []).length
  check("so one tap cannot queue three smooth scrolls", timers === 1, `${timers} scheduled`)

  /* ---------------------------------------------------------------------
     THE PILL ROW IS THE CONTROL
     --------------------------------------------------------------------- */
  console.log("\n  no Clear chip under the pills")

  /*
    It sat under the pills whenever a category was on. The pill row is already
    the control: the category you are in is the filled pill, and the way out is
    the first one. A SUBcategory keeps its chip, because the row above only
    names the parent.
  */
  /* The block ends where the note on the removed "Active:" row begins: that
     row went when the filters became two questions (components/explore/
     explore-filters.tsx), so its old marker is gone with it. */
  const mobileChip = explore.slice(
    explore.indexOf('NO "CLEAR" CHIP'),
    explore.indexOf("NO ROW OF ACTIVE FILTERS"),
  )
  check("the block exists to check", mobileChip.length > 0)
  check("it draws no Clear button", !/>\s*Clear\s*</.test(mobileChip), mobileChip.slice(0, 120))
  check("it is shown only for a subcategory", /\{selectedSubcategoryLabel && \(/.test(mobileChip))
  check("and that chip names the subcategory", /\{selectedSubcategoryLabel\}/.test(mobileChip))
  /*
    "Clear all" and "Clear filters" are different controls elsewhere — inside
    the Active-filters row and the empty state — and were not what was
    reported. Named here so removing them later is a decision, not a slip.
  */
  /* The "Active:" row under the pills is gone; its Clear all lives in the
     filters panel now, which is where the choices it clears are made. */
  check("the filters panel keeps its own Clear all", /Clear all/.test(read("components/explore/explore-filters.tsx")))
  check("and the empty state keeps Clear filters", /Clear filters/.test(explore))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
