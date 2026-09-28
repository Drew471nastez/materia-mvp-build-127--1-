/**
 * ===========================================================================
 *  A LOADING LINE THAT CANNOT DO THE THREE THINGS THAT GOT THE LAST ONE BINNED
 * ===========================================================================
 * There was a violet bar here before and it was removed on the owner's
 * instruction, with three complaints. They are not matters of taste, they are
 * design faults, and this suite is the guard that each one stays impossible:
 *
 *   "IT APPEARS WHEN IT DOESN'T MATTER."  Nothing renders until a navigation
 *   has been in flight for SHOW_AFTER_MS. Back measures 78ms on production,
 *   so back never draws anything at all.
 *
 *   "IT BLOCKS."  pointer-events: none, two pixels tall.
 *
 *   "IT BUGS."  It was photographed stuck at full width across a settled
 *   page, because its ending was driven by its own animation. Here the
 *   pathname changing is what clears it, and a hard cap clears it regardless.
 *
 * Every check below is one of those three, or the thing that makes one of
 * them true.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const bar = read("components/navigation/route-loading-bar.tsx")
const css = read("app/globals.css")
const layout = read("app/(marketing)/layout.tsx")

function main() {
  console.log("\nThe loading line")

  /* ---------------------------------------------------------------------
     1. IT CANNOT APPEAR WHEN IT DOESN'T MATTER
     --------------------------------------------------------------------- */
  console.log("\n  it says nothing about a fast navigation")

  const showAfter = Number(bar.match(/const SHOW_AFTER_MS = (\d+)/)?.[1] ?? 0)
  check("there is a delay before anything is drawn", showAfter >= 150, `SHOW_AFTER_MS is ${showAfter || "unset"}`)
  /* Back is 78ms measured on production. A threshold under that would draw a
     line on the one navigation that is already instant. */
  check("and it is longer than a measured back navigation (78ms)", showAfter > 78)
  check(
    "nothing is rendered before then",
    /if \(!visible\) return null/.test(bar),
    "rendering it hidden still puts an element over the header",
  )
  check("the delay is what sets visible", /window\.setTimeout\(\(\) => setVisible\(true\), SHOW_AFTER_MS\)/.test(bar))

  /* The clicks that are NOT a navigation of this document. Each of these
     starting a bar is "appears when it doesn't matter" in a different form. */
  /*
    AND THE BROWSER'S OWN BACK IS A NAVIGATION TOO. This started on a click
    alone, so an edge swipe on an iPhone, the hardware key and the browser's
    arrow started nothing: filmed with the page behind 2.5 seconds away,
    nothing on screen changed for 2,545ms (scripts/check-back-stall.mjs).
  */
  check("a popstate starts it, so the browser's own back is answered too", /window\.addEventListener\("popstate", onPop\)/.test(bar) && /setPendingSince\(Date\.now\(\)\)/.test(bar.slice(bar.indexOf("const onPop"))))
  /* An entry of ours over the page already showing (the search screen's own, a #tab) fetches nothing. */
  check("but a back to the address already showing starts nothing", /const landed = `\$\{window\.location\.pathname\}\?\$\{new URLSearchParams\(window\.location\.search\)\.toString\(\)\}`/.test(bar) && /if \(landed === committed\.current\) return/.test(bar))
  /* useSearchParams hands out a new object on some renders: a dependency on it would resubscribe every one of them. */
  check("and it subscribes once, reading the committed address from a ref", /window\.addEventListener\("popstate", onPop\)\s*\n\s*return \(\) => window\.removeEventListener\("popstate", onPop\)\s*\n\s*\}, \[\]\)/.test(bar))
  check("a modified click is left to the browser", /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(bar))
  check("a non-primary button does not count", /e\.button !== 0/.test(bar))
  check("a click something else already handled does not count", /e\.defaultPrevented/.test(bar))
  check("a new tab does not change this document", /anchor\.target && anchor\.target !== "_self"/.test(bar))
  check("a download is not a navigation", /anchor\.hasAttribute\("download"\)/.test(bar))
  check("another origin has the browser's own indicator", /url\.origin !== window\.location\.origin/.test(bar))
  check(
    "and a link to where you already are navigates nowhere",
    /url\.pathname === window\.location\.pathname && url\.search === window\.location\.search/.test(bar),
  )

  /* ---------------------------------------------------------------------
     2. IT CANNOT BLOCK
     --------------------------------------------------------------------- */
  console.log("\n  it cannot block anything")

  const rule = css.slice(css.indexOf(".route-loading-bar {"), css.indexOf("}", css.indexOf(".route-loading-bar {")) + 1)
  check("pointer-events are off", /pointer-events: none/.test(rule), rule.replace(/\s+/g, " ").slice(0, 100))
  check("it is two pixels tall", /height: 2px/.test(rule))
  check("and it does not span the page vertically", !/bottom: 0|height: 100/.test(rule))
  check("it is hidden from assistive tech", /aria-hidden/.test(bar))

  /* ---------------------------------------------------------------------
     3. IT CANNOT STICK
     --------------------------------------------------------------------- */
  console.log("\n  it cannot get stuck")

  /*
    THE ENDING IS NOT THE BAR'S TO DECIDE. This is the whole difference from
    the one that was photographed stuck at full width: the router reports that
    the navigation landed, by changing the pathname, and that is what clears
    it.
  */
  check(
    "the navigation landing is what clears it",
    /useEffect\(\(\) => \{\s*\n\s*setPendingSince\(null\)\s*\n\s*\}, \[pathname, searchParams\]\)/.test(bar),
  )
  const giveUp = Number(bar.match(/const GIVE_UP_MS = ([\d_]+)/)?.[1]?.replace(/_/g, "") ?? 0)
  check("and a hard cap clears it regardless", giveUp > 0 && giveUp <= 30000, `GIVE_UP_MS is ${giveUp || "unset"}`)
  check("the cap is armed with the same pending state", /window\.setTimeout\(\(\) => setPendingSince\(null\), GIVE_UP_MS\)/.test(bar))
  check("both timers are cleared when pending changes", /window\.clearTimeout\(show\)[\s\S]{0,60}window\.clearTimeout\(giveUp\)/.test(bar))

  /*
    AND THE WIDTH NEVER REACHES THE END. A bar that fills to 100% and waits is
    claiming the page has arrived when it has not, and it is the frame that
    gets photographed. It decelerates to 90 and stops; the element is removed
    outright when the navigation lands, so there is no completion animation to
    be stranded in.
  */
  const keyframes = css.slice(css.indexOf("@keyframes route-loading-bar"), css.indexOf("}", css.indexOf("100% { width")) + 1)
  check("the width stops short of the end", /100% \{ width: 90%; \}/.test(keyframes), keyframes.replace(/\s+/g, " "))
  /*
    An earlier version of this check searched the whole file for the word
    "complete" and failed on the sentence explaining why the bar cannot get
    stuck. Prose is not code. What actually has to be true is that losing the
    pending state removes the element in the same pass — no second phase, no
    "filling up to 100% then fading", nothing that can be left half-done.
  */
  const code = bar.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  check(
    "losing the pending state hides it in the same pass",
    /if \(pendingSince == null\) \{\s*\n\s*setVisible\(false\)\s*\n\s*return/.test(code),
  )
  check(
    "there is only one animation, and it is the crawl",
    (css.match(/@keyframes route-loading-bar/g) || []).length === 1 &&
      (code.match(/className="route-loading-bar"/g) || []).length === 1,
  )
  check(
    "no second, finishing state exists in the code",
    !/(setDone|setComplete|finishing|isFinishing)/.test(code),
  )
  check("reduced motion gets a static line", /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.route-loading-bar \{\s*\n\s*animation: none;/.test(css))

  /* ---------------------------------------------------------------------
     AND IT IS ACTUALLY ON THE PAGES THAT NEEDED IT
     --------------------------------------------------------------------- */
  console.log("\n  it is mounted where the navigation happens")

  check("the marketing layout mounts it", /<RouteLoadingBar \/>/.test(layout))
  /*
    "Sometimes trying to go back from a checkout or whatever takes too much and
    blocks." The library and the checkout are not under (marketing), so they
    carried no line at all: a way back off either that the router had to fetch
    said nothing, however long it took.
  */
  check("so do the library and the checkout, which had none", /<RouteLoadingBar \/>/.test(read("app/library/layout.tsx")) && /<RouteLoadingBar \/>/.test(read("app/checkout/page.tsx")))
  check("and it is visible on their light tops, not white on white", /html\.with-page-checkout,\s*\nhtml\.with-page-library \{\s*\n\s*--route-bar-ink: rgba\(26, 26, 46, 0\.78\);/.test(css) && /background: var\(--route-bar-ink, rgba\(255, 255, 255, 0\.85\)\)/.test(css))
  check("above the header, so it reads as the browser's own line", layout.indexOf("<RouteLoadingBar />") < layout.indexOf("<ConditionalHeader"))
  /* useSearchParams needs a boundary to build, and the fallback must be null:
     a placeholder here would be a bar drawn for a reason unrelated to
     loading, which is complaint one again. */
  check("its Suspense fallback draws nothing", /<Suspense fallback=\{null\}>/.test(bar))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
