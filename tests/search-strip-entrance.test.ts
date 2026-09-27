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
  /*
    Re-pinned on purpose (the owner's "the search bar appears in the black
    header randomly when I'm at the top"): the hook now measures against a
    line, `insetTop`, which is the header's height on a computer and still
    8px (WINDOW_SLACK) for the phone's strip, and it follows the anchor to
    whichever element carries it. The rules below are the same rules with the
    line named instead of the 8 written in; scripts/check-explore-desktop.mjs
    measures them.
  */
  check(
    "arriving on an Explore surface measures the hero's field instead of assuming it is on screen",
    /const above = anchorIsAbove\(el, line\)/.test(handoff) && /set\(above, false\)/.test(handoff),
    "setInHeader(false) takes the strip away on every back navigation that landed past the hero",
  )
  check(
    "the synchronous rule uses the same line as the observer's rootMargin",
    /return r\.height > 0 && r\.bottom <= insetTop/.test(handoff) && /rootMargin: `-\$\{line\}px 0px 0px 0px`/.test(handoff),
  )
  check(
    "and the phone's strip keeps its 8px",
    /export const WINDOW_SLACK = 8/.test(handoff) && /const searchInHeader = useSearchHandoff\(isExploreSurface\)/.test(header),
  )
  check(
    "with no anchor and nothing remembered, the page still has the field",
    /if \(remembered === undefined\) return false/.test(handoff),
  )
  check(
    "the anchor is followed, not watched once: the loading screen's hero and the next page's replace it",
    /const mo = new MutationObserver\(\(\) => find\(true\)\)/.test(handoff) && !/mo\?\.disconnect\(\) \}\)/.test(handoff),
    "an observer on an element that has left hears nothing, which kept the header's field at the top of the next page",
  )
  check(
    "an entry from an element that has left the document is not the page",
    /if \(entry\.target !== watched \|\| !entry\.target\.isConnected\) return/.test(handoff),
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
    /const anchorBottomInDoc = new Map<string, number>\(\)/.test(handoff) &&
      /return window\.scrollY >= remembered - insetTop/.test(handoff),
    "querySelector found nothing at 134ms under load and the strip went away and came back",
  )
  check(
    "and the observer keeps that memory current, per path and only from a real box",
    /noteAnchor\(entry\.target, entry\.boundingClientRect\.bottom, entry\.boundingClientRect\.height\)/.test(handoff) &&
      /if \(!el\.isConnected \|\| height <= 0\) return/.test(handoff) &&
      /anchorBottomInDoc\.set\(location\.pathname,/.test(handoff),
    "an element leaving reports an empty box at 0, which was remembered as a field at the top of the document",
  )
  /*
    THE DESKTOP FIELD FADES NOW, AND ONLY WHEN SCROLLED TO. The owner asked
    for it to "appear smooth" as the page's field goes under the header. It is
    a transition on a field that is always there, not an entrance on a mount,
    and an arrival turns the transition off (`animate` is false), so the
    replay on every arrival that the checks above forbid cannot come back.
  */
  check(
    "the desktop field is always drawn and fades by opacity and translate",
    /transition-\[opacity,translate,visibility\]/.test(desktop),
  )
  check(
    "and not on an arrival",
    /style=\{deskHandoff\.animate \? undefined : \{ transitionDuration: "0ms" \}\}/.test(header),
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
