/**
 * ===========================================================================
 *  THE BUILT SITE'S MOBILE MENU: WHERE IT OPENS, AND WHAT STOPS BEHIND IT
 * ===========================================================================
 * Reported twice in one message: with the page scrolled down, opening the
 * menu drew it at the top of the document instead of over the screen; and
 * while it was open the site behind it kept scrolling.
 *
 * One cause each.
 *
 * WHERE IT OPENS. In the editor the drawer is portalled into
 * `#wb-preview-root`, which is `position: relative` and `overflow-y: auto`.
 * An absolutely positioned child of a scroller is laid out against its
 * CONTENT box and scrolls with it, so `top: 0` is the top of the whole page
 * rather than the top of the visible rectangle. Measured in
 * scripts/check-nav-drawer.mjs with the canvas at 900px: the old markup
 * lands at -900px, a screen and a half above the person who opened it.
 *
 * WHAT STOPS. The live site locked with `overflow: hidden` on the body,
 * which iOS does not honour for touch scrolling, and the editor applied no
 * lock at all.
 *
 * The geometry itself is measured in the browser by check-nav-drawer.mjs.
 * What is guarded here is that the two mechanisms stay in the source: a
 * drawer positioned from the scroller's own offset, and a lock that is
 * position-fixed rather than overflow-hidden.
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

const FILE = "components/website-builder/sections/renderers/HeaderSection.tsx"
const src = readFileSync(join(process.cwd(), FILE), "utf8")

function main() {
  console.log("\n  the drawer opens over what is on screen")

  check(
    "it is positioned from the scroller's own offset",
    /setPin\(\{\s*top,\s*height:\s*scroller\.clientHeight\s*\}\)/.test(src) &&
      /const top = scroller\.scrollTop/.test(src),
  )
  check(
    "and that offset reaches the drawer and the backdrop",
    (src.match(/\.\.\.frameStyle,/g) ?? []).length === 2,
    `${(src.match(/\.\.\.frameStyle,/g) ?? []).length} of 2 elements`,
  )
  check(
    "no element stretches from the top of the container to its bottom any more",
    !/positionClass,\s*\n?\s*"[^"]*top-0 bottom-0/.test(src) && !/top-0 bottom-0 z-\[9/.test(src),
  )
  check(
    "absolute positioning is used only when the portal really went into the scroller",
    /const positionClass = previewRoot \? "absolute" : "fixed"/.test(src),
  )

  console.log("\n  and the page behind it is frozen")

  check(
    "the canvas itself is locked, not the editor page",
    /scroller\.style\.overflow = "hidden"/.test(src) && /scroller\.style\.touchAction = "none"/.test(src),
  )
  check(
    "and it gets its scroll position back, because overflow hidden can clamp it",
    /scroller\.scrollTop = top/.test(src),
  )
  check(
    "the live site is pinned with position fixed, which iOS honours",
    /body\.position = "fixed"/.test(src) && /body\.top = `-\$\{scrollY\}px`/.test(src),
  )
  check(
    "and the visitor is put back where they were on close",
    /window\.scrollTo\(0, scrollY\)/.test(src),
  )
  check(
    "body overflow hidden is no longer the whole lock",
    !/document\.body\.style\.overflow = "hidden"/.test(src),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
