/**
 * Continue with Google in the apps: the phone's own sheet where the build has
 * one, the Safari sheet otherwise, the same on login and on signup.
 *
 *   npx tsx tests/native-google-sign-in.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { hasNativeGoogle, isCancelled } from "@/lib/auth/native-sign-in"
import { oauthQueryFor } from "@/lib/auth/google-oauth-params"
import { syncSessionHref } from "@/lib/auth/native-session"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const oauthQueryForApple = () => oauthQueryFor("apple")
const sign = read("lib/auth/native-sign-in.ts")
const login = read("app/(storelib)/(auth)/login/page.tsx")
const signup = read("app/(storelib)/(auth)/signup/page.tsx")

console.log("\nThe browser opens as a sheet, never a takeover\n")
{
  check("one opener, a card over the app with a white toolbar", /presentationStyle: "popover", toolbarColor: "#ffffff"/.test(sign) && /export async function openAuthSheet/.test(sign))
  check("  and every sign in on both pages goes through it", (login.match(/await openAuthSheet\(data\.url\)/g) ?? []).length === 2 && (signup.match(/await openAuthSheet\(data\.url\)/g) ?? []).length === 2)
  check("  no page opens the full screen browser of its own any more", !/Browser\.open\(\{ url: data\.url, windowName: "_self" \}\)/.test(login + signup))
}

console.log("\nThe phone's own Google sheet, where the build has one\n")
{
  check("found at runtime, never imported, so a web build carries nothing", /Capacitor\?: \{ Plugins\?: Plugins \}/.test(sign) && !/from "@capgo\/capacitor-social-login"/.test(sign) && !/from "@codetrix-studio/.test(sign))
  check("  the shared cookie one is there too, so iOS can know the person without a Google SDK", /p\.OAuth2Client/.test(sign) && /ASWebAuthenticationSession/.test(sign))
  check("  four plugins are spoken to: Credential Manager's sheet first", /p\.SocialLogin/.test(sign) && /p\.GoogleAuth/.test(sign) && /p\.FirebaseAuthentication/.test(sign) && sign.indexOf("p.SocialLogin") < sign.indexOf("p.GoogleAuth"))
  check("  none in this build: no sheet, said plainly", hasNativeGoogle() === false)
  check("  the token goes straight to Supabase, with no browser and no deep link", /signInWithIdToken\(\{ provider: "google", token \}\)/.test(sign))
  check("backing out is not an error", isCancelled("The user canceled the sign-in flow") && isCancelled("12501") && !isCancelled("network request failed"))
  check("  and a plugin that cannot run falls to the browser sheet instead of failing", /return \{ result: "unavailable", message \}/.test(sign))
}

console.log("\nBoth pages ask for it, and signup no longer signs in inside the WebView\n")
{
  for (const [name, src] of [["login", login], ["signup", signup]] as const) {
    check(`${name}: the native sheet first, then the browser one`, /const sheet = await signInWithNativeGoogle\(supabase\)/.test(src) && /sheet\.result === "done" && sheet\.href/.test(src))
    check(`  ${name}: cancelled leaves the form usable, failed says why`, /sheet\.result === "cancelled"/.test(src) && /sheet\.result === "failed"/.test(src) && /nativeAppReady\(\)/.test(src))
  }
  check("signup opens Google outside the WebView now", /if \(Capacitor\.isNativePlatform\(\)\) \{[\s\S]{0,2000}skipBrowserRedirect: true/.test(signup))
  check("  and only a browser, never the app's own window, is sent to Google", !/window\.location\.href = `\$\{canonicalUrl\}\$\{withCarry\("\/auth\/start\?provider=google"[\s\S]{0,40}\n\s*\}\s*\n\s*if \(Capacitor/.test(signup))
}

console.log("\nGoogle is not asked to forget the person every time\n")
{
  const params = read("lib/auth/google-oauth-params.ts")
  check("nothing extra is asked for, so Google continues with the account it has", /export const GOOGLE_OAUTH_QUERY: Record<string, string> = \{\}/.test(params))
  check("  no sign in anywhere still forces the consent screen", !/access_type: "offline"/.test(login + signup + read("app/(storelib)/auth/start/route.ts") + read("lib/native-bridge.ts")))
  check("  on the web too, through the same one decision", /oauthQueryFor\(provider\)/.test(read("app/(storelib)/auth/start/route.ts")))
  check("  and Apple is still asked for nothing", oauthQueryForApple() === undefined)
}

console.log("\nWhere a person lands is decided once\n")
{
  const session = read("lib/auth/native-session.ts")
  check("one place for the home, the carry and the cookies", /export async function completeNativeSession/.test(session) && /auth\/sync-session/.test(session))
  check("  the deep link uses it too, instead of its own copy", /completeNativeSession\(supabase, \{ \.\.\.data\.session/.test(read("lib/native-oauth.ts")))
  check("  the address carries the tokens and where to go next",
    syncSessionHref({ access_token: "a b", refresh_token: "r" }, "/app?x=1") === "/auth/sync-session?access_token=a%20b&refresh_token=r&next=%2Fapp%3Fx%3D1")
}

console.log("\nThe plugin is in the repository, and so is the one native step\n")
{
  const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> }
  check("@capgo/capacitor-social-login is a dependency, so a sync wires it in", !!pkg.dependencies?.["@capgo/capacitor-social-login"])
  const setup = read("scripts/native-google-setup.mjs")
  check("one command writes the URL scheme Google answers to: the client id, backwards", /iosClientId\.split\("\."\)\.reverse\(\)\.join\("\."\)/.test(setup) && /CFBundleURLSchemes/.test(setup))
  check("  it refuses anything that is not a client id, and says where to find one", /apps\\\.googleusercontent\\\.com\$/.test(setup) && /APIs & Services/.test(setup))
  check("  and says nothing twice", /already lists/.test(setup))
  check("no test client id was left in the app", !/googleusercontent/.test(read("ios/App/App/Info.plist")))
  check("a dismissal is read off the plugin's code, not only its words", /\(err as \{ code\?: unknown \}\)\?\.code/.test(sign) && isCancelled("USER_CANCELLED "))
}

console.log("\nWritten down for the native release\n")
{
  const doc = read("docs/native-google-sign-in.md")
  check("the plugins, the client ids and what Supabase must list", /@capgo\/capacitor-social-login/.test(doc) && /NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID/.test(doc) && /Authorized Client IDs/.test(doc))
  check("  and that both deep links stay, because the browser sheet uses them", /storelib:\/\/auth\/callback/.test(doc) && /com\.storelib\.app:\/\/auth\/callback/.test(doc))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
