/**
 * ===========================================================================
 *  LEAVING THE ONEPAGE EDITOR WORKS THE FIRST TIME
 * ===========================================================================
 * "When I'm in /app/onepage#settings and I click in the sidebar, on
 * Dashboard or Products or Website, it starts the loading bar but never takes
 * me to what I clicked... It doesn't let me get out of the OnePage editor."
 *
 * The cause, measured with the real router (scripts/check-onepage-leave.mjs):
 * a deploy lands while the editor is open; the press starts from the page's
 * outline the Link fetched ahead, the server's answer comes from the new
 * build, and Next 16.0 drops that answer on this path instead of loading the
 * page as a document, so the navigation never commits. The shell now finishes
 * it (lib/ui/app-navigation watchRouterAnswers). And the editor's own history
 * handling, which made Back a press that went nowhere, is gone:
 *
 *   the tabs replace the address, keeping the entry's state (no #tab entries)
 *   no entry is pushed on arrival; Back is held only while work is unsaved,
 *     by a listener that runs before the router's (lib/ui/leave-guard.ts)
 *   a link out with unsaved work asks first, before the shell starts anything,
 *     and once answered goes where it was going, by the router
 *   a row starts the shell's record only on a press this tab follows
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isAnswerFor, isPlainClick, NAV_STUCK_AFTER_ANSWER_MS, type AppNavigation } from "@/lib/ui/app-navigation"
import { hasRouterMarker, leaveGuard, setLeaveGuard, watchLeaveGuard } from "@/lib/ui/leave-guard"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const editor = code("components/onepage/onepage-editor.tsx")
const nav = code("lib/ui/app-navigation.ts")
const stage = code("components/app/app-stage.tsx")
const guard = code("lib/ui/leave-guard.ts")
const instrumentation = code("instrumentation-client.ts")
const desktop = code("components/app/sidebar-desktop-nav.tsx")
const phone = code("components/app/sidebar-mobile-nav.tsx")

console.log("\nThe tabs change the address, not the history")
check("a tab replaces the address with the entry's own state", /window\.history\.replaceState\(window\.history\.state, "", `#\$\{tab\}`\)/.test(editor))
check("the editor pushes no history entry at all", !/pushState/.test(editor))
check("no entry pushed on arrival for Back to pop", !/onepageEditor/.test(editor) && !/hasSetupBackInterception/.test(editor))
check("and nothing goes back by counting entries", !/history\.go\(/.test(editor))

console.log("\nBack, while work is unsaved")
check("the editor holds Back only while dirty and not leaving", /if \(!isDirtyRef\.current \|\| leavingRef\.current\) \{\s*setLeaveGuard\(null\)/.test(editor) && /setLeaveGuard\(\{\s*url: window\.location\.href,\s*state: window\.history\.state,/.test(editor))
check("  and asks, with the held Back as what Save and Discard complete", /onHeld: \(\) => \{\s*setPendingNavigation\("back"\)\s*setShowUnsavedDialog\(true\)/.test(editor))
check("  re-armed when the page's dirtiness changes, and let go when the editor goes", /useEffect\(\(\) => \{\s*armLeaveGuard\(\)\s*\}, \[isDirty, armLeaveGuard\]\)/.test(editor) && /setLeaveGuard\(null\)\s*\}, \[\]\)/.test(editor))
check("the listener is added before the router's, in instrumentation-client", /watchLeaveGuard\(\)/.test(instrumentation) && /from "@\/lib\/ui\/leave-guard"/.test(instrumentation))
check("  it stops the event, puts the entry back, and asks", /e\.stopImmediatePropagation\(\)\s*window\.history\.pushState\(guard\.state, "", guard\.url\)\s*guard\.onHeld\(to\)/.test(guard))
check("  only with the router's marker in the state it puts back", /if \(!guard \|\| !hasRouterMarker\(guard\.state\)\) return/.test(guard))
check("  kept on the window: the instrumentation bundle is its own", /__storelibLeaveGuard/.test(guard))

{
  /* The hold, run: a window of our own with the two listeners in the order the app adds them. */
  type Listener = (e: { stopImmediatePropagation: () => void }) => void
  const listeners: Listener[] = []
  const pushed: Array<[unknown, string]> = []
  const fake = {
    location: { href: "https://storelib.com/app" },
    history: { pushState: (state: unknown, _: string, url: string) => { pushed.push([state, url]) } },
    addEventListener: (type: string, f: Listener) => { if (type === "popstate") listeners.push(f) },
  }
  ;(globalThis as unknown as { window: unknown }).window = fake
  watchLeaveGuard()
  watchLeaveGuard()
  let routerSaw = 0
  listeners.push(() => { routerSaw++ })
  const pop = () => {
    let stopped = false
    for (const f of listeners) {
      f({ stopImmediatePropagation: () => { stopped = true } })
      if (stopped) break
    }
  }
  check("one listener however many times it is asked for", listeners.length === 2)
  pop()
  check("nothing held: the router follows Back", routerSaw === 1 && pushed.length === 0)
  const held: string[] = []
  const state = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {} }
  setLeaveGuard({ url: "https://storelib.com/app/onepage#settings", state, onHeld: (to) => held.push(to) })
  pop()
  check("held: the router never sees it", routerSaw === 1)
  check("  the entry is put back with its own state", pushed.length === 1 && pushed[0][0] === state && pushed[0][1] === "https://storelib.com/app/onepage#settings")
  check("  and the page is told where Back was going", held.join() === "https://storelib.com/app")
  setLeaveGuard({ url: "https://storelib.com/app/onepage", state: { onepageEditor: true }, onHeld: (to) => held.push(to) })
  pop()
  check("a state without the router's marker is not put back (the router would follow it)", routerSaw === 2 && pushed.length === 1)
  setLeaveGuard(null)
  check("let go", leaveGuard() === null && !hasRouterMarker(null) && hasRouterMarker({ __NA: true }))
}

console.log("\nA link out, with work unsaved")
check("the editor stops it in the capture phase, before the link, the rail or the shell", /document\.addEventListener\('click', handleClick, true\)/.test(editor) && /e\.preventDefault\(\)\s*e\.stopPropagation\(\)\s*e\.stopImmediatePropagation\(\)\s*setPendingNavigation\(url\.href\)\s*setShowUnsavedDialog\(true\)/.test(editor))
check("  only a plain press, and not a new tab, a download or this same page", /if \(!isDirtyRef\.current \|\| leavingRef\.current \|\| !isPlainClick\(e\)\) return/.test(editor) && /anchor\.hasAttribute\("download"\)/.test(editor) && /anchor\.target && anchor\.target !== "_self"/.test(editor) && /url\.pathname === window\.location\.pathname && url\.search === window\.location\.search\) return/.test(editor))
check("answered, it goes by the router and tells the shell on the same press", /const goTo = \(href: string\) => \{\s*startNavigationLoading\(href\)/.test(editor) && /navigateWithCeiling\(\s*\(\) => router\.push\(href\)/.test(editor))
/* And a way out that never lands is loaded as a document at the ceiling, as `leave` does (lib/website-builder/navigate-ceiling). */
check("  and a push that never lands still ends", /\(\) => window\.location\.assign\(href\)/.test(editor))
/* A back that does nothing reports nothing: the editor used to sit there with
   the question gone for LEAVE_REVIVE_MS and then hold Back again. Filmed:
   scripts/check-onepage-back-stall.mjs. */
check("  a held Back goes back one entry, and lands on the app when that entry is dead", /if \(target === "back"\) \{\s*backThen\(\(\) => goTo\(EXIT_HREF\)\)/.test(editor) && /const EXIT_HREF = "\/app"/.test(editor))
check("  no whole document load for a link of the app", !/window\.location\.href = pendingNavigation/.test(editor))
check("  and the answered question stands the browser's own prompt down", /leavingRef\.current = true\s*setLeaveGuard\(null\)/.test(editor) && /if \(isDirty && !leavingRef\.current\)/.test(editor))
check("the phone's way out still leaves through the glass", (editor.match(/if \(pendingNavigation === "\/app"\) \{\s*leave\(\)\s*\} else if \(pendingNavigation\) \{\s*leaveTo\(pendingNavigation\)/g) ?? []).length === 2)
check("the question is above the shell: a dialog from md, the shared sheet below", /<BottomSheet isOpen=\{open\}/.test(editor) && /<Dialog open=\{open\}/.test(editor)
  && /z-\[2147483639\]/.test(read("components/ui/dialog.tsx")) && /"fixed inset-0", zIndex == null && "z-\[200\]"/.test(read("components/ui/bottom-sheet.tsx")))

console.log("\nA navigation whose answer came back and did not land")
check("the stage watches for it, once for the tab", /watchRouterAnswers\(\)/.test(stage))
check("it loads the address as a document", /window\.location\.assign\(nav\.href as string\)/.test(nav) && NAV_STUCK_AFTER_ANSWER_MS === 6000)
check("  from the answer's end, and from any script or stylesheet the page is still loading", /armStuckCheck\(nav, entry\.responseEnd\)/.test(nav) && /entry\.initiatorType === "script" \|\| entry\.initiatorType === "link"/.test(nav))
check("  a tab in the background is asked again once it is back", /document\.visibilityState === "hidden"/.test(nav))
{
  const press: AppNavigation = { href: "/app", startedAt: 1000 }
  const origin = "https://storelib.com"
  const entry = (name: string, startTime: number, initiatorType = "fetch") => ({ name: `${origin}${name}`, startTime, initiatorType })
  check("the router's own request, sent in the press", isAnswerFor(press, entry("/app?_rsc=h8r54", 1003), origin))
  check("  or a moment before the record started", isAnswerFor(press, entry("/app?_rsc=h8r54", 990), origin))
  check("not the prefetch under the pointer before it", !isAnswerFor(press, entry("/app?_rsc=h8r54", 860), origin))
  check("not another page's", !isAnswerFor(press, entry("/app/products?_rsc=h8r54", 1003), origin))
  check("not a request without the router's marker", !isAnswerFor(press, entry("/app", 1003), origin))
  check("not a script", !isAnswerFor(press, entry("/app?_rsc=h8r54", 1003, "script"), origin))
  check("not another origin", !isAnswerFor(press, { name: "https://cdn.example.com/app?_rsc=1", startTime: 1003, initiatorType: "fetch" }, origin))
  check("a query is part of the address", isAnswerFor({ href: "/app/orders?view=open", startedAt: 0 }, entry("/app/orders?view=open&_rsc=x", 5), origin)
    && !isAnswerFor({ href: "/app/orders?view=open", startedAt: 0 }, entry("/app/orders?_rsc=x", 5), origin))
  check("a record with no address is never answered", !isAnswerFor({ href: null, startedAt: 0 }, entry("/app?_rsc=x", 5), origin))
}

console.log("\nOnly a press this tab follows starts the shell's record")
check("a plain press", isPlainClick({ button: 0 }))
check("not a Cmd, Ctrl, Shift or Alt press, not another button, not one already stopped",
  !isPlainClick({ button: 0, metaKey: true }) && !isPlainClick({ button: 0, ctrlKey: true }) && !isPlainClick({ button: 0, shiftKey: true })
    && !isPlainClick({ button: 0, altKey: true }) && !isPlainClick({ button: 1 }) && !isPlainClick({ button: 0, defaultPrevented: true }))
check("every rail row, sub row and the Upgrade card asks it", (desktop.match(/if \(isPlainClick\(e\.nativeEvent\)\) onNavigate\?\.\(/g) ?? []).length === 4)
check("and every row of the phone menu", (phone.match(/if \(isPlainClick\(e\.nativeEvent\)\) onNavigate\?\.\(/g) ?? []).length === 4)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
