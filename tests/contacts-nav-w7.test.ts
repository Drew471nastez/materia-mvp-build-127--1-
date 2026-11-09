/**
 * ===========================================================================
 *  WAVE 7: CONTACTS AS ONE PRODUCT, AND BACK GOES UP, NEVER ROUND
 * ===========================================================================
 * The owner, after wave 6:
 *   - "forms → website contact form → back → forms → back doesn't take me
 *     back to the whole Contacts": every back arrow inside Forms pushed the
 *     screen above it, so the history grew forms, inbox, forms and the Forms
 *     arrow went back into the inbox. Now each screen has one parent
 *     (forms-route formsParent) and going up is a history back only when the
 *     entry behind is that parent, else a replace.
 *   - a website message "the page is fucked": no gutter, no width, a header
 *     unlike any other, two ways to reply. Now an order's bar and widths, one
 *     reply box, the sender linked to their profile.
 *   - "I don't like the page of a form": now an order's bar, the lists' quiet
 *     tabs, two columns with a summary, responses as a table with person
 *     links and the follow up, insights as stat cells.
 *   - "mix them much better": People rows say who each person is to the
 *     store, and a profile shows the journey from lead to customer.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CONTACTS_PATH, FORMS_HOME, FORMS_PATH, contactsParentHref, formsParent, formsParentHref, routeOf, screenOf, searchOf, upMove } from "@/app/(storelib)/app/emails/forms/forms-route"

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

const F = "aaaaaaaa-1111-4222-8333-444444444444"
const M = "ffffffff-1111-4222-8333-444444444444"
const S = "eeeeeeee-1111-4222-8333-444444444444"
const R = "11111111-aaaa-4222-8333-444444444444"

console.log("\nEvery Contacts screen has one parent")
check("a message → the website contact form's inbox", formsParentHref(routeOf(`?message=${M}`)) === `${FORMS_PATH}?inbox=1`)
check("the inbox → Forms", formsParentHref(routeOf("?inbox=1")) === FORMS_PATH)
check("an older website form → Forms", formsParentHref(routeOf(`?siteform=${S}`)) === FORMS_PATH)
for (const view of ["edit", "responses", "insights", "settings"]) check(`a form on ${view} → Forms`, formsParentHref(routeOf(`?form=${F}&view=${view}`)) === FORMS_PATH)
check("a form with a response open → Forms", formsParentHref(routeOf(`?form=${F}&view=responses&response=${R}`)) === FORMS_PATH)
check("Forms → Contacts (People)", formsParent(FORMS_HOME) === "contacts" && formsParentHref(FORMS_HOME) === CONTACTS_PATH)
check("a person → the People list", contactsParentHref("/app/contacts/u_ana", "") === CONTACTS_PATH)
check("  as it was last shown (view, search, page)", contactsParentHref("/app/contacts/u_ana", "", "filter=leads&q=ana&page=2") === "/app/contacts?filter=leads&q=ana&page=2")
check("a Forms address → its parent through the same map", contactsParentHref(FORMS_PATH, `?message=${M}`) === `${FORMS_PATH}?inbox=1` && contactsParentHref(FORMS_PATH + "/", "") === CONTACTS_PATH)
check("People has no parent in Contacts", contactsParentHref(CONTACTS_PATH, "") === null)
check("anything that is not an id is ignored, never passed on", searchOf(routeOf("?message=nope&form=<x>")) === "" && formsParent(routeOf("?message=nope")) === "contacts")

console.log("\nGoing up is a back only when the parent is behind")
check("pushed from the inbox, a message goes back to it", upMove("?inbox=1", { ...FORMS_HOME, inbox: true }) === "back")
check("pushed from the list, a form goes back to it, whatever tab it is on now", upMove("", FORMS_HOME) === "back" && upMove("?", FORMS_HOME) === "back")
check("a message opened by a link (nothing behind) replaces itself with the inbox", upMove(null, { ...FORMS_HOME, inbox: true }) === "replace" && upMove(undefined, FORMS_HOME) === "replace")
check("the loop the owner hit: with a message behind the inbox, the inbox does not go back into it", upMove(`?message=${M}`, FORMS_HOME) === "replace")
check("a form pushed from another form does not go back to that form as if it were Forms", upMove(`?form=${F}`, FORMS_HOME) === "replace")
check("screens: a form is one screen on every tab", screenOf(routeOf(`?form=${F}&view=insights`)) === screenOf(routeOf(`?form=${F}`)))

const list = read("app/(storelib)/app/emails/forms/forms-list.tsx")
console.log("\nForms walks the map")
check("a push marks the screen it came from in history.state", /window\.history\.pushState\(\{ \.\.\.\(window\.history\.state \?\? \{\}\), \[FORMS_PREV\]: from \}/.test(list))
check("up is a real back to the parent (watched, backThen), else a replace, never a push", /const up = \(\) => \{[\s\S]*?upMove\([\s\S]*?=== "back"\) backThen\(\(\) => go\(parent, false\)\)\s*else go\(parent, false\)/.test(list))
check("every back arrow inside Forms goes up, and nothing pushes the list any more", (list.match(/onBack=\{up\}/g) ?? []).length >= 4 && !/const home = \(\) => go\(\{\}\)/.test(list))
check("deleting a message goes up to the inbox", /writeRows\(\(rows\) => rows\.filter\(\(r\) => r\.id !== id\)\)\s*up\(\)/.test(list))
const header = read("app/(storelib)/app/contacts/contacts-header.tsx")
check("Forms and a person go back to People by history when it is behind, else the list at its last query", /export function backToPeople[\s\S]*?canReturnTo\("\/app\/contacts"\)\) backThen\(\(\) => router\.push\(peopleHref\(\)\)\)\s*else router\.push\(peopleHref\(\)\)/.test(header))
check("the People list notes the query it shows", /notePeopleQuery\(shownQuery\)/.test(read("app/(storelib)/app/contacts/people-client.tsx")))
const tracker = read("components/platform/app-history-tracker.tsx")
check("a pop inside one page is not counted as a return to another (the app's back plan stays true)", /returning\.current = window\.location\.pathname !== lastPath\.current/.test(tracker))

console.log("\nA website message, as an order")
const msg = read("app/(storelib)/app/emails/message-detail.tsx")
check("an order's bar and width, in Contacts' pane (no more content against the sidebar)", /<OrderBarFrame/.test(msg) && /ORDER_WIDTH, GUTTER\)\} data-message-page/.test(msg) && /<ContactsPane ref=\{paneRef\} data-forms-message/.test(list))
check("one way to reply: the box under the conversation, no Reply button in the bar", /data-reply-box=\{message\.id\}/.test(msg) && !/>\s*\{tt\("Reply"\)\}\s*</.test(msg) && (msg.match(/data-reply-send/g) ?? []).length === 1)
check("the sender links to their contact profile (open?from=message checks the store)", /contactOpenHref\("message", m\.id\)/.test(list) && /data-message-contact=""/.test(msg) && /data-view-contact=""/.test(msg))
check("the open route takes a message", /message: "message"/.test(read("app/(storelib)/app/contacts/open/route.ts")))

console.log("\nA form, as an order and a coupon")
const builder = read("components/forms/forms-manager.tsx")
check("an order's bar: one back arrow up to Forms, the name, its kind and responses under it", /<OrderBarFrame[\s\S]*?aria-label=\{tt\("Back to forms"\)\}[\s\S]*?data-form-subtitle/.test(builder))
/* Changed on purpose (wave 8, the owner: "the tab control should be the Storelib pill style, inherit Storelib"): Storelib's segmented pills, the responses still counted. tests/contacts-smooth-w8.test.ts holds the rest. */
check("the tabs are Storelib's segmented pills, with the responses counted", /<SegmentedPills<FormView>/.test(list) && /formatNumber\(selected\.responses \?\? 0\)/.test(list))
check("two columns from lg: the work, and the summary (state, responses, link, where used)", /lg:grid-cols-\[minmax\(0,1fr\)_320px\]/.test(builder) && /function FormSummary\(/.test(builder) && /data-summary-responses/.test(builder))
check("questions wear their number", /data-question-number=""/.test(builder))
const panels = read("app/(storelib)/app/emails/forms/form-panels.tsx")
check("responses: a table with the person linked to their profile", /data-response-person=""/.test(panels) && /contactOpenHref\("form_submission", r\.id\)/.test(panels))
check("  the follow up changes in place (PATCH /api/leads/<id>), a response can be deleted", /method: "PATCH", body: JSON\.stringify\(\{ status \}\)/.test(panels) && /method: "DELETE"/.test(panels) && /data-response-delete/.test(panels))
check("insights: stat cells first", /data-insights-stats=""/.test(panels) && /tt\("Converted"\)/.test(panels))

console.log("\nPeople, mixed")
const people = read("app/(storelib)/app/contacts/people-client.tsx")
const profile = read("app/(storelib)/app/contacts/[key]/profile-client.tsx")
check("a row says who the person is to the store (customer and lead at once)", /function Relationship\(/.test(people) && /\{tt\("Relationship"\)\}/.test(people) && /colSpan=\{5\}/.test(people))
check("a profile shows the journey: first seen, lead, subscriber, customer, member", /export function journeyOf/.test(profile) && /<Journey profile=\{profile\} \/>/.test(profile))
check("a form answer on a profile opens that response", /view=responses&response=\$\{encodeURIComponent\(f\.id\)\}/.test(profile) && /view=responses&response=\$\{encodeURIComponent\(f\.id\)\}/.test(read("lib/contacts/profile-server.ts")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
