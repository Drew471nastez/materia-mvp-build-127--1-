/**
 * Round AG: what the owner asked for after the plans round, checked in one place.
 *
 *   TRIALS     a free trial is none or 7 to 90 days; a plan saved shorter gives 7 everywhere
 *   PREVIEW    the owner's Preview opens the page and the plans as a visitor sees them, buying nothing
 *   PLANS UI   each plan a card with an Edit panel; a new plan takes its trial and benefits at once
 *   ACCOUNTS   admin delete asks "Are you sure?" only; a deleted email can sign up again; no "Former account" members
 *   CREATORS   no language dropdown; More from shows a community once; a failed picture never shows a broken icon
 *   TAX        Settings › Taxes opens on status, tax collected by country, a CSV, and who does what, honestly
 *   EMAILS     /admin/emails: every email Storelib and a business sends, by category, each drawn with sample data
 *   MODULES    a module of a program sold on its own: price, checkout, grant, lessons opened on the server, refunds
 *   EMAILS     Email your members (one a day, members who keep community emails on) and a community's own words on its emails
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
    "app/(storelib)/checkout/page.tsx",
    "lib/memberships/creator.ts",
  ].every((f) => /trialDaysOf\(/.test(code(f))))
  check("no editor offers 3 days", ![("components/community/creator/settings-section.tsx"), "components/memberships/creator-screen.tsx"].some((f) => /\[0, 3, 7/.test(read(f))))
  const sql = read("supabase/migrations/20270201_round_ag.sql")
  check("the SQL moves old trials to 7 and checks 0 or 7 to 90", /SET trial_days = 7/.test(sql) && /CHECK \(trial_days = 0 OR trial_days BETWEEN 7 AND 90\)/.test(sql))

  console.log("\nPreview")
  const page = code("app/(storelib)/(marketing)/community/[slug]/page.tsx")
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
  const actions = code("app/(storelib)/admin/_console/actions.tsx")
  check("admin delete needs no typed user id, just the dialog", !/confirmId/.test(actions) && /Are you sure\?/.test(read("app/(storelib)/admin/_console/actions.tsx")) && /confirm: action\.userId/.test(actions))
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
  const explorePage = code("app/(storelib)/(marketing)/explore/page.tsx")
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
  /* Changed on purpose (round 27, the owner): the floating offer card is gone from the creator page too. */
  check("no language dropdown on a creator page, and no offer card either", !/<select/.test(lang) && !/<LanguageSuggest/.test(lang))
  const more = code("lib/commerce/product-page-cache.ts")
  check("More from: plain products without a community's plans, and each community once", /excludingCommunityProducts\(/.test(more) && /if \(exclude\) q = q\.is\("community_id", null\)/.test(more) && /from\("communities"\)/.test(more) && /title: c\.name \|\| pick\.title/.test(more))
  const { IMAGE_FALLBACK_SCRIPT } = await import("@/lib/media/image-fallback")
  check("a failed picture: the original, then this host's /media/, then hidden", /\/_next\/image\?/.test(IMAGE_FALLBACK_SCRIPT) && /location\.origin\+u\.pathname/.test(IMAGE_FALLBACK_SCRIPT) && /data-img-broken/.test(IMAGE_FALLBACK_SCRIPT) && /data-img-retry/.test(IMAGE_FALLBACK_SCRIPT))
  check("  in <head> on every page, and hidden pictures leave no icon", /__html: IMAGE_FALLBACK_SCRIPT/.test(read("app/(storelib)/layout.tsx")) && /img\[data-img-broken\] \{\s*visibility: hidden !important;/.test(read("app/globals.css")))
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
  check("the figures are read from what each order recorded, by the store", /scopedOrders\(admin, columns, scope, creatorId, null\)\.gt\("tax_cents", 0\)/.test(report))
  const panel = read("components/app/settings/taxes-panel.tsx")
  check("the panel opens on the overview: status, total, countries, CSV, who does what", /* Changed on purpose (round AH, the owner: simpler): the status sits in the Tax card, what was collected at the foot. */ /<TaxStatus overview=\{overview\.data\} \/>/.test(panel) && /<TaxOverview currency=\{currency\} overview=\{overview\} \/>/.test(panel) && ["data-tax-status", "data-tax-total", "data-tax-countries", "data-tax-csv", "data-tax-responsibility"].every((a) => panel.includes(a)))
  check("never claims Storelib files or pays tax", /does not file or pay tax for you/.test(panel) && !/(we|Storelib) (file|files|remit|remits) (your|the) tax/i.test(panel + report))

  console.log("\nEvery email")
  {
    const { emailGallery, renderGalleryEmail } = await import("@/lib/admin/email-gallery")
    const { NOTIFICATION_TYPES } = await import("@/lib/notify/types")
    const all = emailGallery()
    check("every notification type is in the catalog", NOTIFICATION_TYPES.every((t) => all.some((e) => e.id === `notify:${t}`)))
    check("sign in codes, password reset and the deletion code are there", ["auth:verify", "auth:reset", "auth:new-email", "auth:delete"].every((id) => all.some((e) => e.id === id)))
    check("business emails are their own section, with the website sign in code", all.filter((e) => e.section === "business").length >= 15 && all.some((e) => e.id === "business:site-code"))
    check("every email has a category", all.every((e) => e.category && e.name))
    const broken = all.filter((e) => {
      try {
        const m = renderGalleryEmail(e.id)
        return !m || !m.subject || !m.html || m.html.length < 200 || /undefined|NaN|\[object/.test(m.subject)
      } catch {
        return true
      }
    }).map((e) => e.id)
    check(`all ${all.length} are drawn with sample data`, broken.length === 0, broken)
    check("an id it does not know draws nothing", renderGalleryEmail("notify:NOPE") === null && renderGalleryEmail("nope") === null)
    const route = code("app/api/admin/emails/route.ts")
    check("the admin cookie comes first; the page too", /const denied = await requireAdmin\(\)\s*if \(denied\) return denied/.test(route) && /isAdminAuthenticated\(\)/.test(code("app/(storelib)/admin/emails/page.tsx")))
    check("the preview frame runs nothing", /sandbox=""/.test(read("app/(storelib)/admin/emails/emails-admin.tsx")))
    check("the console links to it", /href: "\/admin\/emails"/.test(read("app/(storelib)/admin/_console/shell.tsx")))
  }

  console.log("\nModule sales")
  {
    const ms = await import("@/lib/communities/server/module-sales")
    check("a price is $1 to $10,000, or none", ms.modulePriceInput("19") === 1900 && ms.modulePriceInput("") === null && ms.modulePriceInput(0) === null && Number.isNaN(ms.modulePriceInput("0.5") as number) && Number.isNaN(ms.modulePriceInput("20000") as number))
    const params = ms.moduleCheckoutParams({
      module: { id: "m1", title: "Mixing", priceCents: 1900 },
      program: { id: "p1", title: "Production", coverUrl: null },
      community: { id: "c1", name: "Makers", slug: "makers" },
      buyer: { userId: "u1", email: null },
      creatorId: "cr1",
      destination: "acct_1",
      currency: "usd",
      fee: { platformFeeCents: 190, feePercent: 10, feeFixedCents: 0, planId: "free" },
    })
    check("the session is the creator's money, Storelib's fee kept, marked a module", params.payment_intent_data?.transfer_data?.destination === "acct_1" && params.payment_intent_data?.application_fee_amount === 190 && params.metadata?.kind === "community_module" && params.metadata?.community_module_id === "m1" && params.line_items?.[0]?.price_data?.unit_amount === 1900)
    check("only its own sessions are taken for a module", ms.isModuleSession({ metadata: params.metadata as never }) && !ms.isModuleSession({ metadata: { kind: "community_program" } as never }))
    const server = code("lib/courses/server.ts")
    check("a bought module opens its lessons on the server", /ownedModules\(db, userId, \[mod\.id\]\)\)\.has\(mod\.id\)\) access = "owner"/.test(server))
    const load = code("lib/courses/load.ts")
    check("the player opens only the bought modules' lessons (and previews)", /partly \? !openModules\.has\(m\.id\) && !l\.isPreview/.test(load))
    check("the locked page plays bought modules; the rest show their price", /openModulesFor\(db, viewer\.userId, row\)/.test(code("lib/communities/server/places.ts")) && /data-module-for-sale/.test(read("components/community/learn/program-page.tsx")))
    check("checkout, confirm, webhook and refunds know a module", /startModuleCheckout/.test(code("app/api/community/[communityId]/learn/[programId]/checkout/route.ts")) && /confirmModuleCheckout/.test(code("app/api/community/[communityId]/learn/[programId]/checkout/confirm/route.ts")) && /kind === "community_module"/.test(code("app/api/stripe/webhook/route.ts")) && /revokeRefundedModule/.test(code("app/api/stripe/webhook/route.ts")))
    check("the editor prices a module only in a community's program", /moduleSales \/>/.test(read("components/community/learn/program-editor.tsx")) && /Modules are sold on their own only in a community's programs/.test(code("lib/courses/manage.ts")))
    const agSql = read("supabase/migrations/20270201_round_ag.sql")
    check("the SQL: a price column and a server only table", /course_modules ADD COLUMN IF NOT EXISTS price_cents/.test(agSql) && /CREATE TABLE IF NOT EXISTS public\.community_module_access/.test(agSql) && /community_module_access ENABLE ROW LEVEL SECURITY/.test(agSql))
  }

  console.log("\nMember emails")
  {
    const b = await import("@/lib/communities/server/broadcasts")
    const ok = b.broadcastInput({ subject: "  New lessons  ", message: "Line one.\r\n\r\n\r\n\r\nLine two is here." })
    check("a broadcast needs a subject and a few words, and keeps its paragraphs", "subject" in ok && ok.subject === "New lessons" && ok.message === "Line one.\n\nLine two is here." && "error" in b.broadcastInput({ subject: "Hi", message: "Long enough message" }) && "error" in b.broadcastInput({ subject: "Hello there", message: "short" }) && "error" in b.broadcastInput({ subject: "Hello there", message: "x".repeat(4001) }))
    const now = Date.parse("2026-10-17T12:00:00Z")
    check("one email a day per community", b.nextBroadcastAt("2026-10-17T02:00:00Z", now) === "2026-10-18T02:00:00.000Z" && b.nextBroadcastAt("2026-10-16T11:00:00Z", now) === null && b.nextBroadcastAt(null, now) === null)
    const { renderEmail } = await import("@/lib/notify/templates")
    const { emailAllowed, emailClass } = await import("@/lib/notify/email-budget")
    const base = { communityName: "Makers Club", communitySlug: "makers", creatorName: "Ana Lopez" }
    const e = renderEmail("COMMUNITY_BROADCAST", { ...base, subject: "New lessons are up", message: "First paragraph here.\n\nSecond paragraph here.", authorName: "Ana Lopez" }, { baseUrl: "https://storelib.com" })
    check("the broadcast is the owner's subject and paragraphs, with why it came", e.subject === "New lessons are up" && /First paragraph here\.<\/p>/.test(e.html) && /Second paragraph here\./.test(e.html) && /You get emails from this community because you are a member of Makers Club/.test(e.text) && /storelib\.com\/community\/makers/.test(e.html))
    check("a broadcast is optional email: counted against each member's daily cap", emailAllowed("COMMUNITY_BROADCAST") && emailClass("COMMUNITY_BROADCAST") === "budgeted" && /"community\.broadcast": "COMMUNITY_BROADCAST"/.test(read("lib/notify/workflows/communities.ts")))
    const emailSrc = code("lib/communities/server/email.ts")
    check("only active members who keep community emails on get it", /broadcast: "email_announcements"/.test(emailSrc))
    check("the job pages members and keys each email per member", /reason === "broadcast"/.test(code("lib/communities/server/jobs/fanout_announcement.ts")) && /key: `broadcast:\$\{broadcastId\}`/.test(code("lib/communities/server/broadcasts.ts")) && /\.eq\("email_announcements", true\)/.test(code("lib/communities/server/broadcasts.ts")))
    const w = renderEmail("COMMUNITY_WELCOME", { ...base, tplSubject: "You made it into {community}", tplIntro: "So glad you are here. {creator}" }, { baseUrl: "https://storelib.com" })
    const plain = renderEmail("COMMUNITY_WELCOME", base, { baseUrl: "https://storelib.com" })
    check("a community's own words change the subject and open the email; the button stays", w.subject === "You made it into Makers Club" && /So glad you are here\. Ana Lopez/.test(w.text) && /Open the community/.test(w.html) && plain.subject === "Welcome to Makers Club")
    /* Changed on purpose (round AE2): a ticket email takes the community's words too; what was paid stays in the facts. */
    const tickets = renderEmail("COMMUNITY_EVENT_TICKET", { ...base, tplSubject: "Changed", eventTitle: "Live Q&A", amountCents: 1500, currency: "eur" }, { baseUrl: "https://storelib.com" })
    check("a ticket email takes the community's words, and still says what was paid", tickets.subject === "Changed" && /Paid: €15\.00/.test(tickets.text))
    const t = await import("@/lib/communities/server/email-templates")
    check("the words are checked: too long is refused, empty keeps Storelib's", "error" in t.wordsInput({ subject: "x".repeat(121) }) && t.emptyWords(t.wordsInput({ subject: "", heading: "" }) as never) && t.isEditableEmail("event_ticket") && !t.isEditableEmail("announcement"))
    check("sendCommunityEmail puts the community's words in the event", /wordsPayload\(await emailWordsFor\(db, input\.communityId, kind\)\)/.test(emailSrc))
    const panel = read("components/community/creator/settings-section.tsx")
    /* Changed on purpose: member emails are managed in Emails › Customer emails › Communities with the store's other emails; the community's old settings link opens them there (still the owner and admins: every route keeps the settings permission). */
    check("Member emails are in Emails, and the old settings link goes there", !/value: "emails"/.test(panel) && /if \(emailsTabAsked\(query\.tab\)\) redirect\(communityEmailsHref\(ctx\.community\.id\)\)/.test(read("app/(storelib)/app/community/[id]/settings/page.tsx")) && /CommunityEmails/.test(read("components/app/settings/customer-emails-panel.tsx")))
    const routes = ["app/api/app/community/[id]/emails/route.ts", "app/api/app/community/[id]/emails/templates/route.ts", "app/api/app/community/[id]/emails/preview/route.ts"].map((f) => code(f))
    check("every member emails route needs the settings permission", routes.every((r) => /requireCreatorCommunity\(id, "manage_settings"\)/.test(r)))
    /* Changed on purpose: drawn in the shared preview frame (components/app/emails/email-parts.tsx), sandboxed, no scripts. */
    check("the preview draws in a sandboxed frame", /sandbox="allow-same-origin"/.test(read("components/app/emails/email-parts.tsx")) && /PreviewFrame/.test(read("components/app/emails/community-emails.tsx")))
    const agSql = read("supabase/migrations/20270201_round_ag.sql")
    check("the SQL: broadcasts and templates, server only", /CREATE TABLE IF NOT EXISTS public\.community_broadcasts/.test(agSql) && /CREATE TABLE IF NOT EXISTS public\.community_email_templates/.test(agSql) && /community_broadcasts ENABLE ROW LEVEL SECURITY/.test(agSql) && /community_email_templates ENABLE ROW LEVEL SECURITY/.test(agSql))
  }

  console.log("\nCopy")
  const mine = ["components/community/creator/settings-section.tsx", "lib/memberships/plan.ts", "supabase/migrations/20270201_round_ag.sql", "lib/account/delete-account.ts", "app/(storelib)/admin/_console/actions.tsx", "components/notifications/web-push-prompt.tsx", "lib/explore/discover-mode-cookie.ts", "lib/communities/client/place-cache.ts", "lib/media/image-fallback.ts", "components/storefront/creator-language.tsx", "lib/tax/report.ts", "lib/tax/report-model.ts", "lib/communities/server/module-sales.ts", "lib/communities/server/broadcasts.ts", "lib/communities/server/email-templates.ts", "components/app/emails/community-emails.tsx"]
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
