/**
 * ===========================================================================
 *  THE METRIC STRIP FOLLOWS THE TAB, AND THE BROWSER SCROLLS IT
 * ===========================================================================
 * The metric strip above each chart is four tabs in a row that scrolls
 * sideways on a phone, on Home and on Analytics. It follows the tab you
 * choose, and a swipe on it is the browser's: sideways scrolls the row, up
 * and down scrolls the page, with no script in between.
 *
 * scripts/check-tab-strip.mjs clicks the real buttons and reads where the row
 * lands; scripts/check-metric-tabs-gesture.mjs swipes the real pages with real
 * touch input. What they cannot see is here: that the scroll asked for is a
 * SMOOTH one, a word the reveal probe has to suppress to measure at all; that
 * no gesture code creeps back into the hook; that the pull to refresh and the
 * chart above and below the row leave its swipe alone; and that every tab in
 * both strips is tagged and both strips are wired.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
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

  console.log("\nThe row is the browser's to scroll: no script in the swipe")

  /*
    "200 fps smooth, not laggish, and make sure it doesn't misunderstand what
    I want: when I want to scroll up and down, ensure this doesn't happen."
    The hook used to drive the row by hand: a non passive touchmove, a 52
    degree cone that took slanted page scrolls, scrollLeft written on the main
    thread every move and a flick of its own. All of it is gone, and it must
    not come back: the browser scrolls the row on the compositor, with the
    platform's momentum, and picks row or page from the first movement
    (measured in scripts/check-metric-tabs-gesture.mjs).
  */
  const code = strip(hook)
  check("the hook listens to no touch at all",
    !/addEventListener\(\s*"touch/.test(code) && !/onTouch(Start|Move|End)/.test(code),
    "a touch listener on the row puts script back in the swipe")
  check("and never cancels a move, writes scrollLeft or runs a flick of its own",
    !/preventDefault/.test(code) && !/scrollLeft\s*=[^=]/.test(code) && !/requestAnimationFrame/.test(code)
      && !/SIDEWAYS_BIAS|DECIDE_PX|GLIDE_DECAY/.test(code),
    "a hand driven scroller runs on the main thread and loses the platform's momentum")
  check("the row keeps both axes, contains sideways overscroll, closes its own vertical axis, and does not snap",
    /export const TAB_STRIP_STYLE: CSSProperties = \{\s*overflowY: "hidden",\s*touchAction: "pan-x pan-y",\s*overscrollBehaviorX: "contain",\s*\}/.test(hook)
      && !/scrollSnap|snap-x|snap-mandatory/.test(code),
    "pan-x alone forbids scrolling the page from the row; an open vertical axis can take a vertical swipe")
  /*
    Both strips draw the one style, so they cannot drift, and carry the
    attribute the pull to refresh reads to leave a sideways swipe alone.
  */
  check("both strips draw that one style, with no touch-action of their own",
    /import \{ TAB_STRIP_STYLE, useTabStrip \} from "@\/components\/app\/use-tab-strip"/.test(home)
      && /import \{ TAB_STRIP_STYLE, useTabStrip \} from "@\/components\/app\/use-tab-strip"/.test(analytics)
      && /<div ref=\{kpiStripRef\} role="tablist" aria-label="Metric" data-scroll-x className="[^"]*" style=\{TAB_STRIP_STYLE\}>/.test(home)
      /* Changed on purpose (round AB2): the class is a template, three columns for a store with nothing to sell yet. */
      && /ref=\{metricStripRef\}\s*role="tablist"\s*aria-label="Metric"\s*data-scroll-x\s*className=(?:"[^"]*"|\{`[^`]*`\})\s*style=\{TAB_STRIP_STYLE\}/.test(analytics)
      && !/touchAction: ["']pan-x/.test(strip(home)) && !/touchAction: ["']pan-x/.test(strip(analytics)))
  check("the attribute is named once, beside the style",
    /export const SCROLL_X_ATTR = "data-scroll-x"/.test(hook))

  console.log("\nAnd nothing above the row takes its swipe")

  /*
    AT THE TOP OF HOME THE PULL TO REFRESH TOOK IT. It cancelled every move
    with any downward drift, so a slanted swipe along the tabs froze the row
    and pulled the page down: "it thinks I want to scroll up or down". A
    touch that starts on a sideways row or a chart is judged by its first few
    pixels now, and a sideways one is left alone, uncancelled.
  */
  const ptr = read("hooks/use-pull-to-refresh.ts")
  check("the pull to refresh knows the rows and the charts that move sideways",
    /const LATERAL = "\[data-scroll-x\], \[data-chart-touch-shield\]"/.test(ptr)
      && /lateral = held === 0 && !!\(e\.target as Element \| null\)\?\.closest\?\.\(LATERAL\)/.test(ptr))
  check("and gives a sideways gesture up before it cancels anything",
    /if \(lateral\) \{[\s\S]{0,300}?if \(ax < LATERAL_DECIDE_PX && ay < LATERAL_DECIDE_PX\) return[\s\S]{0,80}?if \(ax >= ay\) \{\s*stopTracking\(\)\s*return/.test(ptr)
      && ptr.indexOf("if (lateral) {") < ptr.indexOf("e.preventDefault()", ptr.indexOf("const onTouchMove")),
    "a pull that cancels the first sideways move takes the row's swipe for the whole gesture")
  check("deciding within a few pixels, before the browser would start a scroll",
    /const LATERAL_DECIDE_PX = 3/.test(ptr))
  /*
    THE CHART UNDER IT. A move the browser will not let be cancelled is one
    the page is already scrolling with, so the scrub must not start then, or
    a slanted scroll opens the readout halfway down the page.
  */
  const scrub = strip(read("components/app/chart-scrub.tsx"))
  check("the chart lets go of any gesture the page is already scrolling with",
    /if \(!e\.cancelable\) \{[\s\S]{0,200}?lock = "vertical"[\s\S]{0,120}?leave\(\)[\s\S]{0,40}?return\s*\}\s*if \(scrubbing\) \{/.test(scrub),
    "a scrub claimed after the page has started moving shows the readout under a scrolling page")
  check("and neither of them cancels a touchstart",
    /addEventListener\("touchstart", onStart, \{ passive: true \}\)/.test(scrub)
      && /(el|target)\.addEventListener\("touchstart", onTouchStart, \{ passive: true \}\)/.test(ptr))
  /*
    WKWebView ignores overscroll-behavior before iOS 16, so this guard stays.
    It leaves a gesture on a sideways scroller alone, and must keep doing so.
  */
  const guard = read("components/platform/capacitor-bounce-guard.tsx")
  check("the native bounce guard still leaves a sideways scroller's gesture alone",
    /if \(mode === "ignore" \|\| mode === "free"\) return/.test(guard) && /mode = "free"/.test(guard))

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
    THE ANALYTICS FIGURES ARE THE HOME PAGE'S STRIP AGAIN. For a while they
    were a two by two grid on a phone; the owner asked for them to be "one
    row, with the horizontal scrolling touch thing that the chart on the
    homepage has". So they are the same strip, with the same hook deciding a
    sideways swipe from a scroll, following the tab on screen. Changed on
    purpose: there is one set of four now, for every place (the Store and One
    page switch became the property filter).
  */
  check("the analytics figures keep visitors, revenue, orders and conversion, in that order",
    /const CORE_TABS = \["views", "revenue", "orders", "conversion"\] as const/.test(analytics)
      /* Changed on purpose (round AB2): a store with nothing to sell yet has the visits' tabs, not zeros of sales. */
      && /const tabOrder: readonly ChartMetricFilter\[\] = sells === "none" \? TRAFFIC_TABS : CORE_TABS/.test(analytics)
      && /<MetricTab key=\{tab\} tab=\{tab\} className=\{STRIP_TAB\}/.test(analytics))
  check("and they are one row that scrolls sideways on a phone, columns wider up, like the home page's",
    /ref=\{metricStripRef\}/.test(analytics)
      && /role="tablist"/.test(analytics)
      && /aria-label="Metric"/.test(analytics)
      && /data-scroll-x/.test(analytics)
      && /overflow-x-auto scrollbar-hide md:grid/.test(analytics)
      && /md:grid-cols-4/.test(analytics)
      && /style=\{TAB_STRIP_STYLE\}/.test(analytics)
      && /className=\{STRIP_TAB\}/.test(analytics)
      && /const STRIP_TAB = "flex-shrink-0 min-w-\[130px\] md:min-w-0"/.test(analytics)
      && /data-tab=\{tab\}/.test(tabSrc))
  check("the strip follows the chosen tab, in the order drawn",
    /useTabStrip<HTMLDivElement>\(chartMetricFilter, tabOrder\)/.test(analytics)
      && /const CORE_TABS = \["views", "revenue", "orders", "conversion"\] as const/.test(analytics))

  console.log("\nBoth rows draw one tab, with the home page's grey line")

  /*
    "The line under each chart tab button doesn't need to be purple, it needs
    to be light gray, like on the homepage." The two rows had their own
    buttons, and the analytics one had drifted to a violet line and a violet
    tint. They draw one component now, so the line cannot differ again.
  */
  check("the home page and Analytics both draw components/app/metric-tab, and neither keeps its own",
    /import \{ MetricTab \} from "@\/components\/app\/metric-tab"/.test(home)
      /* Analytics also draws the row's one sliding line from the same module (round AC2). */
      && /import \{ MetricTab, MetricTabLine \} from "@\/components\/app\/metric-tab"/.test(analytics)
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
  check("and no longer fakes swipes with scripted TouchEvents, which never scroll anything",
    !/new TouchEvent\(/.test(probe) && /scripts\/check-metric-tabs-gesture\.mjs/.test(probe))
  const gesture = read("scripts/check-metric-tabs-gesture.mjs")
  check("the swipes are real touch input on the real Home and Analytics, at 360, 390 and 430",
    /Input\.dispatchTouchEvent/.test(gesture) && /homeProbePage\(/.test(gesture) && /render-analytics-page\.tsx/.test(gesture)
      && /\?\? "360,390,430"/.test(gesture))
  check("asking of each one: row or page, moves cancelled, React commits, long tasks, and whether a tab got chosen",
    /cancelled: got\.moves\.filter\(\(m\) => m\.p\)\.length/.test(gesture) && /onCommitFiberRoot/.test(gesture)
      && /type: "longtask"/.test(gesture) && /selects no tab/.test(gesture) && /a tap on \$\{r\.tap\.tab\} selects it/.test(gesture))
  check("and reads every touch listener on the row's path from the browser",
    /DOMDebugger\.getEventListeners/.test(gesture) && /no touch listener on the row or its tabs/.test(gesture))
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
