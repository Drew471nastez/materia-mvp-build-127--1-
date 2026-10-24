/**
 * Emails › Customer emails in three families that never mix (Digital
 * products, Physical products, Communities), what was left out of the list
 * and why, and that leaving it out changed nothing that is sent; a
 * community's emails managed in Emails, its old settings links sent there.
 *
 *   npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ALL_EMAILS, COMMUNITY_EMAILS, CUSTOMER_EMAILS, FAMILY_ORDER, LEFT_OUT, emailsOf, findEmail, previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { flowFamilies } from "@/lib/emails/flow-family"
import { emailAllowed } from "@/lib/notify/email-budget"
import { REGISTRY } from "@/lib/notify/registry"
import type { NotificationType } from "@/lib/notify/types"
import { communityEmailsHref, emailsTabAsked, settingsTabOf, SETTINGS_TABS } from "@/components/community/creator/logic"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  console.log("\nThree families that never mix\n")
  check("every email is in exactly one family", ALL_EMAILS.every((e) => FAMILY_ORDER.filter((f) => f === e.family).length === 1))
  const ids = ALL_EMAILS.map((e) => e.id)
  check("  and listed once", new Set(ids).size === ids.length)
  const digital = emailsOf("digital", true).map((e) => e.id)
  const physical = emailsOf("physical", true).map((e) => e.id)
  const communities = emailsOf("communities", true).map((e) => e.id)
  check("Digital products: the receipt, its refund, the checkout reminder", digital.join() === "receipt,digital_refund,checkout_reminder", digital)
  check("Physical products: every order that ships, nothing digital or community", physical.length === 17 && physical.every((id) => !id.startsWith("community_") && id !== "receipt" && id !== "digital_refund"), physical)
  check("Communities: the members' and the ticket emails, nothing of the store's", communities.length === COMMUNITY_EMAILS.length && communities.every((id) => id.startsWith("community_")), communities)
  check("  no family shares an email with another", digital.every((id) => !physical.includes(id) && !communities.includes(id)) && physical.every((id) => !communities.includes(id)))
  check("All is the three together", emailsOf("all", true).length === digital.length + physical.length + communities.length)
  check("physical commerce off: no Physical products at all", emailsOf("physical", false).length === 0 && emailsOf("all", false).every((e) => !e.physical))
  check("a store email is drawn in the browser; a community's is not (its server draws it)", CUSTOMER_EMAILS.every((e) => !!previewCustomerEmail(e.id, { name: "Angus Farm" })) && COMMUNITY_EMAILS.every((e) => previewCustomerEmail(e.id, { name: "Angus Farm" }) === null && !!e.community))
  check("findEmail finds by id across families", findEmail("community_invite")?.family === "communities" && findEmail("refund")?.family === "physical" && findEmail("nope") === null)

  console.log("\nLeft out, and still not sent\n")
  const left = LEFT_OUT.map((l) => l.id)
  check("nothing left out is listed", left.every((id) => !ids.includes(id)), left)
  check("each says why", LEFT_OUT.every((l) => l.why.length > 20))
  for (const l of LEFT_OUT) {
    const type = l.notification as NotificationType
    const neverEmailed = !emailAllowed(type)
    const sentElsewhere = REGISTRY[type]?.emailSentElsewhere === true
    check(`${l.notification}: ${neverEmailed ? "never an email" : sentElsewhere ? "the engine sends nothing, the listed email is the one" : "?"}`, neverEmailed || sentElsewhere || l.notification === "DIGITAL_PRODUCT_ACCESS")
  }
  check("DIGITAL_PRODUCT_ACCESS is planned by no workflow", !/DIGITAL_PRODUCT_ACCESS/.test(read("lib/notify/workflows/customer.ts")) && !/DIGITAL_PRODUCT_ACCESS/.test(read("lib/notify/workflows/products.ts")))
  const announce = read("lib/communities/server/jobs/fanout_announcement.ts")
  const remind = read("lib/communities/server/jobs/event_reminder.ts")
  check("an announcement and an event reminder are emailed only if the budget allows, and it does not", /emailAllowed\("COMMUNITY_ANNOUNCEMENT"\)/.test(announce) && /emailAllowed\("COMMUNITY_EVENT_REMINDER"\)/.test(remind) && !emailAllowed("COMMUNITY_ANNOUNCEMENT") && !emailAllowed("COMMUNITY_EVENT_REMINDER") && !emailAllowed("COMMUNITY_COURSE_AVAILABLE"))
  const t = await import("@/lib/communities/server/email-templates")
  check("a community's words go on the three it really sends, and no more", t.EDITABLE_EMAILS.join() === "welcome,join_approved,invite" && !t.isEditableEmail("announcement") && !t.isEditableEmail("event_reminder") && !t.isEditableEmail("course_available"))
  check("  the listed community emails that take words are exactly those", COMMUNITY_EMAILS.filter((e) => e.editable).map((e) => e.community).join() === t.EDITABLE_EMAILS.join())
  check("  ticket emails preview, never take words", t.PREVIEW_ONLY_EMAILS.every((k) => COMMUNITY_EMAILS.some((e) => e.community === k && !e.editable)) && t.PREVIEW_ONLY_EMAILS.every((k) => !t.isEditableEmail(k)))
  check("  rows saved for the removed ones stay where they are: nothing deletes them", !/announcement|course_available/.test(read("lib/communities/server/email-templates.ts").split("export function wordsInput")[1] ?? ""))
  check("the welcome, an approved request and an invite are still sent, with their words", /sendCommunityEmail\(db, "welcome"/.test(read("lib/communities/server/join.ts")) && /sendCommunityEmail\(db, "join_approved"/.test(read("lib/communities/server/moderation.ts")) && /wordsPayload\(await emailWordsFor\(db, input\.communityId, kind\)\)/.test(read("lib/communities/server/email.ts")))

  console.log("\nAutomations beside their family\n")
  const typeOf = (id: string) => ({ mug: "physical", course: "course", ebook: "digital" } as Record<string, string>)[id]
  check("Leaves checkout goes with the checkout reminder", flowFamilies("abandoned_checkout", [], typeOf, true).join() === "digital")
  check("a purchase of mugs only is Physical", flowFamilies("purchase", ["mug"], typeOf, true).join() === "physical")
  check("a purchase of courses and ebooks is Digital", flowFamilies("purchase", ["course", "ebook"], typeOf, true).join() === "digital")
  check("any product, or some of each, is both", flowFamilies("first_purchase", [], typeOf, true).join() === "digital,physical" && flowFamilies("purchase", ["mug", "ebook"], typeOf, true).join() === "digital,physical")
  check("joining the list is in neither", flowFamilies("new_subscriber", [], typeOf, true).length === 0)
  check("physical off: a mug-only automation is in no family", flowFamilies("purchase", ["mug"], typeOf, false).length === 0)
  const { physicalEmailOf } = await import("@/lib/emails/activity-server")
  check("a shipped order's sent emails are counted under the right one", physicalEmailOf("email_sent:confirmation:abc:", "Order confirmation emailed to the buyer") === "order_confirmation" && physicalEmailOf("email_sent:shipment:f1:out_for_delivery", "Out for delivery email sent to the buyer") === "out_for_delivery" && physicalEmailOf("email_sent:shipment:f1:delivered", "Pickup confirmation emailed to the buyer") === "picked_up" && physicalEmailOf("email_sent:return:r1:approved", "Return update emailed to the buyer") === "return_approved")

  console.log("\nCommunity emails are managed in Emails\n")
  check("the community's settings no longer have a Member emails panel", !(SETTINGS_TABS as readonly string[]).includes("emails") && !/MemberEmailsPanel|value: "emails"/.test(read("components/community/creator/settings-section.tsx")))
  check("an old link (?tab=emails, email, broadcast, templates) is sent to Emails on that community", ["emails", "email", "broadcast", "templates"].every(emailsTabAsked) && !emailsTabAsked("access") && communityEmailsHref("c1") === "/app/emails?tab=customer&kind=communities&community=c1")
  check("  by the settings page, before it draws anything", /if \(emailsTabAsked\(query\.tab\)\) redirect\(communityEmailsHref\(ctx\.community\.id\)\)/.test(read("app/app/community/[id]/settings/page.tsx")))
  check("  and an unknown tab still lands on the first panel", settingsTabOf("emails") === "access")
  const panel = read("components/app/settings/customer-emails-panel.tsx")
  const community = read("components/app/emails/community-emails.tsx")
  check("Emails lists them with the same routes and data as before", /\/api\/app\/community\/\$\{community\.id\}\/emails\/templates/.test(community) && /\/api\/app\/community\/\$\{community\.id\}\/emails`/.test(community) && /emails\/preview/.test(community))
  check("the old note that sent people to each community is gone", !/edited in each community/.test(panel + community))
  check("the family is in the address, so a link opens it", /searchParams\.set\("kind", v\)/.test(panel) && /get\("kind"\)/.test(panel))
  check("the switch is the shared segmented tabs", /<SegmentedTabs value=\{shown\}/.test(panel))
  const seg = read("components/app/segmented-tabs.tsx")
  check("  tabs with one stop, arrows, Home and End", /role="tablist"/.test(seg) && /tabIndex=\{on \? 0 : -1\}/.test(seg) && /ArrowRight/.test(seg) && /"Home"/.test(seg) && /"End"/.test(seg))
  check("  the thumb moves by transform only, the words by opacity only", /transition-\[transform\]/.test(seg) && /translate3d\(\$\{index \* 100\}%,0,0\)/.test(seg) && (seg.match(/transition-opacity/g) ?? []).length === 2 && !/transition-colors|transition-all|transition-\[width/.test(seg))
  check("  still under reduced motion", (seg.match(/motion-reduce:transition-none/g) ?? []).length === 3)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
