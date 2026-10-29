/**
 * Round AE2: every buyer's and member's email can take its owner's words, and
 * every email a community sends is the community's.
 *
 *   editable     each Digital, Physical and Community email in Emails ›
 *                Customer emails has default words, its own values, and a
 *                preview drawn by its sending template with no value left in
 *                braces, with and without the owner's words
 *   branded      each community email (welcome, approved request, invite,
 *                the four ticket emails, a paid plan's seven, its own
 *                broadcast, a refund, a closing notice) comes from the
 *                community by name, with its picture when it has one, Reply-To
 *                its own address, links on its own domain when that is live,
 *                and its name in the footer; never Storelib's mark
 *   dynamic      money in the payment's currency and decimals, a missing name
 *                read as "there", nothing "undefined", nothing in braces
 *   unsubscribe  a community's own email carries a link that turns off that
 *                community's emails for that member, and only that
 *
 *   npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ALL_EMAILS, COMMUNITY_EMAILS, CUSTOMER_EMAILS, previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { DEFAULT_COPY, PLACEHOLDER_LABELS, placeholdersFor, readCopy, unknownPlaceholders } from "@/lib/emails/customer-custom"
import { COMMUNITY_DEFAULT_WORDS, COMMUNITY_WORD_KINDS, communityValuesFor, fillCommunityValues, readCommunityWords, unknownCommunityValues } from "@/lib/emails/community-words"
import { renderEmail, brandOf } from "@/lib/notify/templates"
import { emailChannel } from "@/lib/notify/channels/email"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail).slice(0, 400)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** What a reader sees: the HTML's words, without its tags, styles and entities. */
function visible(html: string): string {
  return html.replace(/<(style|title)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ")
}
/** Nothing a reader should ever see: a value left in braces, or a JavaScript hole. */
function clean(m: { subject: string; html: string; text: string }): string | null {
  const all = `${m.subject}\n${visible(m.html)}\n${m.text}`
  if (/\{\{|\}\}/.test(all)) return "braces"
  if (/\{\s*(community|creator)\s*\}/i.test(all)) return "old braces"
  if (/\bundefined\b|\bnull\b|NaN|\[object Object\]/.test(all)) return "undefined"
  return null
}

const SHOP = { name: "Bread & Butter", supportEmail: "hello@bread.example", storeUrl: "https://bread.example", currency: "EUR", logoUrl: "https://bread.example/logo.png", phone: null, accent: "#0f766e" }
const CREATOR = { name: "Maria Popescu", photoUrl: "https://bread.example/maria.jpg", logoUrl: null }

async function main() {
  console.log("\nEvery email in Emails › Customer emails takes its owner's words\n")
  check("Digital, Physical and Community emails are all listed", ["digital", "physical", "communities"].every((f) => ALL_EMAILS.some((e) => e.family === f)))
  check("every store email is editable, with default words for each of the four parts", CUSTOMER_EMAILS.every((e) => e.editable && DEFAULT_COPY[e.id] && ["subject", "heading", "body", "button"].every((f) => typeof (DEFAULT_COPY[e.id] as Record<string, string>)[f] === "string")))
  check("every default names only values its own email can fill in", CUSTOMER_EMAILS.every((e) => ["subject", "heading", "body", "button"].every((f) => unknownPlaceholders((DEFAULT_COPY[e.id] as Record<string, string>)[f], e.id).length === 0)), CUSTOMER_EMAILS.filter((e) => ["subject", "heading", "body", "button"].some((f) => unknownPlaceholders((DEFAULT_COPY[e.id] as Record<string, string>)[f], e.id).length)).map((e) => e.id))
  check("each value the editor offers has a label", CUSTOMER_EMAILS.every((e) => placeholdersFor(e.id).every((p) => PLACEHOLDER_LABELS[p.key] === p.label)))
  check("a membership email offers its plan, price and dates, not an order number", placeholdersFor("membership_started").map((p) => p.key).join() === "customer_name,plan_name,shop_name,price,next_payment" && !placeholdersFor("membership_started").some((p) => p.key === "order_number"))
  const wrong = readCopy("membership_started", { subject: "Your order {{order_number}}" })
  check("a value the email has not got is refused on save, naming the ones it has", wrong.ok === false && /order_number/.test((wrong as { error: string }).error) && /\{\{plan_name\}\}/.test((wrong as { error: string }).error))
  check("a refund's own values save", readCopy("digital_refund", { subject: "{{amount}} back for {{items}}" }).ok === true)

  console.log("\nEvery store email drawn, with and without the store's words\n")
  for (const e of CUSTOMER_EMAILS) {
    const plain = previewCustomerEmail(e.id, SHOP, null, { channel: "storelib", creator: CREATOR })
    const words = { subject: `Own ${e.id} {{${placeholdersFor(e.id)[0].key}}}`, heading: "Our own heading", body: `Hi {{${placeholdersFor(e.id)[0].key}}}, our own opening.`, button: "Our button" }
    const own = previewCustomerEmail(e.id, SHOP, words, { channel: "storelib", creator: CREATOR, language: { lang: "en", words: {}, own: true } })
    check(`${e.id}: drawn by default with nothing left in braces`, !!plain && clean(plain) === null, plain ? clean(plain) : "no email")
    check(`${e.id}: the store's words go in, values filled`, !!own && clean(own) === null && own.subject.startsWith(`Own ${e.id}`) && /Our own heading/.test(own.html) && /our own opening/.test(own.html) && /Our button/.test(own.html), own ? [own.subject, clean(own)] : "no email")
  }
  const started = previewCustomerEmail("membership_started", SHOP, { subject: "{{plan_name}} for {{price}}" }, { creator: CREATOR, language: { lang: "en", words: {}, own: true } })!
  check("a membership's price is in the store's currency, two decimals", started.subject === "Bread club for €15.00 a month", started.subject)
  check("a membership email comes from the creator by name, their picture on top, not Storelib's mark", /Maria Popescu/.test(started.html) && /class="e-avatar"/.test(started.html) && !/class="e-logo"/.test(started.html))
  const noName = renderEmail("MEMBERSHIP_STARTED", { membershipTitle: "Club", amountCents: 900, currency: "jpy", interval: "month", tplMode: "body", tplIntro: "Hi {{customer_name}}, thanks.", brandName: "Shop" }, { baseUrl: "https://storelib.com" })
  check("a missing first name reads 'there'", /Hi there, thanks\./.test(noName.text), noName.text.slice(0, 200))
  check("a currency without decimals has none (¥900)", /¥900/.test(noName.text) && !/¥900\.00/.test(noName.text))
  const dropped = renderEmail("MEMBERSHIP_STARTED", { membershipTitle: "Club", amountCents: 900, currency: "eur", interval: "month", tplMode: "body", tplDropIntro: true, brandName: "Shop" }, { baseUrl: "https://storelib.com" })
  check("an emptied opening text is left out, the rest of the email stays", !/Thanks for joining/.test(dropped.text) && /membership page/.test(dropped.text))
  const emptied = previewCustomerEmail("membership_started", SHOP, { body: "" }, { creator: CREATOR, language: { lang: "en", words: {}, own: true } })!
  check("  and its preview shows it the same way", !/Thanks for joining/.test(emptied.text) && /membership page/.test(emptied.text))

  console.log("\nEvery community email is the community's\n")
  const t = await import("@/lib/communities/server/email-templates")
  const base = { id: "11111111-1111-4111-8111-111111111111", name: "Makers Club", slug: "makers", creatorName: "Ana Lopez", replyTo: "team@makers.example", currency: "EUR" }
  const variants = [
    { label: "with its picture and domain", c: { ...base, logoUrl: "https://makers.example/avatar.png", host: "club.makers.example" } },
    { label: "without a picture or domain", c: { ...base, logoUrl: null, host: null } },
  ]
  for (const kind of COMMUNITY_WORD_KINDS) {
    for (const v of variants) {
      for (const own of [false, true]) {
        const values = communityValuesFor(kind).map((x) => `{{${x.key}}}`).join(" ")
        const words = own ? { subject: `Ours: ${values}`.slice(0, 120), heading: "Our heading {community}", intro: `Hello {{${communityValuesFor(kind)[0].key}}}. ${values}`.slice(0, 600), button: "Our button" } : { subject: "", heading: "", intro: "", button: "" }
        const m = t.previewEmailWords(kind, words, v.c)
        const name = `${kind}, ${v.label}${own ? ", own words" : ""}`
        const problems: string[] = []
        const dirty = clean(m)
        if (dirty) problems.push(dirty)
        if (m.fromName !== "Makers Club") problems.push(`from ${m.fromName}`)
        if (m.replyTo !== "team@makers.example") problems.push(`reply ${m.replyTo}`)
        if (/class="e-logo"/.test(m.html) || /alt="">\s*<\/td>\s*<td class="e-mark"[^>]*>Storelib/.test(m.html)) problems.push("Storelib mark")
        if (!/Sent by Makers Club through Storelib\./.test(m.html)) problems.push("footer")
        if (v.c.logoUrl ? !/class="e-store-logo"/.test(m.html) : /class="e-store-logo"/.test(m.html)) problems.push("picture")
        const links = [...m.html.matchAll(/href="(https:[^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, "&"))
        const community = links.filter((l) => /\/community\/makers(\/|\?|$)/.test(l) || l.startsWith("https://club.makers.example"))
        if (v.c.host) {
          if (links.some((l) => /storelib\.com\/community\/makers/.test(l))) problems.push("a community link left on storelib.com")
          if (kind.startsWith("membership_") ? false : !community.some((l) => l.startsWith("https://club.makers.example/"))) problems.push("no link on the domain")
        } else if (links.some((l) => l.includes("club.makers.example"))) problems.push("domain without one")
        if (own && !m.subject.startsWith("Ours:")) problems.push(`subject ${m.subject}`)
        if (own && !/Our button/.test(m.html)) problems.push("button")
        if (own && !/Our heading Makers Club/.test(m.html)) problems.push("old {community}")
        check(name, problems.length === 0, problems)
      }
    }
  }
  const ticket = t.previewEmailWords("event_ticket", { subject: "{{event_title}} for {{amount}}", heading: "", intro: "", button: "" }, { ...base, logoUrl: null, host: null })
  check("a ticket's amount is in the store's currency", ticket.subject === "Live Q&A for €15.00", ticket.subject)
  check("the ticket's facts stay whatever the words", /Paid/.test(ticket.text) && /€15\.00/.test(ticket.text) && /Event/.test(ticket.text))
  const welcomed = t.previewEmailWords("welcome", { subject: "", heading: "", intro: "Hi {{first_name}}!", button: "" }, { ...base, logoUrl: null, host: null })
  check("the member's first name fills in", /Hi Maria!/.test(welcomed.text))
  check("an invite says why it came: the invite, not membership", /because you were invited to join Makers Club/.test(t.previewEmailWords("invite", { subject: "", heading: "", intro: "", button: "" }, { ...base }).text))
  const broadcast = t.previewBroadcast({ subject: "New lessons", message: "Hello all.", authorName: "Ana" }, { ...base, logoUrl: null, host: "club.makers.example" })
  check("Email your members is the community's too, linked on its domain", /Makers Club/.test(broadcast.html) && /https:\/\/club\.makers\.example\//.test(broadcast.html) && !/class="e-logo"/.test(broadcast.html))

  console.log("\nThe community's words are checked\n")
  check("each kind's defaults name only its own values", COMMUNITY_WORD_KINDS.every((k) => ["subject", "heading", "intro", "button"].every((f) => unknownCommunityValues(k, (COMMUNITY_DEFAULT_WORDS[k] as unknown as Record<string, string>)[f]).length === 0)))
  check("a value the kind has not got is refused", "error" in readCommunityWords("welcome", { subject: "{{event_title}}" }))
  check("a ticket's values are accepted on a ticket", !("error" in readCommunityWords("event_ticket", { subject: "{{event_title}} on {{event_date}}" })))
  check("too long is refused", "error" in readCommunityWords("welcome", { button: "x".repeat(41) }))
  check("tags are taken out", (readCommunityWords("welcome", { heading: "<b>Hi</b>" }) as { heading: string }).heading === "Hi")
  check("the default typed out is not saved as the owner's", (readCommunityWords("welcome", { subject: COMMUNITY_DEFAULT_WORDS.welcome.subject }) as { subject: string }).subject === "")
  check("an empty value reads sensibly, an unknown one is dropped", fillCommunityValues("Hi {{first_name}} of {{community_name}} {{nope}}", {}) === "Hi there of the community")
  check("the older {community} and {creator} still fill in", fillCommunityValues("{community} by {creator}", { community_name: "Makers", creator_name: "Ana" }) === "Makers by Ana")

  console.log("\nThe From line, the domain and the brand\n")
  check("a brand is only ever on a customer's email", brandOf({ brandName: "Makers Club" }, "creator") === null && brandOf({ brandName: "Makers Club" }, "customer")?.name === "Makers Club")
  check("a brand name cannot carry an address into the From line", !/[<>"]/.test(brandOf({ brandName: 'Makers" <spoof@evil.io>' }, "customer")?.name ?? ""))
  check("a host that is not a plain domain is not used for links", brandOf({ brandName: "M", brandSlug: "m", brandHost: "evil.example/x" }, "customer")?.origin === null && brandOf({ brandName: "M", brandSlug: "m", brandHost: "javascript:alert(1)" }, "customer")?.origin === null)
  check("a reply address that is not plain is dropped", brandOf({ brandName: "M", brandReplyTo: "not an address" }, "customer")?.replyTo === null)
  const sent: Array<{ fromName?: string; replyTo?: string; headers?: Record<string, string> }> = []
  const send = emailChannel({
    provider: { name: "fake", send: async (m: { fromName?: string; replyTo?: string; headers?: Record<string, string> }) => (sent.push(m), { status: "sent", providerMessageId: "x" }) } as never,
    render: renderEmail,
    baseUrl: () => "https://storelib.com",
    customerUnsubscribeUrl: (job) => (job.entity_type === "community" ? "https://storelib.com/api/notify/unsubscribe?token=abc" : null),
  })
  const job = { id: "j1", type: "COMMUNITY_BROADCAST", entity_type: "community", entity_id: base.id, recipient_user_id: null, data: { communityName: "Makers Club", communitySlug: "makers", brandName: "Makers Club", brandReplyTo: "team@makers.example", subject: "Hi", message: "Hello there all." } }
  await send({ job: job as never, entry: { type: "COMMUNITY_BROADCAST", requirement: "optional_product", recipient: "customer", category: "product_and_store" } as never, to: "m@example.com", recipientName: null, deliveryId: "d1" })
  check("a community's email is from the community by name, not 'via Storelib'", sent[0]?.fromName === "Makers Club", sent[0]?.fromName)
  check("  Reply-To the community's own address", sent[0]?.replyTo === "team@makers.example")
  check("  and its own email carries the one-click unsubscribe header", /unsubscribe/.test(sent[0]?.headers?.["List-Unsubscribe"] ?? ""))
  const review = renderEmail("REVIEW_REQUEST", { creatorName: "Ana", creatorSupportEmail: "ana@example.com", productTitle: "Mug" }, { baseUrl: "https://storelib.com" })
  check("a review request still goes out as '<Seller> via Storelib'", review.fromName === "Ana" && !review.fromNameExact)
  const platform = renderEmail("PAYOUT_SENT", { amountCents: 100, currency: "usd", brandName: "Makers Club" }, { baseUrl: "https://storelib.com" })
  check("a creator's own notice stays Storelib's, whatever its data says", !platform.fromName && /class="e-logo"/.test(platform.html))

  console.log("\nOne community's emails off, and only those\n")
  const u = await import("@/lib/notify/unsubscribe")
  const KEY = "a-test-secret-that-is-long-enough"
  const member = "22222222-2222-4222-8222-222222222222"
  const token = u.signCommunityWith(KEY, base.id, member)
  check("the link names the community and the member, signed", JSON.stringify(u.verifyCommunityWith(KEY, token)) === JSON.stringify({ communityId: base.id, userId: member }))
  check("  another secret does not pass", u.verifyCommunityWith("another-secret-entirely-long", token) === null)
  check("  a person's category link cannot pass for it, nor it for one", u.verifyCommunityWith(KEY, u.signWith(KEY, member, "product_and_store")) === null && u.verifyWith(KEY, token) === null && u.verifyReviewWith(KEY, token) === null)
  check("  no address is in it", !Buffer.from(token.split(".")[0], "base64url").toString("utf8").includes("@"))
  const route = read("app/api/notify/unsubscribe/route.ts")
  check("the route turns off that community's emails for that member only", /verifyCommunityUnsubscribe/.test(route) && /\.from\("community_members"\)\s*\.update\(\{ email_announcements: action === "resubscribe"/.test(route) && /\.eq\("community_id", communityId\)\s*\.eq\("user_id", userId\)/.test(route))
  check("the worker signs it for a community's job with its member", /job\.entity_type === "community" && job\.entity_id \? communityUnsubscribeUrl\(job\.entity_id, job\.data\?\.memberUserId\)/.test(read("lib/notify/worker.ts")))
  check("the sender puts the member in the event, and their name for the greeting", /memberUserId: input\.userId/.test(read("lib/communities/server/email.ts")) && /kind !== "invite" && kind !== "broadcast" && input\.userId \? await memberNameOf/.test(read("lib/communities/server/email.ts")))

  console.log("\nWho sends what, read from the sources\n")
  const email = read("lib/communities/server/email.ts")
  check("sendCommunityEmail brands every email with the community's picture, reply address and domain", /logo_url/.test(email) && /replyAddressOf\(db, communityId/.test(email) && /communityDomainHost/.test(email))
  const sync = read("lib/memberships/sync.ts")
  check("a paid plan's emails are the community's, with its words", /t\.communityBrand\(facts\)/.test(sync) && /t\.MEMBERSHIP_WORD_KIND\[name\]/.test(sync))
  check("a membership sold on its own is the creator's, with the store's words in English only", /brandKind: "creator"/.test(sync) && /pickCopy\([^\n]*STORE_EMAIL_ID\[name\]\], language\)/.test(sync) /* Changed on purpose (round 28): English words, or the ones written for English, by pickCopy */ && /tplMode: "body"/.test(sync))
  check("a community's refund is the community's", /t\.communityBrand\(await t\.communityEmailFacts\(db, c\)\)/.test(read("lib/communities/server/membership-lifecycle.ts")))
  check("a closing notice is the community's", /kind: "store", name, pictureUrl: inboxPicture\(m\.logoUrl, 36\)/.test(read("lib/communities/server/community-deletion.ts")))
  check("a download's refund carries the store's words", /signer\?\.words \?\? null/.test(read("lib/email.tsx")))
  check("the community editor has the values, Send test and Reset to default", /communityValuesFor\(kind\)/.test(read("components/app/emails/community-emails.tsx")) && /emails\/test/.test(read("components/app/emails/community-emails.tsx")) && /Reset to default/.test(read("components/app/emails/community-emails.tsx")))
  check("the community test goes only to the person who pressed it", /getUserById\(gate\.ctx\.userId\)/.test(read("app/api/app/community/[id]/emails/test/route.ts")) && /requireCreatorCommunity\(id, "manage_settings"\)/.test(read("app/api/app/community/[id]/emails/test/route.ts")))
  check("every community email in the list takes words but the broadcast", COMMUNITY_EMAILS.every((e) => e.editable === (e.community !== "broadcast")))
  const sql = read("supabase/sql/run-now/301_community_email_words.sql")
  check("part 301 widens the kinds, keeps the old ones, adds the button and keeps the table server only", /'membership_ended'/.test(sql) && /'announcement'/.test(sql) && /ADD COLUMN IF NOT EXISTS button text/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.community_email_templates FROM PUBLIC, anon, authenticated/.test(sql) && !/DROP TABLE|DELETE FROM|TRUNCATE/i.test(sql))
  check("part 301 is in the migrations, the README and the after-check", read("supabase/migrations/20270201_ae2_community_email_words.sql") === sql && /301_community_email_words\.sql/.test(read("supabase/sql/run-now/README.md")) && /* Changed on purpose (round AF): part 304's column comes after it now. */ /as p301_community_email_words[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
