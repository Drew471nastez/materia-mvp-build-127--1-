/**
 * ===========================================================================
 *  THE METRIC STRIP FOLLOWS THE TAB, AND KEEPS A SIDEWAYS SWIPE
 * ===========================================================================
 * The metric strip above each chart is four tabs in a row that scrolls
 * sideways on a phone. Two things were wrong with it: it did not follow the
 * tab you chose, and a sideways swipe on it was often taken by the page.
 *
 * scripts/check-tab-strip.mjs clicks the real buttons and drives real swipes
 * at four angles, which is where both of those are settled. Three things it
 * cannot check are here instead: that the scroll it asks for is a SMOOTH one,
 * a single word the probe's own runs have to suppress to measure anything at
 * all; that the swipe listener is registered in the one way that lets it say
 * no to the page; and that every tab in both strips is tagged and both strips
 * are wired, which a probe of the hook alone would never notice.
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
/**
 * And the tabs it has actually tagged for the reveal to find: a literal
 * data-tab, or the shared <MetricTab tab="…">, which writes its data-tab
 * (components/app/metric-tab, held below).
 */
function taggedIn(src: string): string[] {
  return [...src.matchAll(/(?:data-tab="|<MetricTab\s+tab=")([a-z]+)"/g)].map((m) => m[1])
}

function main() {
  const hook = read("components/app/use-tab-strip.ts")
  const home = read("components/app/dashboard-client.tsx")
  const analytics = read("app/app/analytics/analytics-client.tsx")
  const tabSrc = read("components/app/metric-tab.tsx")
  const probe = read("scripts/check-tab-strip.mjs")

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
  check("the reveal is the browser's own scrolling, not a hand-rolled one",
    /strip\.scrollTo\(\{ left: target/.test(hook),
    "nothing competes with this scroll, so animating it by hand buys nothing")

  console.log("\nAnd a sideways swipe on the row belongs to the row")

  /*
    THE SECOND REPORT. With both axes permitted the browser arbitrates, and on
    a row 72px tall inside a long page it calls anything but a dead flat swipe
    vertical — then keeps the gesture whatever the thumb does next. So the
    strip decides for itself, the way the chart one card below already does.
  */
  check("the gesture is decided once, early, and by the strip",
    /const DECIDE_PX = 5/.test(hook)
      && /owner = Math\.abs\(dx\) \* SIDEWAYS_BIAS > Math\.abs\(dy\) \? "strip" : "page"/.test(hook))
  check("through a cone wider than 45 degrees, because sideways is what this row is for",
    /const SIDEWAYS_BIAS = 1\.3/.test(hook))
  /*
    The half that keeps the previous fix here alive: a gesture handed to the
    page must never be taken back, or a thumb curling sideways halfway down a
    scroll snatches the row out from under it.
  */
  check("and a gesture given to the page is never taken back",
    /if \(owner === "page"\) return/.test(hook))
  /*
    preventDefault on a passive listener is ignored, with a console warning
    and no effect — the page would scroll anyway and the row would move too.
  */
  check("the swipe listener is not passive, which is the only way it can say no",
    /strip\.addEventListener\("touchmove", onMove, \{ passive: false \}\)/.test(hook)
      && /if \(e\.cancelable\) e\.preventDefault\(\)/.test(hook),
    "a passive listener's preventDefault is ignored, so the page takes the swipe anyway")
  check("and only the ones it claims are prevented",
    /if \(owner === "page"\) return\s*\n[\s\S]{0,400}?e\.preventDefault\(\)/.test(hook),
    "preventing before the decision cancels the page's scroll for the whole gesture")
  check("a flick carries on afterwards, and stops at the end of the row",
    /const GLIDE_DECAY = 0\.94/.test(hook)
      && /if \(strip\.scrollLeft === before\) return/.test(hook),
    "a hand-driven scroller that stops dead under the thumb is the tell that it is hand-driven")
  check("nothing glides for somebody who asked for less motion",
    /if \(window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return\s*\n\s*\n\s*\/\*/.test(hook))
  check("and the listeners come off with the strip",
    (hook.match(/removeEventListener/g) ?? []).length === 4
      && /cancelAnimationFrame\(glide\.current\)\s*\n\s*strip\.removeEventListener/.test(hook))
  /*
    Naming one axis in CSS takes the other away: `pan-x` alone is what stopped
    the page scrolling from this row in the first place.
  */
  check("both axes stay permitted in CSS, because the strip is what decides",
    /touchAction: 'pan-x pan-y'/.test(home) && !/touchAction: 'pan-x'/.test(analytics))

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
      && /const kpiStripRef = useTabStrip<HTMLDivElement>\(openKPIModal \?\? "views", KPI_TAB_ORDER\)/.test(home))
  check("with the ref on the row that actually scrolls",
    /<div ref=\{kpiStripRef\}[^>]*? className="relative flex overflow-x-auto/.test(home))

  /*
    THE ANALYTICS FIGURES ARE NOT A STRIP ANY MORE. On a phone they sat in a
    row that scrolled sideways, with the fourth tab past the edge and a swipe
    that had to be told apart from a scroll. They are a two by two grid now
    and a row of four wider up: all four always in view, nothing to swipe to,
    and so nothing for this hook to arbitrate. What is held for them is that
    every button still carries its tab name, in the order it is drawn.
  */
  const storeOrder = tabOrderIn(analytics, "setChartMetricFilter")
  const onepageOrder = tabOrderIn(analytics, "setOnePageChartFilter")
  const analyticsTabs = [...analytics.matchAll(/<MetricTab tab="([a-z]+)"/g)].map((m) => m[1])
  check("the analytics figures tag all eight of their tabs, across both modes, in the order they are drawn",
    JSON.stringify(analyticsTabs) === JSON.stringify([...storeOrder, ...onepageOrder])
      && JSON.stringify(storeOrder) === JSON.stringify(["views", "revenue", "orders", "conversion"])
      && JSON.stringify(onepageOrder) === JSON.stringify(["views", "clicks", "subscribers", "ctr"]),
    `tagged ${analyticsTabs.join(", ")}`)
  check("and they are a grid that never scrolls, so no strip hook is needed",
    /role="tablist" aria-label="Metric" className="grid grid-cols-2 gap-px bg-\[#eef0f2\] md:grid-cols-4"/.test(analytics)
      && !/useTabStrip/.test(analytics)
      && /data-tab=\{tab\}/.test(tabSrc))

  console.log("\nBoth rows draw one tab, with the home page's grey line")

  /*
    "The line under each chart tab button doesn't need to be purple, it needs
    to be light gray, like on the homepage." The two rows had their own
    buttons, and the analytics one had drifted to a violet line and a violet
    tint. They draw one component now, so the line cannot differ again.
  */
  check("the home page and Analytics both draw components/app/metric-tab, and neither keeps its own",
    /import \{ MetricTab \} from "@\/components\/app\/metric-tab"/.test(home)
      && /import \{ MetricTab \} from "@\/components\/app\/metric-tab"/.test(analytics)
      && !/function MetricTab\(/.test(analytics) && !/function MetricTab\(/.test(home)
      && (home.match(/<MetricTab\b/g) ?? []).length === 4)
  check("the line under the chosen tab is light grey, 1.5px, and nothing violet is left on it",
    /export const METRIC_TAB_LINE = "#d1d5db"/.test(tabSrc) && /h-\[1\.5px\]/.test(tabSrc)
      && !/#8b5cf6|#fcfbff|violet|purple/i.test(strip(tabSrc)))

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
  check("and drives real swipes at four angles, asking whose each one is",
    /new TouchEvent\(/.test(probe)
      && /await swipe\(0, 120\)/.test(probe) && /await swipe\(30, 120\)/.test(probe)
      && /await swipe\(70, 120\)/.test(probe) && /await swipe\(90, 120\)/.test(probe))
  check("checking the steep ones are left unprevented, so the page can still scroll",
    /neither is prevented, so the page really can scroll from here/.test(probe))
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
