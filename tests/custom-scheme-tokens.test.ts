/**
 * ===========================================================================
 *  NO LIVE SESSION TOKENS ARE HANDED TO THE storelib:// SCHEME
 * ===========================================================================
 * Round rel2-security2 (SEC-9). Any Android app can declare the `storelib`
 * scheme, so a link on it can be received by an app that is not Storelib.
 * The password reset page's legacy flow sent the recovery session itself
 * there (access_token and refresh_token in the query). It now finishes the
 * reset in the browser.
 *
 * Kept, on purpose, and listed here so a new one is a decision:
 *  - storelib://reset-password?code=...: the app's handler depends on it
 *    (android/app/src/main/AndroidManifest.xml, lib/native-oauth.ts). Its
 *    risk and the App Link alternative are in docs/reliability/SECURITY.md.
 *  - storelib://auth/callback?code=... for OAuth: PKCE, the code is useless
 *    without the verifier kept in the app.
 *  - app/auth/app-callback: nothing links to it (no producer in web or
 *    native code); documented as legacy in SECURITY.md.
 *  - lib/native-oauth.ts keeps a storelib:// string as a sessionStorage
 *    format inside the app, never as a navigation.
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 400)}`}`)
  }
}

const ALLOWED = new Set(["app/auth/app-callback/page.tsx", "lib/native-oauth.ts"])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (f === "node_modules" || f.startsWith(".")) return []
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}

function main() {
  const reset = readCode("app/(auth)/reset-password/page.tsx")
  check("the reset page builds no storelib:// link with access_token or refresh_token", !/storelib:\/\/[^`"']*(access_token|refresh_token)/.test(reset))
  check("  the legacy flow still finishes in the browser", /await establishSessionAndShowForm\(accessToken, refreshToken\)/.test(reset))
  check("  the bridge code handoff is kept (the app depends on it)", /storelib:\/\/reset-password\?code=/.test(reset))

  const offenders: string[] = []
  for (const root of ["app", "lib", "components"]) {
    for (const f of files(root)) {
      if (ALLOWED.has(f)) continue
      if (/storelib:\/\/[^`"'\s]*(access_token|refresh_token)=/.test(readCode(f))) offenders.push(f)
    }
  }
  check("no other code builds a storelib:// address carrying a session token", offenders.length === 0, offenders)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main()
