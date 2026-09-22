/**
 * ===========================================================================
 *  THE TAB STRIP CARRIES ITSELF TO THE TAB YOU TAPPED
 * ===========================================================================
 * The metric strip above each chart is four tabs in a row that scrolls
 * sideways on a phone. The fourth is off the edge, so tapping along the row
 * left the tab just chosen half out of sight and everything past it hidden.
 *
 * scripts/check-tab-reveal.mjs clicks the real buttons on a real strip and
 * reads where the row ends up in pixels. Two things it cannot check are here
 * instead: that the scroll it asks for is a SMOOTH one, which is a single
 * word the probe's own runs have to suppress in order to measure anything at
 * all; and that every tab in both strips is tagged and both strips are wired,
 * which a probe of the hook alone would never notice.
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
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** The tabs a strip draws, in the order it draws them. */
function tabOrderIn(src: string, setter: string): string[] {
  return [...src.matchAll(new RegExp(`${setter}\\("([a-z]+)"\\)`, "g"))].map((m) => m[1])
}
/** And the tabs it has actually tagged for the reveal to find. */
function taggedIn(src: string): string[] {
  return [...src.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1])
}

function main() {
  const hook = read("components/app/use-tab-reveal.ts")
  const home = read("components/app/dashboard-client.tsx")
  const analytics = read("app/app/analytics/analytics-client.tsx")
  const probe = read("scripts/check-tab-reveal.mjs")

  console.log("\nThe strip scrolls to the tab, and shows the edge of the next one")

  check("it brings the chosen tab in, plus a peek of the one after it",
    /const PEEK_PX = 40/.test(hook)
      && /const hidden = tabRight \+ PEEK_PX - visibleRight/.test(hook)
      && /const hidden = visibleLeft - \(tabLeft - PEEK_PX\)/.test(hook),
    "without the peek there is nothing to say the row goes on")
  check("and only when something really is hidden",
    /if \(hidden > 0\) target = visibleLeft \+ hidden/.test(hook)
      && /if \(Math\.abs\(target - visibleLeft\) < 1\) return/.test(hook),
    "scrolling on every tap is movement that means nothing")
  check("never past either end of the row",
    /target = Math\.max\(0, Math\.min\(target, strip\.scrollWidth - strip\.clientWidth\)\)/.test(hook))
  /*
    offsetLeft is measured from the strip, which is position: relative, so it
    is already in scrollLeft's coordinates. Bounding rectangles would mean
    subtracting one scrolled box from another and carrying the error along.
  */
  check("measured in the strip's own coordinates, not by subtracting two scrolled boxes",
    /const tabLeft = tab\.offsetLeft/.test(hook) && !/getBoundingClientRect/.test(strip(hook)))

  console.log("\nSmoothly, and nowhere there is nothing to reveal")

  check("the scroll it asks for is a smooth one",
    /behavior: calm \? "auto" : "smooth"/.test(hook),
    "this is the word the probe has to suppress to measure the target at all")
  check("instant for anyone who has asked for less motion",
    /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/.test(hook))
  /*
    The guard is the strip's own measurements rather than a breakpoint, so the
    desktop grid is covered without being named, and so is a phone wide enough
    that all four tabs already fit.
  */
  check("and it does nothing at all where the row already fits",
    /if \(strip\.scrollWidth <= strip\.clientWidth \+ 1\) return/.test(hook)
      && !/max-width: 767px/.test(hook),
    "a breakpoint would claim to know which screens hide a tab, and it does not")
  check("the browser's own scrolling, not a hand-rolled one",
    /strip\.scrollTo\(\{ left: target/.test(hook) && !/requestAnimationFrame/.test(strip(hook)),
    "animating scrollLeft by hand is main-thread work that fights a finger dragging the row")

  console.log("\nEvery tab in both strips is tagged, and both strips are wired")

  /*
    THE PART THE PROBE CANNOT SEE. The hook finds a tab by its data-tab, so a
    button without one is a tab the strip will never scroll to — and the rest
    of the row would keep working, which is what makes it worth a test.
  */
  const homeOrder = tabOrderIn(home, "setOpenKPIModal")
  check("the home strip tags all four of its tabs",
    JSON.stringify(taggedIn(home)) === JSON.stringify(homeOrder) && homeOrder.length === 4,
    `tagged ${taggedIn(home).join(", ")} against buttons ${homeOrder.join(", ")}`)
  check("and hands the hook the order it draws them in",
    /const KPI_TAB_ORDER = \["views", "revenue", "orders", "conversion"\] as const/.test(home)
      && JSON.stringify(homeOrder) === JSON.stringify(["views", "revenue", "orders", "conversion"])
      && /const kpiStripRef = useTabReveal<HTMLDivElement>\(openKPIModal \?\? "views", KPI_TAB_ORDER\)/.test(home))
  check("with the ref on the row that actually scrolls",
    /<div ref=\{kpiStripRef\} className="relative flex overflow-x-auto/.test(home))

  const storeOrder = tabOrderIn(analytics, "setChartMetricFilter")
  const onepageOrder = tabOrderIn(analytics, "setOnePageChartFilter")
  check("the analytics strip tags all eight of its tabs, across both modes",
    JSON.stringify(taggedIn(analytics)) === JSON.stringify([...storeOrder, ...onepageOrder])
      && storeOrder.length === 4 && onepageOrder.length === 4,
    `tagged ${taggedIn(analytics).join(", ")}`)
  check("the store order is the one its buttons are in",
    /const STORE_TAB_ORDER = \["views", "revenue", "orders", "conversion"\] as const/.test(analytics)
      && JSON.stringify(storeOrder) === JSON.stringify(["views", "revenue", "orders", "conversion"]),
    `its buttons are drawn ${storeOrder.join(", ")}`)
  check("and the OnePage order is its own, which is a different list",
    /const ONEPAGE_TAB_ORDER = \["views", "clicks", "subscribers", "ctr"\] as const/.test(analytics)
      && JSON.stringify(onepageOrder) === JSON.stringify(["views", "clicks", "subscribers", "ctr"]),
    `its buttons are drawn ${onepageOrder.join(", ")}`)
  /*
    Both sets of tabs are drawn into the SAME scrolling row, so the reveal
    follows whichever set is on screen rather than one of them.
  */
  check("one strip, following whichever set of tabs the mode is showing",
    /const metricStripRef = useTabReveal<HTMLDivElement>\(\s*\n\s*analyticsMode === "onepage" \? onePageChartFilter : chartMetricFilter,\s*\n\s*analyticsMode === "onepage" \? ONEPAGE_TAB_ORDER : STORE_TAB_ORDER,/.test(analytics)
      && /<div ref=\{metricStripRef\} className="relative flex overflow-x-auto/.test(analytics))

  console.log("\nAnd the chart itself is left alone")

  /*
    The first attempt at this slid the CHART sideways on a tab change, which
    was not what was asked for and is not what the strip needed.
  */
  check("nothing slides the plot when a tab changes",
    !/MetricSlide/.test(home) && !/MetricSlide/.test(analytics),
    "the tabs move, not the chart")

  console.log("\nAnd the positions are driven in a browser")

  check("the probe clicks real buttons and reads the row's position",
    /\.click\(\)/.test(probe) && /scrollLeft: Math\.round/.test(probe))
  check("checking the chosen tab is unclipped and the next one shows",
    /leaves it fully in view/.test(probe) && /of the tab after it showing/.test(probe))
  check("at a width where the row overflows, and one where it does not",
    /run\(430/.test(probe) && /run\(1400/.test(probe))
  check("and it says why it has to suppress the smooth scroll to measure at all",
    /a smooth scroll needs frames that headless Chromium\s*\n \* under virtual time never gives it/.test(probe))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
