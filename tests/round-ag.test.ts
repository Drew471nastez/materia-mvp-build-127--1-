/**
 * Round AG: what the owner asked for after the plans round, checked in one place.
 *
 *   TRIALS     a free trial is none or 7 to 90 days; a plan saved shorter gives 7 everywhere
 *   PREVIEW    the owner's Preview opens the page and the plans as a visitor sees them, buying nothing
 *   PLANS UI   each plan a card with an Edit panel; a new plan takes its trial and benefits at once
 *   ACCOUNTS   admin delete asks "Are you sure?" only; a deleted email can sign up again; no "Former account" members
 *   CREATORS   no language dropdown; More from shows a community once; a failed picture never shows a broken icon
 *   TAX        Settings › Taxes opens on status, tax collected by country, a CSV, and who does what, honestly
 *   SMALL      Get notified card, a community read that never ends, Explore's mode, the search X, the share bump, the footer
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { checkPlan, LIMITS, TRIAL_CHOICES, trialDaysOf } from "@/lib/memberships/plan"
import { TRIAL_MIN_DAYS } from "@/lib/communities/limits"
import { summarizeTax, taxCsv, taxPeriod } from "@/lib/tax/report-model"
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

  console.log("\nSmall fixes")
  const push = code("components/notifications/web-push-prompt.tsx")
  check("Get notified: bottom right from 1024px, above the tab bar on a phone, a real first notification", /lg:bottom-6 lg:right-6/.test(push) && /--push-bottom/.test(push) && /showNotification\(/.test(push) && /void confirmOn\(communityName\)/.test(push))
  const cache = code("lib/communities/client/place-cache.ts")
  check("a community read gives up after a while and is tried again (no endless spinner after sleep)", /setTimeout\(\(\) => ctrl\?\.abort\(\), PLACE_READ_TIMEOUT_MS\)/.test(cache) && /name === "AbortError"/.test(cache))
  const { retryable, PLACE_READ_TIMEOUT_MS } = await import("@/lib/communities/client/place-cache")
  check("  an abort is retried; the wait is bounded", retryable({ name: "AbortError", message: "The operation was aborted." }) && PLACE_READ_TIMEOUT_MS > 0 && PLACE_READ_TIMEOUT_MS <= 15_000)
  const explorePage = code("app/(marketing)/explore/page.tsx")
  check("Explore opens on products; no lasting cookie decides it", /cookie: null/.test(explorePage) && !/cookies\(\)/.test(explorePage))
  const modeLib = code("lib/explore/discover-mode-cookie.ts")
  check("  the choice lives in this tab only, and the old cookie is cleared", /sessionStorage\.setItem/.test(modeLib) && /max-age=0/.test(modeLib))
  check("  back on /explore in the same tab keeps communities", /readDiscoverModeSession\(\) === "communities"/.test(code("components/explore/explore-page-client.tsx")))
  check("the browser's own X never shows beside a search field's", /input\[type="search"\]::-webkit-search-cancel-button/.test(read("app/globals.css")))
  const share = code("components/product/share-button.tsx")
  check("the share button no longer shrinks under the press (the menu stays put)", !/active:scale/.test(share))
  check("signed out on Explore, the footer's mark goes to storelib.com", /home=\{!signedIn\}/.test(code("components/marketing/conditional-footer.tsx")) && /home \? "\/" : "\/explore"/.test(code("components/storefront/seller-footer.tsx")))

  console.log("\nCreator pages and pictures")
  const lang = code("components/storefront/creator-language.tsx")
  check("no language dropdown on a creator page (the offer card stays)", !/<select/.test(lang) && /<LanguageSuggest/.test(lang))
  const more = code("lib/commerce/product-page-cache.ts")
  check("More from: plain products without a community's plans, and each community once", /excludingCommunityProducts\(/.test(more) && /if \(exclude\) q = q\.is\("community_id", null\)/.test(more) && /from\("communities"\)/.test(more) && /title: c\.name \|\| pick\.title/.test(more))
  const { IMAGE_FALLBACK_SCRIPT } = await import("@/lib/media/image-fallback")
  check("a failed picture: the original, then this host's /media/, then hidden", /\/_next\/image\?/.test(IMAGE_FALLBACK_SCRIPT) && /location\.origin\+u\.pathname/.test(IMAGE_FALLBACK_SCRIPT) && /data-img-broken/.test(IMAGE_FALLBACK_SCRIPT) && /data-img-retry/.test(IMAGE_FALLBACK_SCRIPT))
  check("  in <head> on every page, and hidden pictures leave no icon", /__html: IMAGE_FALLBACK_SCRIPT/.test(read("app/layout.tsx")) && /img\[data-img-broken\] \{\s*visibility: hidden !important;/.test(read("app/globals.css")))
  check("  the script parses", (() => { try { new Function(IMAGE_FALLBACK_SCRIPT); return true } catch { return false } })())
  check("the cleanup also looks for a name with spaces as %20", /replace\(o\.name, ' ', '%20'\)/.test(read("supabase/migrations/20270201_round_ag.sql")))

  console.log("\nTax overview")
  const rows = [
    { id: "o1", tax_cents: 2079, tax_country: "ro", tax_label: "VAT 21%", status: "completed", created_at: "2026-10-01T10:00:00Z" },
    { id: "o2", tax_cents: 1900, tax_country: "DE", tax_label: "VAT 19%", status: "completed", created_at: "2026-10-02T10:00:00Z" },
    { id: "o3", tax_cents: 2079, tax_country: "RO", tax_label: "VAT 21%", status: "completed", created_at: "2026-10-03T10:00:00Z" },
    { id: "o4", tax_cents: 500, tax_country: "RO", tax_label: "VAT", status: "refunded", created_at: "2026-10-04T10:00:00Z" },
    { id: "o5", tax_cents: 0, tax_country: "FR", tax_label: "VAT", status: "completed", created_at: "2026-10-05T10:00:00Z" },
  ]
  const sum = summarizeTax(rows)
  check("collected: kept orders only, refunded and untaxed left out", sum.totalCents === 6058 && sum.orders === 3, sum)
  check("by country, biggest first, the rate taken off the name", sum.byCountry[0].country === "RO" && sum.byCountry[0].taxCents === 4158 && sum.byCountry[0].label === "VAT" && sum.byCountry[1].country === "DE")
  const csv = taxCsv([...rows, { id: "=cmd", tax_cents: 100, tax_country: "US", tax_label: "Sales tax", status: "completed", created_at: "2026-10-06T00:00:00Z" }], "eur")
  check("the CSV has a line per taxed order, in the store's currency, formulas made plain", /Tax \(EUR\)/.test(csv) && csv.trim().split("\n").length === 6 && /"'=cmd"/.test(csv) && /"20\.79"/.test(csv))
  check("periods are 30, 90 or 365 days, else 30", taxPeriod("90") === 90 && taxPeriod("7") === 30 && taxPeriod(null) === 30)
  const report = code("lib/tax/report.ts")
  check("the figures are read from what each order recorded, by the store", /scopedOrders\(admin, COLUMNS, scope, creatorId, null\)\.gt\("tax_cents", 0\)/.test(report))
  const panel = read("components/app/settings/taxes-panel.tsx")
  check("the panel opens on the overview: status, total, countries, CSV, who does what", /<TaxOverview currency=\{currency\} \/>/.test(panel) && ["data-tax-status", "data-tax-total", "data-tax-countries", "data-tax-csv", "data-tax-responsibility"].every((a) => panel.includes(a)))
  check("never claims Storelib files or pays tax", /does not file or pay tax for you/.test(panel) && !/(we|Storelib) (file|files|remit|remits) (your|the) tax/i.test(panel + report))

  console.log("\nCopy")
  const mine = ["components/community/creator/settings-section.tsx", "lib/memberships/plan.ts", "supabase/migrations/20270201_round_ag.sql", "lib/account/delete-account.ts", "app/admin/_console/actions.tsx", "components/notifications/web-push-prompt.tsx", "lib/explore/discover-mode-cookie.ts", "lib/communities/client/place-cache.ts", "lib/media/image-fallback.ts", "components/storefront/creator-language.tsx", "lib/tax/report.ts", "lib/tax/report-model.ts"]
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
