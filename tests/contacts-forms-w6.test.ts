/**
 * ===========================================================================
 *  WAVE 6: CONTACTS AND FORMS, ONE BAR PER SCREEN, IN THE /app PANE
 * ===========================================================================
 * The owner, on a form open in Contacts › Forms: a grey band with "← Forms",
 * then a second header "← Get in touch" with its own back arrow, a narrow
 * column under both, "doesn't match the Storelib UI, isn't glued together".
 * Now every Contacts screen scrolls in the pane every /app list wears (so no
 * bar is a grey band over the shell's white), each screen has one bar and
 * one back arrow, and a form is edited as a coupon or a product is: its name
 * as the title, a sticky Back / ⋯ / Publish bar on a phone, Save draft and
 * Publish in the editors' foot bar on a computer, cards the width of the bar.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

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

const header = read("app/(storelib)/app/contacts/contacts-header.tsx")
const people = read("app/(storelib)/app/contacts/people-client.tsx")
const profile = read("app/(storelib)/app/contacts/[key]/profile-client.tsx")
const page = read("app/(storelib)/app/contacts/forms/page.tsx")
const list = read("app/(storelib)/app/emails/forms/forms-list.tsx")
const panels = read("app/(storelib)/app/emails/forms/form-panels.tsx")
const builder = read("components/forms/forms-manager.tsx")

console.log("\nThe pane every /app list scrolls in")
check("ContactsPane is the Coupons and Orders pane (orders-pane page-scroll, #f8f9fa)", /orders-pane page-scroll h-full overflow-y-auto overflow-x-hidden bg-\[#f8f9fa\]/.test(header))
check("People, a person and every Forms screen sit in it", people.includes("<ContactsPane>") && profile.includes("<ContactsPane>") && (list.match(/<ContactsPane ref=\{paneRef\}/g) ?? []).length >= 5)

console.log("\nOne bar per screen")
check("the Forms page draws no bar of its own: FormsList draws the one each screen has", page.includes("return <FormsList />") && !page.includes("<ContactsHeader"))
check("a form open is FormEditor's own bar only, not under the Forms bar", /if \(selected\) \{[\s\S]*?<ContactsPane ref=\{paneRef\} className="lg:flex lg:flex-col">\s*<FormEditor/.test(list))
check("the inbox and an older website form wear Contacts' bar with a Back to Forms, not a second header", (panels.match(/<ContactsHeader title=/g) ?? []).length === 2 && !/<h2 className="truncate text-\[20px\]/.test(panels))
/* Changed on purpose (wave 7, the owner: "I don't like the page of a form"): the form wears an order's bar on every width, one back arrow up to Forms (asking first when something is unsaved, close()), not a Back pill on a phone and an arrow on a computer. */
check("the form's page has one back arrow, an order's, that asks before leaving changes", (builder.match(/aria-label=\{tt\("Back to forms"\)\}/g) ?? []).length === 1 && /<OrderBarFrame[\s\S]*?onClick=\{\(\) => void close\(\)\}/.test(builder) && !builder.includes("<LeaveButton"))

console.log("\nA form, edited as a coupon or a product")
/* Changed on purpose (wave 7): the title is an order's and a person's (22px on a phone, 20px from sm), with its badge, and its kind and responses under it. */
check("its name is the page's title, with where it stands", /<h1 className="min-w-0 truncate text-\[22px\] font-bold leading-8 text-\[#1a1a2e\] sm:text-\[20px\] sm:leading-7" data-form-title="">/.test(builder) && builder.includes("data-form-subtitle"))
/* Changed on purpose (wave 7): the sticky bar is OrderBarFrame on every width; below lg it carries the ⋯ (Preview, Share, Save draft) and Publish. */
check("below lg the sticky bar holds Back, the ⋯ (Preview, Share, Save draft) and Publish", /<OrderBarFrame/.test(builder) && builder.includes("data-form-actions-more") && builder.includes("const phoneMenu: ActionMenuItem[]") && /<span className="lg:hidden">\s*<PublishButton/.test(builder))
check("from lg Save draft and Publish sit in the editors' foot bar", builder.includes('data-editor-foot=""') && /sticky bottom-0 z-30 mt-auto hidden/.test(builder))
/* Changed on purpose (wave 7): the width is an order's (ORDER_WIDTH, 1040px); the bar is OrderBarFrame at that width, the body and the foot name it. */
check("bar, tabs, cards and foot share one width", (builder.match(/FORM_WIDTH, "app-gutter"/g) ?? []).length === 2 && /const FORM_WIDTH = ORDER_WIDTH/.test(builder))
check("the parts are the editors' cards on the page", /const pageCard = "scroll-mt-4 space-y-4 rounded-2xl/.test(builder) && builder.includes('className={inPage ? pageCard : "space-y-3"}'))

console.log("\nThe Forms list, as Coupons")
check("New form is the bar's action, 44px on a phone", /<ContactsHeader\s+title=\{tt\("Forms"\)\}\s+back\s+actions=/.test(list) && /cn\(buttonAccent, PHONE_ACTION\)\} disabled=\{busy\} data-new-form/.test(list))
check("the kinds are the card's views with counts, not a pill row", list.includes('data-forms-views=""') && !list.includes("FilterPills"))
check("no browser confirm() left in Contacts", !/window\.confirm\(/.test(people + profile))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
