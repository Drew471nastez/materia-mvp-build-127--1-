/**
 * ===========================================================================
 *  THE STORELIB.COM FOOTER
 * ===========================================================================
 * The layout people know, and nothing in it that pretends:
 *
 *   every link goes somewhere real
 *   the sign-up box stores the address (it used to wait and say thanks)
 *   the route that stores it is limited, validates, never says who is on
 *   the list, and never logs an address
 *   the table can only be touched by the server
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const footer = read("components/marketing/footer.tsx")
const route = read("app/api/newsletter/route.ts")
const sql = read("supabase/sql/RUN_STORELIB_NEWSLETTER.sql")

console.log("\nThe links")
const internal = [...footer.matchAll(/href: "(\/[a-z/-]*)"/g)].map((m) => m[1])
const pageExists = (href: string) => {
  if (href === "/") return true
  const seg = href.slice(1)
  /* Changed on purpose (r52): Storelib's pages are under app/(storelib), the published websites' root is app/(site). */
  return [`app/(storelib)/${seg}/page.tsx`, `app/(storelib)/(marketing)/${seg}/page.tsx`, `app/(storelib)/(auth)/${seg}/page.tsx`, `app/(platform)/${seg}/page.tsx`].some((p) => existsSync(join(process.cwd(), p)))
}
const missing = internal.filter((h) => !pageExists(h))
check("every internal link is a page that exists", internal.length >= 9 && missing.length === 0, missing.join(", "))
check("the affiliate link asks by email instead of opening a page that is not there", /Affiliate Program", href: "mailto:team@storelib\.com/.test(footer))
check("cookie choices can be changed from here", /openCookiePreferences\(\)/.test(footer))

console.log("\nThe sign-up")
check("the box posts to the real route", /fetch\("\/api\/newsletter"/.test(footer))
check("and no longer waits and says thanks", !/setTimeout\(resolve/.test(footer) && !/Simulate/.test(footer))
check("a refusal is shown, not swallowed", /setError\(/.test(footer) && /role="alert"/.test(footer))
check("the route is rate limited by address and by email", /rateLimit\(\{[\s\S]*addressSubject\(req\), emailSubject\(email\)/.test(route))
check("it validates and lowercases", /EMAIL\.test\(email\)/.test(route) && /toLowerCase\(\)/.test(route))
check("signing up twice gives the same answer", /onConflict: "email"/.test(route) && /23505/.test(route))
check("an address is never logged", !/console\.[a-z]+\([^)]*email[^)]*\)/.test(route.replace(/\/\*[\s\S]*?\*\//g, "")))
check("the wording agreed to is kept with the time", /consent_text: CONSENT_TEXT/.test(route) && /created_at\s+timestamptz NOT NULL DEFAULT now\(\)/.test(sql))
check("the table is server only", /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.storelib_newsletter FROM anon, authenticated/.test(sql))
check("and the SQL is the same in both places", sql === read("supabase/migrations/20260924_storelib_newsletter.sql"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
