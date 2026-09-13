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

check(
  "the charts of counts over time have no y axis eating their left edge",
  !/<YAxis/.test(code("components/app/analytics-chart.tsx")) &&
    !/<YAxis/.test(code("components/app/dashboard-client.tsx")),
)
check(
  "the grid lines stay, so the shape still has something to read against",
  /<CartesianGrid/.test(read("components/app/analytics-chart.tsx")),
)
check(
  "and the payouts chart keeps its scale, because money is not a count",
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
      `${name}: the chart reserves room for the dot the axis used to leave`,
      /margin=\{\{ top: 10, right: 10, left: 10, bottom: 0 \}\}/.test(src),
    )
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
