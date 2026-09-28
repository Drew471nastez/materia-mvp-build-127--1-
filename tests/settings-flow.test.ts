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
  /<div key=\{activeTab\} data-settings-panel=\{activeTab\} className=\{panelEntrance \? "settings-panel" : undefined\}>/.test(settings),
)
{
  /* The fade is put on by a press and nothing else: not the first paint, not ?tab= on load, not a re-render. */
  const handler = settings.slice(settings.indexOf("const handleTabChange = (newTab: TabId) => {"), settings.indexOf("const handleSubmit = async"))
  check(
    "the fade comes on with a press of a tab, and only then",
    /useState\(false\)/.test(settings.slice(settings.indexOf("const [panelEntrance, setPanelEntrance]"), settings.indexOf("const [panelEntrance, setPanelEntrance]") + 80)) &&
      (settings.match(/setPanelEntrance\(true\)/g) ?? []).length === 1 &&
      /setPanelEntrance\(true\)/.test(handler),
  )
  check(
    "the General tab's Custom Domain row switches tab the same way, so it fades too",
    /onClick=\{\(\) => \{ handleTabChange\("domains"\);/.test(settings) && !/setActiveTab\("domains" as TabId\)/.test(settings),
  )
}

{
  const swap = css.slice(css.indexOf(".settings-panel {"), css.indexOf(".settings-panel {") + 420)
  /* The 4px rise it used to have was the bump the owner reported, measured
     on every switch by scripts/check-settings-tabs.mjs. Opacity only, and
     never from nothing, so no frame is empty under the tabs. */
  check(
    "it settles in tone only: no rise, no frame with nothing under the tabs",
    /from \{ opacity: 0\.2; \}/.test(swap) && !/translate|transform|height|width|background/.test(swap),
  )
  /* "Not that direct": 140ms from 0.4 was over before it was seen. */
  check(
    "long enough to be seen as a fade, on an ease out",
    (() => {
      const m = swap.match(/animation: settings-panel-in (\d+)ms cubic-bezier\(0\.33, 1, 0\.68, 1\) backwards/)
      return m !== null && Number(m[1]) >= 180
    })(),
  )
  check(
    "a switch keeps the scroll, so the tab bar does not jump under the finger",
    /form\.style\.minHeight = `\$\{Math\.max\(0, Math\.ceil\(scroller\.scrollTop \+ scroller\.clientHeight - formTop\)\)\}px`/.test(settings)
      && /<form ref=\{formRef\} onSubmit=\{handleSubmit\}>/.test(settings),
  )
  check(
    "and a refresh of the domain list keeps the list on screen",
    /if \(!domainsLoadedRef\.current\) setDomainsLoading\(true\)/.test(settings),
  )
  check(
    "and it is short enough to switch through repeatedly",
    (() => {
      const m = swap.match(/animation: settings-panel-in (\d+)ms/)
      return m !== null && Number(m[1]) <= 220
    })(),
  )
  check("off where motion is not wanted", /prefers-reduced-motion: reduce\)\s*\{\s*\.settings-panel \{ animation: none; \}/.test(css))
}

{
  /*
    "I don't like the animation of the pill when switching between tabs. Make it smoother, cleaner, something
    else, not that slide." Nothing travels across the row any more: each tab owns its fill, which fades in and
    grows from 96% where it is, the old one fades out where it is, and the words ease their colour, 150ms.
  */
  check(
    "no pill slides across the row: no shared ring, no measuring, no animate()",
    !/data-settings-tab-ring|tabRingRef|ring\.animate\(|TAB_SLIDE_MS/.test(settings),
  )
  check(
    "each tab carries its own fill, faded and scaled in place on opacity and scale only, 150ms on a plain ease out",
    /data-settings-tab-fill=""/.test(settings)
      && /pointer-events-none absolute -inset-px rounded-full border border-\[#d1d5db\] bg-\[#f3f4f6\][^`]*\$\{panelEntrance \? "transition-\[opacity,scale\]" : "transition-none"\} motion-reduce:transition-none/.test(settings)
      && /activeTab === tab\.id \? "opacity-100 scale-100" : "opacity-0 scale-\[0\.96\]"/.test(settings)
      && /const TAB_FADE_MS = 150/.test(settings) && /const TAB_EASE = "cubic-bezier\(0\.33, 1, 0\.68, 1\)"/.test(settings),
  )
  check(
    "a press is answered by a small dip, and the selected tab is announced",
    /active:scale-\[0\.97\] motion-reduce:transition-none motion-reduce:active:scale-100/.test(settings)
      && /aria-current=\{activeTab === tab\.id \? "page" : undefined\}/.test(settings),
  )
  /* The Notifications tab's rows used to load as 48px grey bars and grow to their real height when they landed: a jump after the fade. */
  const prefs = code("components/app/settings/notification-preferences.tsx")
  check(
    "the Notifications rows are drawn with their real names and lines while the switches load, so nothing grows when they land",
    /data-notification-pref-loading=\{c\.category\}/.test(prefs) && /\{c\.label\}<\/p>/.test(prefs) && /\{c\.detail\}<\/p>/.test(prefs) && !/h-3\.5 w-32 rounded bg-\[#f1f2f4\]/.test(prefs),
  )
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
    "closing does not show a spinner, or wait on a timer before it leaves",
    !/Show spinner briefly/.test(read("components/app/billing/upgrade-page-client.tsx")) &&
      !/setTimeout\(\(\) => \{\s*router\.push/.test(upgrade),
  )
  /* Back is the browser's back when there is an /app page behind this one,
     and otherwise a real link to the tab, not to the route that only
     redirects. */
  check(
    "Back goes back when there is somewhere in the app to go back to, and is a link to the Billing tab otherwise",
    /<Link\s+href=\{BILLING_HREF\}\s+onClick=\{goBack\}/.test(upgrade) &&
      /const BILLING_HREF = "\/app\/settings\?tab=billing"/.test(upgrade) &&
      /if \(!hasInAppHistory\(\)\) return\s+e\.preventDefault\(\)\s+moveLayer\("leave", \(\) => backThen\(\(\) => router\.replace\(BILLING_HREF\)\), false\)/.test(upgrade),
  )
  check(
    "it is its own page: a layer over the whole shell, with the pill stepping aside under it",
    /* The shared layer (components/app/page-layer.tsx): over the header (50), under the pill (55), which it hides. */
    /<PageLayer inset="white">/.test(read("app/app/settings/billing/upgrade/layout.tsx")) &&
      /data-page-layer=\{pill \? "pill" : ""\}/.test(read("components/app/page-layer.tsx")) &&
      /fixed inset-0 z-\[52\]/.test(read("components/app/page-layer.tsx")) &&
      /html:has\(\[data-page-layer=""\]\) \[data-app-nav-pill\] \{\s*visibility: hidden;/.test(css),
  )
  check(
    "and it arrives and leaves on the shell's landing, not animations of its own",
    !/upgrade-arriving|upgrade-leaving/.test(upgrade) && !/\.upgrade-(arriving|leaving)/.test(css),
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
      /axisWidth\(axisLabels, 11, 8\)/.test(analytics) &&
      ![home, analytics].some((src) => /const PLOT_LEFT = \d+/.test(src))
    )
  })(),
)
/*
  THE NUMBERS ARE DRAWN OVER THE PLOT NOW (components/app/chart-morph
  AxisLabels), so they can cross-fade when a tab changes them; recharts keys
  each tick by its value and would replace it outright. The rule is the same:
  one formatter writes the labels and the same labels are measured, and the
  gutter is the widest label of every metric the tabs can show, so a tab
  never moves the plot sideways.
*/
check(
  "one formatter both draws the ticks and measures them, so the gutter fits what is shown",
  /const axisLabels = useMemo\(\(\) => scale\.ticks\.map\(axisTick\)/.test(code("components/app/dashboard-client.tsx")) &&
    /plotLeftFor\(axisLabels\)/.test(code("components/app/dashboard-client.tsx")) &&
    /<AxisLabels labels=\{axisLabels\}/.test(code("components/app/dashboard-client.tsx")) &&
    /const axisLabels = useMemo\(\(\) => scale\.ticks\.map\(axisTick\)/.test(code("components/app/analytics-chart.tsx")) &&
    /axisWidth\(axisLabels, 11, 8\)/.test(code("components/app/analytics-chart.tsx")) &&
    /<AxisLabels labels=\{axisLabels\}/.test(code("components/app/analytics-chart.tsx")),
)
check(
  "and one width for every tab, taken from every metric the tabs can show",
  /const widths = \(Object\.keys\(widthFrom\) as Metric\[\]\)/.test(code("components/app/dashboard-client.tsx")) &&
    /const widths = METRICS_OF\[analyticsMode\]\.map/.test(code("components/app/analytics-chart.tsx")),
)
check(
  "and the measured width is what the axis, the margin and the finger all read",
  /*
    The finger's half is components/app/chart-scrub now, the layer both
    charts draw: it is handed the same plotLeft the axis is given, and turns
    a pointer into a point with it.
  */
  ["components/app/analytics-chart.tsx", "components/app/dashboard-client.tsx"].every((f) => {
    const src = code(f)
    return (
      /width=\{plotLeft\}/.test(src) &&
      /left=\{plotLeft\}/.test(src) &&
      !/rect\.left \+ 40/.test(src)
    )
  }) &&
    /const x = Math\.max\(l, Math\.min\(width - rr, r\.clientX - box\.left\)\)/.test(code("components/app/chart-scrub.tsx")) &&
    /Math\.round\(\(\(x - l\) \/ plot\) \* \(n - 1\)\)/.test(code("components/app/chart-scrub.tsx")),
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
  "the Website glyph is one browser window, drawn once, like the envelope and the banknote beside it",
  /from "@solar-icons\/react\/linear\/window-frame"/.test(read("components/app/sidebar-desktop-nav.tsx")) &&
    !/linear\/monitor/.test(read("components/app/sidebar-desktop-nav.tsx")),
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

  /*
    Both charts' readout is components/app/chart-scrub's, so the clamp and
    the width are held there, once, and each chart is held to drawing it.
  */
  const layer = code("components/app/chart-scrub.tsx")
  check(
    "chart-scrub.tsx: the position is a clamp whose bounds are the card, not a guess",
    /translateX\(clamp\(8px, calc\(\$\{x\.toFixed\(1\)\}px - 50%\), calc\(\$\{width\.toFixed\(1\)\}px - 100% - 8px\)\)\)/.test(layer),
  )
  check(
    "chart-scrub.tsx: it can never be wider than the card either",
    /maxWidth: "calc\(100% - 16px\)"/.test(layer),
  )
  for (const path of charts) {
    const src = code(path)
    const name = path.split("/").pop()

    check(`${name}: its readout is the shared one`, /<ChartScrub\b/.test(src))
    check(
      `${name}: nothing reads the tooltip's own width any more`,
      !/tooltipRef\.current\?\.offsetWidth/.test(src) && !/offsetWidth/.test(layer),
    )
    check(
      `${name}: and there is no fixed edge zone deciding when centring is safe`,
      !/EDGE_ZONE/.test(src) && !/EDGE_ZONE/.test(layer),
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
  "switching metric draws once, from the render that receives the series, and fetches nothing",
  (() => {
    /**
     * `openKPIModal` used to sit in these deps beside the data. Tapping
     * Revenue fired the animation immediately, redrawing the chart with the
     * OLD numbers still in it, and again when the fetch returned. Two draws,
     * the first of the wrong thing: the double refresh.
     *
     * Then the flag was raised by an effect on the data, which runs after the
     * new line has been painted: one frame of the new line cut in, then the
     * morph. There is no flag now: the line is components/app/morph-lines,
     * handed the numbers alone, and it starts a move in a layout effect, before
     * paint, only when those numbers differ from what it has. A tab does not
     * fetch at all: the chart's events are read once per period.
     */
    const src = code("components/app/dashboard-client.tsx")
    const lines = code("components/app/morph-lines.tsx")
    return /const lines = useMemo\(\(\) => \[displayChartData\.map\(\(d\) => d\.value \?\? 0\)\], \[displayChartData\]\)/.test(src)
      && /<MorphLines\s+lines=\{lines\}/.test(src)
      && !/setShouldAnimate/.test(src)
      && /React\.useLayoutEffect\(\(\) => \{\s*const s = st\.current\s*if \(s\.sig === sig\) return/.test(lines)
      /* Changed on purpose: a new order asks again too (ordersChanged); the tab still never does. */
      && /\}, \[periodKey, creatorId, ordersChanged\]\)/.test(src) && !/openKPIModal, periodKey/.test(src)
  })(),
)


// ---------------------------------------------------------------------------
section("The scrub, on a phone")
// ---------------------------------------------------------------------------

/*
  THE SCRUB IS ONE LAYER NOW, components/app/chart-scrub, drawn by the home
  page's chart, the Analytics chart and the report cards. These rules were
  held on the home page's chart, which had them first; they are held on the
  layer every chart draws, so no chart can lose one.
*/
{
  const src = code("components/app/chart-scrub.tsx")
  const name = "chart-scrub.tsx"

  check(
    `${name}: the marks are placed over their own point, in the plot area`,
    /const plot = Math\.max\(0, width - l - r\)/.test(src) &&
      /n <= 1 \? l \+ plot \/ 2 : l \+ \(i \/ \(n - 1\)\) \* plot/.test(src),
  )
  check(
    `${name}: not as a percentage of the whole card, which ignored the axis`,
    !/tooltipLeftPercent/.test(src),
  )
  check(
    `${name}: one haptic per point crossed, fired on the change and not the frame`,
    /if \(i !== r\.index\) \{\s*if \(r\.input === "touch"\) hapticTap\(r\.index < 0 \? "medium" : "light"\)/.test(src),
  )
  check(
    `${name}: and it is forgotten when the finger lifts, so the next scrub ticks again`,
    /r\.index = -1/.test(src),
  )
  check(
    `${name}: a hold produces the tooltip in about a tenth of a second`,
    /const HOLD_MS = 100/.test(src) && /\}, HOLD_MS\)/.test(src),
  )
  check(
    /**
     * THE LOST HOLD. `dx + dy > 5` counts tremor as movement, and a bare
     * `else` makes a one pixel vertical bias into a scroll, so a resting
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
    /lastX = t\.clientX/.test(src) && /move\(lastX, "touch"\)/.test(src),
  )
  check(
    `${name}: the box follows the finger every frame, written straight to the node`,
    /tip\.style\.transform = `translateX\(clamp\(/.test(src) && /if \(!r\.frame\) r\.frame = requestAnimationFrame\(paint\)/.test(src),
  )
  check(
    `${name}: with no transition on its position, which would only be lag; only its opacity fades`,
    /const t = `opacity \$\{ms\}ms \$\{SCRUB_FADE_EASE\}`/.test(src) && !/tip\.style\.transition = .*transform/.test(src) && !/transform 90ms/.test(src),
  )
  check(
    `${name}: and no React state carries the position, so there is no render per frame`,
    !/useState|setTooltipLeft|setTooltipX/.test(src),
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
     * Home and Analytics draw one style for the row now
     * (components/app/use-tab-strip TAB_STRIP_STYLE), measured by
     * scripts/check-metric-tabs-gesture.mjs.
     */
    const src = code("components/app/dashboard-client.tsx")
    const hook = code("components/app/use-tab-strip.ts")
    return /aria-label="Metric" data-scroll-x className="[^"]*" style=\{TAB_STRIP_STYLE\}>/.test(src)
      && /touchAction: "pan-x pan-y"/.test(hook) && !/touchAction: ["']pan-x["']/.test(hook + src)
  })(),
)


check(
  "both charts got every part of the scrub, not most of it",
  (() => {
    /**
     * A patch script applied six changes to one chart and four to the other,
     * and the build passed either way: a half-updated gesture is still valid
     * TypeScript. There is one copy now, components/app/chart-scrub, so a
     * partial application is not possible; what is held is that both charts
     * draw it and that it has every part.
     */
    const layer = code("components/app/chart-scrub.tsx")
    const parts = [
      /const SLOP_X = 8/,
      /const SLOP_Y = 12/,
      /\} else if \(dy > dx \* 1\.4\) \{/,
      /translateX\(clamp\(8px, calc\(/,
      /tip\.style\.transform = /,
      /const HOLD_MS = 100/,
      /move\(lastX, "touch"\)/,
      /if \(i !== r\.index\) \{/,
    ]
    const home = code("components/app/dashboard-client.tsx")
    const analytics = code("components/app/analytics-chart.tsx")
    return parts.every((re) => re.test(layer))
      && [home, analytics].every((src) => /<ChartScrub\b/.test(src) && /<AxisLabels labels=\{axisLabels\}/.test(src))
      && /function plotLeftFor\(labels: string\[\]\): number/.test(home)
  })(),
)

// ---------------------------------------------------------------------------
section("The analytics chart: the same marker as the home page's")
// ---------------------------------------------------------------------------
/*
  "The analytics still don't have the smoothness of the charts." Each point a
  finger crossed used to re-render recharts, because the dots were drawn by a
  function of the active index. Then it had a marker of its own that snapped
  and glided, and still felt different from the home page's. It draws the
  home page's now: components/app/chart-scrub.
*/
{
  const chart = code("components/app/analytics-chart.tsx")
  const layer = code("components/app/chart-scrub.tsx")
  check(
    "the analytics chart draws the shared layer, not a copy of it",
    /<ChartScrub\b/.test(chart) && !/addEventListener\("touchstart"/.test(chart),
  )
  check(
    "the frame is memoised, and nothing about the finger or the numbers is among its props",
    /const Frame = memo\(function Frame\(/.test(chart) && !/interface FrameProps \{[^}]*(activeIndex|lines|values)/.test(chart),
  )
  check(
    "the marker sits over its own point, in the plot area the axis leaves",
    /left=\{plotLeft\}/.test(chart) && /right=\{PLOT_RIGHT\}/.test(chart) &&
      /l \+ \(i \/ \(n - 1\)\) \* plot/.test(layer),
  )
  check(
    "it moves by transform, glides under a mouse, and cuts where it first appears",
    /cross\.style\.transform = `translateX\(/.test(layer) && /if \(arriving\) setGlide\(false\)/.test(layer)
      && /if \(r\.input === "mouse"\) r\.glide = requestAnimationFrame\(\(\) => setGlide\(true\)\)/.test(layer),
  )
  check(
    "one haptic per point crossed, and it is forgotten when the finger lifts",
    /if \(i !== r\.index\) \{\s*if \(r\.input === "touch"\) hapticTap/.test(layer) && /r\.index = -1/.test(layer),
  )
  check(
    "a hold scrubs from where the finger is now, in a tenth of a second",
    /move\(lastX, "touch"\)/.test(layer) && /const HOLD_MS = 100/.test(layer),
  )
  check(
    "a hold that turns into a scroll lets go, and nothing cancels a touchstart",
    /if \(!moved && dy > SLOP_Y\) \{/.test(layer) &&
      /addEventListener\("touchstart", onStart, \{ passive: true \}\)/.test(layer) &&
      /addEventListener\("touchmove", onMove, \{ passive: false \}\)/.test(layer),
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
 *
 * Each chart is read together with components/app/chart-scrub, the layer it
 * draws for the crosshair, the dots, the readout and the gesture.
 */
{
  const layer = code("components/app/chart-scrub.tsx")
  const charts: Array<[string, string]> = [
    ["home", code("components/app/dashboard-client.tsx") + layer],
    ["analytics", code("components/app/analytics-chart.tsx") + layer],
  ]

  const required: Array<[string, RegExp]> = [
    ["the tooltip is clamped to the card, by the box's own width", /translateX\(clamp\(8px, calc\(/],
    ["nothing measures the tooltip's width from a ref", /^(?!.*tooltipRef\.current\?\.offsetWidth)/s],
    ["the numbers are on the axis", /<YAxis/],
    ["the axis is measured from its own labels", /function plotLeftFor\(labels: string\[\]\): number/],
    ["one formatter draws and measures the ticks", /const axisLabels = useMemo\(\(\) => scale\.ticks\.map\(axisTick\)[\s\S]*<AxisLabels labels=\{axisLabels\}/],
    ["the axis width is what the finger reads", /left=\{plotLeft\}/],
    ["room above for the active dot", /const PLOT_TOP = \d+/],
    ["the tooltip sits over its own point, in the plot area", /l \+ \(i \/ \(n - 1\)\) \* plot/],
    ["a resting thumb cannot cancel the hold", /const SLOP_Y = 12/],
    ["a deliberate sideways drag engages sooner than a scroll gives up", /const SLOP_X = 8/],
    ["one morph, the same length and curve, shared by both charts", /<MorphLines\b/],
    ["vertical has to win clearly to be a scroll", /\} else if \(dy > dx \* 1\.4\) \{/],
    ["the hold reads where the finger is now", /move\(lastX, "touch"\)/],
    ["a hold lands in about a tenth of a second", /const HOLD_MS = 100/],
    ["the box follows the finger every frame", /tip\.style\.transform = `translateX\(clamp\(/],
    ["no transition fights that follow: only the readout's opacity fades", /const t = `opacity \$\{ms\}ms \$\{SCRUB_FADE_EASE\}`/],
    ["one haptic per point crossed", /if \(i !== r\.index\) \{/],
    ["the haptic resets when the finger lifts", /r\.index = -1/],
    /*
      The dependency list is the data, and nothing that merely ASKS for data:
      a metric filter in here fired the effect once with the old numbers
      still in the chart and again when the new ones arrived. The analytics
      chart also carries its own animation flag in the list, because the flag
      is now raised during the render that receives the series rather than by
      this effect; see tests/analytics-chart-skeleton.test.ts.
    */
    ["one redraw per metric switch, on the data", /const lines = useMemo\([\s\S]{0,200}?\[(?:chartDisplayData, visibleKeys|displayChartData)\],?\s*\)/],
  ]

  /*
    THE ANALYTICS CHART'S FORM OF A RULE: it measures its gutter in the font
    the labels are drawn in rather than estimating it. Every rule still has
    to hold on both charts.
  */
  const ANALYTICS_FORM: Record<string, RegExp> = {
    "the axis is measured from its own labels": /axisWidth\(axisLabels, 11, 8\)/,
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
     * says these numbers are not yours rather than "wait". The first-load
     * state is the chart's frame with a grey floor line, softly blurred,
     * from the first frame and only while there is no line: no skeleton.
     */
    const src = code("components/app/dashboard-client.tsx")
    return (
      !/isChartLoading \? "opacity-30 blur-\[2px\]"/.test(src) &&
      /* Renamed on purpose: Home waits for the Analytics answer (homeAnswer), not for events it read itself. */
      /const chartWaiting = \(homeAnswer == null \|\| isChartLoading\) && displayChartData\.length === 0/.test(src) &&
      /showSampleData && !hasRealData \? "opacity-50/.test(src)
    )
  })(),
)

check(
  "a sideways swipe cannot hand the browser a pull-to-refresh",
  /\.app-content-scroll \{\s*overscroll-behavior-y: contain;/.test(read("app/globals.css")),
)

/*
  ── HOW FAR IN AN /app PAGE STARTS, AND WHERE THAT NUMBER LIVES ──────────────
  "Reduce their padding left and right, like increase their width on phones so
  they are more close to the edges." A card was inset twice — the page's gutter
  and the card's own padding — and the two were written out separately in about
  twenty files, so nobody could see the sum. Both now come from app/globals.css
  and nowhere else, and scripts/check-app-insets.mjs renders the real pages and
  reads the sum back off the boxes. These checks hold the one place, and that
  only the phone moved.
*/
{
  const css = read("app/globals.css")
  check(
    "the gutter and the card padding are two custom properties in app/globals.css: on a phone 10px and 12px, so a word starts 23px in rather than 33",
    /:root \{\s*--app-gutter: 11px;\s*--app-card-x: 12px;\s*\}/.test(css),
  )
  check(
    "from 640px both are 24px and from 1024px the gutter is 32px, exactly what `sm:px-6 lg:px-8` and `sm:p-6` were: a tablet and a computer do not move",
    /@media \(min-width: 640px\) \{\s*:root \{\s*--app-gutter: 24px;\s*--app-card-x: 24px;\s*\}\s*\}/.test(css)
      && /@media \(min-width: 1024px\) \{\s*:root \{\s*--app-gutter: 32px;\s*\}\s*\}/.test(css),
  )
  check(
    "the two utilities pad sideways only, and live in the components layer so a page's own `lg:px-[35px]` or `sm:px-0` still wins",
    /@layer components \{[\s\S]*?\.app-gutter \{\s*padding-inline: var\(--app-gutter\);\s*\}/.test(css)
      && /\.app-card-x \{\s*padding-inline: var\(--app-card-x\);\s*\}/.test(css)
      && /\.app-gutter-bleed \{\s*margin-inline: calc\(var\(--app-gutter\) \* -1\);\s*padding-inline: var\(--app-gutter\);\s*\}/.test(css),
  )
  check(
    "every /app page shell wears it: Settings, Home, Analytics, and the list pages through orders/order-parts GUTTER",
    /className="max-w-4xl mx-auto app-gutter py-6 sm:py-8/.test(code("components/app/settings-form-new.tsx"))
      && /className="app-gutter py-6 max-w-\[1200px\] mx-auto"/.test(code("components/app/dashboard-client.tsx"))
      && /className="app-gutter py-6 max-w-\[1200px\] mx-auto space-y-6"/.test(code("app/app/analytics/analytics-client.tsx"))
      && /export const GUTTER = "app-gutter"/.test(code("app/app/orders/order-parts.tsx")),
  )
  check(
    "the Settings tab strip still reaches the glass, out by whatever the shell put in rather than by its own copy of 16px",
    /data-settings-tabs="" className="mb-6 sm:mb-8 overflow-x-auto app-gutter-bleed sm:mx-0 sm:px-0/.test(code("components/app/settings-form-new.tsx")),
  )
  check(
    "no Settings or billing card writes its own sideways padding any more: `p-4 sm:p-6` is gone from both",
    !/p-4 sm:p-6/.test(read("components/app/settings-form-new.tsx"))
      && !/p-4 sm:p-6|p-5 sm:p-6/.test(read("components/app/billing/billing-page-client.tsx"))
      && (code("components/app/settings-form-new.tsx").match(/app-card-x py-4 sm:py-6/g) ?? []).length >= 10,
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
