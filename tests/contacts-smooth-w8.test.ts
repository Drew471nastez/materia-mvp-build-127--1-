/**
 * ===========================================================================
 *  WAVE 8: CONTACTS SWITCHES WITHOUT A FLASH OR A FADE
 * ===========================================================================
 * The owner, after wave 7:
 *   - a form's Edit / Responses / Insights / Settings "smooth and clean, no
 *     flash, no blank", in Storelib's pill style: SegmentedPills, the chosen
 *     one easing in place; Responses and Insights mounted behind the form
 *     from the moment it opens and kept per form, so a tab is there at once.
 *   - People's All / Leads / Customers / Subscribers / Members "no fade":
 *     the rows on screen stay at full strength until the next ones are here,
 *     read from /api/contacts and kept for the tab, the next views read ahead.
 *   - every kind of form edited in Storelib's own controls: a booking form's
 *     week as switch rows that never cut a time off on a phone, each kind
 *     opening on its own setting.
 *   - a website message's links (the bell, the creator's email) go straight
 *     to its page in Contacts › Forms, and the page is the only one there is.
 * Measured in a browser by frame (the wave's probe); held here by source.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { messageNoticeRow } from "@/lib/site-contact/notify"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const list = read("app/(storelib)/app/emails/forms/forms-list.tsx")
const panels = read("app/(storelib)/app/emails/forms/form-panels.tsx")
const builder = read("components/forms/forms-manager.tsx")
const people = read("app/(storelib)/app/contacts/people-client.tsx")
const msg = read("app/(storelib)/app/emails/message-detail.tsx")

console.log("\nA form's tabs")
check("Storelib's segmented pills, easing in place (no slide past 150ms)", /<SegmentedPills<FormView>[\s\S]{0,120}motion="fade"/.test(list) && /import \{ SegmentedPills \} from "@\/components\/app\/segmented-pills"/.test(list))
check("Responses and Insights are both mounted with the form, the one not shown hidden", /hidden=\{route\.view !== "responses"\}[\s\S]{0,200}<ResponsesPanel/.test(list) && /hidden=\{route\.view !== "insights"\}[\s\S]{0,120}<InsightsPanel/.test(list))
check("  and the form keeps them mounted behind Edit and Settings", /hidden=\{view !== "panel"\}/.test(builder) && /\{panel\}/.test(builder))
check("a form's responses and insights are kept per form and shown first on the next visit", /const responsesKept = new Map/.test(panels) && /const insightsKept = new Map/.test(panels) && /useState<FormInsights \| null>\(\(\) => insightsKept\.get\(formId\)/.test(panels) && /useState\(!kept\)/.test(panels))
check("insights wait behind their own shape, not a list's rows", /function InsightsSkeleton\(/.test(panels) && /if \(!data\) return <InsightsSkeleton \/>/.test(panels))
check("a form opened by its address waits in the form page's shape (its bar, the pills, the cards)", /a form opened by its address[\s\S]{0,400}<OrderBarFrame/.test(list))

console.log("\nPeople's views")
check("no fade on the list while a view is read", !/opacity-60/.test(people) && !/transition-opacity/.test(people))
check("the chosen view is pressed at once", /const active = f === \(wanted \?\? query\)\.filter/.test(people))
check("views are read from /api/contacts, kept for the tab, and shared while on their way", /fetch\(`\/api\/contacts\$\{qs \? `\?\$\{qs\}` : ""\}`/.test(people) && /const peopleCache = new Map/.test(people) && /peopleReads\.get\(qs\)/.test(people))
check("the address follows by replaceState, so a reload and a link read the same list", /window\.history\.replaceState\(window\.history\.state, "", url\)/.test(people))
check("the next views are read ahead (pointer, finger, and once the list has settled)", /onPointerEnter=\{\(\) => readAhead/.test(people) && /onTouchStart=\{\(\) => readAhead/.test(people) && /for \(const f of CONTACT_FILTERS\) if \(f !== query\.filter/.test(people))
check("a failed read falls back to the router", /startTransition\(\(\) => router\.replace\(qs \? `\/app\/contacts\?\$\{qs\}`/.test(people))
check("a change (add, import, bulk) forgets what was kept", /peopleCache\.clear\(\)/.test(people))

console.log("\nEvery kind of form")
check("a booking week: Storelib's switches, no browser checkbox", /data-booking-week=""/.test(builder) && /<Switch checked=\{on\}/.test(builder) && !/type="checkbox"/.test(builder))
check("  a fieldset that can shrink, times that share the row (never cut on a phone)", /<fieldset className="min-w-0">/.test(builder) && /h-10 min-w-0 flex-1/.test(builder))
check("each kind opens on its own setting", /form\.draft\?\.booking \? "bookings" : form\.draft\?\.mode === "quiz" \? "layout"/.test(builder))
check("a choice's words wrap instead of being cut", /const SEGMENT_WRAP = /.test(builder) && (builder.match(/className=\{SEGMENT_WRAP\}/g) ?? []).length === 2)

console.log("\nA website message")
const row = messageNoticeRow({ creatorId: "c", messageId: "5c000000-0000-4000-8000-000000000001", name: "Jo", email: "jo@x.y", subject: "", message: "hi", site: null }, "u")
check("the bell opens the message's page in Contacts › Forms", row.action_url === "/app/contacts/forms?message=5c000000-0000-4000-8000-000000000001")
check("the creator's email links there too", /\/app\/contacts\/forms\?message=\$\{encodeURIComponent\(keptId\)\}/.test(read("lib/site-contact/handle.ts")))
check("one message page in the app, the new one", !/Message from \{who\}/.test(msg) && /data-message-thread=/.test(msg) && (list.match(/<MessagePage/g) ?? []).length === 1)
check("where they wrote from reads as a place, not a path glued to it", /`\$\{m\.site\} · \$\{shown\}`/.test(msg))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
