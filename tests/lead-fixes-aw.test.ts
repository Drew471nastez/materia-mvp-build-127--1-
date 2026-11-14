/**
 * Round AW, the lead's own five fixes (beside tracks A to F):
 *   1. SQL part 460: a OnePage address can never be another account's name, whoever writes it.
 *   2. A banned store takes no new payments: checkout's one gate asks the ban.
 *   3. A products count that got no answer does not say noindex on a creator page.
 *   4. A handle rename clears what the CDN kept for the old address and the new one.
 *   5. SQL part 461: a course is not deleted with the public key.
 * Parts 460 and 461 were also run twice on the production-shaped database (scripts/sql-harness)
 * and the attacks tried before and after them; this suite pins their text and wiring.
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const raw = (p: string) => readFileSync(p, "utf8")

console.log("\n1. A OnePage address is never somebody else's name (part 460)")
{
  const part = raw("supabase/sql/run-now/460_onepage_address_not_anothers.sql")
  check("the migration copy is the same text", part === raw("supabase/migrations/20271460_onepage_address_not_anothers.sql"))
  check("only browser keys are checked (the server's route checks its own writes)", /IF current_user NOT IN \('authenticated', 'anon'\) THEN RETURN NEW; END IF;/.test(part))
  check("an unchanged address is never checked, so older pages still save", /IF TG_OP = 'UPDATE' AND lower\(coalesce\(NEW\.slug, ''\)\) = lower\(coalesce\(OLD\.slug, ''\)\) THEN RETURN NEW; END IF;/.test(part))
  check("another page's address in any case, or another account's username in any case, is taken", /lower\(o\.slug\) = lower\(btrim\(p_slug\)\) AND \(p_page IS NULL OR o\.id <> p_page\)/.test(part) && /lower\(p\.username\) = lower\(btrim\(p_slug\)\) AND \(p_owner IS NULL OR p\.id <> p_owner\)/.test(part))
  check("refused with the unique violation the route already answers as taken", /USING ERRCODE = '23505'/.test(part) && /if \(\(error as \{ code\?: string \}\)\.code === "23505"\) return refuse\(TAKEN\)/.test(readCode("app/api/onepage/route.ts")))
  check("on writes that set or change the address only", /CREATE TRIGGER onepages_address_not_anothers BEFORE INSERT OR UPDATE OF slug ON public\.onepages/.test(part))
  check("guarded, idempotent, and changes no row", /RAISE NOTICE 'part 460:/.test(part) && /DROP TRIGGER IF EXISTS onepages_address_not_anothers/.test(part) && !/\b(DELETE FROM|TRUNCATE|DROP TABLE|UPDATE public\.)/i.test(part))
  check("in the README, the check after and the bundles", raw("supabase/sql/run-now/README.md").includes("460_onepage_address_not_anothers.sql") && raw("supabase/sql/run-now/99_check_after.sql").includes("as p460_onepage_address_not_anothers") && raw("supabase/sql/run-four/3_of_4_latest.sql").includes("onepages_address_not_anothers"))
}

console.log("\n2. A banned store takes no new payments")
{
  const service = readCode("lib/payments/service.ts")
  const gate = service.slice(service.indexOf("export async function checkoutReadyForCreator"), service.indexOf("export async function hadAirwallexAccount"))
  check("checkout's one gate asks the ban beside Stripe's row", /creatorIsBanned\(creatorId\)\.catch\(\(\) => false\)/.test(gate) && /readCreatorStripe\(creatorId\)\]\)/.test(gate))
  check("a banned store is not ready", /if \(banned\) return false/.test(gate))
  check("a ban read that fails is not a ban (a database blip never closes a store)", /\.catch\(\(\) => false\)/.test(gate))
  for (const [file, label] of [
    ["app/api/checkout/stripe-session/route.ts", "one product"],
    ["app/api/checkout/cart/route.ts", "a basket"],
    ["app/api/checkout/site/route.ts", "a website basket"],
    ["app/api/onepage/tip/route.ts", "a tip"],
    ["app/api/memberships/checkout/route.ts", "a membership"],
  ] as const) {
    check(`  ${label} asks that gate`, /checkoutReadyForCreator\(/.test(readCode(file)))
  }
  check("  nothing that completes a paid order asks it (paid orders are fulfilled as before)", !/checkoutReadyForCreator/.test(readCode("lib/checkout/fulfil-payment.ts")) && !/checkoutReadyForCreator/.test(readCode("lib/checkout/fulfil-cart-session.ts")))
}

console.log("\n3. A products count that got no answer does not say noindex")
{
  const page = readCode("app/(storelib)/(marketing)/u/[username]/page.tsx")
  check("the head's read says when the count itself failed", /countFailed: publishedProducts\.failed/.test(page))
  check("an unread count is taken as one for this answer, an answered count as it is", /const publishedProducts = countReadFailed \? Math\.max\(countedProducts, 1\) : countedProducts/.test(page))
  check("the handle and spam rules and the ban still decide", /creatorIndexable\(\{ publishedProducts, handle, spamState \}\) && !isBanned\(creator\)/.test(page))
  check("a failed search text read alone does not change the count", !/countFailed: !!override\.error/.test(page))
}

console.log("\n4. A handle rename clears the old address and the new one")
{
  const route = readCode("app/api/account/profile-changed/route.ts")
  check("the route takes the old handle", /typeof body\.previousHandle === "string"/.test(route))
  check("  and clears it only when this account gave it up (username_history), so nobody purges another store", /\.from\("username_history"\)[\s\S]{0,80}\.eq\("user_id", user\.id\)[\s\S]{0,120}\.ilike\("old_username", exactIlike\(/.test(route) && /if \(old\) \{\s*await creatorPagesChanged\(\{ userId: user\.id, handles: \[old\] \}\)\s*await onePageChangedFor\(user\.id, \[old\]\)/.test(route))
  check("  the new handle's addresses are cleared by identityChanged as before", /identityChanged\(\{ userId: user\.id, creatorId: followed\.creatorId \}\)/.test(route))
  const form = readCode("components/app/settings-form-new.tsx")
  /* Changed on purpose (round AX): the rename runs on the server, which answers the old handle (previous); Settings sends that. */
  check("Settings calls it on a rename too, not only on a new display name", /if \(nameChanged \|\| previousHandle\)/.test(form) && /\.\.\.\(previousHandle \? \{ previousHandle \} : \{\}\)/.test(form) && /previousHandle = moved\.previous \|\| null/.test(form))
  check("  and still sends the old display name only when it changed", /\.\.\.\(nameChanged \? \{ previousName \} : \{\}\)/.test(form))
}

console.log("\n5. A course is not deleted with the public key (part 461)")
{
  const part = raw("supabase/sql/run-now/461_course_deletes_through_the_server.sql")
  check("the migration copy is the same text", part === raw("supabase/migrations/20271461_course_deletes_through_the_server.sql"))
  check("DELETE and TRUNCATE taken from the browser keys only", /REVOKE DELETE, TRUNCATE ON public\.courses FROM PUBLIC, anon, authenticated/.test(part) && !/service_role/.test(part.split("\n").slice(1).join("\n")))
  check("guarded and changes no row", /RAISE NOTICE 'part 461:/.test(part) && !/\b(DELETE FROM|TRUNCATE public|DROP TABLE|UPDATE public\.)/i.test(part))
  check("every course delete the app makes is on the server key", /const db = createAdminClient\(\)/.test(readCode("app/api/courses/manage/route.ts")) && /deleteProgram\(gate\.ctx\.admin,/.test(readCode("app/api/app/community/[id]/learn/[programId]/route.ts")))
  check("no browser code deletes a course row", !/from\("courses"\)[^;]*\.delete\(\)/.test(readCode("components/app/course-builder.tsx")))
  check("in the README, the check after and the bundles", raw("supabase/sql/run-now/README.md").includes("461_course_deletes_through_the_server.sql") && raw("supabase/sql/run-now/99_check_after.sql").includes("as p461_course_deletes_through_the_server") && raw("supabase/sql/run-four/3_of_4_latest.sql").includes("REVOKE DELETE, TRUNCATE ON public.courses"))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
