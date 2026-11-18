/**
 * Log out leaves nothing of the account on the device, Continue with Google
 * asks which account, the arrival note stands over the phone's bar, and the
 * way from a sign in into /app is one white screen that fades.
 *
 *   npx tsx tests/sign-out-and-arrival.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { isAccountKey, NATIVE_HOME_KEY } from "@/lib/auth/forget-device-sign-in"
import { endDeviceSession } from "@/lib/auth/log-out"
import { oauthQueryFor } from "@/lib/auth/google-oauth-params"
import { arrivalBottom, ARRIVAL_MOVE_MS } from "@/lib/auth/arrival"
import { NATIVE_CARRY_KEY } from "@/lib/auth/continue"
import { APP_FROM_DARK_BOOT, APP_FROM_DARK_CLASS, APP_FROM_SIGN_IN_CLASS, FROM_SIGN_IN_KEY, FROM_SIGN_IN_MAX_AGE_MS } from "@/lib/appearance/site-appearance"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  console.log("\nGoogle asks which account\n")
  check("web and the app's browser sheet: prompt=select_account", oauthQueryFor("google")?.prompt === "select_account")
  check("  never consent or offline access", !/consent|offline/.test(JSON.stringify(oauthQueryFor("google"))))
  check("  Apple gets nothing of Google's", oauthQueryFor("apple") === undefined)

  console.log("\nThe account's own keys, and only those\n")
  for (const k of ["sb-abcd-auth-token", "sb-abcd-auth-token.0", "sb-abcd-auth-token.12", "sb-abcd-auth-token-code-verifier", "sb-abcd-auth-token-user", NATIVE_HOME_KEY, NATIVE_CARRY_KEY]) check(`forgets ${k}`, isAccountKey(k))
  for (const k of ["storelib_feed_view", "storelib:look-now", "_sl_avatar_x", "sb-abcd-auth-tokenx", "my-sb-abcd-auth-token", "storelib_tz"]) check(`keeps ${k}`, !isAccountKey(k))

  console.log("\nEvery Log out forgets the device's copy\n")
  {
    let forgot = 0
    const forget = async () => { forgot++ }
    const ok = (async () => new Response(JSON.stringify({ ok: true, auth: true }), { status: 200 })) as unknown as typeof fetch
    const down = (async () => { throw new TypeError("fetch failed") }) as unknown as typeof fetch
    const fails = { signOut: async () => ({ error: new Error("500") }) }
    await endDeviceSession("local", { signOut: async () => ({ error: null }) }, ok, forget)
    check("this device, when it worked", forgot === 1)
    await endDeviceSession("local", fails, down, forget)
    check("  this device, even when nothing could be reached (the Preferences copy would sign them back in)", forgot === 2)
    const r503 = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch
    await endDeviceSession("global", fails, r503, forget)
    check("  everywhere that did not happen keeps it, so they can ask again", forgot === 2)
    await endDeviceSession("global", { signOut: async () => ({ error: null }) }, ok, forget)
    check("  everywhere that did", forgot === 3)
    const res = await endDeviceSession("local", { signOut: async () => ({ error: null }) }, ok, async () => { throw new Error("plugin") })
    check("  a forgetting that throws never fails the Log out", res.ended === true)
  }
  {
    const bridge = read("lib/native-bridge.ts")
    check("the native shell's Log out and nativeLogout forget too", (bridge.match(/forgetDevice\(\)/g) ?? []).length >= 2)
    const sign = read("lib/auth/native-sign-in.ts")
    check("the phone's Google sheet is signed out (SocialLogin, GoogleAuth, Firebase)", /social\.logout\(\{ provider: "google" \}\)/.test(sign) && /(?:gauth|googlePlugin)\.signOut\(\)/.test(sign) && /fb\.signOut\(\)/.test(sign))
    for (const f of ["components/marketing/user-nav.tsx", "components/marketing/user-nav-client.tsx", "components/dashboard/sidebar.tsx"])
      check(`${f} logs out through the shared helper`, /await endDeviceSession\("local", createClient\(\)\.auth\)/.test(read(f)) && !/supabase\.auth\.signOut\(/.test(read(f)))
    check("the server's Log out expires an unfinished OAuth carry", /jar\.set\(CARRY_COOKIE, "", \{ path: "\/", maxAge: 0 \}\)/.test(read("app/api/auth/logout/route.ts")))
    check("nothing logs a token", !/console\.(log|warn|error)/.test(read("lib/auth/forget-device-sign-in.ts")))
  }

  console.log("\nThe arrival note stands over the phone's bar\n")
  check("over /app's pill, by the pill's own measured top", arrivalBottom("app") === "calc(var(--app-nav-top, env(safe-area-inset-bottom, 0px)) + 16px)")
  const other = arrivalBottom("other")
  check("  elsewhere over the home indicator, the buyer's bar and a community's join bar", /env\(safe-area-inset-bottom, 0px\) \+ 16px/.test(other) && /var\(--buyer-tabs-h, 0px\) \+ 12px/.test(other) && /var\(--community-fixed-foot-h, 0px\) \+ 12px/.test(other) && other.startsWith("max("))
  check("  --app-nav-top includes the safe area (app/globals.css)", /--app-nav-lift: max\(4px, env\(safe-area-inset-bottom, 0px\)\);\s*--app-nav-top: calc\(var\(--app-nav-bar\) \+ var\(--app-nav-lift\)\);/.test(read("app/globals.css")))
  const note = read("components/auth/arrival-note.tsx")
  check("  comes and goes on opacity and translate, about a quarter second, still under reduced motion", ARRIVAL_MOVE_MS >= 200 && ARRIVAL_MOVE_MS <= 300 && /transition-\[opacity,translate\]/.test(note) && /motion-reduce:transition-none/.test(note))
  check("  painted hidden first, shown a frame later", /raf = requestAnimationFrame\(\(\) => setShown\(true\)\)/.test(note))

  console.log("\nFrom a sign in into /app: one white screen that fades\n")
  const veil = (path: string, store: Record<string, string>) => {
    const classes = new Set<string>()
    const g = globalThis as unknown as Record<string, unknown>
    const before = { sessionStorage: g.sessionStorage, location: g.location, document: g.document, setTimeout: g.setTimeout }
    g.sessionStorage = { getItem: (k: string) => store[k] ?? null, removeItem: (k: string) => { delete store[k] } }
    g.location = { pathname: path }
    g.document = { documentElement: { classList: { add: (...c: string[]) => c.forEach((x) => classes.add(x)), remove: () => {}, contains: (c: string) => classes.has(c) } } }
    g.setTimeout = () => 0
    try { new Function(APP_FROM_DARK_BOOT)() } finally { Object.assign(g, before) }
    return { veiled: classes.has(APP_FROM_DARK_CLASS), white: classes.has(APP_FROM_SIGN_IN_CLASS), store }
  }
  const now = String(Date.now())
  const a = veil("/app", { [FROM_SIGN_IN_KEY]: now })
  check("an /app document after a sign in opens under the white veil", a.veiled && a.white)
  check("  and the mark is read once", !(FROM_SIGN_IN_KEY in a.store))
  const b = veil("/app/auth/callback", { [FROM_SIGN_IN_KEY]: now })
  check("  the app's own callback step leaves it for the page after", !b.veiled && FROM_SIGN_IN_KEY in b.store)
  const c = veil("/library", { [FROM_SIGN_IN_KEY]: now })
  check("  another landing page uses it up without a veil", !c.veiled && !(FROM_SIGN_IN_KEY in c.store))
  const d = veil("/app", { [FROM_SIGN_IN_KEY]: String(Date.now() - FROM_SIGN_IN_MAX_AGE_MS - 1000) })
  check("  an abandoned sign in never veils a later visit", !d.veiled)
  const e = veil("/app", { "storelib:look-now": "dark" })
  check("  after a dark page it is still the header's colour", e.veiled && !e.white)
  const css = read("app/globals.css")
  check("  the white veil is the sign in screen's white and fades like the dark one", /html\.app-from-dark\.app-from-sign-in::after \{\s*background-color: #ffffff;/.test(css))
  check("  the shell's reveal takes the white class off too", /APP_FROM_DARK_OUT_CLASS, APP_FROM_SIGN_IN_CLASS\)/.test(read("lib/appearance/client.ts")))
  const screen = read("components/auth/auth-resolving-screen.tsx")
  check("the sign in screen marks the hand off, only on a sign in page", /SIGN_IN_PAGE\.test\(window\.location\.pathname\)\) window\.sessionStorage\.setItem\(FROM_SIGN_IN_KEY/.test(screen))
  check("  its spinner is /app's, at /app's 40%, and fades in only after the wait", /<ActivitySpinner \/>/.test(screen) && /grid-rows-\[2fr_auto_3fr\]/.test(screen) && /animationDelay: `\$\{SPINNER_WAIT_MS\}ms`/.test(screen) && !/animate-spin/.test(screen))
  check("  /auth/complete is the same screen", /<AuthResolvingScreen message=\{status\} \/>/.test(read("app/(storelib)/auth/complete/page.tsx")))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}
void main()
