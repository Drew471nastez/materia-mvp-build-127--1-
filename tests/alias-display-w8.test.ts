/**
 * A SECOND BUSINESS'S ADDRESS, NEVER ON A CREATOR'S SCREEN (wave 8)
 *
 * The owner saw, in Contacts › People, "RaduStamate /
 * nastees112+slb-66c749e6@gmail.com": the address Storelib gives a second
 * business (lib/businesses/email-alias.ts). It reaches a creator's lists
 * wherever that business bought, joined, subscribed or answered a form. What
 * is stored, and what is sent to, stays as it is; what is shown, exported and
 * searched is the owner's own address, and an address with no inbox is not
 * shown at all.
 *
 *   1. the helpers: displayEmail, displayEmails, emailMatchKey, emailMatches,
 *      searchedAddress, taggedSearchPattern;
 *   2. Contacts: one person for the tagged and the plain address, the tag
 *      never taking an address from the owner's own account, search by the
 *      address shown;
 *   3. Orders: search, the timeline's words, the CSV, the customer count;
 *   4. every screen and export touched prints through the helper (a scan of
 *      the source, with the few raw uses that must stay named).
 *
 * Run: node scripts/run-push-tests.mjs (in SUITES)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { businessAlias, displayEmail, displayEmails, emailMatchKey, emailMatches, searchedAddress, taggedSearchPattern } from "@/lib/businesses/email-alias"
import { matchesSearch as personMatches, mergePeople, pagePeople, readPeopleQuery, type Account, type SourceRecord } from "@/lib/contacts/identity"
import { groupOrders, matchesSearch as orderMatches, type OrderRow } from "@/lib/orders/order-view"
import { orderEvents } from "@/lib/orders/timeline"
import { ordersCsv } from "@/lib/orders/export-csv"
import { leadRow } from "@/lib/forms/lead-csv"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 600)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const REAL = "nastees112@gmail.com"
const TAGGED = "nastees112+slb-66c749e6@gmail.com"
const NO_INBOX = businessAlias(null, "1a2b3c4d")

section("1. The helpers")
{
  check("the owner's report: the tagged address is shown as the owner's own", displayEmail(TAGGED) === REAL, displayEmail(TAGGED))
  check("  upper case tag too", displayEmail("Nastees112+SLB-66C749E6@Gmail.com") === "Nastees112@Gmail.com")
  check("  an address with no inbox shows nothing", displayEmail(NO_INBOX) === null)
  check("  an ordinary address is untouched, a plus address that is not ours too", displayEmail("ana+news@x.co") === "ana+news@x.co")

  check("the match key: tagged and plain are one key", emailMatchKey(TAGGED) === REAL && emailMatchKey(" Nastees112@GMAIL.com ") === REAL)
  check("  an address with no inbox keeps its own key (it joins nobody)", emailMatchKey(NO_INBOX) === NO_INBOX && emailMatchKey(businessAlias(null, "ffffffff")) !== emailMatchKey(NO_INBOX))
  check("  nothing is nothing", emailMatchKey(null) === null && emailMatchKey("  ") === null)

  const list = displayEmails([TAGGED, REAL, NO_INBOX, "other@x.co", null, "OTHER@x.co"])
  check("a list of addresses: tags off, each once, no-inbox names dropped", JSON.stringify(list) === JSON.stringify([REAL, "other@x.co"]), list)

  check("search by the address shown finds the tagged one", emailMatches(TAGGED, REAL) && emailMatches(TAGGED, "nastees112@gm"))
  check("  \"slb\" alone finds nobody by a tag nobody sees", !emailMatches(TAGGED, "slb") && !emailMatches(TAGGED, "66c749e6"))
  check("  a whole tagged address pasted still finds it", emailMatches(TAGGED, TAGGED))
  check("  a made-up no-inbox name is never found by its domain", !emailMatches(NO_INBOX, "businesses.invalid"))

  check("an address typed in a search splits in two", JSON.stringify(searchedAddress("Nastees112@gmail.com")) === JSON.stringify({ local: "nastees112", domain: "gmail.com" }))
  check("  not an address, or a broken one: nothing", searchedAddress("nastees") === null && searchedAddress("@gmail.com") === null && searchedAddress("a@b@c") === null && searchedAddress("a*b@x.co") === null)
  check("  PostgREST's pattern for the tagged twin", taggedSearchPattern(REAL) === "nastees112+slb-*@gmail.com*", taggedSearchPattern(REAL))
}

section("2. Contacts: one person per address as it is shown")
{
  const at = (d: number) => new Date(Date.UTC(2026, 10, 1 + d)).toISOString()
  const rec = (o: Partial<SourceRecord> & Pick<SourceRecord, "kind" | "id">): SourceRecord => ({ userId: null, email: null, name: null, at: at(0), ...o })
  const none = new Map<string, Account>()

  const people = mergePeople(
    [
      rec({ kind: "subscriber", id: "s1", email: TAGGED, name: "RaduStamate", status: "subscribed", active: true }),
      rec({ kind: "form_submission", id: "f1", email: REAL, at: at(1) }),
      rec({ kind: "lead", id: "l1", email: "someone@else.co", at: at(2) }),
    ],
    none,
  )
  check("the tagged and the plain address given to this store are one person, not two rows that read the same", people.length === 2, people.map((p) => [p.id, p.email]))
  const radu = people.find((p) => p.name === "RaduStamate")
  check("  that person is the subscriber with the form answer", !!radu && radu.subscriber && radu.forms === 1, radu)
  check("  and is shown with the owner's own address", displayEmail(radu?.email) === REAL)

  /* Two accounts: the owner's own (verified plain address) and their second business (verified tagged one). */
  const accounts = new Map<string, Account>([
    ["aaaaaaaa-0000-4000-8000-000000000001", { email: REAL, verified: true, name: "Radu" }],
    ["bbbbbbbb-0000-4000-8000-000000000002", { email: TAGGED, verified: true, name: "RaduStamate" }],
  ])
  const two = mergePeople(
    [
      rec({ kind: "order", id: "o1", userId: "aaaaaaaa-0000-4000-8000-000000000001", email: REAL, paid: true }),
      rec({ kind: "order", id: "o2", userId: "bbbbbbbb-0000-4000-8000-000000000002", email: TAGGED, paid: true }),
      rec({ kind: "subscriber", id: "s2", email: REAL, status: "subscribed", active: true }),
      rec({ kind: "lead", id: "l2", email: TAGGED }),
    ],
    accounts,
  )
  const owner = two.find((p) => p.userId === "aaaaaaaa-0000-4000-8000-000000000001")
  const business = two.find((p) => p.userId === "bbbbbbbb-0000-4000-8000-000000000002")
  check("two accounts stay two people (an account is a person, identity.ts rule 1)", two.length === 2 && !!owner && !!business, two.map((p) => [p.id, p.userId]))
  check("  the plain address still joins the owner's own account: a tag never takes it away", !!owner?.subscriber, owner)
  check("  the tagged address given without an account joins the business it belongs to", (business?.lead ?? false) || two.every((p) => p.userId), business)

  /* Only the business account owns the tagged address: a plain-address row joins it, as the same inbox. */
  const solo = mergePeople(
    [rec({ kind: "order", id: "o3", userId: "bbbbbbbb-0000-4000-8000-000000000002", email: TAGGED, paid: true }), rec({ kind: "form_submission", id: "f3", email: REAL })],
    new Map([["bbbbbbbb-0000-4000-8000-000000000002", accounts.get("bbbbbbbb-0000-4000-8000-000000000002")!]]),
  )
  check("a business that bought signed in and its owner's form answer are one person", solo.length === 1 && solo[0].forms === 1, solo)

  const noInbox = mergePeople([rec({ kind: "subscriber", id: "s4", email: NO_INBOX }), rec({ kind: "subscriber", id: "s5", email: businessAlias(null, "ffffffff") })], none)
  check("two addresses with no inbox are never joined to each other", noInbox.length === 2)

  check("People search by the address shown finds the tagged person", personMatches(radu!, REAL) && personMatches(radu!, "nastees112@"))
  check("  and the tag finds nobody", !personMatches(radu!, "slb-66c"))
  const page = pagePeople(people, readPeopleQuery((k) => (k === "q" ? REAL : null)))
  check("  through the list's own paging too", page.total === 1 && page.rows[0]?.name === "RaduStamate", page)
}

section("3. Orders: search, the timeline, the CSV")
{
  const row = (o: Partial<OrderRow>): OrderRow =>
    ({
      id: "ord-1",
      product_id: "p1",
      amount_cents: 1200,
      fee_cents: 90,
      status: "completed",
      created_at: "2026-11-08T10:00:00.000Z",
      buyer_email: TAGGED,
      buyer_first_name: null,
      buyer_last_name: null,
      receipt_token: "tok",
      buyer_notified_at: "2026-11-08T10:01:00.000Z",
      product: { id: "p1", title: "Preset pack", type: "digital", thumbnail_url: null },
      ...o,
    }) as OrderRow
  const [order] = groupOrders([row({})])
  check("an order is kept with the address it was bought with", order.customerEmail === TAGGED)
  check("  the Orders search finds it by the address shown", orderMatches(order, REAL) && !orderMatches(order, "slb"))
  const words = orderEvents(order).map((e) => e.text).join(" | ")
  check("  the timeline names the owner's own address, never the tag", words.includes(REAL) && !words.includes("+slb-"), words)
  const csv = ordersCsv([order], "UTC", "plain")
  check("  the CSV exports the real address (the tag reaches the same inbox, and nobody recognises it)", csv.includes(REAL) && !csv.includes("+slb-"), csv.slice(0, 300))
  const [ghost] = groupOrders([row({ id: "ord-2", buyer_email: NO_INBOX })])
  const ghostCsv = ordersCsv([ghost], "UTC", "plain")
  check("  an address with no inbox exports as empty, never the made-up name", !ghostCsv.includes("businesses.invalid") && !orderEvents(ghost).some((e) => e.text.includes("businesses.invalid")))

  const lead = leadRow({ submitted_at: "2026-11-08", form_title: "Contact", contact_name: "R", contact_email: TAGGED, answers: [] })
  check("a form's lead export writes the real address", lead.includes(REAL) && !lead.some((c) => String(c).includes("+slb-")), lead)
}

section("4. Every screen and export touched prints through the helper")
{
  /* Field names that hold an address, read raw from a row. */
  const FIELD = "(?:email|contact_email|customerEmail|buyer_email|buyerEmail|customer_email|recipient)"
  /* `{x.email}` printed as it is, or `name || x.email` shown as a fallback. */
  const RAW_PRINT = new RegExp(`\\{\\s*[a-zA-Z_$][\\w$.?!]*\\.${FIELD}\\s*\\}|\\|\\|\\s*[a-zA-Z_$][\\w$.?!]*\\.${FIELD}\\b(?!\\s*\\))`, "g")
  /* Where the raw address must stay: it is what is sent to or matched on, never drawn. Each with why. */
  const ALLOWED: Record<string, RegExp[]> = {
    /* The People row and profile key by the stored address (React key, the composer's ?to=). */
    "app/(storelib)/app/emails/contact-detail.tsx": [/\{keyOf\(contact\.email\)\}/],
    /* The email asked for in Change email is what the creator typed. */
    "app/(storelib)/app/orders/orders-client.tsx": [/\{ email: action\.email \}/],
    /* The receipt resend posts what the creator typed; payouts' sale fallbacks are all wrapped. */
    "app/(storelib)/app/payouts/payouts-client.tsx": [/emailOverrides\[order\.id\] \|\| order\.buyer\?\.email/],
    /* A team invite is sent to the address the owner typed. */
    "components/app/settings/team-panel.tsx": [/\{ email: m\.email, permissions/],
  }
  const FILES = [
    "app/(storelib)/app/contacts/people-client.tsx",
    "app/(storelib)/app/contacts/[key]/profile-client.tsx",
    "app/(storelib)/app/contacts/contact-words.ts",
    "app/(storelib)/app/orders/orders-list.tsx",
    "app/(storelib)/app/orders/order-detail.tsx",
    "app/(storelib)/app/orders/orders-client.tsx",
    "app/(storelib)/app/customers/customers-view.tsx",
    "app/(storelib)/app/emails/contact-detail.tsx",
    "app/(storelib)/app/emails/message-detail.tsx",
    "app/(storelib)/app/emails/leads-panel.tsx",
    "app/(storelib)/app/emails/forms/form-panels.tsx",
    "app/(storelib)/app/emails/flow/[id]/builder.tsx",
    "app/(storelib)/app/support/buyer-cases.tsx",
    "app/(storelib)/app/payouts/payouts-client.tsx",
    "app/(storelib)/admin/resolution/buyer-cases.tsx",
    "app/(storelib)/admin/_console/view-platform.tsx",
    "app/(storelib)/admin/_console/view-commerce.tsx",
    "app/(storelib)/admin/notifications/notifications-admin.tsx",
    "components/community/creator/members-section.tsx",
    "components/community/creator/member-sheet.tsx",
    "components/community/creator/join-requests-panel.tsx",
    "components/community/creator/moderation-section.tsx",
    "components/community/creator/event-tickets.tsx",
    "components/app/settings/team-panel.tsx",
    "components/app/settings/handoff-panel.tsx",
    "components/memberships/creator-screen.tsx",
    "components/reviews/manage/requests-view.tsx",
    "components/reviews/manage/reviews-view.tsx",
    "components/forms/leads-manager.tsx",
    "components/onepage/sections/leads-section.tsx",
  ]
  for (const f of FILES) {
    const code = read(f)
    const allowed = ALLOWED[f] ?? []
    const raw = [...code.matchAll(RAW_PRINT)]
      .map((m) => {
        const lineStart = code.lastIndexOf("\n", m.index!) + 1
        const lineEnd = code.indexOf("\n", m.index!)
        return code.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
      })
      .filter((line) => !/displayEmail\(/.test(line) && !allowed.some((a) => a.test(line)))
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    check(`${f.split("/").slice(-2).join("/")} prints no raw address`, raw.length === 0, raw.map((l) => l.trim().slice(0, 160)))
    if (/\.(tsx)$/.test(f) && f !== "app/(storelib)/app/orders/orders-client.tsx") check(`  and reads the helper`, /from "@\/lib\/businesses\/email-alias"/.test(code) || f.endsWith("contact-words.ts"))
  }

  /* Exports: the real address, the tag never (a CSV is opened by people, and imported into tools that do not know the tag). */
  check("Contacts' export", /displayEmail\(p\.email\) \?\? ""/.test(read("app/api/contacts/export/route.ts")))
  check("  community members' export", /displayEmail\(v\.email\) \?\? ""/.test(read("lib/communities/server/creator.ts")))
  check("  join answers' export", /displayEmail\(p\?\.email\) \?\? ""/.test(read("lib/communities/server/join-questions.ts")))
  check("  shipped orders' export", /displayEmail\(o\.buyer_email\) \?\? ""/.test(read("app/api/physical/orders/export/route.ts")))
  check("  sales' export on Payouts", /displayEmail\(o\.buyer_email \|\| o\.customer_email\) \|\| ""/.test(read("app/(storelib)/app/payouts/payouts-client.tsx")))
  check("  OnePage leads' export", /displayEmail\(lead\.email\) \?\? lead\.email,/.test(read("components/onepage/sections/leads-section.tsx")))

  /* The sale email to the seller shows the buyer's address and offers a reply to it. */
  check("the seller's sale email names the real address", /const email = displayEmail\(d\.text\("customerEmail", 200\)\) \?\? ""/.test(read("lib/notify/templates/catalog.ts")))
  check("  and a shipped order's Reply goes to it", /const replyTo = displayEmail\(m\.buyerEmail\)/.test(read("lib/notify/seller-commerce.ts")))

  /* Search finds the tagged twin by the address shown. */
  const app = read("lib/search/app-search.ts")
  check("app search: a buyer is one per address shown, and named by it", /emailMatchKey\(order\.customerEmail\)/.test(app) && /email: displayEmail\(order\.customerEmail\)/.test(app))
  check("  the email list is searched for the tagged twin of a typed address", /searchedAddress\(q\)/.test(app) && /\+slb-%@/.test(app))
  for (const f of ["lib/communities/server/creator.ts", "lib/communities/server/event-admin.ts"]) check(`  ${f.split("/").pop()}: members found by the address shown`, /taggedSearchPattern\(s\)/.test(read(f)))

  /* What is stored and what is sent stay as they are. */
  const view = read("lib/orders/order-view.ts")
  check("the order keeps the stored address (sending and Change email use it)", /customerEmail: lines\.map\(\(r\) => \(r\.buyer_email \|\| ""\)\.trim\(\)\)/.test(view))
  check("  and the profile reads both forms of an address, so its sends and rows are the person's", /const shown = emailMatchKey\(e\)/.test(read("lib/contacts/profile-server.ts")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
