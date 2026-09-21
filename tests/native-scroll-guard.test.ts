/**
 * ===========================================================================
 *  THE SCROLL THAT STOPS ANSWERING PART WAY DOWN
 * ===========================================================================
 * "On this page, at some point when I scroll down, it lags really weirdly and
 * I don't know why."
 *
 * The bounce guard runs only inside the native shell. It reads the page's
 * height once, when the finger lands, and used to hold that number for the
 * whole gesture on the reasoning that content and box do not resize
 * mid-scroll. They do: the dashboard loads its chart through a dynamic import
 * with `ssr: false`, so a 200px skeleton becomes the real chart while
 * somebody is already dragging, and every image that arrives moves the bottom
 * again.
 *
 * A height that is too small makes the boundary test read true half a page
 * early, and from that moment every downward move of the gesture is
 * cancelled. Driven for real in scripts/check-native-scroll-cost.mjs, which
 * starts a drag, grows the page under the finger and keeps dragging. With the
 * cached number trusted, every move of that gesture was vetoed; with it
 * confirmed, none is.
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
  const guard = read("components/platform/capacitor-bounce-guard.tsx")

  console.log("\n  a gesture is never cancelled on a height that may be stale")

  check("there is one place that re-reads the page's extent",
    /function refreshExtent\(\): void \{/.test(guard))
  check("the boundary that cancels a gesture is confirmed before it does",
    /if \(atBottom\) \{\s*\n\s*refreshExtent\(\)\s*\n\s*atBottom = scrollTop \+ clientHeight >= scrollHeight - 1\s*\n\s*\}/.test(guard))
  check("and a page that did not fit is re-checked before every move is refused",
    /if \(mode === "document" && !canScrollDoc\) \{[\s\S]{0,320}?refreshExtent\(\)\s*\n\s*if \(!canScrollDoc\) \{/.test(guard))

  /*
    The point of the change is that the CHEAP path is unchanged: a layout
    read per move is what this whole file exists to avoid, so the re-read
    happens only where a gesture would otherwise be cancelled.
  */
  check("the expensive ancestor walk still runs once per gesture, not per move",
    /\/\*\* The expensive part, and it runs once per gesture instead of once per frame\. \*\//.test(guard)
      && /function resolve\(target: Element \| null\): void \{/.test(guard))
  check("and the claim that the page cannot resize mid-scroll is gone",
    !/content and box do not resize mid-scroll/.test(guard))
  check("driven for real, with the page growing under the finger",
    /vetoedAfterPageGrew/.test(read("scripts/check-native-scroll-cost.mjs")))

  console.log("\n  and the dashboard's banner is sized for the box it goes in")

  const dash = read("components/app/dashboard-client.tsx")
  check("the full width banner declares the width it is really drawn at",
    /sizes="\(max-width: 640px\) 100vw, 640px"/.test(dash))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
