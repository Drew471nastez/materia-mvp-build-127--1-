/**
 * ===========================================================================
 *  THE /app SHELL IN MOTION: SHEETS, NAVIGATION, SETTINGS TABS, AVATARS
 * ===========================================================================
 * The motion itself is measured in a browser, frame by frame:
 *
 *   scripts/check-sheet-motion.mjs     every way a sheet closes slides out; the pill stays under it
 *   scripts/check-app-mobile-nav.mjs   the real pill under an open sheet: visible, in place, not tappable
 *   scripts/check-app-stage.mjs        no outline ever; the spinner only past its wait; the landing; back keeps scroll
 *   scripts/check-settings-tabs.mjs    the tab bar and the new tab hold still through every switch
 *   scripts/check-upgrade-page.mjs     the plans page covers the shell; Back goes back
 *   scripts/check-page-layer.mjs       the editor over the shell on a phone, in it from md, its bar under the header
 *   scripts/check-scrollbar-stable.mjs the page's box and the scrollbar track never move or come and go while the real pages swap (1280, 1440, 1920)
 *   scripts/check-app-avatar.mjs       no initials before a photo; one fade; none on the way back
 *
 * What is held here is the logic those rest on (the navigation record, the
 * way back) and the lines that would undo them without anything else
 * failing.
 *
 * Run with:  npm run test:push
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  beginAppNavigation,
  endAppNavigation,
  getAppNavigation,
  hasInAppHistory,
  markLanded,
  markTraversal,
  NAV_BAR_AFTER_MS,
  NAV_ENTER_MS,
  NAV_ENTER_RISE_PX,
  NAV_SPINNER_AFTER_MS,
  NAV_PHONE_SPINNER_AFTER_MS,
  NAV_SPINNER_FADE_MS,
  NAV_SPINNER_OUT_MS,
  NAV_SPINNER_CAP_MS,
  APP_PAGE_KEPT_MS,
  isCommittedAddress,
  isCurrentAddress,
  markCommitted,
  pendingPath,
  waitsWithSpinner,
  spinnerDelay,
  recalledScroll,
  rememberScroll,
  takeTraversal,
} from "@/lib/ui/app-navigation"
import { SHEET_CLOSE_EASE, SHEET_CLOSE_MS, SHEET_EASE, SHEET_OPEN_MS } from "@/components/ui/bottom-sheet"
import { SPINNER_WAIT_MS } from "@/components/ui/activity-spinner"
import { SHIMMER_SWAP_MS, SHIMMER_WAIT_MS } from "@/components/ui/shimmer"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

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

/* The record only runs where there is a window; a bare one is enough here. */
const g = globalThis as unknown as { window?: unknown }
if (!g.window) g.window = globalThis

section("A navigation, from start to landing")
{
  check("nothing is underway to begin with", getAppNavigation() === null)
  beginAppNavigation("/app/orders")
  const nav = getAppNavigation()
  check("a click records where it is going, and when", nav?.href === "/app/orders" && typeof nav?.startedAt === "number")
  const firstStart = getAppNavigation()?.startedAt
  beginAppNavigation("/app/orders")
  check("the same press reported twice is one navigation: it keeps when it started",
    getAppNavigation()?.href === "/app/orders" && getAppNavigation()?.startedAt === firstStart)
  beginAppNavigation("/app/analytics")
  check("a second click replaces the first", getAppNavigation()?.href === "/app/analytics")
  check("and the nav lights the page being opened, by path, only inside /app",
    pendingPath(getAppNavigation()) === "/app/analytics" && pendingPath({ href: "/app/orders/?order=1", startedAt: 0 }) === "/app/orders"
      && pendingPath({ href: "/explore", startedAt: 0 }) === null && pendingPath({ href: null, startedAt: 0 }) === null && pendingPath(null) === null)
  endAppNavigation()
  check("the commit clears it", getAppNavigation() === null)
  endAppNavigation()
  check("and clearing twice is harmless", getAppNavigation() === null)
  check(
    "the thresholds are the ones asked for: a computer's bar at 300ms, a 180ms landing with a 1 to 3px rise",
    NAV_BAR_AFTER_MS === 300 && NAV_ENTER_MS >= 160 && NAV_ENTER_MS <= 200 && NAV_ENTER_RISE_PX >= 1 && NAV_ENTER_RISE_PX <= 3,
  )
}

section("Pressing the page you are on")
{
  const w = globalThis as unknown as { location?: unknown }
  const had = w.location
  w.location = { href: "https://storelib.com/app/orders?order=7", origin: "https://storelib.com", pathname: "/app/orders", search: "?order=7" }
  check("is told apart from a navigation, by path and query, with or without a trailing slash",
    isCurrentAddress("/app/orders?order=7") && isCurrentAddress("/app/orders/?order=7") && isCurrentAddress("https://storelib.com/app/orders?order=7")
      && !isCurrentAddress("/app/orders") && !isCurrentAddress("/app/analytics") && !isCurrentAddress("https://elsewhere.com/app/orders?order=7") && !isCurrentAddress(null))
  w.location = had
  const bar = code("components/app/navigation-loading-bar.tsx")
  check("and starts no record, from a link or from a push: nothing would ever end it, and the bar and spinner sat for ten seconds",
    /if \(isCurrentAddress\(url\.href\)\) \{ endAppNavigation\(\); return \}/.test(bar) && /if \(isCurrentAddress\(href\)\) \{ endAppNavigation\(\); return \}\s*takeTraversal\(\)\s*beginAppNavigation\(href\)/.test(bar))
  /* Regression: Orders on its way, then Home (showing) pressed again. The
     router drops the Orders navigation, nothing commits, and the record used
     to stay: the spinner over Home and Orders lit in the pill for ten seconds
     (scripts/check-app-stage.mjs, "backToTheShowingPage": 94 frames before). */
  check("and a press on it while another page is on its way ends that navigation's record: the router has dropped it",
    (bar.match(/if \(isCurrentAddress\([^)]*\)\) \{ endAppNavigation\(\); return \}/g) ?? []).length === 2)
}

section("Back onto the page already showing")
{
  /* Regression: the email and OnePage editors push a guard entry at their own
     address, the OnePage tabs push #tab. Back onto one of those commits
     nothing, and the record it started kept the spinner up over the editor
     for ten seconds. */
  markCommitted("/app/emails/edit/7", "")
  check("the committed address is the stage's, by path and query, trailing slash and query order aside",
    isCommittedAddress("/app/emails/edit/7", "") && isCommittedAddress("/app/emails/edit/7/", "")
      && !isCommittedAddress("/app/emails", "") && !isCommittedAddress("/app/emails/edit/7", "?tab=x"))
  markCommitted("/app/orders", "?b=2&a=1")
  check("a query is compared as parameters, not as a string", isCommittedAddress("/app/orders", "?b=2&a=1") && !isCommittedAddress("/app/orders", "?b=3&a=1"))
  const bar = code("components/app/navigation-loading-bar.tsx")
  check("a popstate onto it starts no record, ends any underway, and leaves no back to restore",
    /const onPop = \(\) => \{\s*if \(isCommittedAddress\(window\.location\.pathname, window\.location\.search\)\) \{\s*takeTraversal\(\)\s*endAppNavigation\(\)\s*return\s*\}\s*markTraversal\(\)/.test(bar))
  check("the stage records every commit, before the paint", /keyRef\.current = key\s*markCommitted\(pathname, search\)/.test(code("components/app/app-stage.tsx")))
}

section("A slow page: no outline, a spinner")
{
  check("a phone waits 500ms, a computer a second, and either fades it in over 150ms",
    NAV_PHONE_SPINNER_AFTER_MS === 500 && NAV_SPINNER_AFTER_MS === 1000 && NAV_SPINNER_FADE_MS === 150
      && spinnerDelay("/app/orders", true) === 500 && spinnerDelay("/app/orders", false) === 1000
      && spinnerDelay("/app", true) === 500 && spinnerDelay("/app/products?tab=all", true) === 500)
  check("never for the product editor, new or saved, at any width",
    ["/app/products/new", "/app/products/8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6", "/app/products/abc/", "/app/products/new?from=x"]
      .every((h) => !waitsWithSpinner(h) && spinnerDelay(h, true) === null && spinnerDelay(h, false) === null))
  check("nor for the coupon editor, which is framed the same way; the Coupons list still waits with it",
    ["/app/coupons/new", "/app/coupons/8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6"].every((h) => !waitsWithSpinner(h) && spinnerDelay(h, true) === null)
      && spinnerDelay("/app/coupons", true) === 500)
  check("nor for a page drawn over the whole shell, nor outside /app, nor an unknown address",
    !waitsWithSpinner("/app/settings/billing/upgrade") && !waitsWithSpinner("/explore") && !waitsWithSpinner("/application") && !waitsWithSpinner(null))
  check("no page draws an outline of itself on the way: the route outlines are gone",
    !existsSync(join(root, "components/app/route-skeletons.tsx"))
      && ["app/app/analytics/skeleton.tsx", "app/app/payouts/skeleton.tsx", "app/app/settings/skeleton.tsx", "app/app/orders/sales/skeleton.tsx", "app/app/orders/order-skeleton.tsx", "app/app/emails/flow/flow-skeleton.tsx"]
        .every((f) => !existsSync(join(root, f))))
  const stage = code("components/app/app-stage.tsx")
  check("the stage draws the spinner and nothing shaped like a page, asks for the wait by address, and fades in on opacity alone",
    /<PageSpinner \/>/.test(stage) && !/RouteSkeleton|data-app-route-skeleton/.test(stage)
      && /const delay = nav \? spinnerDelay\(nav\.href\) : null/.test(stage)
      && /el\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: NAV_SPINNER_FADE_MS/.test(stage))
  /* "Make sure the in-page transition with the loading doesn't stay so long,
     and after it ends there is no empty gap." scripts/check-app-stage.mjs:
     gone 117ms after the commit at 390 and 133ms at 1280 (167 before), and
     surface and page together cover every frame after it (1.0). */
  check("it fades out from where it got to, quicker than it came (120ms), and a fade that never finishes still leaves",
    NAV_SPINNER_OUT_MS === 120 && NAV_SPINNER_OUT_MS < NAV_ENTER_MS && NAV_SPINNER_OUT_MS < NAV_SPINNER_FADE_MS
      && /const from = Number\(getComputedStyle\(el\)\.opacity\)/.test(stage) && /const out = fadeTo\(el, 0, NAV_SPINNER_OUT_MS, NAV_ENTER_EASE\)/.test(stage)
      && /out\.onfinish = done\s*window\.setTimeout\(done, NAV_SPINNER_OUT_MS \+ 120\)/.test(stage) && /leaves\.current === id/.test(stage))
  /* "Make sure it never blocks, fully." scripts/check-app-stage.mjs presses
     through it, lets a navigation hang past the cap, and ends navigations
     every way the router can: a query, a redirect, a redirect back to the
     page showing, a page that throws, the not-found page, the page showing
     throwing. Gone within 205ms of each, at both widths. */
  check("it never takes a press: the header, the pill, the rail and the page under it all answer",
    /data-app-slow-page=""\s*className="pointer-events-none fixed/.test(stage) && !/el\.style\.pointerEvents/.test(stage))
  check("it gives way 8 seconds after the press whether the page came or not, and says so",
    NAV_SPINNER_CAP_MS === 8000 && /capped\.current = nav\s*console\.warn\(/.test(stage)
      && /NAV_SPINNER_CAP_MS - \(performance\.now\(\) - nav\.startedAt\)/.test(stage) && /if \(nav && delay != null && capped\.current !== nav\)/.test(stage))
  check("a commit at the address already showing ends the navigation (a redirect back to it)",
    /useEffect\(\(\) => \{\s*watchRouterCommits\(\)\s*watchRouterAnswers\(\)\s*\}, \[\]\)/.test(stage)
      && /\(data as \{ __NA\?: unknown \}\)\.__NA/.test(code("lib/ui/app-navigation.ts"))
      && /if \(current === nav && isCommittedAddress\(window\.location\.pathname, window\.location\.search\)\) endAppNavigation\(\)/.test(code("lib/ui/app-navigation.ts")))
  check("the error boundary and the not-found page end it too",
    /export function PageLanded\(\) \{\s*useLayoutEffect\(\(\) => \{ endAppNavigation\(\) \}, \[\]\)/.test(stage)
      && /<PageLanded \/>/.test(code("app/app/error.tsx")) && /<PageLanded \/>/.test(code("app/app/not-found.tsx")))
  const barCode = code("components/app/navigation-loading-bar.tsx")
  check("a link the page handles itself (its default prevented, the router started nothing) starts no record",
    /window\.addEventListener\("click", onClickStart, true\)/.test(barCode)
      && /if \(e\.defaultPrevented\) \{\s*const now = routerStartCount\(\)\s*if \(now !== null && now === startsAtClick\) return\s*\}/.test(barCode)
      && /export function onRouterTransitionStart\(\) \{\s*noteRouterStart\(\)/.test(code("instrumentation-client.ts")))
  check("under it the page only rises: its fade out is the page's fade in, not a second fade multiplied by it",
    /playEntrance\(s\.outer, \{ fade: !slowSurfaceIsUp\(\) \}\)/.test(stage) && /if \(!rise && !fade\) continue/.test(stage))
  check("it covers the content area by main's own numbers: under the header and the pill, rounded on a phone",
    /pointer-events-none fixed inset-x-0 bottom-0 top-\[calc\(68px\+env\(safe-area-inset-top,0px\)\)\] z-\[38\] bg-\[#111111\] md:left-\[240px\] md:top-\[calc\(58px\+env\(safe-area-inset-top,0px\)\)\] md:bg-transparent/.test(stage)
      && /data-app-slow-surface="" className="h-full overflow-hidden rounded-t-\[20px\] bg-\[#f8f9fa\] md:rounded-none"/.test(stage)
      && /pt-\[calc\(68px_\+_env\(safe-area-inset-top,_0px\)\)\] md:pt-\[calc\(58px\+env\(safe-area-inset-top,_0px\)\)\] md:pl-\[240px\]/.test(read("app/app/layout.tsx")))
  /* Regression: "the purple things in the corners". The rounded surface was
     the fixed box itself, so its corners showed the page under it, and Home's
     top is the violet announcement bar. scripts/check-app-stage.mjs reads the
     corner pixels: [139,92,246] before, the header's [17,17,17] now. */
  check("its rounded corners are backed by the header's #111111, never by the page under them",
    /data-app-slow-page=""\s*className="pointer-events-none fixed[^"]*bg-\[#111111\]/.test(stage) && !/data-app-slow-page=""\s*className="[^"]*rounded-t-/.test(stage))
  const bar = code("components/app/navigation-loading-bar.tsx")
  check("a phone shows the spinner in place of the bar, keeps the bar where there is no spinner, and drops a bar still finishing",
    /if \(isPhoneShell\(\) && spinnerDelay\(nav\.href, true\) !== null\) \{\s*setShown\(false\)\s*return\s*\}/.test(bar))
  check("a part of a page that is still coming waits the same half second as a slow page, then shows the same spinner",
    SPINNER_WAIT_MS === NAV_PHONE_SPINNER_AFTER_MS)
  const spinner = code("components/ui/activity-spinner.tsx")
  const css = read("app/globals.css")
  /* "Bigger, just a little bit, more smooth, clean, only smooth." It turned
     in eighths (steps(8)), which on a phone read as a judder. The probe reads
     120 frames: 6.01 degrees each at 60Hz, none repeated, none jumping. */
  check("the spinner is the iOS one, a little bigger: eight tapered spokes, light gray, stepped shading, 26px",
    /const SPOKES = 8/.test(spinner) && /text-\[#9ca3af\]/.test(spinner) && /fill="currentColor"/.test(spinner)
      && /opacity=\{\(1 - \(\(SPOKES - i\) % SPOKES\)/.test(spinner) && /role="status"/.test(spinner)
      && /export const SPINNER_SIZE = 26/.test(spinner) && /size = SPINNER_SIZE/.test(spinner) && /viewBox="0 0 20 20"/.test(spinner))
  check("it turns continuously, one turn a second on a linear curve, never in steps",
    /\.activity-spinner \{\s*display: block;\s*animation: activity-spin 1000ms linear infinite;\s*will-change: transform;/.test(css)
      && !/animation: activity-spin[^;]*steps\(/.test(css))
  check("on an HTML box around the drawing, transform alone, kept inside a .group on a touch screen, and slower rather than stopped for reduced motion",
    /@keyframes activity-spin \{\s*from \{ transform: rotate\(0deg\) \}\s*to \{ transform: rotate\(360deg\) \}\s*\}/.test(css)
      && /<span\s+data-activity-spinner=""[\s\S]{0,300}data-keep-transform=""\s*className="activity-spinner"/.test(spinner)
      && /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,160}\.activity-spinner \{\s*animation-duration: 3000ms;/.test(css))
  check("the outline's leftover rule is gone from the stylesheet", !/data-app-route-skeleton/.test(css))
  /* "Move that loading thing a little bit more up." The probe measures the
     spinner's centre at 0.403 of the content area's height at 390 and 1280
     (313px and 323px down), where it was 0.5. */
  check("it sits a little above the middle, 40% of the way down, on grid rows rather than a transform",
    /export function PageSpinner\(/.test(spinner) && /grid h-full w-full grid-rows-\[2fr_auto_3fr\] justify-items-center/.test(spinner)
      && /<ActivitySpinner label=\{label\} className="row-start-2" \/>/.test(spinner))
}

section("No page draws a picture of itself while it loads, inside or out")
{
  /* The owner still saw grey drawings of pages on a phone: the route outlines
     are gone, and these were the ones left inside the pages and the shell. */
  const cold = code("app/app/cold-start.tsx")
  check("a native cold start is the shell's frame and the spinner: the header's colour, the rounded content area, no violet bar, no drawing",
    !existsSync(join(root, "app/app/dashboard-skeleton.tsx"))
      && /fixed inset-0 bg-\[#111111\] md:bg-\[#131316\]/.test(cold) && /rounded-t-\[20px\] bg-\[#f8f9fa\]/.test(cold)
      && /<PageSpinner \/>/.test(cold) && !/8b5cf6|animate-pulse|bg-gray-/.test(cold))
  const layout = code("app/app/layout.tsx")
  check("and both of the layout's gates use it", (layout.match(/loadingFallback=\{<AppColdStart \/>\}/g) ?? []).length === 2)
  const dash = code("components/app/dashboard-client.tsx")
  /* "The loading should not be the spinner in the charts loading and the
     tables loading; loading structures or skeleton, light gray shimmering."
     Page to page stays on the spinner and draws no page; the data inside a
     page draws its own shapes (components/ui/shimmer). */
  /* "I don't like those skeleton loading structures in the charts... it
     just needs to be that blur thing happening." The chart waits as
     Analytics' does: its frame, a grey line on the floor, softly blurred. */
  check("Home has no full page skeleton, and its chart waits as a blurred grey floor line, not a skeleton, from the first frame",
    !/showLoadingSkeleton|isLoading && |Full Page Skeleton|skeleton-bar/.test(dash) && !/animate-pulse/.test(dash) && !/WaitingArea/.test(dash)
      && !/ShimmerChart|ShimmerSwap/.test(dash)
      /* Renamed on purpose: Home waits for the Analytics answer (homeAnswer), not for events it read itself. */
      && /const chartWaiting = \(homeAnswer == null \|\| isChartLoading\) && displayChartData\.length === 0/.test(dash)
      && /chartWaiting \? "opacity-60 blur-\[1\.5px\]"/.test(dash) && /loading=\{chartWaiting\}/.test(dash))
  check("and its four figures wait for the period's first answer (MetricTab `loading`), with No activity yet held back until it",
    /const \[figuresReady, setFiguresReady\] = useState\(false\)/.test(dash) && (dash.match(/loading=\{!figuresReady\}/g) ?? []).length === 4
      && (dash.match(/soft=\{isRefreshing && figuresReady\}/g) ?? []).length === 4 && /\{figuresReady && !hasRealData && \(/.test(dash))
  const reports = code("app/app/analytics/analytics-reports.tsx")
  check("Analytics' cards draw their own shapes while they wait (rows, a chart, a ring, the funnel) and crossfade into the figures",
    !/WaitingArea/.test(reports) && !/animate-pulse/.test(reports)
      && (reports.match(/<Body blank=\{/g) ?? []).length === 16
      && /<ShimmerSwap loading=\{blank\} skeleton=\{<Waiting kind=\{wait\} lead=\{lead\} \/>\} className=\{BODY\} contentClassName="h-full">/.test(reports))
  const tab = code("components/app/metric-tab.tsx")
  /* "I don't like the skeleton structure in the chart tabs; before it was
     the blur thing, I liked those, revert it." The home chart under them
     waits as a blurred grey floor line too (checked above). */
  check("a figure tab waits blurred, the way it did before the gray bars: its number 2px and its foot 1px, clearing over 700ms",
    /const blurred = soft \|\| loading/.test(tab) && /blurred \? "blur-\[2px\]" : "blur-0"/.test(tab) && /blurred \? "blur-\[1px\]" : "blur-0"/.test(tab)
      && /transition-\[filter,color,opacity\] duration-\[700ms\]/.test(tab)
      && /\n\s*\{value\}\n/.test(tab) && /\n\s*\{foot\}\n/.test(tab) && /\{loading \? null : change\}/.test(tab)
      && !/ShimmerBlock|shimmer-enter|shimmer-wait|from "@\/components\/ui\/shimmer"/.test(tab)
      && (code("app/app/analytics/analytics-client.tsx").match(/loading=\{figuresLoading\}/g) ?? []).length === 8)
  const payouts = code("app/app/payouts/payouts-client.tsx")
  /* The redone page (round 5): the balance and revenue figures wait soft, the
     way MetricTab's do, rather than as grey bars; the two balance panels are
     one Details panel, so its holds are drawn once, and its bank line too. */
  check("Payouts' chart, bank lines, holds, timeline and payout list draw their shapes, and its figures wait blurred, not the spinner",
    !/WaitingArea/.test(payouts) && !/animate-pulse/.test(payouts) && !/\[1, 2, 3\]\.map/.test(payouts)
      && /<ShimmerChart height=\{192\} \/>/.test(payouts) && (payouts.match(/<ShimmerRows /g) ?? []).length === 3
      && (payouts.match(/<Shimmer className=/g) ?? []).length === 2
      && (payouts.match(/loading \? "blur-\[2px\]" : "blur-0"/g) ?? []).length === 2)
  check("no grey bar pulses in Settings either", !/animate-pulse/.test(code("components/app/settings-form-new.tsx")))
  const payoutsPage = code("app/app/payouts/page.tsx")
  check("Payouts' heading lands on the press; Stripe streams in behind it, in a waiting room rather than an outline",
    /<Suspense fallback=\{<PayoutsWaiting \/>\}>\s*(\{\}\s*)?\{PayoutsBody\(\{ creator \}\)\}\s*<\/Suspense>/.test(payoutsPage)
      && /function PayoutsWaiting\(\) \{\s*return \(\s*<Shimmer className="space-y-4 pt-2" label="Loading payouts">/.test(payoutsPage)
      && /async function PayoutsBody\(/.test(payoutsPage)
      && !/stripe\./.test(payoutsPage.slice(payoutsPage.indexOf("export default async function PayoutsPage"), payoutsPage.indexOf("async function PayoutsBody")))
      && /stripe\.balance\.retrieve/.test(payoutsPage.slice(payoutsPage.indexOf("async function PayoutsBody"))))
  check("and its bar is sent with the heading, with a box the client fills with Export and Cash out once Stripe answers",
    /<PaneBar width="max-w-\[1200px\]"/.test(payoutsPage) && /<div data-payouts-actions="" /.test(payoutsPage)
      && /usePageSlot\("\[data-payouts-actions\]"\)/.test(payouts) && /createPortal\(actions, slot\)/.test(payouts))
  const emails = code("app/app/emails/emails-home.tsx")
  check("Emails' tables wait as their own header and rows, crossfading into the rows, and its figures as shapes, not dashes",
    /function Loading\(\) \{\s*return <ShimmerRows rows=\{5\} header/.test(emails) && !/WaitingArea/.test(emails)
      && (emails.match(/<ShimmerSwap loading=\{props\.loading\} skeleton=\{<Loading \/>\}>/g) ?? []).length === 3
      && !/props\.loading \? "–"/.test(emails) && /\{props\.loading \? \(\s*<ShimmerBlock /.test(emails)
      /* The Sent tab's strip is there on every render, its figures shapes while they come, so the table under it never moves. */
      && /if \(p\.tab === "published"\) \{/.test(emails) && /value: o \? n\(o\.total_sent\) : "–"/.test(emails))
  check("the coupon pages draw nothing under the gate rather than an outline",
    !existsSync(join(root, "app/app/coupons/skeleton.tsx")) && !existsSync(join(root, "app/app/coupons/new/skeleton.tsx"))
      && ["app/app/coupons/page.tsx", "app/app/coupons/new/page.tsx", "app/app/coupons/[id]/page.tsx"].every((f) => /if \(load\.state === "signed-out"\) return null/.test(code(f))))
  check("the unused skeleton helpers and the old settings form are gone",
    !existsSync(join(root, "components/app/page-transition.tsx")) && !existsSync(join(root, "components/app/settings-form.tsx")))
  const spinner = code("components/ui/activity-spinner.tsx")
  check("the waiting area shows nothing for half a second, then fades the spinner in on opacity",
    /export const SPINNER_WAIT_MS = 500/.test(spinner) && /animation: `skeleton-reveal 150ms ease-out \$\{SPINNER_WAIT_MS\}ms forwards`/.test(spinner) && /className="inline-flex opacity-0"/.test(spinner))
  const css = read("app/globals.css")
  check("the late and fade skeleton classes nothing uses are gone from the stylesheet", !/\.skeleton-late\s*\{/.test(css) && !/\.skeleton-fade\s*\{/.test(css) && /@keyframes skeleton-reveal/.test(css))
  const shimmer = code("components/ui/shimmer.tsx")
  check("a skeleton shows nothing for 200ms, then fades in; the answer crossfades over 180ms",
    SHIMMER_WAIT_MS === 200 && SHIMMER_SWAP_MS === 180
      && /\.shimmer-wait \{\s*opacity: 0;\s*animation: shimmer-fade-in 200ms ease-out 200ms forwards;/.test(css)
      && /\.shimmer-enter \{\s*animation: shimmer-fade-in 180ms [^;]* backwards;/.test(css)
      && /\.shimmer-leave \{\s*animation: shimmer-fade-out 180ms [^;]* forwards;/.test(css))
  check("its band of light is one transform on a pseudo element, 1.4s a pass, and still under reduced motion",
    /\.shimmer-block::after \{[^}]*transform: translateX\(-100%\);[^}]*animation: shimmer-sweep 1400ms/.test(css)
      && /@keyframes shimmer-sweep \{\s*from \{ transform: translateX\(-100%\); \}\s*to \{ transform: translateX\(100%\); \}/.test(css)
      && /@media \(prefers-reduced-motion: reduce\) \{\s*\.shimmer-block::after \{\s*animation: none;/.test(css))
  check("the skeleton stays in the tree through the swap, keyed, so its fade carries on and the content is not remounted",
    /* flow-root in the flow: a first block's top margin stays inside, so the box does not move up when it goes absolute (a layout shift on Analytics' donut) */
    /<div key="skeleton" className=\{leaving \? "shimmer-leave pointer-events-none absolute inset-0 overflow-hidden" : "h-full flow-root"\}>/.test(shimmer)
      && /<div key="content" className=\{cn\(leaving && "shimmer-enter", contentClassName\)\}>/.test(shimmer)
      && /if \(loading && !held\) setHeld\(true\)/.test(shimmer))
  check("the flash probe lands on every main page and reads every element every frame",
    /home,orders,products,analytics,emails,customers,payouts,website,settings/.test(read("scripts/check-page-flash.mjs"))
      && /playEntrance\(ref\.current\)/.test(read("scripts/render-page-flash.tsx")))
}

section("The press answers on the press")
{
  const desktop = code("components/app/sidebar-desktop-nav.tsx")
  const mobile = code("components/app/sidebar-mobile-nav.tsx")
  check("the rail's rows and the menu's rows light the page being opened, from the navigation record",
    (desktop.match(/const pathname = useShownPath\(\)/g) || []).length === 3 && !/usePathname/.test(desktop)
      && (mobile.match(/isRouteActive\(useShownPath\(\), /g) || []).length === 2)
  check("the shell no longer keeps a pendingHref nothing read, re-rendering itself on every click",
    !/pendingHref|setPendingHref/.test(code("components/app/sidebar.tsx")))
  check("the menu's rows start fetching their page on the pointerdown",
    /onPointerDown: \(\) => \{ setPressed\(true\); onPress\?\.\(\) \}/.test(mobile)
      && /usePressed\(\(\) => \{ if \(!active\) prefetchAppPage\(router, child\.href\) \}\)/.test(mobile)
      && /usePressed\(\(\) => \{ if \(!active && !item\.forceNavigation\) prefetchAppPage\(router, item\.href\) \}\)/.test(mobile))
  check("the pill fetches the page under the finger on the pointerdown, and warms its four again after the router's keep time",
    /onPress\?\.\(slotAt\(e\.clientX\)\)/.test(mobile) && /if \(item && index !== current\) onPrefetch\?\.\(item\.href\)/.test(mobile)
      && /document\.visibilityState === "visible" && Date\.now\(\) - warmedAt > APP_PAGE_KEPT_MS/.test(mobile))
  const sidebarCode = code("components/app/sidebar.tsx")
  check("the desktop account menu fetches Billing whole under the pointer, like the rail",
    /const warmAccountPage = \(href: string\) => \{\s*if \(href\.startsWith\("\/app\/"\)\) prefetchAppPage\(router, href\)/.test(sidebarCode)
      && (sidebarCode.match(/onMouseEnter=\{\(\) => warmAccountPage\(item\.href\)\}/g) ?? []).length === 2)
  const config = read("next.config.mjs")
  const stale = /staleTimes:\s*\{\s*dynamic:\s*(\d+)/.exec(config)
  check("and that keep time is next.config's staleTimes, one number in two places held equal",
    !!stale && Number(stale[1]) * 1000 === APP_PAGE_KEPT_MS, stale?.[1])
}

section("Pages drawn over the whole shell")
{
  const upgrade = code("app/app/settings/billing/upgrade/layout.tsx")
  const newLayout = code("app/app/products/new/layout.tsx")
  const idLayout = code("app/app/products/[id]/layout.tsx")
  check("the plans page and both editor addresses use the one shared layer; the editor keeps the pill, its bar clears the status bar itself, and it is a layer on a phone only",
    /<PageLayer inset="white">/.test(upgrade) && /<PageLayer pill inset="bar" phoneOnly>/.test(newLayout) && /<PageLayer pill inset="bar" phoneOnly>/.test(idLayout))
  const layer = code("components/app/page-layer.tsx")
  check("the layer is the whole window, between the header and the pill, and pads itself under the status bar",
    /"fixed inset-0 z-\[52\] flex flex-col bg-\[#f8f9fa\]"/.test(layer) && /"pt-\[env\(safe-area-inset-top,0px\)\]"/.test(layer)
      && /phoneOnly \? "has-phone-page-layer" : "has-page-layer"/.test(layer) && /html\.classList\.add\(name\)/.test(layer))
  check("a phone only layer is the same layer below md and, from md, fills the shell's content area in the flow",
    /"flex h-full flex-col bg-\[#f8f9fa\] max-md:fixed max-md:inset-0 max-md:z-\[52\] max-md:h-auto"/.test(layer)
      && /data-page-layer-phone=\{phoneOnly \? "" : undefined\}/.test(layer) && /"max-md:pt-\[env\(safe-area-inset-top,0px\)\]"/.test(layer))
  const css = read("app/globals.css")
  check("while a layer is up the shell's chrome is not painted, the scroller is no stacking context on iOS, and the black shield stands down, each by :has() and by class",
    /html:has\(\[data-page-layer\]:not\(\[data-page-layer-phone\]\)\) \[data-shell-chrome\] \{\s*visibility: hidden;/.test(css)
      && /html\.has-page-layer \[data-shell-chrome\] \{\s*visibility: hidden;/.test(css)
      && /html:has\(\[data-page-layer\]:not\(\[data-page-layer-phone\]\)\) \.app-content-scroll \{\s*-webkit-overflow-scrolling: auto;/.test(css)
      // Changed on purpose: the shield stands down by the class alone, which the
      // layer sets from its first paint (HtmlClassScript in the server's HTML,
      // then its layout effect). `html.capacitor:has([data-page-layer])` made
      // <html> the subject of a :has(), and the Android app restyled the whole
      // document whenever text anywhere was replaced (NATIVE=1
      // scripts/check-app-sheets-frames.mjs).
      && !/html\.capacitor:has\(\[data-page-layer/.test(css.replace(/\/\*[\s\S]*?\*\//g, ""))
      && /<HtmlClassScript name=\{phoneOnly \? "has-phone-page-layer" : "has-page-layer"\} \/>/.test(layer)
      && /html\.capacitor\.has-page-layer::before \{\s*display: none;/.test(css))
  const phoneOnlyRules = /@media \(max-width: 767px\) \{\s*html:has\(\[data-page-layer-phone\]\) \[data-shell-chrome\] \{[\s\S]*?\n\}/.exec(css)?.[0] ?? ""
  check("and for the editor's layer the same four, by :has() and by class, below 768px only: from md the header and the rail stay",
    /html:has\(\[data-page-layer-phone\]\) \[data-shell-chrome\] \{\s*visibility: hidden;/.test(phoneOnlyRules)
      && /html\.has-phone-page-layer \[data-shell-chrome\] \{\s*visibility: hidden;/.test(phoneOnlyRules)
      && /html:has\(\[data-page-layer-phone\]\) \.app-content-scroll \{\s*-webkit-overflow-scrolling: auto;/.test(phoneOnlyRules)
      // (the capacitor :has() twin is gone on purpose, see the check above)
      && !/html\.capacitor:has\(\[data-page-layer-phone\]\)/.test(phoneOnlyRules)
      && /html\.capacitor\.has-phone-page-layer::before \{\s*display: none;/.test(phoneOnlyRules)
      && /html\.capacitor\.has-phone-page-layer \{\s*background-color: #f8f9fa;/.test(phoneOnlyRules))
  const stage = code("components/app/app-stage.tsx")
  check("the slow page's surface stands aside only for a layer that is over the shell now, not for the editor in it",
    /if \(overShell\(\)\) return clear/.test(stage) && /getComputedStyle\(el\)\.position === "fixed"/.test(stage) && !/document\.querySelector\("\[data-page-layer\]"\)\) return clear/.test(stage))
  check("the pill steps aside only for a layer that does not keep it, and a layer that does gives the scroller room for it",
    /html:has\(\[data-page-layer=""\]\) \[data-app-nav-pill\] \{\s*visibility: hidden;/.test(css)
      && /\[data-page-layer="pill"\] \[data-page-layer-scroll\] > \.page-scroll \{\s*padding-bottom: calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css))
  const sidebar = read("components/app/sidebar.tsx")
  check("both headers and the rail say they are the shell's chrome", (sidebar.match(/data-shell-chrome=""/g) || []).length >= 3)
}

section("One scrollbar track on a computer, always there, never moving")
{
  /* Measured every frame, at 1280, 1440 and 1920 with classic scrollbars, on
     the real Products, Orders, Emails, Home and the rest, by
     scripts/check-scrollbar-stable.mjs. "The Products page doesn't have a
     scroll bar, but when I switch to the Orders page it has one." */
  const css = read("app/globals.css")
  const block = /\/\* ── One scrollbar track, always there[\s\S]*?@media \(min-width: 768px\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? ""
  const SCROLLERS = [
    "html.app-layout:not(.capacitor) .app-content-scroll",
    "html.app-layout:not(.capacitor) .app-content-scroll > .page-scroll",
    "html.app-layout:not(.capacitor) .app-content-scroll > .dashboard-scroll-container",
    "html.app-layout:not(.capacitor) .app-content-scroll > .sales-scroll-container",
    "html.app-layout:not(.capacitor) .app-content-scroll > .orders-stage > .orders-pane",
    "html.app-layout:not(.capacitor) .app-content-scroll [data-page-layer-scroll] > .page-scroll",
  ]
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  check("every box that scrolls a page paints its track whether or not there is anything to scroll, in one look: the shell's, a page's own, each pane of Orders and Emails, the editor's",
    new RegExp(`${SCROLLERS.map(esc).join(",\\s*")} \\{\\s*overflow-y: scroll;\\s*scrollbar-gutter: stable;\\s*scrollbar-width: thin;\\s*scrollbar-color: rgba\\(156, 163, 175, 0\\.5\\) #f8f9fa;`).test(block))
  check("a page that scrolls itself is the one track: the shell's scroller then does not scroll and keeps no column",
    /\.app-content-scroll:has\(> \.page-scroll, > \.dashboard-scroll-container, > \.sales-scroll-container, > \.orders-stage, > \[data-page-layer\]\) \{\s*overflow-y: hidden;\s*scrollbar-gutter: auto;/.test(block))
  check("while a page that fitted rises, its thumb is drawn clear and its track stays (never overflow: hidden, which takes the track away)",
    /html\.app-layout:not\(\.capacitor\) \[data-app-landing\] \{\s*scrollbar-color: transparent #f8f9fa !important;/.test(block)
      && !/\[data-app-landing\] \{\s*overflow/.test(css))
  check("none of it below 768px or in the native apps, where scrollbars float and take no room",
    !/@media \(max-width: 767px\) \{\s*html\.app-layout \.app-content-scroll \{\s*(scrollbar-gutter|overflow-y: scroll)/.test(css)
      && !/html\.app-layout \.app-content-scroll/.test(block) && !/html\.app-layout\.capacitor/.test(block))
  /* "When I click Settings coming from a page with no scrollbar, it glitches
     with the scrollbar on the right." Safari before 18.2 reads only
     ::-webkit-scrollbar: the pages' own boxes were 6px there and the shell's
     scroller the system's 15px, so landing on Settings moved the column. */
  check("in a browser that reads only ::-webkit-scrollbar, every scroller's bar is the pages' 6px, on the same track",
    new RegExp(`${SCROLLERS.map((s) => esc(`${s}::-webkit-scrollbar`)).join(",\\s*")} \\{\\s*display: block;\\s*width: 6px;\\s*background-color: #f8f9fa;`).test(block)
      && /\.page-scroll::-webkit-scrollbar \{\s*width: 6px;/.test(css)
      && new RegExp(`${SCROLLERS.map((s) => esc(`${s}::-webkit-scrollbar-thumb`)).join(",\\s*")} \\{\\s*background-color: rgba\\(156, 163, 175, 0\\.5\\);`).test(block))
  const stage = code("components/app/app-stage.tsx")
  check("the landing moves what is in a scroller, never the scroller: a page's own box, each pane, the editor's pane stand still with their bars",
    /function ownScrollers\(child: HTMLElement\): HTMLElement\[\]/.test(stage)
      && /querySelectorAll<HTMLElement>\(":scope > \.orders-pane, :scope > \[data-page-layer-scroll\] > \.page-scroll"\)/.test(stage)
      && /movers\.push\(\.\.\.\(Array\.from\(box\.children\) as HTMLElement\[\]\)\)/.test(stage)
      && /const a = el\.animate\(\[from, to\]/.test(stage) && !/child\.animate\(/.test(stage))
  check("it reads whether each scroller fitted before the rise starts, marks only those, and lets go when the rise is over or soon after",
    /fitted\.set\(box, fits\(box\)\)/.test(stage) && /fitted\.set\(outer, fits\(outer\)\)/.test(stage)
      && /holdStill\(moving\.length \? \[\.\.\.fitted\]\.filter\(\(\[, fit\]\) => fit\)\.map\(\(\[el\]\) => el\) : \[\], moving\)/.test(stage)
      && /el\.setAttribute\("data-app-landing", ""\)/.test(stage)
      && /a\.finished\.catch\(\(\) => undefined\)/.test(stage) && /window\.setTimeout\(release, NAV_ENTER_MS \+ 120\)/.test(stage))
  check("the billing tab, drawn inside Settings, is not a scroller of its own: no second, empty track down its side",
    /className=\{embedded \? "overflow-x-clip bg-\[#fafafa\]" : "h-full overflow-y-scroll/.test(code("components/app/billing/billing-page-client.tsx")))
  /* "Search inputs across /app: on focus the border turns heavy black, too much weight." Every search field focuses the description editor's way now: a #c9ccd3 hairline and a 3px halo at 6%, measured by scripts/check-search-focus. */
  {
    const HALO_WITHIN = /focus-within:border-\[#c9ccd3\] focus-within:shadow-\[0_0_0_3px_rgba\(17,17,19,0\.06\)\]/
    const HALO = /focus:border-\[#c9ccd3\] focus:shadow-\[0_0_0_3px_rgba\(17,17,19,0\.06\)\]/
    const within = ["app/app/orders/orders-list.tsx", "app/app/emails/emails-home.tsx"]
    /* Settings' country search is the shared list's now (components/app/settings/country-picker), so it is choice-list's halo. */
    const direct = ["components/app/product-picker.tsx", "components/ui/choice-list.tsx"]
    const heavy = /focus-within:border-\[#1a1a2e\] focus-within:shadow-\[0_0_0_1px_#1a1a2e\]/
    /* "Make it that way: like mobile." The Products search is the phone's on every width: no box, in the card's toolbar, so no edge to draw on focus. */
    const products = code("app/app/products/products-client.tsx")
    check("every /app search field focuses with a light grey hairline and a soft halo, never a black 2px edge or a violet ring",
      within.every((f) => HALO_WITHIN.test(code(f)) && !heavy.test(code(f))) && direct.every((f) => HALO.test(code(f)))
        && !heavy.test(products) && !/focus-within:border|focus-within:ring|focus:ring-\[#8b5cf6\]/.test(products)
        && !/placeholder="Search countries\.\.\."[\s\S]{0,500}focus:ring-\[#8b5cf6\]/.test(code("components/app/settings-form-new.tsx"))
        && /<ChoicePicker/.test(code("components/app/settings/country-picker.tsx")) && !/<input/.test(code("components/app/settings/country-picker.tsx"))
        && /focus-visible:shadow-\[inset_0_0_0_1px_#c9ccd3,0_0_0_3px_rgba\(17,17,19,0\.06\)\]/.test(code("components/app/app-search.tsx")) && !/focus-visible:ring-\[#8b5cf6\]/.test(code("components/app/app-search.tsx")),
      [...within, ...direct].filter((f) => !(HALO_WITHIN.test(code(f)) || HALO.test(code(f)))).join(", "))
  }
  /* "When landing on the settings page, the content drifts toward the right." Its wrapper was overflow-x: hidden, so a scroller; the rise overflowed it by 2px, a scrollbar came for 180ms and went, and the page slid 7.5px right (scripts/check-settings-landing). */
  const settingsForm = code("components/app/settings-form-new.tsx")
  check("Settings is not a scroller of its own either: its wrappers clip sideways, so the landing's rise raises no bar and nothing slides",
    /<div data-settings-page="" className="overflow-x-clip bg-\[#fafafa\]">\s*<div className="max-w-4xl mx-auto [^"]*overflow-x-clip">/.test(settingsForm) && !/overflow-x-hidden bg-\[#fafafa\]/.test(settingsForm))
}

section("The way back")
{
  check("a back or forward is told apart from a new visit, once", (() => {
    const before = takeTraversal()
    markTraversal()
    return before === false && takeTraversal() === true && takeTraversal() === false
  })())
  rememberScroll("/app/orders", 120, 900)
  check("where the reader was is kept per address", JSON.stringify(recalledScroll("/app/orders")) === JSON.stringify({ outer: 120, inner: 900 }))
  check("and an address never visited has nothing", recalledScroll("/app/nowhere") === null)
  for (let i = 0; i < 80; i++) rememberScroll(`/app/page-${i}`, i, i)
  check("a long session keeps a bounded number of addresses", recalledScroll("/app/orders") === null && recalledScroll("/app/page-79") !== null)
  check("a page opened cold has no /app page behind it", hasInAppHistory() === false)
  markLanded()
  check("and one landed on in the app does", hasInAppHistory() === true)
}

section("Sheets")
{
  const sheet = code("components/ui/bottom-sheet.tsx")
  check("a sheet taken away while on screen leaves a copy that finishes the slide",
    /function leaveBehind\(root: HTMLElement, fromY: number, height: number, scrimOpacity: number\)/.test(sheet)
      && /useLayoutEffect\(\(\) => \{\s*const leave = leaveRef\s*return \(\) => leave\.current\(\)\s*\}, \[\]\)/.test(sheet)
      && /ghost\.setAttribute\("inert", ""\)/.test(sheet) && /a\.onfinish = done/.test(sheet))
  /* ... and a kept sheet at rest is out of sight and takes no tap at all (REST_STYLE). */
  check("a closing sheet gives the tap back at once",
    /style=\{isOpen \? undefined : atRest \? REST_STYLE : \{ pointerEvents: "none" \}\}/.test(sheet)
      && /const REST_STYLE: React\.CSSProperties = \{ visibility: "hidden", pointerEvents: "none" \}/.test(sheet))
  /* The open is the website builder's sheet's (SNAP_DURATION_MS, SNAP_EASING in mobile-editor-sheet.tsx); a tap outside keeps its ease in and out. */
  check("it opens over 360ms on the iOS curve and closes over 340ms on an ease in and out, the scrim fades evenly, and a release leaves at the finger's speed",
    SHEET_OPEN_MS === 360 && SHEET_CLOSE_MS === 340 && SHEET_EASE === "cubic-bezier(0.32, 0.72, 0, 1)" && SHEET_CLOSE_EASE === "cubic-bezier(0.4, 0, 0.2, 1)"
      && /easing: FADE_EASE \}\)/.test(sheet) && /const motion = velocity > 0 \? snapMotion\(travel, velocity\) : null/.test(sheet)
      && /\}, motion \? curveCss\(motion\.curve\) : CLOSE_EASE\)/.test(sheet) && /const motion = snapMotion\(rest - from, velocity\)/.test(sheet))
  check("the parent hears about a close once the slide has had a frame, not before its first one",
    /tell\.raf = requestAnimationFrame\(\(\) => \{ tell\.timer = window\.setTimeout\(tellNow, 0\) \}\)/.test(sheet)
      && /if \(rootRef\.current\) rootRef\.current\.style\.pointerEvents = "none"/.test(sheet))
  /* Explore's filters: "closing must be smoother". The scrim is a layer while a finger dims it, and a button inside can close the sheet the way a tap outside does, the slide before the parent. */
  check("the scrim is its own layer on every sheet, and a control marked data-sheet-close closes the sheet as a tap outside does",
    /style=\{\{ opacity: 0, touchAction: "none", willChange: "opacity" \}\}/.test(sheet)
      && /const closer = \(e\.target as HTMLElement \| null\)\?\.closest\?\.\("\[data-sheet-close\]"\)\s*if \(closer && e\.currentTarget\.contains\(closer\)\) requestClose\(\)/.test(sheet)
      && /data-sheet-panel=""\s*tabIndex=\{-1\}\s*onClick=\{onPanelClick\}/.test(sheet))
  check("focus moves after the slide, not on its first frames", /window\.setTimeout\(\(\) => \{\s*const panel = sheetRef\.current/.test(sheet))
  check("what is inside a sheet is laid out and painted on its own, and the big blurred shadow is gone",
    (sheet.match(/contain: "layout paint"/g) || []).length === 2 && !/0_-8px_40px/.test(sheet))
  /*
    A control that owns its finger keeps it: the cover being pinched in the
    profile sheet, the colour picker's box and hue strip, a reorder grip.
    The creator page's editors moved onto this sheet, and those controls
    carry `data-sheet-no-drag`, which the builder's sheet honoured and this
    one now does too, at touchdown.
  */
  check("a control marked data-sheet-no-drag keeps its touches from the sheet",
    /if \(target\?\.closest\?\.\("\[data-sheet-no-drag\]"\)\) \{\s*pendingRef\.current = false/.test(sheet))
  check("a release velocity is read over the last 100ms of event times, not one noisy pair of events",
    /releaseVelocity\(samplesRef\.current, eventTime\(e\)\)/.test(sheet) && /samples\.push\(\{ t: eventTime\(e\), y \}\)/.test(sheet))
  check("a sheet that edits the page behind it can leave that page undimmed, and still close on a tap",
    /scrim === "clear" \? "bg-transparent" : "bg-black\/40"/.test(sheet) && /onClick=\{requestClose\}/.test(sheet))
  check("a fresh open can wait for its pictures to decode, never longer than 120ms",
    /const IMAGE_WAIT_MS = 120/.test(sheet) && /img\.decode\(\)\.catch/.test(sheet) && /openTokenRef\.current !== token/.test(sheet))
  check("the parent is told when the sheet is actually gone, on both ways out",
    (sheet.match(/setPresent\(false\)\s*onClosedRef\.current\?\.\(\)/g) || []).length === 2)
  check("a keyboard lifts the sheet over the keyboard's own time, not in one frame",
    /const KEYBOARD_MOVE = "bottom 250ms/.test(sheet) && /aboveKeyboard \? \{ transition: KEYBOARD_MOVE \}/.test(sheet))
  const menu = code("components/app/mobile-account-menu.tsx")
  check("the account sheet decodes its photo ahead, at the size it draws it, and its links do not prefetch as they slide in",
    /const sheetAvatar = businesses\.length > 0 \? SWITCHER_AVATAR\.sheet : 40/.test(menu) && (menu.match(/preloadAvatar\(avatarSrc, sheetAvatar\)/g) ?? []).length === 3 &&
      /prefetch=\{false\}/.test(menu) && /SHEET_OPEN_MS \+ 60/.test(menu))
  const sheetCss = read("app/globals.css")
  /* The shared sheet is found by an attribute on <html>, not by :has(): a :has() on the root that changes its
     answer restyled all 590 elements of the home page on every open and close (scripts/check-app-sheets-frames.mjs). */
  check("no sheet rule ends in a bare `*` (the whole document) nor in `a, button` (every link and button in it), and the shared sheet is not found by :has()",
    !/html:has\([^{]*\) \[data-app-nav-pill\] \*/.test(sheetCss) && /html\[data-app-sheet-up="open"\] \[data-app-nav-pill\] \.pointer-events-auto,/.test(sheetCss)
      && !/\[data-app-nav-pill\] :is\(a, button/.test(sheetCss) && !/:has\(\[data-app-sheet/.test(sheetCss)
      && /showSheetState\(key, pageState\)/.test(sheet) && /html\.setAttribute\("data-app-sheet-up", up\)/.test(sheet) && /data-sheet-root=""/.test(sheet))
  const css = read("app/globals.css")
  check("the pill is never hidden, faded or dropped under the page for a sheet",
    /html\[data-app-sheet-up\] \[data-app-nav-pill\],[\s\S]{0,300}z-index: 39;/.test(css)
      && !/html\[data-app-sheet-up[^\]]*\][^{]*\[data-app-nav-pill\][^{]*\{[^}]*(opacity|visibility|display|transform)/.test(css))
}

section("Navigation")
{
  const offenders = ["app/app/loading.tsx", "app/app/orders/loading.tsx", "app/app/orders/sales/loading.tsx", "app/app/orders/[id]/loading.tsx", "app/app/settings/loading.tsx", "app/app/customers/loading.tsx", "app/app/emails/loading.tsx", "app/app/analytics/loading.tsx", "app/app/payouts/loading.tsx", "app/app/coupons/loading.tsx", "app/app/coupons/new/loading.tsx", "app/app/onepage/loading.tsx", "app/app/website-builder/loading.tsx"].filter((f) => existsSync(join(root, f)))
  check("no /app page swaps itself for a loading boundary on the first frame of a navigation", offenders.length === 0, offenders.join(", "))
  const stage = code("components/app/app-stage.tsx")
  check("the landing starts before the new page is painted, and moves only transform and opacity",
    /useLayoutEffect\(\(\) => \{[\s\S]*playEntrance\(s\.outer, \{ fade: /.test(stage)
      && /const from: Keyframe = \{ \.\.\.\(fade \? \{ opacity: 0 \} : \{\}\), \.\.\.\(rise \? \{ translate: `0 \$\{NAV_ENTER_RISE_PX\}px` \} : \{\}\) \}/.test(stage)
      && /const to: Keyframe = \{ \.\.\.\(fade \? \{ opacity: 1 \} : \{\}\), \.\.\.\(rise \? \{ translate: "0 0" \} : \{\}\) \}/.test(stage)
      /* No fill: nothing is left on the page's boxes when the landing ends. */
      && /el\.animate\(\[from, to\], \{ duration: NAV_ENTER_MS, easing: NAV_ENTER_EASE \}\)/.test(stage))
  check("a page with something fixed showing gets the fade without the rise", /const rise = !holdsVisibleFixed\(el\)/.test(stage))
  check("reduced motion means no landing at all", /if \(reducedMotion\(\)\) return/.test(stage))
  check("the scroll is set in the same frame, and a back puts it where it was",
    /const saved = traversal \? recalledScroll\(key\) : null/.test(stage) && /s\.outer\.scrollTop = saved\?\.outer \?\? 0/.test(stage))
  check("the shell's own after paint scroll reset is gone", !/scrollEl\.scrollTop = 0/.test(code("components/app/app-layout-wrapper.tsx")))
  check("the shell mounts the stage", /<AppStage \/>/.test(read("components/app/app-layout-wrapper.tsx")))
  /*
    FROM THE FIRST PAINT. The rule used to wait for `html.app-layout`, a
    class an effect adds after hydration, so a page loaded as a document was
    painted at opacity 0 first: spinner, a flat grey content area, then the
    page. scripts/check-website-page.mjs films that landing frame by frame.
  */
  const shellCss = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "")
  check("inside the shell a page does not fade a second time on its own class, from the document's first paint",
    /\n\s*\.app-content-scroll \.app-page-enter \{\s*animation: none;/.test(shellCss) && !/html\.app-layout \.app-content-scroll \.app-page-enter/.test(shellCss))
  check("  and the Website page, which arrives as a document most often, carries no fade of its own",
    !/app-page-enter/.test(code("app/app/website-builder/website-builder-client.tsx")))
  /*
    THE WEBSITE ROW IS AN ORDINARY /app PAGE. It was marked forceNavigation
    when the page lived outside the /app tree, so on the web the sidebar and
    the search loaded it with window.location: the spinner, then a whole new
    document. It is a page in the shell now and arrives like the others.
  */
  check("  and the sidebar and the search reach it by the router, not by loading a document",
    /\{ href: "\/app\/website-builder", label: t\("nav\.websiteBuilder"\), icon: NAV_ICONS\.websiteBuilder \}/.test(code("components/app/sidebar.tsx")) &&
      !/href\.startsWith\("\/app\/website-builder"\)/.test(code("components/app/app-search.tsx")))
  const bar = code("components/app/navigation-loading-bar.tsx")
  check("the bar waits before it shows, and back and forward are seen as navigations",
    /NAV_BAR_AFTER_MS - \(performance\.now\(\) - nav\.startedAt\)/.test(bar) && /window\.addEventListener\("popstate", onPop\)/.test(bar))
  check("a modified click (a new tab) starts nothing", /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(bar))
}

section("Toasts on a phone")
{
  /* Measured at 390 and 1440 by scripts/check-toasts.mjs. */
  const box = code("components/ui/toast.tsx")
  check("the viewport runs across the screen between 16px gutters, just under the header, not from the middle (which squeezed every toast into half the screen)",
    /'pointer-events-none fixed inset-x-0 top-\[calc\(68px\+env\(safe-area-inset-top,0px\)\+8px\)\] z-\[2147483646\] flex max-h-screen flex-col items-center gap-2 px-4 outline-none'/.test(box)
      && !/left-1\/2 -translate-x-1\/2 top-\[calc\(76px/.test(box))
  check("from md it sits at the bottom right, 380px at most, over neither the header's buttons nor the page's own bar",
    /md:left-auto md:right-6 md:top-auto md:bottom-\[calc\(24px\+env\(safe-area-inset-bottom,0px\)\)\] md:w-\[380px\]/.test(box))
  check("the box is tight and square cornered like the app's other toasts, no pill, no blur behind it",
    /rounded-xl px-3\.5 py-2\.5/.test(box) && !/rounded-full px-4 py-2\.5/.test(box) && !/backdrop-blur/.test(box))
  check("one line of 14px title and at most two lines of 13px detail",
    /'truncate text-\[14px\] font-medium leading-5'/.test(box) && /'line-clamp-2 text-\[13px\] leading-\[18px\] text-white\/75'/.test(box))
  check("no close button on a phone: it only showed on hover and still took the room", /'hidden shrink-0 rounded-full p-1[^']*md:inline-flex'/.test(box))
  check("a swipe moves it on either axis, so up works as well as right",
    /data-\[swipe=move\]:translate-y-\[var\(--radix-toast-swipe-move-y\)\]/.test(box) && /data-\[swipe=end\]:translate-y-\[var\(--radix-toast-swipe-end-y\)\]/.test(box))
  const toaster = code("components/ui/toaster.tsx")
  check("every toast is the dark #111113 box with a white mark, never a green check or a red box",
    /default: 'border border-white\/10 bg-\[#111113\] text-white'/.test(box) && /destructive: 'destructive group border border-white\/10 bg-\[#111113\] text-white'/.test(box)
      && !/bg-red-600|bg-emerald|bg-green/.test(box + toaster) && /data-toast-icon="" className="[^"]*text-white/.test(toaster))
  check("and it is swiped up on a phone, to the right on a computer",
    /const PHONE = "\(max-width: 767px\)"/.test(toaster) && /return phone \? "up" : "right"/.test(toaster) && /swipeDirection=\{swipeDirection\}/.test(toaster))
  const sonner = code("components/ui/editor-toaster.tsx")
  check("the website builder's toasts keep clear of the home indicator on a phone and keep to the same lines",
    /mobileOffset=\{\{ left: 16, right: 16, bottom: "calc\(16px \+ env\(safe-area-inset-bottom, 0px\)\)" \}\}/.test(sonner)
      && /title: "truncate text-\[14px\]"/.test(sonner) && /description: "line-clamp-2 text-\[13px\]"/.test(sonner) && /toast: "max-\[600px\]:py-3!"/.test(sonner)
      && /<EditorToaster \/>/.test(code("app/website-builder/layout.tsx")) && !/from "sonner"/.test(code("app/website-builder/layout.tsx")))

  /*
    THE WORDS. Every toast written out in these files says one short thing:
    at most 40 characters, no em dash, no "successfully", no "Please". The
    emails, billing, automations, search and notifications code belongs to
    other work and is not read here.
  */
  const files = [
    "app/app/payouts/payouts-client.tsx",
    "app/app/products/products-client.tsx",
    "app/app/products/new/product-editor.tsx",
    "app/app/coupons/coupons-client.tsx",
    "app/app/website-builder/themes/themes-client.tsx",
    "app/app/website-builder/website-builder-client.tsx",
    "components/app/dashboard-client.tsx",
    "components/app/settings-form-new.tsx",
    "components/onepage/tabs/products-tab.tsx",
    "app/website-builder/code/[installId]/page.tsx",
    "components/website-builder/editor/image-picker.tsx",
    "app/website-builder/editor/[installId]/page.tsx",
  ]
  const call = /\b(?:toast(?:\.(?:success|error|info|warning|message))?|showNotification|showToast|say)\(\s*(?:\{\s*title:\s*)?(["`])((?:(?!\1)[^\\]|\\.)*)\1/g
  const long: string[] = []
  const said: string[] = []
  for (const f of files) {
    for (const m of code(f).matchAll(call)) {
      const text = m[2]
      said.push(text)
      /* A name filled in at run time counts as ten characters. */
      const length = text.replace(/\$\{[^}]*\}/g, "0123456789").length
      if (length > 40 || /—|successfully|\bPlease\b/.test(text)) long.push(`${f}: "${text}"`)
    }
  }
  check("every toast in the app's own pages is short and plain", said.length >= 40 && long.length === 0, long.join("; ") || `${said.length} read`)
  check("an upload that failed says so, not the storage error's own words",
    /toast\.error\("Upload failed\. Try again\."\)/.test(code("components/website-builder/editor/image-picker.tsx")) && !/err\.message/.test(code("components/website-builder/editor/image-picker.tsx")))
  const addRoute = code("app/api/website-builder/themes/add/route.ts")
  check("adding a theme never hands the database's error text to the toast", !/seedErr\.message|installErr\?\.message/.test(addRoute) && (addRoute.match(/"Could not add the theme\. Try again\."/g) ?? []).length >= 2 && !/json\(\{ error: [a-zA-Z]+Err/.test(addRoute))
}

section("Avatars")
{
  const avatar = code("components/app/app-avatar.tsx")
  check("while a photo is on its way the circle has no initials in it",
    /\{photo \? \(/.test(avatar) && /data-state=\{photo \? \(loaded \? "photo" : "waiting"\) : "initials"\}/.test(avatar))
  check("it fades in over 150ms, and only when it arrived after the first paint",
    /transition: fade \? "opacity 150ms ease-out" : undefined/.test(avatar) && /if \(img\.complete && img\.naturalWidth > 0\)/.test(avatar))
  check("a photo already shown in this tab is drawn at once", /useState\(\(\) => !!url && shown\.has\(url\)\)/.test(avatar))
  check("it is asked for at its drawn size, never through a storage transform",
    /optimizedSrcSet\(url,/.test(avatar) && /toOriginalImageUrl\(src\)/.test(avatar) && !/render\/image/.test(avatar))
  /* The phone's account trigger and sheet live in their own file now (components/app/mobile-account-menu.tsx). */
  const sidebar = code("components/app/sidebar.tsx") + code("components/app/mobile-account-menu.tsx")
  check("the header, the account sheet and the sidebar all use it, and none draws initials under a photo",
    (sidebar.match(/<AppAvatar /g) ?? []).length === 4 && !/>\s*\{userInitials\}\s*</.test(sidebar))
  const settings = code("components/app/settings-form-new.tsx")
  const photo = code("components/app/settings/profile-photo.tsx")
  check("so does Settings, without the purple gradient behind the initials",
    /<ProfilePhoto\s+userId=\{profile\.id\}\s+src=\{avatarUrl \|\| null\}/.test(settings) && /<AppAvatar src=\{src \|\| null\}/.test(photo)
      && !/from-\[#8b5cf6\] to-\[#a78bfa\]/.test(settings))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
