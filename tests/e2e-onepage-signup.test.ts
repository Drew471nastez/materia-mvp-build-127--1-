/**
 * A ONEPAGE EMAIL SIGNUP AND CONTACT MESSAGE, FROM END TO END
 *
 * Through the real routes over the journey harness (tests/_journey: an
 * in-memory PostgREST, Mailgun's mailbox): a creator with a published
 * OnePage; a visitor joins with a first name and lands on the creator's one
 * subscriber list (the list Emails › Subscribers reads and Klaviyo or
 * Omnisend are synced from), with the OnePage lead beside it; a script that
 * fills the hidden field or sends faster than a person is told it worked and
 * nothing is written; a draft page takes nobody; and the contact block's
 * message reaches the creator's inbox and Emails › Messages, adding the
 * sender to the list only when they ticked the box.
 *
 * Run: node scripts/run-push-tests.mjs (in STRICT_SUITES)
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)

async function main() {
  const j = await Journey.start()

  section("1. A creator with a published OnePage")
  const seller = await j.signUp("maker@example.com", { name: "Mia Maker" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mia" } })
  const creator = j.rows("creators")[0]
  check("the creator exists", !!creator?.id, j.rows("creators"))
  const [page] = j.db.insert("onepages", { owner_id: seller.id, seller_id: creator.id, status: "published" }, {})
  const [draft] = j.db.insert("onepages", { owner_id: seller.id, seller_id: creator.id, status: "draft" }, {})

  section("2. A visitor joins from the email signup block")
  const joined = await j.call("POST /api/onepage/leads", { body: { onepage_id: page.id, email: "  Ana@Example.com ", name: " Ana ", company: "", elapsed: 4200, block_id: "block_signup", origin: "https://storelib.me/mia" } })
  check("the answer says it worked", joined.status === 200 && joined.json?.success === true, joined)
  const sub = j.rows("subscribers").find((s) => s.email === "ana@example.com")
  check("she is on the creator's one subscriber list, subscribed, with her first name", !!sub && sub.creator_id === creator.id && sub.status === "subscribed" && sub.name === "Ana" && sub.source === "onepage", sub)
  const lead = j.rows("onepage_leads").find((l) => l.email === "ana@example.com")
  check("and the OnePage lead is kept beside it, from that block", !!lead && lead.onepage_id === page.id && lead.block_id === "block_signup" && lead.name === "Ana", lead)

  const again = await j.call("POST /api/onepage/leads", { body: { onepage_id: page.id, email: "ana@example.com", elapsed: 3000 } })
  check("joining twice is one subscriber, and it still says yes", again.status === 200 && j.rows("subscribers").filter((s) => s.email === "ana@example.com").length === 1, again)

  section("3. Scripts and pages that are not live are kept out")
  const before = j.rows("subscribers").length
  const trap = await j.call("POST /api/onepage/leads", { body: { onepage_id: page.id, email: "bot1@example.com", company: "Acme Inc", elapsed: 9000 } })
  const fast = await j.call("POST /api/onepage/leads", { body: { onepage_id: page.id, email: "bot2@example.com", elapsed: 200 } })
  check("the hidden field filled: told yes, nothing written", trap.status === 200 && !j.rows("subscribers").some((s) => s.email === "bot1@example.com") && !j.rows("onepage_leads").some((l) => l.email === "bot1@example.com"), trap)
  check("sent faster than a person can: told yes, nothing written", fast.status === 200 && !j.rows("subscribers").some((s) => s.email === "bot2@example.com"), fast)
  const unpublished = await j.call("POST /api/onepage/leads", { body: { onepage_id: draft.id, email: "early@example.com", elapsed: 4000 } })
  check("a draft page takes nobody", unpublished.status === 404 && j.rows("subscribers").length === before, unpublished)
  const bad = await j.call("POST /api/onepage/leads", { body: { onepage_id: page.id, email: "not-an-address", elapsed: 4000 } })
  check("an address that is not one is refused", bad.status === 400, bad)
  const cached = await j.call("POST /api/onepage/leads", { body: { onepage_id: page.id, email: "old-page@example.com" } })
  check("a page cached from before the checks still signs people up", cached.status === 200 && j.rows("subscribers").some((s) => s.email === "old-page@example.com"), cached)

  section("4. The contact block's message")
  const wrote = await j.call("POST /api/website-builder/contact", { body: { creator_id: creator.id, name: "Bo", email: "bo@example.com", message: "Do you do mixing?", consent: false, company: "", elapsed: 9000, page: "onepage" } })
  check("it is sent", wrote.status === 200 && wrote.json?.ok === true, wrote)
  const kept = j.rows("site_contact_messages").find((m) => m.email === "bo@example.com")
  check("kept for Emails › Messages", !!kept && kept.creator_id === creator.id && String(kept.message).includes("mixing"), kept)
  const mail = j.net.mails.find((m) => m.replyTo === "bo@example.com")
  check("and emailed to the creator, Reply going to the sender", !!mail && mail.to.includes("maker@example.com"), j.net.mails.map((m) => ({ to: m.to, replyTo: m.replyTo, subject: m.subject })))
  const bo = j.rows("subscribers").find((s) => s.email === "bo@example.com")
  check("without the box ticked she is a contact who wrote, not a subscriber", !bo || bo.status !== "subscribed", bo)
  await j.call("POST /api/website-builder/contact", { body: { creator_id: creator.id, name: "Cy", email: "cy@example.com", message: "Hi!", consent: true, company: "", elapsed: 9000, page: "onepage" } })
  check("with the box ticked she joins the list", j.rows("subscribers").find((s) => s.email === "cy@example.com")?.status === "subscribed")
  const botMsg = await j.call("POST /api/website-builder/contact", { body: { creator_id: creator.id, email: "spam@example.com", message: "buy", company: "x", elapsed: 9000, page: "onepage" } })
  check("a script's message is told yes and kept nowhere", botMsg.status === 200 && !j.rows("site_contact_messages").some((m) => m.email === "spam@example.com"))

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
