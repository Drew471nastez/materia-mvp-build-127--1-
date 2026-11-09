/**
 * ===========================================================================
 *  WAVE 5: EMAILS ON A PHONE, AS IT WAS BEFORE ROUND 51
 * ===========================================================================
 * The owner: "the emails on phone / mobile devices as well, make it how it
 * was before, more easy, simple, clean". Before round 51 a phone had the
 * title with Automation and New email beside it, one row of views and the
 * list. Round 51 put three tabs there and a second row under them (All,
 * Sent, Scheduled, Drafts and Templates; Delivery and Customer emails),
 * which on a 390px phone cut Drafts off behind Templates.
 *
 *   1. A phone has one row of views, every view in it, and choosing one
 *      sets the tab and its filter or section together (placeOfView is
 *      viewOf the other way round, for every view).
 *   2. A phone's second rows (Campaigns' filter and Templates, Settings'
 *      sections) are gone from a phone and kept on a computer.
 *   3. A phone has Automation and New email on every view, 44px tall.
 *   4. A computer keeps the three tabs and one main action per tab.
 *   5. Templates stay reachable on a phone: an empty new email offers them.
 *   6. No new words without their six translations.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CAMPAIGN_SHOWS, PAGE_TABS, SETTINGS_SECTIONS, placeOfView, viewOf } from "@/app/(storelib)/app/emails/emails-route"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const home = read("app/(storelib)/app/emails/emails-home.tsx")
const client = read("app/(storelib)/app/emails/emails-client.tsx")
const data = read("app/(storelib)/app/emails/emails-data.ts")

/* ─── 1. One row of views ───────────────────────────────────────────── */
const phoneBlock = /export const PHONE_VIEWS[^=]*= \[([\s\S]*?)\n\]/.exec(home)?.[1] ?? ""
const phoneViews = [...phoneBlock.matchAll(/id: "([a-z]+)"/g)].map((m) => m[1])
const dataViews = [...(/export const TABS: EmailsTab\[\] = \[([^\]]*)\]/.exec(data)?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1])
check("a phone's row lists every view the page reads, in the page's order", phoneViews.length === 7 && JSON.stringify(phoneViews) === JSON.stringify(dataViews), { phoneViews, dataViews })
check("the row starts with the emails (All, Sent, Scheduled, Drafts), then Automations, Customer emails and Delivery", JSON.stringify(phoneViews) === JSON.stringify(["all", "published", "scheduled", "drafts", "flows", "customer", "platforms"]))

/* Every view finds its place and back: placeOfView is viewOf the other way round. */
for (const v of ["all", "published", "scheduled", "drafts", "flows", "customer", "platforms"] as const) {
  const at = placeOfView(v)
  const back = viewOf(at.tab, at.show ?? "all", at.section ?? "sending")
  check(`the view ${v} is the tab ${at.tab}${at.show ? ` showing ${at.show}` : ""}${at.section ? ` at ${at.section}` : ""}, and back`, back === v && PAGE_TABS.includes(at.tab), { at, back })
}
/* And every place a computer can reach is a view on a phone. */
let everyPlace = true
for (const tab of PAGE_TABS) for (const show of CAMPAIGN_SHOWS) for (const section of SETTINGS_SECTIONS) if (!phoneViews.includes(viewOf(tab, show, section))) everyPlace = false
check("every tab, filter and section a computer has is in a phone's row", everyPlace)

check(
  "a view is chosen in one step: the tab, its filter or section, and the address written once",
  /const setView = \(next: EmailsTab\) => \{[\s\S]*?placeOfView\(next\)[\s\S]*?setPageTabState\(at\.tab\)[\s\S]*?writeAddress\(\(p\) => \{[\s\S]*?p\.set\("tab", at\.tab\)[\s\S]*?\}, "replace"\)/.test(client) && /onView=\{setView\}/.test(client),
)
check("the phone's row shows the chosen view at once, ahead of its rows, as the tabs do", /<Tabs tab=\{props\.chosenTab \?\? tab\} onTab=\{\(v\) => props\.onView\?\.\(v\)\} onIntent=\{props\.onViewIntent\} options=\{PHONE_VIEWS\} marker="data-email-views-phone" \/>/.test(home))
check("a phone's row is a phone's only; the three tabs are a computer's only", /<div className="sm:hidden">\s*<Tabs tab=\{props\.chosenTab \?\? tab\}/.test(home) && /<div className="max-sm:hidden">\s*<Tabs tab=\{pageTab\}/.test(home))
check("the row is read ahead when a finger or pointer arrives on a view", /onViewIntent=\{\(v\) => prefetch\(keyFor\(v\), loaderFor\(v\), 30_000\)\}/.test(client))

/* ─── 2. No second row on a phone ───────────────────────────────────── */
check("Campaigns' filter and Templates are a computer's row", /className="mt-4 flex items-center justify-between gap-3 max-sm:hidden" data-campaign-filter=""/.test(home))
check("Settings' sections are a computer's row", /className="mt-4 max-sm:hidden" data-settings-sections=""/.test(home))

/* ─── 3. A phone's two actions ──────────────────────────────────────── */
const phoneActions = /<div className="flex min-w-0 items-center gap-2 sm:hidden" data-phone-actions="">([\s\S]*?)<\/div>/.exec(home)?.[1] ?? ""
check("a phone has Automation and New email on every view, not one per tab", /href="\/app\/emails\/flow\/new"[\s\S]*?data-phone-new-automation=""[\s\S]*?\{tt\("Automation"\)\}/.test(phoneActions) && /href="\/app\/emails\/new"[\s\S]*?data-phone-new-email=""[\s\S]*?\{tt\("New email"\)\}/.test(phoneActions) && !/pageTab ===/.test(phoneActions))
check("both are 44px tall, for a thumb", (phoneActions.match(/"h-11 px-3"/g) ?? []).length === 2)
check("both open as a layer over the list, as a computer's do", (phoneActions.match(/onClick=\{layerLinkClick\(router, "\/app\/emails\/(flow\/)?new"\)\}/g) ?? []).length === 2)

/* ─── 4. A computer as it was ───────────────────────────────────────── */
check("a computer keeps one main action per tab", /<div className="flex min-h-9 min-w-0 items-center gap-2 max-sm:hidden">\s*\{pageTab === "campaigns" \? \(\s*<Link href="\/app\/emails\/new"[^>]*data-new-email=""/.test(home) && /pageTab === "automations" \? \(\s*<Link href="\/app\/emails\/flow\/new"[^>]*data-new-automation=""/.test(home))
check("a computer keeps Templates beside the filter", /data-email-templates=""/.test(home) && /\/app\/emails\/new\?layout=/.test(home))

/* ─── 5. Templates on a phone ───────────────────────────────────────── */
check("an empty new email offers the layouts before anything is written", /\{canStart \? <StarterList onPick=\{chooseLayout\} \/> : null\}/.test(read("components/email/compose/composer.tsx")))

/* ─── 6. Words ──────────────────────────────────────────────────────── */
for (const loc of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
  const cat = read(`lib/i18n/catalog/${loc}.ts`)
  check(`${loc}: the phone's words are translated`, ["Automation", "New email", "All", "Sent", "Scheduled", "Drafts", "Automations", "Customer emails", "Delivery"].every((w) => cat.includes(`"${w}":`)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
