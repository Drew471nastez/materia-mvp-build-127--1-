/**
 * ===========================================================================
 *  SETTINGS, WITHOUT THE PRETEND LOADING
 * ===========================================================================
 * "Every time I switch between the pill shapes there, subpages of the
 * settings, it blinks, it takes too much, it loads bad, these bad loading
 * skeleton structures reloading for one millisecond looks cheap."
 *
 * All of it was true, and none of it was loading:
 *
 *   - Switching tab set a flag, drew forty-five lines of shimmering grey
 *     cards, and cleared the flag on a 160ms timer. Every panel renders from
 *     props the component already holds. There was nothing to wait for; the
 *     delay existed so the fake loading state would be visible.
 *   - The Get paid banner was hidden behind a client fetch, so the page
 *     painted and then a full-width purple bar dropped in and shoved
 *     everything down. The creator row already says whether Stripe is
 *     connected, and the page already selects it.
 *   - Billing was a separate route, so choosing that tab was a navigation
 *     with a route skeleton, arriving with its own copy of the tab bar.
 *   - Closing Upgrade drew a spinner for 400ms and then navigated. Nothing
 *     loaded during those 400ms either.
 *
 * The rule this suite holds: a loading state in settings has to correspond
 * to something actually being waited for.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
/** Without comments: the ones here quote what was removed. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const settings = code("components/app/settings-form-new.tsx")
const settingsRaw = read("components/app/settings-form-new.tsx")
const css = read("app/globals.css")

// ---------------------------------------------------------------------------
section("A tab switch is a switch")
// ---------------------------------------------------------------------------

check(
  "there is no loading flag standing between the tabs any more",
  !/isTabLoading/.test(settings),
)
check(
  "and no timer clearing one",
  !/setTimeout\(\(\) => \{\s*setIsTabLoading/.test(settings),
)
check(
  "no panel is gated behind a loading flag",
  !/!isTabLoading && activeTab/.test(settings),
)
check(
  "the shimmering skeleton cards are gone",
  !/Skeleton Card 1/.test(settings) && !/animate-\[shimmer_1\.5s_ease-in-out_infinite\]/.test(settings),
)
check(
  "the panel is keyed on the tab, so one replaces another instead of being edited into it",
  /<div key=\{activeTab\} className="settings-panel">/.test(settings),
)

{
  const swap = css.slice(css.indexOf(".settings-panel {"), css.indexOf(".settings-panel {") + 420)
  check(
    "it fades rather than shimmers, on opacity and translate only",
    /translate: 0 4px/.test(swap) && !/height|width|background/.test(swap),
  )
  check(
    "and it is short enough to switch through repeatedly",
    (() => {
      const m = swap.match(/animation: settings-panel-in (\d+)ms/)
      return m !== null && Number(m[1]) <= 160
    })(),
  )
  check("off where motion is not wanted", /prefers-reduced-motion: reduce\)[\s\S]{0,120}settings-panel/.test(css))
}

// ---------------------------------------------------------------------------
section("The Get paid banner is right in the first paint")
// ---------------------------------------------------------------------------

check(
  "connection is seeded from the creator row the server already loaded",
  /const connectedAtLoad = Boolean\(\(creator as \{ stripe_account_id\?: string \| null \} \| null\)\?\.stripe_account_id\)/.test(settings),
)
check(
  "so the banner no longer waits on a fetch before deciding whether to exist",
  !/!stripeStatusLoading && !stripeStatus\.connected/.test(settings) &&
    /\{!stripeStatus\.connected && \(/.test(settings),
)
check(
  "the settings loader really does select that column",
  /\.from\("creators"\)\.select\("\*"\)/.test(read("app/app/settings/_server.ts")),
)
check(
  "the fetch still runs, so the detail is still refined",
  /loadStripeStatus\(\)/.test(settings),
)

// ---------------------------------------------------------------------------
section("Billing is a tab")
// ---------------------------------------------------------------------------

check(
  "choosing it no longer navigates to a route",
  !/router\.push\("\/app\/settings\/billing"\)/.test(settings),
)
check(
  "the old route redirects, so bookmarks and Stripe return URLs still land",
  /redirect\("\/app\/settings\?tab=billing"\)/.test(read("app/app/settings/billing/page.tsx")),
)
check(
  "and it no longer carries a route-level skeleton",
  (() => {
    try {
      readFileSync(join(root, "app/app/settings/billing/loading.tsx"), "utf8")
      return false
    } catch {
      return true
    }
  })(),
)
check(
  "the tab reads from one endpoint rather than a page render",
  /fetch\("\/api\/billing\/overview"\)/.test(settings) &&
    /export async function GET/.test(read("app/api/billing/overview/route.ts")),
)
check(
  "one person's invoices are never cached",
  /private, no-store/.test(read("app/api/billing/overview/route.ts")),
)
check(
  "it is asked once and kept, so returning to the tab is instant",
  /billingAsked\.current/.test(settings),
)
check(
  "a failed load can be retried rather than being stuck for the session",
  /billingAsked\.current = false/.test(settings) && /setBillingError\(true\)/.test(settings),
)
check(
  "the billing panel stops drawing its own copy of the tab bar",
  /embedded\?: boolean/.test(read("components/app/billing/billing-page-client.tsx")) &&
    /<BillingPageClient initialData=\{billingData as never\} embedded \/>/.test(settings),
)
check(
  "the URL no longer has to exclude billing from its own tab list",
  !/tab !== "billing"/.test(settings),
)

// ---------------------------------------------------------------------------
section("Upgrade opens and closes")
// ---------------------------------------------------------------------------

{
  const upgrade = code("components/app/billing/upgrade-page-client.tsx")
  check(
    "closing animates instead of showing a spinner for four hundred milliseconds",
    !/Show spinner briefly/.test(read("components/app/billing/upgrade-page-client.tsx")) &&
      /upgrade-leaving/.test(upgrade) &&
      /}, 180\)/.test(upgrade),
  )
  check(
    "and it returns to the tab, not to the route that no longer renders anything",
    /router\.push\("\/app\/settings\?tab=billing"\)/.test(upgrade),
  )
  check("it arrives with a transition too", /upgrade-arriving/.test(upgrade))
  check(
    "the exit is dead to the pointer while it plays",
    /\.upgrade-leaving[\s\S]{0,160}pointer-events: none/.test(css),
  )
  check(
    "and its 69-line skeleton is gone, so the previous screen simply stays until this one is ready",
    (() => {
      try {
        readFileSync(join(root, "app/app/settings/billing/upgrade/loading.tsx"), "utf8")
        return false
      } catch {
        return true
      }
    })(),
  )
}

// ---------------------------------------------------------------------------
section("The chart and the icon")
// ---------------------------------------------------------------------------

/**
 * THE AXIS IS BACK, at the owner's request, and the guard changed with the
 * decision rather than being argued with. What it holds now is the thing
 * that actually broke when it was removed: the axis width and the maths that
 * turns a finger into a data point were two separate copies of one number,
 * so taking the axis away moved one and not the other, and every touch
 * landed thirty pixels from where it looked like it did.
 */
check(
  "the numbers are on the charts again",
  /<YAxis/.test(code("components/app/analytics-chart.tsx")) &&
    /<YAxis/.test(code("components/app/dashboard-client.tsx")),
)
/*
  THE ANALYTICS CHART MEASURES EACH LABEL IN THE FONT IT IS DRAWN IN
  (lib/analytics/chart-scale axisWidth) rather than counting characters,
  because the owner found the gutter too wide for "0 50 100" on a phone. The
  dashboard keeps its own estimate; both are held to "one formatter draws
  the ticks and measures them".
*/
check(
  "the axis is measured from its own labels rather than being a flat 40px",
  (() => {
    const home = code("components/app/dashboard-client.tsx")
    const analytics = code("components/app/analytics-chart.tsx")
    return (
      /function plotLeftFor\(labels: string\[\]\): number/.test(home) &&
      /Math\.max\(22, Math\.min\(46, longest\.length \* 7 \+ 10\)\)/.test(home) &&
      /axisWidth\(scale\.ticks\.map\(axisTick\), 11, 8\)/.test(analytics) &&
      ![home, analytics].some((src) => /const PLOT_LEFT = \d+/.test(src))
    )
  })(),
)
check(
  "one formatter both draws the ticks and measures them, so the gutter fits what is shown",
  /tickFormatter=\{axisTick\}/.test(code("components/app/dashboard-client.tsx")) &&
    /plotLeftFor\(\[axisTick\(0\)/.test(code("components/app/dashboard-client.tsx")) &&
    /tickFormatter=\{axisTick\}/.test(code("components/app/analytics-chart.tsx")) &&
    /axisWidth\(scale\.ticks\.map\(axisTick\)/.test(code("components/app/analytics-chart.tsx")),
)
check(
  "and the measured width is what the axis, the margin and the finger all read",
  ["components/app/analytics-chart.tsx", "components/app/dashboard-client.tsx"].every((f) => {
    const src = code(f)
    return (
      /width=\{plotLeft\}/.test(src) &&
      /rect\.left \+ plotLeft/.test(src) &&
      !/rect\.left \+ 40/.test(src)
    )
  }),
)
check(
  "the grid lines stay, so the shape still has something to read against",
  /<CartesianGrid/.test(read("components/app/analytics-chart.tsx")),
)
check(
  "and the payouts chart keeps its scale",
  /<YAxis/.test(read("app/app/payouts/payouts-client.tsx")),
)
check(
  "the Website glyph is one plain screen, like the envelope and the card beside it",
  /from "@solar-icons\/react\/linear\/monitor"/.test(read("components/app/sidebar-desktop-nav.tsx")) &&
    !/linear\/monitor-smartphone/.test(read("components/app/sidebar-desktop-nav.tsx")),
)

// ---------------------------------------------------------------------------
section("Nothing pretends to load")
// ---------------------------------------------------------------------------

check(
  "no timer exists whose only job is to keep a loading state on screen",
  (() => {
    /**
     * THE ACTUAL RULE, rather than a count of spinners.
     *
     * An earlier version of this check counted `animate-spin` in the file
     * and failed at nineteen — which was a number I had guessed at, not a
     * rule. Those nineteen are button spinners: Saving, Connecting,
     * Disconnecting. Every one of them stands for a request genuinely in
     * flight, and there is nothing wrong with any of them.
     *
     * What was wrong was a timer that existed to hold a loading state
     * visible for a fixed period while nothing loaded. That is what this
     * looks for, in both files it was found in.
     */
    const held = /setTimeout\(\s*\(\)\s*=>\s*\{?\s*set[A-Za-z]*Loading\(false\)/
    return !held.test(settings) && !held.test(code("components/app/billing/upgrade-page-client.tsx"))
  })(),
)

check(
  "and the billing panel says what it is waiting for, rather than shimmering a shape",
  /Checking your plan and invoices/.test(settingsRaw),
)


// ---------------------------------------------------------------------------
section("The native cold start")
// ---------------------------------------------------------------------------

{
  const start = read("app/native-start/page.tsx")

  check(
    "the deep-link check uses the bridge Capacitor already injected",
    /\(window as unknown as \{[\s\S]{0,400}\}\)\.Capacitor/.test(start) &&
      /bridge\.Plugins\?\.App/.test(start),
  )
  check(
    "so a launch no longer waits on a chunk fetch before it can read where to go",
    (() => {
      /*
       * The import survives as a fallback for a shell whose bridge does not
       * expose the plugin, but it must no longer be the FIRST thing awaited.
       */
      /*
       * WITHOUT COMMENTS. The comment explaining the change quotes the very
       * import it removed from the critical path, so a search over the raw
       * text finds that first and reports the fix as absent — the same trap
       * the drop-target guard fell into, and the reason this is worth
       * spelling out twice.
       */
      const resolve = code("app/native-start/page.tsx").slice(
        code("app/native-start/page.tsx").indexOf("async function resolve()"),
      )
      const firstImport = resolve.indexOf('await import("@capacitor/app")')
      const bridgeRead = resolve.indexOf(").Capacitor")
      return bridgeRead > 0 && firstImport > bridgeRead
    })(),
  )
  check(
    "a browser skips the check entirely rather than importing and catching",
    /if \(!bridge\?\.isNativePlatform\?\.\(\)\) throw new Error\("not native"\)/.test(start),
  )
  check(
    "and the ordering that makes recovery links work is unchanged",
    (() => {
      const resolve = start.slice(start.indexOf("async function resolve()"))
      const deepLink = resolve.indexOf("isRecovery")
      const fastPath = resolve.indexOf("Layer 1: synchronous localStorage fast-path")
      return deepLink > 0 && fastPath > 0 && deepLink < fastPath
    })(),
  )
  check(
    "the entry itself is still a static file, not a render",
    (() => {
      /* Prerendered: the first hop is a file, and only the hop after it is work. */
      return !/export const dynamic = "force-dynamic"/.test(start)
    })(),
  )
}


// ---------------------------------------------------------------------------
section("The chart tooltip stays in its card")
// ---------------------------------------------------------------------------

{
  const charts = [
    "components/app/dashboard-client.tsx",
    "components/app/analytics-chart.tsx",
  ]

  for (const path of charts) {
    const src = code(path)
    const name = path.split("/").pop()

    check(
      `${name}: the position is a clamp whose bounds are the card, not a guess`,
      /translateX\(clamp\(8px, calc\(\$\{x\.toFixed\(1\)\}px - 50%\), calc\(\$\{track\}px - 100% - 8px\)\)\)/.test(src),
    )
    check(
      `${name}: nothing reads the tooltip's own width any more`,
      !/tooltipRef\.current\?\.offsetWidth/.test(src),
    )
    check(
      `${name}: and there is no fixed edge zone deciding when centring is safe`,
      !/EDGE_ZONE/.test(src),
    )
    check(
      `${name}: it can never be wider than the card either`,
      /maxWidth: "calc\(100% - 16px\)"/.test(src),
    )
    check(
      `${name}: the chart's margin comes from the same constants, not from literals`,
      /margin=\{\{ top: PLOT_TOP, right: PLOT_RIGHT, left: 0, bottom: 0 \}\}/.test(src),
    )
    check(
      `${name}: there is room above for the active dot, which is 8px of ring and radius`,
      /const PLOT_TOP = (\d+)/.test(src) && Number(src.match(/const PLOT_TOP = (\d+)/)![1]) >= 8,
    )
    /*
      The glide is now conditional — a cut on the first placement, a slide
      after — so it is checked by the pair in "The scrub, on a phone" rather
      than by looking for an unconditional transition here.
    */
    /*
      Superseded: the 5px sum turned out to be the cause of the lost hold, not
      a cure for a dead zone. The slop model replaced it, and is checked in
      "The scrub, on a phone".
    */
  }
}


check(
  "switching metric redraws the chart once, when its data arrives",
  (() => {
    /**
     * `openKPIModal` used to sit in these deps beside the data. Tapping
     * Revenue fired the animation immediately — redrawing the chart with the
     * OLD numbers still in it — and again when the fetch returned. Two draws,
     * the first of the wrong thing: the double refresh.
     */
    const src = code("components/app/dashboard-client.tsx")
    return /setShouldAnimate\(true\)[\s\S]{0,200}\}, \[displayChartData\]\)/.test(src)
  })(),
)


// ---------------------------------------------------------------------------
section("The scrub, on a phone")
// ---------------------------------------------------------------------------

for (const f of ["components/app/dashboard-client.tsx"]) {
  const src = code(f)
  const name = f.split("/").pop()

  check(
    `${name}: the tooltip is placed over its own point, in the plot area`,
    /const plotWidth = track - plotLeft - PLOT_RIGHT/.test(src) &&
      /plotLeft \+ \(activeIndex \/ \([a-zA-Z]+\.length - 1\)\) \* plotWidth/.test(src),
  )
  check(
    `${name}: not as a percentage of the whole card, which ignored the axis`,
    !/tooltipLeftPercent/.test(src),
  )
  check(
    `${name}: one haptic per point crossed, fired on the change and not the frame`,
    /idx !== lastHapticIndexRef\.current/.test(src) && /hapticTap\("light"\)/.test(src),
  )
  check(
    `${name}: and it is forgotten when the finger lifts, so the next scrub ticks again`,
    /lastHapticIndexRef\.current = null/.test(src),
  )
  check(
    `${name}: a hold produces the tooltip in about a tenth of a second`,
    /\}, 100\)/.test(src) && !/\}, 250\)/.test(src),
  )
  check(
    /**
     * THE LOST HOLD. `dx + dy > 5` counts tremor as movement, and a bare
     * `else` makes a one pixel vertical bias into a scroll — so a resting
     * thumb locked the gesture vertical within about fifty milliseconds and
     * the hold was gone for good. Slop is per axis, and vertical has to win
     * clearly, because getting that wrong steals a hold while getting it
     * wrong the other way only delays a scroll by a few pixels.
     */
    `${name}: a resting thumb's drift cannot cancel the hold`,
    /const SLOP_Y = 12/.test(src) &&
      /\(dx > SLOP_X \|\| dy > SLOP_Y\)/.test(src) &&
      /\} else if \(dy > dx \* 1\.4\) \{/.test(src) &&
      !/const totalMove = dx \+ dy/.test(src),
  )
  check(
    `${name}: and the hold reads the finger's current position, not where it landed`,
    /getIndexFromTouch\(lastTouchXRef\.current\)/.test(src),
  )
  check(
    `${name}: the box follows the finger every frame, written straight to the node`,
    /box\.style\.transform = shiftFor\(x, rect\.width\)/.test(src),
  )
  check(
    `${name}: with no transition in front of it, which would only be lag`,
    /transition: "none"/.test(src) && !/transform 90ms/.test(src),
  )
  check(
    `${name}: and no React state carries the position, so there is no render per frame`,
    !/setTooltipLeft|setTooltipX/.test(src),
  )
}

check(
  "a thumb on the Views / Revenue / Orders row can still scroll the page",
  (() => {
    /**
     * `pan-x` does not mean "prefer horizontal". It means vertical panning is
     * not allowed in this element at all — so a thumb that landed on a KPI
     * tile and pulled down could not scroll the page, and the row read as
     * frozen. Both axes named lets the browser decide from the gesture.
     */
    const src = code("components/app/dashboard-client.tsx")
    return /touchAction: 'pan-x pan-y'/.test(src) && !/touchAction: 'pan-x'/.test(src)
  })(),
)


check(
  "both charts got every part of the scrub, not most of it",
  (() => {
    /**
     * A patch script applied six changes to one chart and four to the other,
     * and the build passed either way — a half-updated gesture is still valid
     * TypeScript. This compares the two files on the parts that have to
     * match, so the next partial application fails here rather than on a
     * phone.
     */
    const a = code("components/app/dashboard-client.tsx")
    const parts = [
      /const SLOP_X = 8/,
      /const SLOP_Y = 12/,
      /\} else if \(dy > dx \* 1\.4\) \{/,
      /function shiftFor\(x: number, track: number\): string/,
      /box\.style\.transform = shiftFor\(x, rect\.width\)/,
      /transition: "none"/,
      /lastTouchXRef/,
      /idx !== lastHapticIndexRef\.current/,
      /function plotLeftFor\(labels: string\[\]\): number/,
      /tickFormatter=\{axisTick\}/,
      /\}, 100\)/,
    ]
    /*
      The analytics chart reads the shared gesture now
      (components/app/use-chart-scrub), so its half of the pair is that hook
      plus the chart: the same slop, the same bias, the same hold.
    */
    const b = code("components/app/analytics-chart.tsx") + code("components/app/use-chart-scrub.ts")
    const shared = [
      /const SLOP_X = 8/,
      /const SLOP_Y = 12/,
      /\} else if \(dy > dx \* 1\.4\) \{/,
      /function shiftFor\(x: number, track: number\): string/,
      /tickFormatter=\{axisTick\}/,
      /const HOLD_MS = 100/,
    ]
    return parts.every((re) => re.test(a)) && shared.every((re) => re.test(b))
  })(),
)

// ---------------------------------------------------------------------------
section("The analytics chart: a marker that glides and stops on the day")
// ---------------------------------------------------------------------------
/*
  "The analytics still don't have the smoothness of the charts." Each point a
  finger crossed used to re-render recharts, because the dots were drawn by a
  function of the active index. The plot and the marker are two layers now,
  and only the marker moves.
*/
{
  const chart = code("components/app/analytics-chart.tsx")
  const hook = code("components/app/use-chart-scrub.ts")
  check(
    "the analytics chart reads the shared gesture, not a copy of it",
    /useChartScrub<HTMLDivElement>\(indexAt\)/.test(chart) && !/addEventListener\("touchstart"/.test(chart),
  )
  check(
    "the plot is memoised, and nothing about the finger is among its props",
    /const Plot = memo\(function Plot\(/.test(chart) && !/interface PlotProps \{[^}]*activeIndex/.test(chart),
  )
  check(
    "the marker sits over its own point, in the plot area",
    /const plotWidth = Math\.max\(0, track - plotLeft - PLOT_RIGHT\)/.test(chart) &&
      /plotLeft \+ \(i \/ \(n - 1\)\) \* plotWidth/.test(chart) &&
      /const chartLeft = rect\.left \+ plotLeft/.test(chart),
  )
  check(
    "it moves by transform and glides, except where it first appears",
    /const transition = shown && settled \? GLIDE : "none"/.test(chart) &&
      /transform: shiftFor\(x, track\)/.test(chart) &&
      /transform: `translateX\(\$\{x\.toFixed\(1\)\}px\)`/.test(chart),
  )
  check(
    "one haptic per point crossed, and it is forgotten when the finger lifts",
    /if \(i !== lastIndex\) \{[\s\S]{0,80}hapticTap/.test(hook) && /lastIndex = null/.test(hook),
  )
  check(
    "a hold scrubs from where the finger is now, in a tenth of a second",
    /show\(lastX, true\)/.test(hook) && /const HOLD_MS = 100/.test(hook),
  )
  check(
    "a hold that turns into a scroll lets go, and nothing cancels a touchstart",
    /if \(!moved && dy > SLOP_Y\) \{/.test(hook) &&
      /addEventListener\("touchstart", onStart, \{ passive: true \}\)/.test(hook) &&
      /addEventListener\("touchmove", onMove, \{ passive: false \}\)/.test(hook),
  )
}


// ---------------------------------------------------------------------------
section("THE AUDIT: every chart request, on both charts")
// ---------------------------------------------------------------------------

/**
 * Asked for, over several rounds, and checked here in one place so "is it all
 * done" has an answer that is not my opinion.
 *
 * Two of these were found by this audit rather than by anything failing: the
 * analytics chart still redrew twice on a metric switch, and the analytics
 * PAGE had two more rows that forbade vertical panning. Both were the same
 * bugs as the dashboard's, in the file nobody had screenshotted.
 */
{
  const charts: Array<[string, string]> = [
    ["home", code("components/app/dashboard-client.tsx")],
    ["analytics", code("components/app/analytics-chart.tsx") + code("components/app/use-chart-scrub.ts")],
  ]

  const required: Array<[string, RegExp]> = [
    ["the tooltip is clamped to the card, by the box's own width", /translateX\(clamp\(8px, calc\(/],
    ["nothing measures the tooltip's width from a ref", /^(?!.*tooltipRef\.current\?\.offsetWidth)/s],
    ["the numbers are on the axis", /<YAxis/],
    ["the axis is measured from its own labels", /function plotLeftFor\(labels: string\[\]\): number/],
    ["one formatter draws and measures the ticks", /tickFormatter=\{axisTick\}/],
    ["the axis width is what the finger reads", /rect\.left \+ plotLeft/],
    ["room above for the active dot", /const PLOT_TOP = \d+/],
    ["the tooltip sits over its own point, in the plot area", /plotLeft \+ \(activeIndex/],
    ["a resting thumb cannot cancel the hold", /const SLOP_Y = 12/],
    ["a deliberate sideways drag engages sooner than a scroll gives up", /const SLOP_X = 8/],
    ["one animation length, shared by both charts", /CHART_ANIM_MS/],
    ["vertical has to win clearly to be a scroll", /\} else if \(dy > dx \* 1\.4\) \{/],
    ["the hold reads where the finger is now", /getIndexFromTouch\(lastTouchXRef\.current\)/],
    ["a hold lands in about a tenth of a second", /\}, 100\)/],
    ["the box follows the finger every frame", /box\.style\.transform = shiftFor\(x, rect\.width\)/],
    ["no transition fights that follow", /transition: "none"/],
    ["one haptic per point crossed", /idx !== lastHapticIndexRef\.current/],
    ["the haptic resets when the finger lifts", /lastHapticIndexRef\.current = null/],
    /*
      The dependency list is the data, and nothing that merely ASKS for data:
      a metric filter in here fired the effect once with the old numbers
      still in the chart and again when the new ones arrived. The analytics
      chart also carries its own animation flag in the list, because the flag
      is now raised during the render that receives the series rather than by
      this effect; see tests/analytics-chart-skeleton.test.ts.
    */
    ["one redraw per metric switch, on the data", /\}, \[(?:shouldAnimate, )?(displayChartData|chartDisplayData)\]\)/],
  ]

  /*
    THE ANALYTICS CHART'S FORM OF EACH RULE. It reads the shared gesture
    (components/app/use-chart-scrub) and draws a marker that glides between
    points and stops on each, so a few rules are held in the words that
    express them there. Every rule still has to hold on both charts.
  */
  const ANALYTICS_FORM: Record<string, RegExp> = {
    "the axis is measured from its own labels": /axisWidth\(scale\.ticks\.map\(axisTick\), 11, 8\)/,
    "the tooltip sits over its own point, in the plot area": /plotLeft \+ \(i \/ \(n - 1\)\) \* plotWidth/,
    "the hold reads where the finger is now": /show\(lastX, true\)/,
    "a hold lands in about a tenth of a second": /const HOLD_MS = 100/,
    "the box follows the finger every frame": /transform: shiftFor\(x, track\)/,
    "no transition fights that follow": /shown && settled \? GLIDE : "none"/,
    "one haptic per point crossed": /if \(i !== lastIndex\) \{/,
    "the haptic resets when the finger lifts": /lastIndex = null/,
  }
  for (const [label, re] of required) {
    const missing = charts.filter(([name, src]) => !((name === "analytics" && ANALYTICS_FORM[label]) || re).test(src)).map(([name]) => name)
    check(
      `both charts: ${label}`,
      missing.length === 0,
      missing.length ? `missing on: ${missing.join(", ")}` : undefined,
    )
  }
}

check(
  "no strip anywhere in the app forbids vertical panning",
  (() => {
    /**
     * `pan-x` alone means a thumb on that element cannot scroll the page.
     * The dashboard's KPI row was the one in the screenshot; the analytics
     * page had two more of them.
     *
     * This is about STRIPS, not the two trend charts. Those are deliberately
     * `touch-action: none`, because a chart that promises the browser a pan
     * has its hold stolen mid gesture, and they scroll the page by hand
     * instead. tests/analytics-chart.test.ts holds that rule and the
     * scrolling that pays for it.
     */
    const files = [
      "components/app/dashboard-client.tsx",
      "app/app/analytics/analytics-client.tsx",
    ]
    return files.every((f) => !/touchAction: 'pan-x'/.test(read(f)))
  })(),
)


check(
  "a metric switch plays one animation, not three",
  (() => {
    /**
     * Tapping Revenue used to blur the chart out to 30%, blur it back in, and
     * redraw the line, all at once — the pumping and double loading. The
     * first-load skeleton stays, because that is the one moment there really
     * is nothing to look at; the sample-data dimming stays too, because it
     * says these numbers are not yours rather than "wait".
     */
    const src = code("components/app/dashboard-client.tsx")
    return (
      !/isChartLoading \? "opacity-30 blur-\[2px\]"/.test(src) &&
      /isChartLoading && displayChartData\.length === 0 \?/.test(src) &&
      /showSampleData && !hasRealData \? "opacity-50"/.test(src)
    )
  })(),
)

check(
  "a sideways swipe cannot hand the browser a pull-to-refresh",
  /\.app-content-scroll \{\s*overscroll-behavior-y: contain;/.test(read("app/globals.css")),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
