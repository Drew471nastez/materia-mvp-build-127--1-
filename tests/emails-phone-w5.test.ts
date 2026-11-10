/**
 * ===========================================================================
 *  EMAILS' NAVIGATION: ONE QUIET LEVEL, ON A PHONE AND A COMPUTER
 * ===========================================================================
 * Changed on purpose (wave 6). Wave 5 gave a phone one long row of seven
 * pill views (All, Sent, Scheduled, Drafts, Automations, Customer emails,
 * Delivery) and kept a computer's pill track of three tabs with a second
 * row of pills under it. The owner: "too many pill-shaped selectors, before
 * it looked better". Now, the same on both:
 *
 *   1. No pill track and no second row of pills: Emails draws no
 *      SegmentedPills or FilterPills of its own.
 *   2. The list bar every Storelib list wears (LIST_BAR); All, Sent,
 *      Scheduled and Drafts are the list card's quiet tabs, as Orders' and
 *      Coupons' views, with Templates at the toolbar's end. Not hidden on
 *      either width.
 *   3. Changed on purpose (wave 7). Wave 6 drew Campaigns with Automations
 *      and a Settings button beside the title, and Automations and Settings
 *      as pages under it with a back arrow, Settings holding Delivery and
 *      Customer emails as a second row of tabs. The owner: Customer emails,
 *      Delivery and the settings must be easier to reach. Now one row of
 *      four places under the title, Emails: Campaigns, Automations,
 *      Customer emails and Settings (Delivery), words with a hairline under
 *      the chosen one (an integration's page tabs), so they read as a level
 *      above the list's views and never as pills. The title is Emails on
 *      every place, no back arrow; leaving Campaigns is still pushed and
 *      Campaigns pops it.
 *      Changed on purpose (wave 8, the owner: "make sure it's like how it
 *      was before, with the pill shape, Storelib UI, inherited; and make it
 *      smooth and clean"). The four places are Storelib's shared pill track
 *      again (components/app/segmented-pills, the control Emails drew
 *      before wave 6), one row, each place still a real link. On a phone
 *      the whole track scrolls from edge to edge, as Settings' pill row
 *      does. All, Sent, Scheduled and Drafts stay the card's quiet tabs.
 *   4. Every place stays reachable and every address still lands
 *      (?tab=, &show=, &section=).
 *   5. A thumb's 44px on a phone.
 *   6. No new words without their six translations.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { emailsAddress, viewOf } from "@/app/(storelib)/app/emails/emails-route"

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
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "")

const home = code(read("app/(storelib)/app/emails/emails-home.tsx"))
const client = code(read("app/(storelib)/app/emails/emails-client.tsx"))
const pills = code(read("components/app/segmented-pills.tsx"))

/* ─── 1. No pills ───────────────────────────────────────────────────── */
/* Changed on purpose (wave 8): one pill track, the places'; still no pill filter row and no phone row of seven views. */
check("Emails draws one pill track (the places) and no pill filter row", (home.match(/<SegmentedPills/g) ?? []).length === 1 && !/FilterPills|PHONE_VIEWS|data-email-views-phone/.test(home))
check("and the client no phone-only row of views", !/setView|onView=/.test(client))

/* ─── 2. Campaigns, the page ────────────────────────────────────────── */
check("the bar is the list bar every Storelib list wears", /<PaneBar width=\{LIST_WIDTH\} className=\{LIST_BAR\}>/.test(home))
check("the views are quiet tabs (Orders' and Coupons' classes), a tablist", /role="tablist"[\s\S]*?role="tab"/.test(home) && /on \? "bg-\[#eceef1\] text-\[#1a1a2e\]" : "text-\[#4b5563\] hover:bg-\[#f4f5f7\]"/.test(home))
const toolbar = /data-campaign-filter="">([\s\S]*?)data-email-templates=""/.exec(home)?.[1] ?? ""
check("All, Sent, Scheduled and Drafts are the list card's toolbar, with Templates at its end", /<Views[\s\S]*?options=\{SHOW_LABELS\}/.test(toolbar) && /className="flex h-\[52px\] items-center gap-1 border-b border-\[#eef0f2\] px-2 md:h-12" data-campaign-filter=""/.test(home))
check("the toolbar is the same on a phone and a computer", !/max-sm:hidden" data-campaign-filter|sm:hidden" data-campaign-filter/.test(home))
check("Templates opens the layouts, and a picked one starts a new email", /onClick=\{\(\) => setTemplates\(true\)\}/.test(home) && /\/app\/emails\/new\?layout=/.test(home))
const actions = /pageTab === "campaigns" \? \(([\s\S]*?)\) : pageTab === "automations"/.exec(home)?.[1] ?? ""
/* Changed on purpose (wave 7): Automations and Settings left the bar for the row of places; the bar keeps New email. */
check("Campaigns' bar: New email, and no other button", /<Link href="\/app\/emails\/new"[\s\S]*?data-new-email=""/.test(actions) && !/data-emails-automations|data-emails-settings/.test(actions))
check("each place is a real link, so it opens in a new tab too", /href: "\/app\/emails\?tab=automations"/.test(home) && /href: "\/app\/emails\?tab=settings&section=customer"/.test(home) && /href: "\/app\/emails\?tab=settings&section=sending"/.test(home) && /* Changed on purpose (wave 8): the track draws an option with an address as a link, a modified click left to the browser */ /href: p\.href \}\)\)/.test(home) && /const Tag: React\.ElementType = o\.href \? "a" : "button"/.test(pills) && /if \(e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey \|\| e\.button !== 0\) return/.test(pills))

/* ─── 3. Pages under Emails ─────────────────────────────────────────── */
/* Changed on purpose (wave 7): no back arrows and no second row; four places in one row under the title. */
check("the title is Emails on every place, with no back arrow", /<h1 className="min-w-0 truncate text-\[24px\] font-bold text-\[#1a1a2e\] sm:text-\[28px\]">\{tt\("Emails"\)\}<\/h1>/.test(home) && !/data-emails-back|tt\("Email settings"\)/.test(home))
check("the four places, in order: Campaigns, Automations, Customer emails, Settings", /value: "campaigns"[\s\S]*?tt\("Campaigns"\)[\s\S]*?value: "automations"[\s\S]*?tt\("Automations"\)[\s\S]*?value: "customer", tab: "settings", section: "customer"[\s\S]*?tt\("Customer emails"\)[\s\S]*?value: "settings", tab: "settings", section: "sending"[\s\S]*?tt\("Settings"\)/.test(home))
/* Changed on purpose (wave 8, the owner: the pill shape, as before): the row is Storelib's pill track, not words over a hairline. */
check("the row is the shared pill track of the four places, the chosen one selected", /data-emails-nav="">\s*<SegmentedPills[\s\S]*?value=\{place\}[\s\S]*?options=\{PLACES\.map/.test(home) && !/border-b-2/.test(home) && /variant = "track"/.test(pills) && /bg-\[#eceef1\] p-1/.test(pills))
check("Settings has no second row of sections", !/data-settings-sections/.test(home))
check("Automations' bar has Create automation", /pageTab === "automations" \? \(\s*<Link href="\/app\/emails\/flow\/new"[^>]*data-new-automation="">/.test(home))
check("leaving Campaigns is pushed; moving between the others replaces; Campaigns pops it, or puts Campaigns in the address when nothing is behind", /const push = pageTab === "campaigns" && next !== "campaigns"/.test(client) && /placePushed\.current = push \|\| \(placePushed\.current && next !== "campaigns"\)/.test(client) && /writeAddress\(placeAddress\(next, nextSection\), push \? "push" : "replace"\)/.test(client) && /backThen\(\(\) => \{\s*setPageTabState\("campaigns"\)\s*writeAddress\(placeAddress\("campaigns", nextSection\), "replace"\)/.test(client))
check("a filter is replaced, never pushed; a section is a place", /p\.set\("tab", "campaigns"\)[\s\S]*?\}, "replace"\)/.test(client) && /const setSection = \(next: SettingsSection\) => setPlace\("settings", next\)/.test(client))

/* ─── 4. Every address lands ────────────────────────────────────────── */
const at = (q: string) => {
  const a = emailsAddress(new URLSearchParams(q))
  return viewOf(a.tab, a.show, a.section)
}
check("?tab=campaigns&show=drafts is Drafts", at("tab=campaigns&show=drafts") === "drafts")
check("?show=sent alone is Sent", at("show=sent") === "published")
check("?tab=automations is Automations", at("tab=automations") === "flows")
check("?tab=settings is Delivery, &section=customer Customer emails", at("tab=settings") === "platforms" && at("tab=settings&section=customer") === "customer")
check("anything else is Campaigns, All", at("tab=nope") === "all" && at("") === "all")

/* ─── 5. A thumb ────────────────────────────────────────────────────── */
/* Changed on purpose (wave 7): the bar has one button now (was three); each place is 44px tall. */
/* Changed on purpose (wave 8): a place is a 36px pill in the 44px track, and on a phone reaches the track's full 44px. */
check("the bar's button and each place reach 44px on a phone", /const TAP = "relative before:absolute before:-inset-y-1\.5 before:inset-x-0 before:content-\[''\] sm:before:hidden"/.test(home) && (actions.match(/TAP/g) ?? []).length === 1 && /max-sm:\[&>\[role=tab\]\]:before:-inset-y-1/.test(home) && /h-9 px-4 text-\[14px\]/.test(pills))
/* Changed on purpose (wave 10, the owner: "on a phone, the top row of Emails tabs still scrolls sideways"): the track spans the gutter's width and the four places share it (Customer emails says Customers on a phone), so nothing scrolls at 360px or wider; only a longer language's row scrolls, inside the page, with the chosen place kept in view. tests/emails-tabs-w10.test.ts pins the fit. */
check("on a phone the track fits the screen, never the page scrolls, the chosen place kept in view", /className="orders-strip h-11 overflow-x-auto overflow-y-hidden/.test(home) && /max-sm:flex max-sm:w-full max-sm:\[&>\[role=tab\]\]:flex-auto/.test(home) && /const PLACE_CLEAR = 12/.test(home) && /\}, \[place\]\)/.test(home))
check("a view is 36px on a phone, 32px from md up", /inline-flex h-9 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-\[10px\] px-3 text-\[15px\][^"]*md:h-8/.test(home))

/* ─── 6. Words ──────────────────────────────────────────────────────── */
for (const loc of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
  const cat = read(`lib/i18n/catalog/${loc}.ts`)
  check(`${loc}: the navigation's words are translated`, ["Campaigns", "Couldn't load this part.", "Retry", "Automations", "Settings", "New email", "Create automation", "Templates", "All", "Sent", "Scheduled", "Drafts", "Customer emails", "Delivery"].every((w) => cat.includes(`"${w}":`)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
