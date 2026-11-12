/**
 * ===========================================================================
 *  A WEBSITE'S ADDRESS, APART FROM ITS CREATOR'S USERNAME
 * ===========================================================================
 * "Don't you think it's better to let users change that without changing
 * their Storelib username?" A website has a name of its own now, starting as
 * the username. Held here: what a name may be, that the site answers to it
 * (and to the one before), that its canonical address uses it, that only the
 * signed-in creator changes their own, and that a new username cannot take a
 * website's name. Measured in check-website-settings.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { RESERVED_HANDLES, effectiveHandle, handleProblem, normalizeHandle } from "@/lib/website-builder/site-address"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nWhat a name may be")
check("typed, it becomes a name: lower case, spaces to hyphens, the host part only",
  normalizeHandle("  Astrid Studio ") === "astrid-studio" && normalizeHandle("https://Astrid.storelib.com/about") === "astrid" && normalizeHandle("a__b--c!") === "a-b-c")
check("between 3 and 40 letters, numbers and hyphens, not starting or ending with one",
  handleProblem("ab") !== null && handleProblem("a".repeat(41)) !== null && handleProblem("-astrid") !== null && handleProblem("astrid-") !== null && handleProblem("astrid-studio") === null)
check("and never one of Storelib's own", ["www", "app", "api", "admin", "mcp", "storelib"].every((n) => RESERVED_HANDLES.has(n) && handleProblem(n) !== null))
check("with none chosen, the website is at its creator's username", effectiveHandle(null, "Astrid") === "astrid" && effectiveHandle("studio", "astrid") === "studio")

console.log("\nWhere it is used")
const published = read("lib/website-builder/published-site.ts")
check("a website answers to its name, asked after usernames and creator names so a username always keeps its own", /const byHandle = await creatorIdByHandle\(lower, admin\)/.test(published) && published.indexOf('.eq("slug", lower)') < published.indexOf("creatorIdByHandle(lower"))
const data = read("lib/website-builder/site-address-data.ts")
check("and to a name it had before, so links already given out arrive", /website_address_history/.test(data) && /creatorIdByHandle/.test(data))
check("every read fails soft, so a site stays at its username until the table exists", (data.match(/catch \{/g) ?? []).length >= 2)
check("its canonical address and sitemap use the name", /\$\{\(handle \?\? name\)\.toLowerCase\(\)\}\.\$\{getMainDomain\(\)\}/.test(read("lib/website-builder/site-seo-data.ts")))
const route = read("app/api/website-address/route.ts")
/* Changed on purpose (rel2-auth): still Supabase Auth itself, through routeUser({ fresh: true }), so a slow Auth is 503 and not 401. */
check("only the signed-in creator changes their own, found from the session", /await routeUser\(\{ fresh: true \}\)/.test(route) && /\.eq\("user_id", user\.id\)/.test(route) && !/creator_id: body|creatorId: body/.test(route))
check("the name is checked as the page checks it, then checked free", /handleProblem\(wanted\)/.test(route) && /handleTakenFor\(wanted, me\.creatorId, admin\)/.test(route) && /error\.code === "23505"/.test(route))
check("the name it had keeps answering, and the live site is refreshed", /website_address_history"\)\.upsert/.test(route) && /revalidatePublishedSite\(me\.creatorId\)/.test(route))
const sql = read("supabase/migrations/20260926_website_addresses.sql")
check("the table is readable only by its owner and written only by the server", /enable row level security/.test(sql) && /to authenticated/.test(sql) && /revoke insert, update, delete on public\.website_addresses from anon, authenticated/.test(sql))
check("and a new username cannot take a website's name", /website_handle_taken/.test(sql) && /rpc\("website_handle_taken", \{ p_handle: cleanUsername \}\)/.test(read("components/app/settings-form-new.tsx")))
const domains = read("components/website-builder/website-settings/domains.tsx")
check("Website Settings changes it in Domains, where the address is", /function StorelibAddress/.test(domains) && /fetch\("\/api\/website-address"/.test(domains) && /ctx\.onAddressChanged\(d\.handle\)/.test(domains))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
