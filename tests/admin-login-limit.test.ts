/**
 * ===========================================================================
 *  THE ADMIN LOGIN IS LIMITED, AND SAYS SO WHEN IT RUNS ON ITS FALLBACK
 * ===========================================================================
 * Round rel-security (F2). The owner's decision that a fallback credential
 * lives in the route stands (tests/admin-auth.test.ts holds it). What this
 * adds: a per address limit before any comparison, and a loud log line while
 * the environment variables that replace the fallback are unset.
 */
import { readCode } from "./_source"
import { ADMIN_LOGIN_LIMITS, adminCredentialWarnings } from "@/lib/admin/login-guard"

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

const route = readCode("app/api/admin/blog/auth/route.ts")
const post = route.slice(route.indexOf("export async function POST"))

check("the login is rate limited per caller address", /bucket: "admin-login"/.test(post) && /subjects: \[addressSubject\(req\)\]/.test(post) && /if \(limited\) return limited/.test(post))
check("  before the credential is compared", post.indexOf("if (limited) return limited") > 0 && post.indexOf("if (limited) return limited") < post.indexOf("sameSecret("))
check("  a guesser gets few tries, the owner never meets it", ADMIN_LOGIN_LIMITS[0].limit <= 10 && ADMIN_LOGIN_LIMITS[0].seconds >= 300 && ADMIN_LOGIN_LIMITS[1].limit <= 50 && ADMIN_LOGIN_LIMITS[1].limit >= 20)
check("the fallback is warned about when the variables are unset", adminCredentialWarnings({}).length === 2)
check("  and only the missing one", adminCredentialWarnings({ BLOG_ADMIN_USER: "u", BLOG_ADMIN_PASSWORD: "p" }).length === 1 && adminCredentialWarnings({ BLOG_ADMIN_USER: "u", BLOG_ADMIN_PASSWORD: "p", BLOG_ADMIN_SECRET: "s" }).length === 0)
check("  the warning never prints a credential", !adminCredentialWarnings({}).some((l) => /process\.env|"[^"]{6,}"/.test(l)))
check("  it is logged with console.error, once per instance", /if \(!warned\) \{\s*warned = true\s*for \(const line of adminCredentialWarnings\(\)\) console\.error/.test(post))
check("the owner's fallback behaviour is untouched (the environment still wins)", /process\.env\.BLOG_ADMIN_USER \|\| "/.test(route) && /process\.env\.BLOG_ADMIN_PASSWORD \|\| "/.test(route))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
