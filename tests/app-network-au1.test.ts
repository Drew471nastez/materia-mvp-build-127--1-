/**
 * ===========================================================================
 *  ROUND AU, TRACK 1: THE PHONE APP ON A BAD NETWORK, AND COMING BACK TO IT
 * ===========================================================================
 * The owner: "more stable ... for bad internet devices ... AFK optimized".
 *
 *   SPLASH    the launch screen always comes down: SPLASH_CAP_MS after the
 *             first page of a document ran whatever it landed on, and at
 *             once on a screen that is final though it is not the page (an
 *             error, the session gate's retry, no connection)
 *   GATE      a start that cannot land says so with Try again: offline, no
 *             hand over is tried and it goes on when the phone is back; the
 *             router's fallback document load waits until the page answered
 *             once; past STALL_MS still on the gate, "Still loading"
 *   OFFLINE   in the app, while the phone says it is offline, a document load
 *             is held back (Android's own error page replaced the app)
 *   RESUME    the read aheads that keep pages warm wait until the app has
 *             settled after coming back, never in the same instant as the
 *             screen's own reads, and never while offline
 *
 * scripts/check-app-network-au1.mjs measures the first three in Chromium.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"
import { armSplashCap, releaseLaunchScreen, resetSplashMemory, splashIsDown, SPLASH_AUTH_CAP_MS, SPLASH_CAP_MS } from "@/lib/native-chrome"
import { holdsBackLoad } from "@/lib/native-offline"
import { afterResume, RESUME_SETTLE_MS } from "@/lib/ui/resume"
import { landInPlace } from "@/lib/native-start-landing"

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

const root = process.cwd()
const GATE = "app/(storelib)/native-start/page.tsx"
type G = Record<string, unknown>
const g = globalThis as unknown as G

/** A window with fake timers and the shell's bridge. */
function fakeWindow(opts: { native?: boolean; auth?: boolean } = {}) {
  const timers: Array<{ at: number; f: () => void; id: number }> = []
  let now = 0
  let id = 0
  const calls: string[] = []
  const win: G = {
    Capacitor: opts.native === false ? undefined : { isNativePlatform: () => true, Plugins: { SplashScreen: { hide: async () => void calls.push("hide") } } },
    StorelibNative: { appReady: () => calls.push("appReady") },
    setTimeout: (f: () => void, ms: number) => {
      timers.push({ at: now + ms, f, id: ++id })
      return id
    },
    clearTimeout: (n: number) => {
      const i = timers.findIndex((t) => t.id === n)
      if (i >= 0) timers.splice(i, 1)
    },
    location: { pathname: "/native-start", replace: (u: string) => calls.push(`replace ${u}`) },
  }
  const store = new Map<string, string>(opts.auth ? [["nativeAuthInProgress", "1"]] : [])
  const advance = async (ms: number) => {
    const end = now + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const t = timers[0]
      if (!t || t.at > end) break
      timers.shift()
      now = t.at
      t.f()
      await Promise.resolve()
    }
    now = end
  }
  return { win, calls, store, advance, nowRef: () => now }
}

async function main() {
  const realDateNow = Date.now

  console.log("\nSPLASH")
  {
    check("the ceiling is 12s, and 20s while a sign in is being finished", SPLASH_CAP_MS === 12_000 && SPLASH_AUTH_CAP_MS === 20_000)
    const f = fakeWindow()
    g.window = f.win
    g.sessionStorage = { getItem: (k: string) => f.store.get(k) ?? null }
    Date.now = () => f.nowRef()
    resetSplashMemory()
    armSplashCap()
    armSplashCap()
    await f.advance(SPLASH_CAP_MS - 1)
    check("nothing comes down before the ceiling", f.calls.length === 0, f.calls)
    await f.advance(1)
    check("at the ceiling both shells' launch screens come down, once", f.calls.filter((c) => c === "hide").length === 1 && f.calls.filter((c) => c === "appReady").length === 1, f.calls)
    check("and the splash is known to be down", splashIsDown())

    const h = fakeWindow({ auth: true })
    g.window = h.win
    g.sessionStorage = { getItem: (k: string) => h.store.get(k) ?? null }
    Date.now = () => h.nowRef()
    resetSplashMemory()
    armSplashCap()
    await h.advance(SPLASH_CAP_MS)
    check("a sign in being finished holds it past 12s", h.calls.length === 0, h.calls)
    await h.advance(SPLASH_AUTH_CAP_MS - SPLASH_CAP_MS)
    check("but not past 20s", h.calls.includes("hide") && h.calls.includes("appReady"), h.calls)

    const landed = fakeWindow()
    g.window = landed.win
    Date.now = () => landed.nowRef()
    resetSplashMemory()
    armSplashCap()
    releaseLaunchScreen()
    const before = landed.calls.length
    await landed.advance(SPLASH_CAP_MS)
    check("a launch screen already down is not asked again at the ceiling", landed.calls.length === before, landed.calls)

    const web = fakeWindow({ native: false })
    g.window = web.win
    resetSplashMemory()
    armSplashCap()
    releaseLaunchScreen()
    await web.advance(SPLASH_CAP_MS * 2)
    check("in a browser nothing is asked of a shell that is not there", web.calls.length === 0, web.calls)
    Date.now = realDateNow

    const chrome = readCode("components/platform/native-chrome.tsx")
    check("the root's NativeChrome arms the ceiling and the offline guard once per document", /useEffect\(\(\) => \{\s*armSplashCap\(\)\s*return armOfflineNavigationGuard\(\)\s*\}, \[\]\)/.test(chrome))
    check("an error screen brings the launch screen down when it is shown", /setPhase\("shown"\)\s*releaseLaunchScreen\(\)/.test(readCode("components/platform/error-screen.tsx")))
    check("the session gate's retry screen brings it down", /if \(!stuck\) return\s*releaseLaunchScreen\(\)/.test(readCode("components/native-auth-gate.tsx")))
    check("the dashboard's no connection screen brings it down", /if \(isOffline\) releaseLaunchScreen\(\)/.test(readCode("components/app/offline-guard.tsx")))
  }

  console.log("\nGATE")
  {
    const gate = readCode(GATE)
    check("every hand over goes through handOver (watched, held while offline)", /landed\.current = true\s*handOver\(target\)/.test(gate) && (gate.match(/landInPlace\(/g) ?? []).length === 1)
    check("offline: no hand over, the screen says so, the launch screen comes down", /if \(deviceOffline\(\)\) \{\s*setTrouble\("offline"\)\s*releaseLaunchScreen\(\)\s*return\s*\}/.test(gate))
    check("back online, the start goes on by itself", /window\.addEventListener\("online", online\)/.test(gate) && /trouble === "offline" && goingTo\.current\) handOver\(goingTo\.current\)/.test(gate))
    check("a stall past STALL_MS (10s) ends on Still loading with the launch screen down", /const STALL_MS = 10_000/.test(gate) && /setTrouble\(deviceOffline\(\) \? "offline" : "slow"\)\s*releaseLaunchScreen\(\)/.test(gate))
    check("the router's fallback document load to the target waits for one answer, and goes ahead only on it", /e\.preventDefault\(\)\s*void reachable\(target\)\.then/.test(gate) && /allowed = url\s*window\.location\.replace\(url\)/.test(gate))
    check("the answer is a HEAD that follows no redirect and gives up after 6s", /method: "HEAD", cache: "no-store", credentials: "same-origin", redirect: "manual"/.test(gate) && /const REACH_MS = 6_000/.test(gate))
    check("Try again hands over again, with the spinner", /setVisit\(true\)\s*if \(goingTo\.current\) handOver\(goingTo\.current\)/.test(gate))
    const gateRaw = readFileSync(join(root, GATE), "utf8")
    check("three words for three causes, all translated", /tt\("No internet connection"\)/.test(gateRaw) && /tt\("Cannot reach Storelib"\)/.test(gateRaw) && /tt\("Still loading"\)/.test(gateRaw) && /tt\("Try again"\)/.test(gateRaw))

    const replaced: string[] = []
    const timers: Array<() => void> = []
    g.window = { location: { pathname: "/native-start", replace: (u: string) => replaced.push(u) }, setTimeout: (f: () => void) => timers.push(f) }
    const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator")
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true })
    landInPlace("/app", { replace: () => {} })
    timers.forEach((f) => f())
    check("the land watch never loads a document while offline", replaced.length === 0, replaced)
    Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true })
    landInPlace("/app", { replace: () => {} })
    timers.slice(1).forEach((f) => f())
    check("online, a stalled start is still loaded as a document", replaced.join() === "/app", replaced)
    if (nav) Object.defineProperty(globalThis, "navigator", nav)
  }

  console.log("\nOFFLINE")
  {
    const load = { cancelable: true, destination: { sameDocument: false, url: "https://storelib.com/help" }, preventDefault() {} }
    check("offline, a document load is held back", holdsBackLoad(load, true))
    check("online, it never is", !holdsBackLoad(load, false))
    check("the router's own move in the page is left alone", !holdsBackLoad({ ...load, destination: { sameDocument: true } }, true))
    check("a hash, a download and a load that cannot be stopped are left alone", !holdsBackLoad({ ...load, hashChange: true }, true) && !holdsBackLoad({ ...load, downloadRequest: "a.pdf" }, true) && !holdsBackLoad({ ...load, cancelable: false }, true))
    const guard = readCode("lib/native-offline.ts")
    check("only in the app, only with the Navigation API", /isNativePlatform\?\.\(\)\) return \(\) => \{\}/.test(guard) && /if \(!nav\?\.addEventListener\) return \(\) => \{\}/.test(guard))
    check("a screen with its own offline state takes the event; otherwise a short note says why", /if \(window\.dispatchEvent\(told\)\) showNote\(\)/.test(guard) && /e\.preventDefault\(\)\s*setIsOffline\(true\)/.test(readCode("components/app/offline-guard.tsx")))
  }

  console.log("\nRESUME")
  {
    check("the read aheads wait 1.5s after the app comes back", RESUME_SETTLE_MS === 1_500)
    const f = fakeWindow()
    let ran = 0
    let shown = "visible"
    let online = true
    g.window = f.win
    g.document = { get visibilityState() { return shown } }
    const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator")
    Object.defineProperty(globalThis, "navigator", { get: () => ({ onLine: online }), configurable: true })
    afterResume(() => ran++)
    await f.advance(RESUME_SETTLE_MS - 1)
    check("nothing is read in the instant the app comes back", ran === 0)
    await f.advance(1)
    check("then it is", ran === 1)
    const stop = afterResume(() => ran++)
    stop()
    await f.advance(RESUME_SETTLE_MS)
    check("a page that went away cancels it", ran === 1)
    afterResume(() => ran++)
    shown = "hidden"
    await f.advance(RESUME_SETTLE_MS)
    check("hidden again before it settled: nothing read", ran === 1)
    shown = "visible"
    online = false
    afterResume(() => ran++)
    await f.advance(RESUME_SETTLE_MS)
    check("offline: nothing read", ran === 1)
    if (nav) Object.defineProperty(globalThis, "navigator", nav)

    check("keepFresh reads after the app settles", /pending = afterResume\(read\)/.test(readCode("components/nav/keep-fresh.ts")))
    check("the bottom bar's pages are warmed again after it settles", /resumed = afterResume\(warm\)/.test(readCode("components/app/sidebar-mobile-nav.tsx")))
    check("and the OnePage editor's", /resumed = afterResume\(warm\)/.test(readCode("components/app/sidebar.tsx")))
  }

  console.log("\nCOPY")
  {
    const DASH = /—/
    const BANNED = /\b(unlock|elevate|seamless|powerful|effortlessly|supercharge|transform)\b/i
    for (const f of [GATE, "lib/native-offline.ts", "lib/ui/resume.ts", "lib/native-chrome.ts", "scripts/check-app-network-au1.mjs", "tests/app-network-au1.test.ts"]) {
      const src = readFileSync(join(root, f), "utf8")
      /* The CSS property transform is not the word. */
      const ours = (f === GATE || f === "lib/native-chrome.ts" ? src.slice(src.search(/ROUND AU/)) : src).replace(/transform: /g, "")
      check(`${f}: no em dash and none of the banned words in this round's text`, !DASH.test(ours.slice(0, 4000)) && !BANNED.test(ours.slice(0, 4000)))
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
