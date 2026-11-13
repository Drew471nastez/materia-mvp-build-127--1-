/**
 * ===========================================================================
 *  ROUND AT, TRACK 3: OPENING THE PHONE APP
 * ===========================================================================
 * The owner: "when I open the app, it loads and it takes me much more faster
 * inside of the app without extra loading."
 *
 * The iOS and Android apps are shells that load storelib.com/native-start
 * (capacitor.config.ts server.url). This pins the launch path:
 *
 *   HOPS     the shell opens the gate itself (no HTTP redirect to reach it),
 *            and the gate reaches the page in one hop in the same document
 *            (router.replace), never a second document
 *   LOADERS  one launch screen and nothing under it: the gate draws no
 *            spinner on a start, Android's overlay is not dropped on the
 *            gate, iOS's launch screen comes down on every /app page (it
 *            stayed up on any /app page but the home), and no route exists
 *            just to show a loader
 *   SPEED    nobody signed in goes to /welcome without downloading the
 *            Supabase client first; the launch screen comes down two frames
 *            after the page draws, through the plugin the shell injects,
 *            with no 400 ms wait and no chunk fetched for it
 *   AUTH     the shortcut is taken only on proof of no session (not on
 *            "could not tell"), after a recovery link was looked for; the
 *            server still guards /app; the launch screen comes down only
 *            once the session gate has let the page draw
 *
 * scripts/check-app-launch-at3.mjs measures the launch in Chromium.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode, readSource } from "./_source"
import { landInPlace, landsAsDocument } from "@/lib/native-start-landing"
import { hideSplashOnce, resetSplashMemory, shouldHideSplashOn, SPLASH_FADE_MS } from "@/lib/native-chrome"
import { hasStoredSessionToken } from "@/lib/auth/session-read"
import { startTarget } from "@/lib/native-resume"

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
const gate = readCode(GATE)
const gateSrc = readSource(GATE)
const bridge = readCode("app/NativeOAuthBridge.tsx")
const authGate = readCode("components/native-auth-gate.tsx")
const splashHook = readCode("hooks/use-hide-native-splash.ts")
const proxy = readCode("proxy.ts")
const capConfig = readFileSync(join(root, "capacitor.config.ts"), "utf8")

type Win = Record<string, unknown>
const g = globalThis as unknown as { window?: Win; localStorage?: unknown; document?: unknown }

async function main() {
  console.log("\nHOPS")
  {
    const url = capConfig.match(/^\s*server:\s*\{\s*\n\s*url:\s*'([^']+)'/m)?.[1] ?? ""
    check("the shell opens the gate itself: server.url is https://storelib.com/native-start", url === "https://storelib.com/native-start", url)
    check("the proxy never redirects /native-start (no rule sends it elsewhere)", !/pathname\s*===\s*"\/native-start"[^\n]*NextResponse\.redirect/.test(proxy))
    check("the proxy asks nobody who is signed in for the gate (no auth round trip before the first byte)", /request\.nextUrl\.pathname === "\/native-start" \? \{ user: null, state: "indeterminate", reason: "start gate" \}/.test(proxy))
    check("an old shell opening \"/\" is one redirect to the gate", /isCapacitor &&[\s\S]{0,200}pathname === "\/"[\s\S]{0,200}url\.pathname = "\/native-start"/.test(proxy))

    /* The gate's one hop: a client navigation in the same document. */
    const calls: string[] = []
    const replaced: string[] = []
    const timers: Array<() => void> = []
    g.window = {
      location: { pathname: "/native-start", replace: (u: string) => replaced.push(u) },
      setTimeout: (f: () => void) => {
        timers.push(f)
        return 1
      },
    }
    for (const target of ["/app", "/welcome", "/explore", "/app/products", "/account/library"]) landInPlace(target, { replace: (h: string) => calls.push(h) })
    check("each landing is one router.replace and no document load", calls.length === 5 && replaced.length === 0, { calls, replaced })
    /* The router landed: the watch finds the address moved and loads nothing. */
    ;(g.window.location as { pathname: string }).pathname = "/app"
    timers.forEach((f) => f())
    check("a landing that arrived is not loaded again as a document", replaced.length === 0, replaced)
    check("only the auth route handlers land as a document", landsAsDocument("/auth/callback") && !landsAsDocument("/app") && !landsAsDocument("/welcome"))
    check("signed in, the start goes straight to the home (no middle page)", startTarget({ last: null, home: "/app" }) === "/app" && startTarget({ last: null, home: "/library", exploreOn: false }) === "/account/library")
    check("the gate never hands over to itself or to \"/\" (the loop that kept the launch screen up)", /target === "\/native-start" \|\| target\.startsWith\("\/native-start"\)\) return/.test(gate) && /sanitizeNativeHome\(url\)/.test(gate))
    check("one hand over per visit, even when the effect runs again", /const landed = useRef\(false\)/.test(gate) && /if \(landed\.current\) return/.test(gate) && /landed\.current = true/.test(gate) && !/didRedirect/.test(gate))
    delete g.window
  }

  console.log("\nLOADERS")
  {
    /* Changed on purpose (round AU): the spinner also follows Try again, once the launch screen is down (tests/app-network-au1.test.ts). */
    check("the gate draws its spinner only on a visit, never under the launch screen", /visit \? \(?\s*<div className="ns-spinner"/.test(gate) && /const \[visit, setVisit\] = useState\(false\)/.test(gate) && /if \(!isStart\) setVisit\(true\)/.test(gate))
    /* Changed on purpose (round AU): only on a start that cannot land (offline, unreachable, past STALL_MS), each time with the screen that says so. */
    check("the gate never takes the launch screen down itself on a start that lands", !/hideSplash|SplashScreen|nativeAppReady|appReady/.test(gate) && (gate.match(/releaseLaunchScreen\(\)/g) ?? []).length === (gate.match(/setTrouble\((?:[^()]|\([^()]*\))*\)\s*releaseLaunchScreen\(\)/g) ?? []).length)
    check("Android's overlay is not dropped on the gate", /if \(pathname === "\/native-start"\) return\s*\n?\s*if \(pathname\.startsWith\("\/app"\)/.test(bridge))
    check("iOS's launch screen is left to the landing page on the gate", !shouldHideSplashOn("/native-start", false))
    const ready = authGate.slice(authGate.indexOf("if (blocked || !authChecked) return"))
    check("iOS's launch screen comes down on every /app page, with Android's overlay, once the session gate lets the page draw",
      /import \{ hideSplashOnce(, releaseLaunchScreen)? \} from "@\/lib\/native-chrome"/.test(authGate) && /nativeAppReadyForce\(\)\s*void hideSplashOnce\(\)/.test(ready.slice(0, 600)))
    check("the gate's loading file is a plain ground, no spinner or skeleton", !/spin|Spinner|Skeleton|animate-pulse/i.test(readCode("app/(storelib)/native-start/loading.tsx")))
    /* No route exists just to show a loader between the shell and the app. */
    const dirs: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(join(root, d))) {
        const rel = `${d}/${e}`
        if (statSync(join(root, rel)).isDirectory()) {
          dirs.push(rel)
          walk(rel)
        }
      }
    }
    walk("app")
    const loaderRoutes = dirs.filter((d) => /\/(launch|launching|boot|booting|splash|loader|loading|starting|app-start|start-app)$/.test(d))
    check("no launch, boot, splash or loader route under app/", loaderRoutes.length === 0, loaderRoutes)
    check("one start route, /native-start", existsSync(join(root, "app/(storelib)/native-start/page.tsx")) && dirs.filter((d) => /native-start/.test(d)).length === 1)
  }

  console.log("\nSPEED")
  {
    const layer1b = gate.indexOf("if (!hasStoredSessionToken() && (await preferencesHoldSession()) === false)")
    const layer2 = gate.indexOf('await import("@/lib/supabase/client")')
    check("nobody signed in goes to /welcome before the Supabase client is downloaded", layer1b > 0 && layer1b < layer2 && /=== false\) \{\s*safeRedirect\("\/welcome"\)/.test(gate))
    check("Preferences is read through the shell's injected plugin, not a downloaded chunk", /Capacitor\?\.Plugins\?\.Preferences/.test(gate) && gate.indexOf('import("@capacitor/preferences")') > layer1b)
    check("the splash hook waits no extra 400 ms and goes through the one shared hide", /export function useHideNativeSplash\(delay = 0\)/.test(splashHook) && /hideSplashOnce\(\)/.test(splashHook) && !/@capacitor\/splash-screen/.test(splashHook))
    check("one fade for every landing", SPLASH_FADE_MS === 250)

    /* hideSplashOnce through the injected plugin: once, no chunk. */
    const hides: unknown[] = []
    g.window = { Capacitor: { isNativePlatform: () => true, Plugins: { SplashScreen: { hide: async (o: unknown) => void hides.push(o) } } } }
    resetSplashMemory()
    await hideSplashOnce()
    await hideSplashOnce()
    check("the launch screen is hidden once, through Capacitor.Plugins, with the 250 ms fade", hides.length === 1 && (hides[0] as { fadeOutDuration?: number }).fadeOutDuration === 250, hides)
    g.window = { Capacitor: { isNativePlatform: () => false, Plugins: { SplashScreen: { hide: async (o: unknown) => void hides.push(o) } } } }
    resetSplashMemory()
    await hideSplashOnce()
    check("in a browser nothing is asked of a splash", hides.length === 1)
    delete g.window
  }

  console.log("\nAUTH")
  {
    const recovery = gate.indexOf("getLaunchUrl")
    check("a recovery link is looked for before any shortcut", recovery > 0 && recovery < gate.indexOf("if (!hasStoredSessionToken() &&"))
    check("\"could not tell\" never takes the shortcut (only a strict false from Preferences)", /\(await preferencesHoldSession\(\)\) === false/.test(gate) && /return "unknown"/.test(gate))
    check("a chunked session in Preferences counts as a session", /key: `\$\{key\}\.0`/.test(gate))

    /* hasStoredSessionToken: the proof the shortcut needs, from localStorage or the cookie. */
    const store: Record<string, string> = {}
    g.window = {}
    g.localStorage = { getItem: (k: string) => store[k] ?? null }
    g.document = { cookie: "" }
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcd.supabase.co"
    check("an empty phone holds no session", hasStoredSessionToken() === false)
    store["sb-abcd-auth-token"] = "{}"
    check("a session in localStorage is a session (no shortcut)", hasStoredSessionToken() === true)
    delete store["sb-abcd-auth-token"]
    store["sb-abcd-auth-token.0"] = "{}"
    check("a chunked session in localStorage is a session", hasStoredSessionToken() === true)
    delete store["sb-abcd-auth-token.0"]
    g.document = { cookie: "sb-abcd-auth-token=base64-abc" }
    check("a session cookie is a session", hasStoredSessionToken() === true)
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl
    delete g.window
    delete g.localStorage
    delete g.document

    check("the server still sends a stranger on /app to sign in", /const guarded =\s*\n?\s*request\.nextUrl\.pathname\.startsWith\("\/app"\)/.test(proxy) && /if \(guarded && shouldSendToLogin\(current\)\)/.test(proxy))
    check("the /app layout still renders only its session gate when the server could not tell", /<NativeAuthGate requireAuth loadingFallback=\{<AppColdStart \/>\}>/.test(readCode("app/(storelib)/app/layout.tsx")))
    const guard = authGate.indexOf("if (blocked || !authChecked) return")
    const hides = [...authGate.matchAll(/hideSplashOnce\(\)/g)].map((m) => m.index ?? -1)
    check("the launch screen never comes down while the session gate is still deciding", guard > 0 && hides.length === 1 && hides[0] > guard && hides[0] - guard < 600, { guard, hides })
  }

  console.log("\nCOPY")
  {
    const DASH = new RegExp("\\u2014")
    const BANNED = new RegExp(`\\b(${["un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less(ly)?", "super" + "charge", "trans" + "form"].join("|")})\\b`, "i")
    /* Whole files this round wrote, and this round's notes in files whose older notes are not this round's to rewrite. */
    for (const f of ["hooks/use-hide-native-splash.ts", "scripts/check-app-launch-at3.mjs", "tests/app-launch-at3.test.ts"]) {
      const src = readFileSync(join(root, f), "utf8")
      check(`${f}: no em dash and none of the banned words`, !DASH.test(src) && !BANNED.test(src))
    }
    for (const f of [GATE, "app/NativeOAuthBridge.tsx", "components/native-auth-gate.tsx", "lib/native-chrome.ts"]) {
      const src = readFileSync(join(root, f), "utf8")
      /* From the marker to the end of its comment: the lines that are still comment. */
      const notes = [...src.matchAll(/ROUND AT|Round AT/g)].map((m) => {
        const lines = src.slice(m.index ?? 0).split("\n")
        const kept = [lines[0]]
        for (const line of lines.slice(1)) {
          if (!/^\s*(\/\/|\*|\/\*)|^\s*[A-Za-z(`"'.,:;0-9]/.test(line) || /^\s*(const|let|if|return|import|export|function|async|await|void|useEffect|requestAnimationFrame)\b/.test(line)) break
          kept.push(line)
          if (line.includes("*/")) break
        }
        return kept.join("\n")
      })
      check(`${f}: this round's notes (${notes.length}) have no em dash and none of the banned words`, notes.length > 0 && notes.every((n) => !DASH.test(n) && !BANNED.test(n)))
    }
    check("the gate's notes say why the spinner went", /NO SPINNER UNDER THE LAUNCH SCREEN/.test(gateSrc))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
