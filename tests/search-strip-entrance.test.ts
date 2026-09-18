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
    /return bottom <= 8/.test(handoff) && /rootMargin: "-8px/.test(handoff),
  )
  check(
    "with no anchor and nothing remembered, the page still has the field",
    /if \(anchorBottomInDoc === null\) return false/.test(handoff),
  )

  /* ---- the fade ---- */
  /* Either quoting style, so a revert to a plain string fails on the animation
     rather than on the test losing track of the element. */
  const strip = header.match(/className=[{`"]+fixed inset-x-0 z-\[35\][^`"]*/)?.[0] ?? ""
  const desktop = header.match(/className=[{`"]+hidden md:flex flex-1[^`"]*/)?.[0] ?? ""
  check("the phone's search strip is where the test expects it", strip.length > 0)
  check("the desktop search field is where the test expects it", desktop.length > 0)
  check(
    "neither search field animates at all",
    !/animate-in/.test(strip) && !/animate-in/.test(desktop),
    "every version of this entrance eventually played on an arrival; a bar that appears as you scroll should just appear",
  )
  check(
    "and nothing else in the header carries an entrance for them",
    !/searchEntrance/.test(header) && !/useEntranceOnAppear/.test(header),
  )
  check(
    "the appear-only hook went with its last caller",
    !/useEntranceOnAppear/.test(hook),
    "a hook with no callers is a second answer to a question nothing asks",
  )

  /* ---- the strip must be right on the frame it arrives, not a frame later ---- */
  check(
    "the hero's field offset is remembered, so an arrival before it renders still knows",
    /let anchorBottomInDoc: number \| null = null/.test(handoff) &&
      /return window\.scrollY >= anchorBottomInDoc - 8/.test(handoff),
    "querySelector found nothing at 134ms under load and the strip went away and came back",
  )
  check(
    "and the observer keeps that memory current",
    /noteAnchor\(entry\.boundingClientRect\.bottom\)/.test(handoff),
  )

  /* ---- and the header itself, which went with it ---- */
  check(
    "the header root is pinned while a pop is in flight",
    /html\.pop-in-flight #platform-header-root \{\s*position: sticky;/.test(read("app/globals.css")),
    "a relative header on a page the browser has already scrolled is 900px above the window",
  )
  check(
    "the pin is armed by popstate, synchronously",
    /window\.addEventListener\("popstate", onPop\)/.test(header) &&
      /classList\.add\("pop-in-flight"\)/.test(header),
    "React state would arrive a frame after the browser's scroll, and a frame is the bug",
  )
  check(
    "and released both by the new route and by a timer",
    /useEffect\(\(\) => \{\s*document\.documentElement\.classList\.remove\("pop-in-flight"\)\s*\}, \[pathname\]\)/.test(header) &&
      /setTimeout\(clear, 700\)/.test(header),
    "a pop that changes nothing would otherwise pin it for good",
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
