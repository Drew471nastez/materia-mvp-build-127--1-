/**
 * ===========================================================================
 *  ROUND 23: THE SETTINGS SHEET, THE RELOADS AND THE SLIDES
 * ===========================================================================
 * The owner: the settings sheet "glitches and sometimes closes twice"; going
 * back from the website builder's editor "the whole page randomly refreshes
 * or reloads, and this sometimes happens randomly across Storelib"; "back and
 * entering pages" should have no slide delay. Each cause was found in a real
 * Next 16 build of the real components (scripts/nav23-real-router: the /app
 * shell, the sheet over a page through app/app/@sheet, the real editor page,
 * the real product layer), counted there before and after, and fixed:
 *
 *   SHEET     Escape never closed it (the rail's hidden menus were taken for
 *             a dialog over it); a Back during the close's slide was followed
 *             by a second Back, past the page under it; opened on its own,
 *             the close slid a copy away over the sheet itself, which stayed
 *             until the dashboard came and then blinked away
 *   RELOADS   the editor's leave watchdog loaded the address for real at the
 *             very moment its own push started; a link out of the shell left
 *             a navigation record that nothing ended, and its stuck check
 *             then reloaded the page that had just come (entering the editor
 *             by a link reloaded it); a newer deploy turned a replace or a
 *             way back into a whole page load
 *   MOTION    a page layer (product, coupon, email composer, plans) no longer
 *             rises and drops; leaving an editor no longer waits 3s behind a
 *             screen, and that screen shows only when the next page is slow
 *
 * Run with:  pnpm run test:push
 */
import { readCode, readSource } from "./_source"
import { BACK_MARK, BACK_MARK_MS, fullLoadFor, markBackStarted, SKEW_SAFE_MS } from "@/lib/ui/new-deploy"
import { LEAVING_SEEN_MS, NAVIGATE_CEILING_MS, navigateWithCeiling } from "@/lib/website-builder/navigate-ceiling"
import { EXIT_MIN_MS, exitWatchdogMs } from "@/lib/website-builder/exit-hold"
import { NAV_SPINNER_CAP_MS, NAV_STUCK_AFTER_ANSWER_MS } from "@/lib/ui/app-navigation"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readCode(p)

console.log("\nSHEET: one close, whichever way it is closed")
{
  const sheet = code("components/app/settings-sheet.tsx")
  check("a dialog counts as over the sheet only when it is drawn (rect, visibility, presses, the closed phone menu)",
    /function dialogOverSheet\(\): boolean \{/.test(sheet) && /el\.getAttribute\("data-mobile-menu"\) === "closed" \|\| !el\.getClientRects\(\)\.length/.test(sheet) && /cs\.visibility === "hidden" \|\| cs\.pointerEvents === "none"/.test(sheet))
  check("Escape asks that, not whether any dialog is mounted", /if \(dialogOverSheet\(\)\) return\s*\n\s*close\(\)/.test(sheet) && !/if \(document\.querySelector\("\[role=dialog\]\[aria-modal=true\]:not\(\[data-settings-sheet\]\)"\)\) return/.test(sheet))
  check("  and so does the pull on the content", /skip: !!target\?\.closest\?\.\(OWN_GESTURE\) \|\| dialogOverSheet\(\)/.test(sheet))
  check("over a page, the Back after the slide is skipped once the address has left Settings (a Back during the slide)",
    /const back = \(\) => \{[\s\S]{0,700}?if \(!alive\.current \|\| !onSettings\(\)\) return\s*\n\s*setGone\(true\)/.test(sheet))
  check("opened on its own, the sheet is hidden the moment its sliding copy takes over", /ghostPanel\.style\.transform = [^\n]+\n[\s\S]{0,200}?setGone\(true\)\s*\n\s*go\(\)/.test(sheet))
  check("  and without motion it is hidden too", /if \(!el \|\| !root \|\| !motion\) \{\s*\n\s*setGone\(true\)\s*\n\s*return go\(\)/.test(sheet))
  check("  its way out is skipped when the address already left, and replaces Settings rather than stacking on it",
    /const go = \(\) => \{\s*\n\s*if \(!onSettings\(\)\) return/.test(sheet) && /const toDashboard = \(\) => router\.replace\("\/app"\)\s*\n\s*if \(ours && window\.history\.length > 1\) backThen\(toDashboard\)\s*\n\s*else toDashboard\(\)/.test(sheet) && !/router\.push\("\/app"\)/.test(sheet))
  check("  it comes back only if the dashboard has not come by the app's give up, not after 2.5s", /const STUCK_PAGE_MS = 10_000/.test(sheet) && /\}, overlay \? STUCK_MS : STUCK_PAGE_MS\)/.test(sheet))
  check("  and the dashboard is fetched whole ahead, not only its frame", /prefetchAppPage\(router, "\/app"\)/.test(sheet) && !/router\.prefetch\("\/app"\)/.test(sheet))
}

console.log("\nRELOADS: a whole page load only when nothing else can work, never on a Back")
{
  const behind = { href: "/app/products", from: "https://storelib.com/app/orders", newDeploy: true, holdsWork: false, tabAgeMs: SKEW_SAFE_MS + 1 }
  check("a press forward to another page, on a tab past skew protection, still picks up the new code", fullLoadFor({ ...behind, type: "push" }) === "assign")
  check("a replace never does (a close, a fallback, a tab: the page did it, not the person)", fullLoadFor({ ...behind, type: "replace" }) === null)
  check("nor Back or Forward", fullLoadFor({ ...behind, type: "traverse" }) === null)
  check("nor a push that is a way back", fullLoadFor({ ...behind, type: "push", inBack: true }) === null)
  check("nor Settings over a page", fullLoadFor({ ...behind, href: "/app/settings?tab=taxes", type: "push" }) === null)
  {
    const g = globalThis as unknown as { window?: Record<string, unknown> }
    const had = g.window
    g.window = {}
    markBackStarted(1_000)
    check("a way back marks the window (instrumentation-client is bundled apart, so not a module variable)", g.window[BACK_MARK] === 1_000 && BACK_MARK_MS >= 2_000)
    g.window = had
  }
  const back = code("lib/navigation/go-back.ts")
  check("every way back marks it: a history back, its fallback, and a back that has to be a push",
    /markBackStarted\(\)\s*\n\s*window\.history\.back\(\)/.test(back) && /markBackStarted\(\)\s*\n\s*fallback\(\)/.test(back) && /swallowEchoClicks\(\)[\s\S]{0,200}?markBackStarted\(now\)/.test(back))
  const deploy = code("lib/ui/new-deploy.ts")
  check("the router's start reads the mark, and never loads in place", /inBack: backJustStarted\(\)/.test(deploy) && !/window\.location\.replace\(href\)/.test(deploy))

  const editor = code("app/website-builder/editor/[installId]/page.tsx")
  const watch = editor.match(/useEffect\(\(\) => \{\s*\n\s*if \(!leaving\) return[\s\S]*?\}, \[leaving\]\)/)?.[0] ?? ""
  check("the editor's leave watchdog no longer loads the address itself (it fired as its own push started)", watch.length > 0 && !/location\.assign/.test(watch) && /window\.setTimeout\(revive, exitWatchdogMs\(NAVIGATE_CEILING_MS\)\)/.test(watch) && exitWatchdogMs(NAVIGATE_CEILING_MS) === EXIT_MIN_MS + NAVIGATE_CEILING_MS + 2000)
  /* Y1: the builder's own way out pushes once Going back has been up EXIT_MIN_MS (the editor stays around it until then); the page editors still push on the press. */
  check("the page editors push on the press, and a document load waits as long as the app's spinner does", LEAVING_SEEN_MS === 0 && NAVIGATE_CEILING_MS === NAV_SPINNER_CAP_MS)
  {
    const said: string[] = []
    const timers: Array<[() => void, number]> = []
    const cancel = navigateWithCeiling(() => said.push("soft"), () => said.push("hard"), (cb, ms) => timers.push([cb, ms]), () => said.push("cleared"))
    check("  soft first, the hard load only armed, 8s out", said.join() === "soft" && timers.length === 1 && timers[0][1] === 8_000)
    cancel()
    check("  and the page going (the editor unmounting) cancels it", said.includes("cleared"))
  }

  const nav = code("lib/ui/app-navigation.ts")
  check("a page that landed outside the shell ends its record instead of being loaded again",
    /const navPath = pathOf\(new URL\(nav\.href as string, window\.location\.href\)\.pathname\)\s*\n\s*if \(pathOf\(window\.location\.pathname\) === navPath && committedPath !== navPath\) \{\s*\n\s*endAppNavigation\(\)\s*\n\s*return/.test(nav))
  check("  and a page still rendering after its answer (a heavy page on a slow phone) is given 6s, not 2s", NAV_STUCK_AFTER_ANSWER_MS === 6_000)
  const stage = code("components/app/app-stage.tsx")
  check("  and the shell going ends it too", /useEffect\(\(\) => \(\) => \{\s*\n\s*forgetCommitted\(\)\s*\n\s*endAppNavigation\(\)\s*\n\s*\}, \[\]\)/.test(stage))
}

console.log("\nMOTION: a page is there, or fades in once; nothing slides")
{
  const layer = code("components/app/page-layer.tsx")
  /* Changed on purpose (round 41): LAYER_MOVES is still off for every layer, but a layer can ask to move (the product editor's, `moves`), and layerMotionOn reads that ask first. */
  check("a page layer moves no more unless it asks to: LAYER_MOVES is off and asked first", /const LAYER_MOVES: boolean = false/.test(layer) && /function layerMotionOn\(moves: boolean = LAYER_MOVES\): boolean \{\s*\n\s*if \(!moves\) return false/.test(layer))
  /* Changed on purpose (round 41): whole whenever this commit plays no move, read after the drop is decided on the way out. */
  check("a layer over the whole screen is drawn whole on its first frame, coming and going, whenever it does not move (no fade from an empty frame)",
    /const whole = \(\) => !moving\(\) && \(!phoneOnly \|\| !!window\.matchMedia\?\.\(LAYER_PHONE\)\.matches\)\s*\n\s*if \(whole\(\)\) holdLanding\(\)/.test(layer) && /if \(!dropAtCommit\(\)\) markReactMotion\("leave", asked\)\s*\n(\s*\/\*[^*]*\*\/\s*\n)?\s*if \(whole\(\)\) holdLanding\(\)/.test(layer))
  const css = readSource("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "")
  const leaving = css.match(/\.wb-leaving \{[\s\S]*?\n {2}\}/)?.[0] ?? ""
  check("the editor's leaving glass waits 300ms, so a quick way back never shows it", /animation: wb-leaving-in 200ms cubic-bezier\(0\.32, 0\.72, 0, 1\) 300ms both;/.test(leaving))
  check("and the builder does not shrink under it", /\.wb-editor-leaving \{\s*pointer-events: none;\s*\}/.test(css))
}

console.log("\nCOPY")
{
  const files = [
    "components/app/settings-sheet.tsx",
    "lib/ui/new-deploy.ts",
    "lib/navigation/go-back.ts",
    "lib/website-builder/navigate-ceiling.ts",
    "lib/ui/app-navigation.ts",
    "components/app/app-stage.tsx",
    "components/app/page-layer.tsx",
    "app/website-builder/editor/[installId]/page.tsx",
    "app/globals.css",
  ]
  /* The words are spelled out in pieces here so this file does not hold them itself. */
  const banned = new RegExp(["\\u2014", "unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "trans" + "form"].map((w) => (w.startsWith("\\") ? w : `\\b${w}`)).join("|"), "i")
  /* This round's own words: every comment that names round 23, and the round's markers in code. */
  const written = files.flatMap((f) => (readSource(f).match(/\/\*[\s\S]*?\*\//g) ?? []).filter((c) => /round 23/i.test(c)).map((c) => [f, c] as const))
  check("this round's notes are where they say (one or more in each file it changed)", files.every((f) => written.some(([g]) => g === f)), files.filter((f) => !written.some(([g]) => g === f)))
  const bad = written.filter(([, c]) => banned.test(c)).map(([f, c]) => `${f}: ${c.slice(0, 80)}`)
  check("no em dash and no banned word in them", bad.length === 0, bad)
  const own = readSource("tests/nav23.test.ts").replace(/\["\\\\u2014"[^\]]*\]/, "")
  check("nor in this file", !banned.test(own.replace(/\.style\.transform|\.transform\b|transform:/g, "")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
