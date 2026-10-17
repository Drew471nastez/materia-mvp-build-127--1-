/**
 * Round AG: what the owner asked for after the plans round, checked in one place.
 *
 *   TRIALS     a free trial is none or 7 to 90 days; a plan saved shorter gives 7 everywhere
 *   PREVIEW    the owner's Preview opens the page and the plans as a visitor sees them, buying nothing
 *   PLANS UI   each plan a card with an Edit panel; a new plan takes its trial and benefits at once
 *   ACCOUNTS   admin delete asks "Are you sure?" only; a deleted email can sign up again; no "Former account" members
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { checkPlan, LIMITS, TRIAL_CHOICES, trialDaysOf } from "@/lib/memberships/plan"
import { TRIAL_MIN_DAYS } from "@/lib/communities/limits"
import { untt } from "./i18n-source"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

async function main() {
  console.log("\nTrials")
  check("the minimum is 7 days, in both places it is read", LIMITS.trialMin === 7 && TRIAL_MIN_DAYS === 7)
  check("the choices are none, 7, 14 and 30", JSON.stringify(TRIAL_CHOICES) === "[0,7,14,30]")
  check("an old 3 day trial gives 7; none stays none; over 90 is 90", trialDaysOf(3) === 7 && trialDaysOf(0) === 0 && trialDaysOf(null) === 0 && trialDaysOf(14) === 14 && trialDaysOf(400) === 90)
  const three = checkPlan({ monthlyPriceCents: 900, trialDays: 3 }, { publishing: true })
  check("a membership saved with 3 days is refused", !three.ok && (three as { field: string }).field === "trial")
  check("7 and 0 are fine", checkPlan({ monthlyPriceCents: 900, trialDays: 7 }, { publishing: true }).ok && checkPlan({ monthlyPriceCents: 900, trialDays: 0 }, { publishing: true }).ok)
  const tierRoute = code("app/api/app/community/[id]/tiers/[tierId]/route.ts")
  check("the plan route refuses 1 to 6 days", /days > 0 && days < TRIAL_MIN_DAYS/.test(tierRoute))
  check("the subscription's trial is the corrected one", /trialDaysOf\(plan\.trial_days\)/.test(code("app/api/memberships/checkout/route.ts")))
  check("the page, the picker and the editors read the corrected trial", [
    "lib/communities/server/public.ts",
    "lib/communities/server/tiers.ts",
    "lib/memberships/product-page.ts",
    "app/checkout/page.tsx",
    "lib/memberships/creator.ts",
  ].every((f) => /trialDaysOf\(/.test(code(f))))
  check("no editor offers 3 days", ![("components/community/creator/settings-section.tsx"), "components/memberships/creator-screen.tsx"].some((f) => /\[0, 3, 7/.test(read(f))))
  const sql = read("supabase/migrations/20270201_round_ag.sql")
  check("the SQL moves old trials to 7 and checks 0 or 7 to 90", /SET trial_days = 7/.test(sql) && /CHECK \(trial_days = 0 OR trial_days BETWEEN 7 AND 90\)/.test(sql))

  console.log("\nPreview")
  const page = code("app/(marketing)/community/[slug]/page.tsx")
  check("?preview=plans is for the community's staff, drawn as a visitor sees it", /query\.preview === "plans"/.test(page) && /meetsRole\(load\.viewer\.role, "moderator"\)/.test(page) && /asVisitor: true/.test(page))
  check("it comes before the member's own view of the address", page.indexOf('query.preview === "plans"') < page.indexOf("if (load.viewer.active) {"))
  const pub = code("lib/communities/server/public.ts")
  check("a visitor's join is worked out signed out", /opts\?\.asVisitor\s*\?\s*\{ signedIn: false, active: false/.test(pub))
  const controls = code("components/community/public/join-controls.tsx")
  check("in a preview a pick says what would happen and buys nothing", /if \(preview\) \{\s*setPreviewNote/.test(controls) && /if \(preview\) return void openFlow/.test(controls))
  check("the settings Preview button opens it", /\?preview=plans&join=plans/.test(read("components/community/creator/settings-section.tsx")))

  console.log("\nPlans editor")
  const settings = read("components/community/creator/settings-section.tsx")
  check("a plan is a card with an Edit panel that opens smoothly", /data-tier-card/.test(settings) && /data-tier-edit/.test(settings) && /grid-rows-\[0fr\]/.test(settings))
  check("benefits are rows with Add a benefit, not one textarea", /data-tier-benefit-add/.test(settings) && /Benefit (\{n\}|\$\{i \+ 1\})/.test(settings))
  check("a new plan takes its trial, subheading and benefits", /data-new-tier/.test(settings) && /extra\.trialDays = trial/.test(settings) && /extra\.benefits = lines/.test(settings))

  console.log("\nAccounts")
  const actions = code("app/admin/_console/actions.tsx")
  check("admin delete needs no typed user id, just the dialog", !/confirmId/.test(actions) && /Are you sure\?/.test(read("app/admin/_console/actions.tsx")) && /confirm: action\.userId/.test(actions))
  const del = code("lib/account/delete-account.ts")
  check("a closed account lets go of its other sign in methods", /rpc\("storelib_release_auth_identities"/.test(del))
  check("a full delete that fails still frees the address", /failures\.push\(`sign in account: \$\{error\.message\}`\)\s*const closed = await closeSignIn\(\)/.test(del))
  check("its community rows go (no Former account in members) and paid memberships stop", /from\("community_members"\)\.delete\(\)\.eq\("user_id", userId\)\.neq\("role", "owner"\)/.test(del) && /stripe\.subscriptions\.cancel/.test(del))
  const agSql = read("supabase/migrations/20270201_round_ag.sql")
  check("the SQL makes the function for the server only and frees accounts deleted before", /SECURITY DEFINER SET search_path = ''/.test(agSql) && /GRANT EXECUTE ON FUNCTION public\.storelib_release_auth_identities\(uuid\) TO service_role/.test(agSql) && /DELETE FROM auth\.identities i USING auth\.users u/.test(agSql) && /NOT EXISTS \(SELECT 1 FROM public\.profiles p WHERE p\.id = u\.id\)/.test(agSql))
  check("it only ever releases a closed account", /NOT LIKE 'deleted-%@deleted\.storelib\.invalid' THEN RAISE EXCEPTION/.test(agSql))

  console.log("\nCopy")
  const mine = ["components/community/creator/settings-section.tsx", "lib/memberships/plan.ts", "supabase/migrations/20270201_round_ag.sql", "lib/account/delete-account.ts", "app/admin/_console/actions.tsx"]
  const offenders = mine.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
  check("no em dash and no banned word", offenders.length === 0, offenders)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
