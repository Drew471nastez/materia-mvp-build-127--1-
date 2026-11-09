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
 *   2. Campaigns is the page: the list bar every Storelib list wears
 *      (LIST_BAR) with Automations, Settings and New email, as Contacts
 *      carries Forms; All, Sent, Scheduled and Drafts are the list card's
 *      quiet tabs, as Orders' and Coupons' views, with Templates at the
 *      toolbar's end. Not hidden on either width.
 *   3. Automations and Settings are pages under it: one back arrow, their
 *      own title; Settings' Delivery and Customer emails are the same quiet
 *      tabs. Going in is pushed, the arrow pops it.
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

/* ─── 1. No pills ───────────────────────────────────────────────────── */
check("Emails draws no pill track and no pill filter row", !/SegmentedPills|FilterPills|PHONE_VIEWS|data-email-views-phone/.test(home))
check("and the client no phone-only row of views", !/setView|onView=/.test(client))

/* ─── 2. Campaigns, the page ────────────────────────────────────────── */
check("the bar is the list bar every Storelib list wears", /<PaneBar width=\{LIST_WIDTH\} className=\{LIST_BAR\}>/.test(home))
check("the views are quiet tabs (Orders' and Coupons' classes), a tablist", /role="tablist"[\s\S]*?role="tab"/.test(home) && /on \? "bg-\[#eceef1\] text-\[#1a1a2e\]" : "text-\[#4b5563\] hover:bg-\[#f4f5f7\]"/.test(home))
const toolbar = /data-campaign-filter="">([\s\S]*?)data-email-templates=""/.exec(home)?.[1] ?? ""
check("All, Sent, Scheduled and Drafts are the list card's toolbar, with Templates at its end", /<Views[\s\S]*?options=\{SHOW_LABELS\}/.test(toolbar) && /className="flex h-\[52px\] items-center gap-1 border-b border-\[#eef0f2\] px-2 md:h-12" data-campaign-filter=""/.test(home))
check("the toolbar is the same on a phone and a computer", !/max-sm:hidden" data-campaign-filter|sm:hidden" data-campaign-filter/.test(home))
check("Templates opens the layouts, and a picked one starts a new email", /onClick=\{\(\) => setTemplates\(true\)\}/.test(home) && /\/app\/emails\/new\?layout=/.test(home))
const actions = /pageTab === "campaigns" \? \(([\s\S]*?)\) : pageTab === "automations"/.exec(home)?.[1] ?? ""
check("Campaigns' bar: Automations, Settings and New email", /href=\{PLACE_HREF\.automations\}[\s\S]*?data-emails-automations=""/.test(actions) && /href=\{PLACE_HREF\.settings\}[\s\S]*?data-emails-settings=""/.test(actions) && /<Link href="\/app\/emails\/new"[\s\S]*?data-new-email=""/.test(actions))
check("each place's way in is a real link, so it opens in a new tab too", /automations: "\/app\/emails\?tab=automations"/.test(home) && /settings: "\/app\/emails\?tab=settings"/.test(home) && /if \(e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.button !== 0\) return/.test(home))

/* ─── 3. Pages under Emails ─────────────────────────────────────────── */
check("Automations and Settings have one back arrow and their own title", /pageTab !== "campaigns" \? \(\s*<a href=\{PLACE_HREF\.campaigns\}[^>]*aria-label=\{tt\("Back to emails"\)\} data-emails-back="">/.test(home) && /pageTab === "automations" \? tt\("Automations"\) : pageTab === "settings" \? tt\("Email settings"\) : tt\("Emails"\)/.test(home))
check("Automations' bar has Create automation", /pageTab === "automations" \? \(\s*<Link href="\/app\/emails\/flow\/new"[^>]*data-new-automation="">/.test(home))
check("Settings' Delivery and Customer emails are the same quiet tabs", /data-settings-sections="">\s*<Views[^\n]*options=\{SECTION_LABELS\}/.test(home))
check("going in is pushed; the arrow pops it, or puts Campaigns in the address when nothing is behind", /const push = pageTab === "campaigns" && next !== "campaigns"/.test(client) && /writeAddress\(placeAddress\(next\), push \? "push" : "replace"\)/.test(client) && /backThen\(\(\) => \{\s*setPageTabState\("campaigns"\)\s*writeAddress\(placeAddress\("campaigns"\), "replace"\)/.test(client))
check("a filter or a section is replaced, never pushed", /p\.set\("tab", "campaigns"\)[\s\S]*?\}, "replace"\)/.test(client) && /p\.set\("tab", "settings"\)[\s\S]*?\}, "replace"\)/.test(client))

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
check("the bar's buttons reach 44px on a phone", /const TAP = "relative before:absolute before:-inset-y-1\.5 before:inset-x-0 before:content-\[''\] sm:before:hidden"/.test(home) && (actions.match(/TAP/g) ?? []).length === 3)
check("a view is 36px on a phone, 32px from md up", /inline-flex h-9 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-\[10px\] px-3 text-\[15px\][^"]*md:h-8/.test(home))

/* ─── 6. Words ──────────────────────────────────────────────────────── */
for (const loc of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
  const cat = read(`lib/i18n/catalog/${loc}.ts`)
  check(`${loc}: the navigation's words are translated`, ["Email settings", "Back to emails", "Automations", "Settings", "New email", "Create automation", "Templates", "All", "Sent", "Scheduled", "Drafts", "Customer emails", "Delivery"].every((w) => cat.includes(`"${w}":`)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
