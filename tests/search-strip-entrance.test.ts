/**
 * ===========================================================================
 *  THE SEARCH STRIP BLINKING UNDER THE HEADER ON THE WAY BACK
 * ===========================================================================
 * Filmed on production, /explore scrolled to 900 -> product -> back, sampling
 * every 16ms:
 *
 *      18ms   strip absent, page already /explore at y=900, hero 663px above
 *      67ms   strip present at opacity 0, `enter` running
 *     133ms   0.112
 *     199ms   0.852
 *     264ms   opacity 1
 *
 * Two faults stacked on one element. `useSearchHandoff` forced `false` on
 * arrival — "an Explore surface has its own field" — which is only true at
 * the top of the page, and a back navigation lands where you left. That is
 * the fifty milliseconds of nothing. Then the strip remounts, and a mount
 * replays `animate-in fade-in-0`. That is the fade.
 *
 * Both are asserted here; scripts/check-back-search-flash.mjs measures the
 * result on the deployed page.
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

function main() {
  const handoff = read("lib/explore/use-search-handoff.ts")
  const header = read("components/platform/platform-header-client.tsx")
  const hook = read("lib/ui/use-entrance-on-change.ts")

  /* ---- the fifty milliseconds of nothing ---- */
  check(
    "arriving on an Explore surface measures the hero's field instead of assuming it is on screen",
    /setInHeader\(anchorIsAbove\(\)\)/.test(handoff),
    "setInHeader(false) takes the strip away on every back navigation that landed past the hero",
  )
  check(
    "the synchronous rule uses the same 8px slack as the observer's rootMargin",
    /getBoundingClientRect\(\)\.bottom <= 8/.test(handoff) && /rootMargin: "-8px/.test(handoff),
  )
  check(
    "no anchor still means the page has the field",
    /if \(!el\) return false/.test(handoff),
  )

  /* ---- the fade ---- */
  /* Either quoting style, so a revert to a plain string fails on the animation
     rather than on the test losing track of the element. */
  const strip = header.match(/className=[{`"]+fixed inset-x-0 z-\[35\][^`"]*/)?.[0] ?? ""
  const desktop = header.match(/className=[{`"]+hidden md:flex flex-1[^`"]*/)?.[0] ?? ""
  check("the phone's search strip is where the test expects it", strip.length > 0)
  check("the desktop search field is where the test expects it", desktop.length > 0)
  check(
    "neither search field animates unconditionally on mount",
    !/animate-in/.test(strip) && !/animate-in/.test(desktop),
    "a mount is a mount: arriving on the page replays the entrance",
  )
  check(
    "both take their entrance from the appear-only hook",
    /\$\{searchEntrance\}/.test(strip) && /\$\{searchEntrance\}/.test(desktop),
  )
  check(
    "and that hook is fed the handoff state",
    /useEntranceOnAppear\(\s*\n?\s*searchInHeader,/.test(header),
  )

  /* ---- the hook itself ---- */
  check(
    "useEntranceOnAppear does not animate on the first render",
    /const wasActive = useRef\(active\)/.test(hook),
    "seeding the ref from the current value is what makes an arrival silent",
  )
  check(
    "it keeps the class while active, so a re-render cannot cut the animation short",
    /entering\.current = true/.test(hook) && /return active && entering\.current \? classes : ""/.test(hook),
  )
  check(
    "and it resets when the element goes away, so the next appearance plays",
    /if \(!active\) entering\.current = false/.test(hook),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
