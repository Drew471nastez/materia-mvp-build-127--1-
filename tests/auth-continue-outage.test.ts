/**
 * ===========================================================================
 *  /auth/continue DURING AN AUTH OUTAGE SENDS A SIGNED IN PERSON ON
 * ===========================================================================
 * Round rel-security (F8). The route asked Supabase Auth with no fallback, so
 * while Auth was down every sign in, OAuth return and receipt "continue"
 * ended on the login form. It now checks the access token's signature as the
 * other request helpers do; tests/net-resilience.test.ts runs that fallback
 * itself (Auth not answering, a valid signature: signed in by the claims; an
 * expired session: still anonymous).
 */
import { readCode } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}`)
  }
}

const cont = readCode("app/auth/continue/route.ts")
check("/auth/continue reads the user with the token signature fallback", /readCurrentUser\(supabase, \{ fallbackClaims: process\.env\.NEXT_PUBLIC_SUPABASE_URL \?\? null \}\)/.test(cont))
check("  the same fallback request-scope and route-user use", /fallbackClaims/.test(readCode("lib/auth/request-scope.ts")) && /* Round 49: route-user reads through request-scope */ /readerForRequest\(\)/.test(readCode("lib/auth/route-user.ts")))
check("  signed out still goes to login", /if \(!user\) return go\(withCarry\("\/login", carry\)\)/.test(cont))
const attach = readCode("lib/orders/attach-guest-orders.ts")
check("  a guest order attach asks Auth itself, so a claims-only sign in attaches nothing", /authUserById\(admin as never, userId\)/.test(attach) && /if \(!\(await provenAccount\(admin, user\.id, email\)\)\) return \{ attached: \[\] \}/.test(attach))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
