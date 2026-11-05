/**
 * ===========================================================================
 *  WHERE THE PAGE MEETS THE BLACK BAR: THE SAME ROUNDED CORNERS EVERYWHERE
 * ===========================================================================
 * "In the whole app where the black top bar is, on mobile devices, it needs
 * to be the rounded concave thing, across all pages, the same as it is on
 * desktop." And the purple Try Pro strip under the bar, calmer.
 *
 * The pixels are read by scripts/check-app-top-corners.mjs (360, 390, 430,
 * 1280, 1440, 1920; NATIVE=1 for the apps, iPads included). What is held here
 * are the lines that would undo it without anything else failing: one
 * radius and one overlap, read by every surface that draws the top of the
 * content area; the corners hung from both headers; nothing left rounding
 * the top by a number of its own; and a strip with no gradient in it.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "")

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

const css = code("app/globals.css")
const sidebar = code("components/app/sidebar.tsx")
const corners = code("components/app/app-top-corners.tsx")
const stage = code("components/app/app-stage.tsx")
const cold = code("app/(storelib)/app/cold-start.tsx")
const layout = code("app/(storelib)/app/layout.tsx")

section("One radius, one overlap, in one place")
{
  const radius = css.match(/--app-top-corner:\s*([^;]+);/g) ?? []
  const overlap = css.match(/--app-top-overlap:\s*([^;]+);/g) ?? []
  check("the stylesheet says the radius once: 16px, the desktop bar's own", radius.length === 1 && /--app-top-corner:\s*16px;/.test(css), radius.join(" "))
  check("and the overlap once: 1px, so each corner starts inside the bar and no seam opens", overlap.length === 1 && /--app-top-overlap:\s*1px;/.test(css), overlap.join(" "))
  const start = css.indexOf(".app-top-corners {")
  const rules = css.slice(start, css.indexOf(".dashboard-scroll-container", start))
  check("the corners are sized and placed by those two and nothing else",
    /top: calc\(100% - var\(--app-top-overlap\)\);/.test(rules) && /height: calc\(var\(--app-top-corner\) \+ var\(--app-top-overlap\)\);/.test(rules)
      && /width: var\(--app-top-corner\);/.test(rules) && /width: calc\(var\(--app-top-corner\) \* 2\);/.test(rules)
      && /box-shadow: 0 0 0 var\(--app-top-corner\) currentColor;/.test(rules) && !/\d+px/.test(rules.replace(/0 0 0 /, "")),
    rules.slice(0, 200))
  check("they take no presses", /\.app-top-corners \{[^}]*pointer-events: none;/.test(css))
  check("the component is two corners in one box, hidden from a screen reader",
    /data-app-top-corners=""/.test(corners) && /aria-hidden="true"/.test(corners) && /data-corner="left"/.test(corners) && /data-corner="right"/.test(corners))
}

section("Hung from both bars, on a phone as on a computer")
{
  const uses = sidebar.match(/<AppTopCorners className="text-\[#[0-9a-f]{6}\]" \/>/g) ?? []
  check("the sidebar hangs them from both headers, each in its own bar's colour",
    uses.length === 2 && /<AppTopCorners className="text-\[#131316\]" \/>/.test(sidebar) && /<AppTopCorners className="text-\[#111111\]" \/>/.test(sidebar), uses.join(" "))
  const phoneHeader = sidebar.slice(sidebar.indexOf('className="fixed top-0 left-0 right-0 z-50 md:hidden bg-[#111111]"'))
  check("the phone's are inside the phone's header, so whatever hides the header hides them",
    phoneHeader.indexOf('<AppTopCorners className="text-[#111111]" />') > 0 && phoneHeader.indexOf('<AppTopCorners className="text-[#111111]" />') < phoneHeader.indexOf("</header>"))
  const desktopHeader = sidebar.slice(sidebar.indexOf('className="fixed top-0 left-0 right-0 z-50 hidden md:block'))
  check("the desktop's likewise",
    desktopHeader.indexOf('<AppTopCorners className="text-[#131316]" />') > 0 && desktopHeader.indexOf('<AppTopCorners className="text-[#131316]" />') < desktopHeader.indexOf("</header>"))
  check("the old drawn corners and their 16px band in the flow are gone: the desktop header's box ends with the bar",
    !/8\.163/.test(sidebar) && !/relative h-4 pointer-events-none/.test(sidebar))
  check("both bars and the hidden chrome rule still go together: the headers carry [data-shell-chrome]",
    (sidebar.match(/<header data-shell-chrome=""/g) ?? []).length === 2)
}

section("Nothing else rounds the top by a number of its own")
{
  check("main has no rounded top: it starts under the header, where it was never seen",
    !/rounded-t-/.test(layout.slice(layout.indexOf("<main"), layout.indexOf("</main>"))))
  check("a slow page's surface takes the same radius from the stylesheet on a phone, square from md",
    /data-app-slow-surface="" className="h-full overflow-hidden rounded-t-\[var\(--app-top-corner\)\] bg-\[#f8f9fa\] md:rounded-none"/.test(stage))
  check("the native cold start draws the header's own corners, at every width",
    /<AppTopCorners \/>/.test(cold) && /text-\[#111111\] md:h-\[calc\(58px\+env\(safe-area-inset-top,0px\)\)\] md:text-\[#131316\]/.test(cold) && !/rounded-t-\[\d+px\]/.test(cold))
  for (const file of ["app/(storelib)/app/layout.tsx", "app/(storelib)/app/cold-start.tsx", "components/app/app-stage.tsx", "components/app/sidebar.tsx"]) {
    check(`${file} writes no rounded-t-[20px] of its own`, !/rounded-t-\[20px\]/.test(code(file)))
  }
}

section("The Try Pro strip: in the rounded top, the violet band it was")
{
  const strip = code("components/app/announcement-bar-mobile.tsx")
  check("one strip for Analytics, Emails and Payouts, from one component",
    ["app/(storelib)/app/analytics/analytics-client.tsx", "app/(storelib)/app/emails/emails-client.tsx", "app/(storelib)/app/payouts/page.tsx"].every((f) => /<TryProStrip \/>/.test(code(f)) && !/<AnnouncementBarMobile>/.test(code(f))))
  /* "The announcement bar background colour: I want it purple like it was before." */
  check("the solid violet band in white type, as it was, with no hairline under it",
    /STRIP_TINT = "bg-\[#8b5cf6\] text-white"/.test(strip) && /STRIP_TITLE = "font-semibold text-white"/.test(strip) && !/#f5f3ff|shadow-\[inset_0_-1px_0_#ede9fe\]/.test(strip))
  check("the near black Upgrade pill with its white hairline and the sparkle, solid rather than a gradient, no sweep",
    /STRIP_ACTION =\s*"inline-flex shrink-0 items-center gap-1 rounded-full bg-\[#111111\][^"]*shadow-\[inset_0_0_0_1px_rgba\(255,255,255,0\.3\)\]/.test(strip) && /<Sparkles className=\{STRIP_SPARKLE\}/.test(strip) && !/gradient|laser-sweep/.test(strip))
  check("the same heights as before, so nothing under it moves", /h-\[38px\] md:h-\[40px\]/.test(strip))
  check("the same link, to the plans", /<Link href="\/upgrade" className=\{STRIP_ACTION\}>/.test(strip))
  check("no \"use client\": Payouts renders it on the server", !/^"use client"/m.test(read("components/app/announcement-bar-mobile.tsx")))

  const dash = code("components/app/dashboard-client.tsx")
  const bar = dash.slice(dash.indexOf("const AnnouncementBar = memo("), dash.indexOf("export function DashboardClient("))
  check("Home's rotating strip wears the same tint and the same button on every slide",
    /data-page-strip="" className=\{STRIP_TINT\}/.test(bar) && (bar.match(/className=\{STRIP_ACTION\}/g) ?? []).length === 3)
  check("and keeps its links and its clock", /href="\/app\/settings\/billing\/upgrade"/.test(bar) && /href="\/app\/settings\?tab=payments"/.test(bar) && /onClick=\{bumpGettingStarted\}/.test(bar) && /announce-progress/.test(bar))
  check("with no gradient or sweep, and the sparkle only on Upgrade", !/gradient|laser-sweep/.test(bar) && (bar.match(/<Sparkles /g) ?? []).length === 1)
  check("and the sweep's keyframes went with it", !/@keyframes laser-sweep/.test(dash))
}

section("Measured")
{
  const probe = read("scripts/check-app-top-corners.mjs")
  check("the probe reads the numbers from the stylesheet, at every width the owner named, native too",
    /getPropertyValue\("--app-top-corner"\)/.test(probe) && /getPropertyValue\("--app-top-overlap"\)/.test(probe)
      && [360, 390, 430, 1280, 1440].every((w) => new RegExp(`\\[${w}, \\{ width: ${w},`).test(probe)) && /NATIVE/.test(probe) && /setSafeAreaInsetsOverride/.test(probe))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
