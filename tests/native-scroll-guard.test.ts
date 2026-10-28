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
  /* Changed on purpose: round 1026 asks the walk again once (rewalked) between the re-read and the refusal, for a box under the finger that has come to scroll since touchdown (tests/editor-touch-scroll.test.ts). */
  check("and a page that did not fit is re-checked before every move is refused",
    /if \(mode === "document" && !canScrollDoc\) \{[\s\S]{0,320}?refreshExtent\(\)[\s\S]{0,900}?if \(!canScrollDoc && !rewalked\) \{[\s\S]{0,200}?resolve\(gestureTarget\)[\s\S]{0,120}?if \(!canScrollDoc\) \{/.test(guard))

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

  /*
    ── AND ON MOST PHONES IT IS NOT THERE AT ALL ──────────────────────────
    Making the handler cheap could not fix the other half of the cost. A
    non-passive touchmove listener on the document is a promise that the main
    thread might veto the scroll, so the compositor waits for it on every
    frame of every gesture however little the handler then does. The only way
    to give that back is not to register it — and app/globals.css already
    declares overscroll-behavior: none on html.capacitor, on body and on
    .app-content-scroll, and touch-action: none in landscape.

    So the listener is for the engines that cannot read those declarations.
    The question goes to the engine, not to a user agent string.
  */
  console.log("\n  the listener is only registered where CSS cannot do the job")

  check("the engine is asked whether it knows the property",
    /CSS\.supports\("overscroll-behavior-y", "none"\)/.test(guard))
  check("and it is asked before anything is registered",
    guard.indexOf("if (cssRefusesTheBounce()) return") > 0
      && guard.indexOf("if (cssRefusesTheBounce()) return") < guard.indexOf('addEventListener("touchstart"'))
  check("no user agent is read to decide it",
    !/userAgent/.test(guard))
  check("an engine with no CSS.supports at all counts as one that needs it",
    /catch \{[\s\S]{0,140}?return false/.test(guard))

  const cost = read("scripts/check-native-scroll-cost.mjs")
  check("and both engines are measured, not just the one this browser is",
    /legacy=1/.test(cost) && /const legacy = await main\(true, true\)/.test(cost))
  check("the modern path is held to zero listeners",
    /if \(native\.nonPassiveMoveListeners > 0\)/.test(cost))
  check("and the legacy path is held to exactly one, still vetoing both ends",
    /if \(legacy\.nonPassiveMoveListeners !== 1\)/.test(cost)
      && /if \(!legacy\.behaviour\.vetoedAtTop\)/.test(cost)
      && /if \(!legacy\.behaviour\.vetoedAtBottom\)/.test(cost))

  const css = read("app/globals.css")
  check("the declarations it is standing down in favour of are really there",
    /html\.capacitor,\s*\nhtml\.capacitor body \{\s*\n\s*overscroll-behavior: none;/.test(css)
      && /html\.capacitor \.app-content-scroll \{\s*\n\s*overscroll-behavior: none;/.test(css))

  console.log("\n  and the dashboard's banner decodes no picture at all")

  /* It was a 1200px photograph that had to declare its real width (`sizes`) so a
     phone did not decode a 3x one; now its background is CSS gradients, painted
     once, and there is nothing to download or decode (components/app/home/home-banner). */
  const dash = read("components/app/dashboard-client.tsx")
  const banner = read("components/app/home/home-banner.tsx")
  check("no photograph behind the banner any more",
    !/images\.unsplash\.com/.test(dash) && !/images\.unsplash\.com/.test(banner))
  check("and the banner loads no image of any kind",
    !/next\/image/.test(banner) && !/<img\b|<Image\b/.test(banner) && !/url\(["']?https?:/.test(banner))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
