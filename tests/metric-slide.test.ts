/**
 * ===========================================================================
 *  THE CHART COMES IN FROM THE SIDE ITS TAB IS ON
 * ===========================================================================
 * The metric strip above both charts is a row you scroll sideways, and tapping
 * along it changed the plot underneath with a cut. Asked for: the chart should
 * slide in from the left or the right depending on which way you moved along
 * the row, on a phone.
 *
 * scripts/check-metric-slide.mjs clicks the real tabs in a real browser and
 * reads the animation off the element, which is where direction is decided.
 * What it cannot check is that both charts are actually wired to it with the
 * order their own tabs are drawn in — a strip whose order is written down
 * wrongly animates confidently in the wrong direction, and no probe of the
 * component alone would ever notice. That is what this file is for.
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

/** The tabs each strip draws, in the order it draws them. */
function tabOrderIn(src: string, setter: string): string[] {
  return [...src.matchAll(new RegExp(`${setter}\\("([a-z]+)"\\)`, "g"))].map((m) => m[1])
}

function main() {
  const slide = read("components/app/metric-slide.tsx")
  const home = read("components/app/dashboard-client.tsx")
  const analytics = read("app/app/analytics/analytics-client.tsx")
  const probe = read("scripts/check-metric-slide.mjs")

  console.log("\nDirection is the distance between two tabs in their own order")

  check("the slide takes the tabs in the order they are drawn",
    /order: readonly string\[\]/.test(slide)
      && /const was = order\.indexOf\(from\)\s*\n\s*const now = order\.indexOf\(slot\)/.test(slide))
  check("and moves one way or the other, never by the number of tabs crossed",
    /const direction = now > was \? 1 : -1/.test(slide),
    "two tabs at once is the same gesture as one, said further")
  check("a tab that is already the one you are on moves nothing",
    /if \(was < 0 \|\| now < 0 \|\| was === now\) return/.test(slide))

  console.log("\nOn a phone, on the compositor, and out of the way of anyone who asked for less")

  check("phones only, which is where it was asked for",
    /matchMedia\("\(max-width: 767px\)"\)\.matches/.test(slide))
  check("and never against a reduced-motion preference",
    /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/.test(slide))
  check("it animates transform and opacity, and nothing that costs a layout",
    (() => {
      const keyframes = strip(slide).slice(strip(slide).indexOf("node.animate("))
      const inside = keyframes.slice(keyframes.indexOf("["), keyframes.indexOf("],") + 1)
      return /transform: `translate3d\(\$\{direction \* SHIFT_PX\}px, 0, 0\)`, opacity: 0/.test(slide)
        && /opacity: 1/.test(inside)
        && !/\b(width|height|left|right|margin|top|bottom|padding):/.test(inside)
    })(),
    "anything but transform and opacity in there is a layout every frame")
  /*
    A CSS class restarts an animation only when its NAME changes, so two taps
    the same way would play once. The usual workaround is forcing a reflow
    between them, which is a layout on the main thread in the middle of a tap.
  */
  check("through the animations API, so a second tap the same way replays it",
    /node\.animate\(/.test(slide) && /running\.current\?\.cancel\(\)/.test(slide),
    "a class would need a forced reflow to replay, which is a layout inside a tap")
  /*
    A layout effect runs after React has put the new chart in the DOM and
    before the browser paints. From an ordinary effect the chart paints once
    in its final place and then jumps aside to slide back, which is a flash.
  */
  check("started before the frame is painted, so nothing is seen in place first",
    /useLayoutEffect\(\(\) => \{\s*\n\s*const from = previous\.current/.test(slide))

  console.log("\nThe clip it needs is given back without help from the compositor")

  check("it clips only while it moves",
    /node\.style\.overflow = "hidden"/.test(slide),
    "unclipped, the offset chart widens the page and the scroller answers with a sideways pan")
  /*
    `finish` and `cancel` are queued against the animation's own timeline, and
    a timeline that never advances never queues them: a backgrounded tab, a
    frozen page, an element taken out of the document mid-move. Any of those
    would leave the container clipped for the rest of its life.
  */
  check("and gives it back on a timer, not on the animation's own event",
    /unclip\.current = window\.setTimeout\(\(\) => \{[\s\S]{0,200}node\.style\.overflow = ""/.test(slide)
      && !/addEventListener\("finish"/.test(slide),
    "an animation event that never arrives leaves the chart clipped for ever")
  check("cleared before the next move and on the way out",
    /useLayoutEffect\(\(\) => \(\) => \{\s*\n\s*window\.clearTimeout\(unclip\.current\)/.test(slide))

  console.log("\nAnd both strips hand it the order they actually draw")

  /*
    THE PART A PROBE OF THE COMPONENT CANNOT SEE. The order is a list written
    by hand beside a strip of buttons; get it wrong and the chart slides
    confidently the wrong way. So it is read back off the buttons themselves.
  */
  const homeOrder = tabOrderIn(home, "setOpenKPIModal")
  check("the home chart's order is the one its own tabs are in",
    /const KPI_TAB_ORDER = \["views", "revenue", "orders", "conversion"\] as const/.test(home)
      && JSON.stringify(homeOrder) === JSON.stringify(["views", "revenue", "orders", "conversion"]),
    `its buttons are drawn ${homeOrder.join(", ")}`)
  check("and its chart is wrapped in the slide",
    /<MetricSlide slot=\{openKPIModal \?\? "views"\} order=\{KPI_TAB_ORDER\}>/.test(home)
      && /import \{ MetricSlide \} from "@\/components\/app\/metric-slide"/.test(home))

  const storeOrder = tabOrderIn(analytics, "setChartMetricFilter")
  const onepageOrder = tabOrderIn(analytics, "setOnePageChartFilter")
  check("the analytics store strip's order is the one its tabs are in",
    /const STORE_TAB_ORDER = \["views", "revenue", "orders", "conversion"\] as const/.test(analytics)
      && JSON.stringify(storeOrder) === JSON.stringify(["views", "revenue", "orders", "conversion"]),
    `its buttons are drawn ${storeOrder.join(", ")}`)
  check("and the OnePage strip's is its own, which is a different list",
    /const ONEPAGE_TAB_ORDER = \["views", "clicks", "subscribers", "ctr"\] as const/.test(analytics)
      && JSON.stringify(onepageOrder) === JSON.stringify(["views", "clicks", "subscribers", "ctr"]),
    `its buttons are drawn ${onepageOrder.join(", ")}`)
  check("with the chart given whichever of the two the current mode is showing",
    /slot=\{analyticsMode === "onepage" \? onePageChartFilter : chartMetricFilter\}/.test(analytics)
      && /order=\{analyticsMode === "onepage" \? ONEPAGE_TAB_ORDER : STORE_TAB_ORDER\}/.test(analytics))

  console.log("\nAnd the direction itself is driven in a browser")

  check("the probe clicks the real tabs and reads the animation off the element",
    /getAnimations\(\)/.test(probe) && /a\.effect\.getKeyframes\(\)/.test(probe))
  check("both ways along the strip, and the tab you are already on",
    /a tab to the left starts/.test(probe) && /tapping the tab you are already on does nothing/.test(probe))
  check("at both widths, and against reduced motion",
    /run\(1280\)/.test(probe) && /force-prefers-reduced-motion/.test(probe))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
