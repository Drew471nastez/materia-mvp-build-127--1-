/**
 * Wave 10, emails: a store's emails reply to the STORE, never to
 * support@storelib.com (the owner: "a few store emails that don't set a
 * reply address still send replies to support@storelib.com"); one sending
 * domain and one sender address for every email a store sends (campaigns,
 * automations, order emails), with no marketing / transactional split;
 * and Emails' top tabs fit a phone without sideways scroll.
 *
 * Nothing real is called: Mailgun is a stub of its API shape, the store
 * lookups are stubs or tests/fake-supabase.
 *
 *   node scripts/run-push-tests.mjs   (this suite is in SUITES)
 */
import "./_mailgun-env"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { bareAddress, canTakeReply, isPlatformReply, pickStoreReply, platformReplyAddresses, replyToFor } from "@/lib/emails/reply-to"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 700)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── Mailgun, stubbed: every message's form is kept ───────────────────── */

const sent: { path: string; form: FormData }[] = []
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url
  const u = new URL(url)
  if (u.origin !== "https://mailgun.test") throw new Error(`a real address was called: ${url}`)
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (/\/(bounces|complaints)\//.test(u.pathname)) return json(404, { message: "not found" })
  if ((init.method ?? "GET") === "POST" && /^\/v3\/[^/]+\/messages$/.test(u.pathname)) {
    sent.push({ path: u.pathname, form: init.body })
    return json(200, { id: "<m1@x>", message: "Queued." })
  }
  return json(404, { message: "not stubbed" })
}) as typeof fetch

const STORE = "11111111-1111-4111-8111-111111111111"
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const lastReply = () => sent.at(-1)?.form.get("h:Reply-To") ?? null

async function main() {
  /* ─── 1. The rule, pure ─────────────────────────────────────────────── */
  console.log("\n1. Where a reply can go")
  const block = { sendingDomain: "mail.anapop.studio", platformDomain: "mg.storelib.com", platform: ["support@storelib.com"] }
  check("a store's ordinary inbox takes a reply", canTakeReply("hello@anapop.studio", block) && canTakeReply("Ana <ana.pop@gmail.com>", block))
  check("Storelib's support inbox never takes a store's reply", !canTakeReply("support@storelib.com", block) && !canTakeReply("Storelib <SUPPORT@storelib.com>", block))
  check("a noreply address never does (noreply, no-reply, do-not-reply, mailer-daemon)", ["noreply@anapop.studio", "no-reply@anapop.studio", "do-not-reply@x.com", "donotreply@x.com", "mailer-daemon@x.com", "bounce@x.com"].every((a) => !canTakeReply(a, block)))
  check("an address on the store's own sending domain never does (mail. sends, it has no inbox)", !canTakeReply("hello@mail.anapop.studio", block) && !canTakeReply("x@eu.mail.anapop.studio", block))
  check("an address on Storelib's sending domain never does", !canTakeReply("noreply@mg.storelib.com", block) && !canTakeReply("hello@mg.storelib.com", {}))
  check("a Storelib relay (+slb-) never does", !canTakeReply("ana+slb-1a2b@gmail.com", block))
  check("not an address at all never does", !canTakeReply("", block) && !canTakeReply("nobody", block) && !canTakeReply(null, block))
  check("bareAddress reads a From-shaped value", bareAddress('"Ana, Studio" <Ana@Shop.com>') === "ana@shop.com")
  check("EMAIL_REPLY_TO is a platform address", platformReplyAddresses({ EMAIL_REPLY_TO: "Help <help@storelib.com>" }).includes("help@storelib.com") && isPlatformReply("support@storelib.com"))

  console.log("\n2. Which of the store's addresses, in order")
  check("contact email first (Settings › Store details)", JSON.stringify(pickStoreReply({ contact: "hello@anapop.studio", support: "help@anapop.studio", account: ["ana@gmail.com"] }, block)) === JSON.stringify({ address: "hello@anapop.studio", via: "contact" }))
  check("then the support email", pickStoreReply({ contact: "", support: "help@anapop.studio", account: ["ana@gmail.com"] }, block)?.via === "support")
  check("then the owner's account email", JSON.stringify(pickStoreReply({ contact: null, support: null, account: ["ana@gmail.com"] }, block)) === JSON.stringify({ address: "ana@gmail.com", via: "account" }))
  check("a contact email that cannot take a reply is passed over", pickStoreReply({ contact: "noreply@anapop.studio", support: "support@storelib.com", account: ["hello@mail.anapop.studio", "ana@gmail.com"] }, block)?.address === "ana@gmail.com")
  check("none at all is none, never Storelib's", pickStoreReply({ contact: null, support: "support@storelib.com", account: [] }, block) === null)

  console.log("\n3. The Reply-To a send carries")
  check("Storelib's own email (no store) without one: Storelib's support inbox", replyToFor({ replyTo: null }, "support@storelib.com") === "support@storelib.com")
  check("Storelib's own email keeps the one it asked for", replyToFor({ replyTo: "buyer@x.com" }, "support@storelib.com") === "buyer@x.com")
  check("a store's email without one: the store's", replyToFor({ store: STORE, replyTo: null, resolved: "hello@anapop.studio" }, "support@storelib.com", block) === "hello@anapop.studio")
  check("a store's email that was handed Storelib's inbox: the store's instead", replyToFor({ store: STORE, replyTo: "support@storelib.com", resolved: "hello@anapop.studio" }, "support@storelib.com", block) === "hello@anapop.studio")
  check("a store's email keeps a good one it asked for (a community's own contact)", replyToFor({ store: STORE, replyTo: "circle@anapop.studio", resolved: "hello@anapop.studio" }, "support@storelib.com", block) === "circle@anapop.studio")
  check("a store's email with nowhere to reply: no Reply-To, never Storelib's", replyToFor({ store: STORE, replyTo: "support@storelib.com", resolved: null }, "support@storelib.com", block) === null)

  /* ─── 2. Through lib/mailgun.ts, the path under every send ──────────── */
  const { storeSender, storeReply, withStoreSender, sendMailgunOnce, sendMailgunEmail, replyHeaderOf, EMAIL_REPLY_TO } = await import("@/lib/mailgun")
  const { sendEmail } = await import("@/lib/mail")
  const replyOf = new Map<string, string | null>([[STORE, "hello@anapop.studio"]])
  const ownOf = new Map<string, { address: string; domain: string } | null>()
  const asked: string[] = []
  storeSender.lookup = async (id) => ownOf.get(id) ?? null
  storeReply.lookup = async (id) => {
    asked.push(id)
    return replyOf.has(id) ? replyOf.get(id)! : null
  }

  console.log("\n4. Every send made for a store replies to the store")
  const base = { to: "buyer@example.com", subject: "Your order", html: "<p>Thanks</p>", text: "Thanks" }
  check("withStoreSender gives a store's email without a Reply-To the store's", (await withStoreSender({ ...base, store: STORE })).replyTo === "hello@anapop.studio")
  check("withStoreSender replaces Storelib's support inbox on a store's email", (await withStoreSender({ ...base, store: STORE, replyTo: "support@storelib.com" })).replyTo === "hello@anapop.studio")
  check("withStoreSender leaves a platform email (no store) alone", (await withStoreSender({ ...base })).replyTo === undefined && replyHeaderOf({}) === EMAIL_REPLY_TO)
  asked.length = 0
  await withStoreSender({ ...base, store: STORE, replyTo: "circle@anapop.studio" })
  check("a good Reply-To is kept without a lookup", asked.length === 0)

  sent.length = 0
  await sendMailgunEmail({ ...base, store: STORE })
  check("sendMailgunEmail: Reply-To is the store's contact email", lastReply() === "hello@anapop.studio", lastReply())
  await sendMailgunOnce({ ...base, store: STORE, replyTo: "support@storelib.com" })
  check("sendMailgunOnce (campaigns, notifications): the store's, not support@storelib.com", lastReply() === "hello@anapop.studio", lastReply())
  await sendEmail({ ...base, store: STORE, replyTo: "support@storelib.com" })
  check("sendEmail (receipts, courses, automations): the store's", lastReply() === "hello@anapop.studio", lastReply())

  replyOf.set(STORE, null)
  await sendMailgunEmail({ ...base, store: STORE, replyTo: "support@storelib.com" })
  check("a store with no address at all: no Reply-To header, never Storelib's", lastReply() === null, lastReply())
  replyOf.set(STORE, "hello@anapop.studio")

  ownOf.set(STORE, { address: "hello@mail.anapop.studio", domain: "mail.anapop.studio" })
  await sendMailgunEmail({ ...base, from: "Ana Pop Studio <noreply@storelib.com>", store: STORE, replyTo: "hello@mail.anapop.studio" })
  const last = sent.at(-1)!
  check("with its own domain verified: From the store's address, through its domain", String(last.form.get("from")).includes("hello@mail.anapop.studio") && last.path === "/v3/mail.anapop.studio/messages", { from: last.form.get("from"), path: last.path })
  check("…and a reply never goes to the sending address: Reply-To is the store's inbox", lastReply() === "hello@anapop.studio", lastReply())
  ownOf.delete(STORE)

  await sendMailgunEmail({ ...base, to: "creator@example.com", subject: "You made a sale" })
  check("Storelib's own email to the creator still replies to Storelib's support", lastReply() === "support@storelib.com", lastReply())
  await sendMailgunOnce({ ...base, to: "creator@example.com" })
  check("…on the one-attempt path too", lastReply() === "support@storelib.com", lastReply())

  /* ─── 3. The read behind it ──────────────────────────────────────────── */
  console.log("\n5. storeReplyTo reads Store details, then the support email, then the owner")
  const { storeReplyTo } = await import("@/lib/emails/reply-to-server")
  const dbWith = (s: { contact?: string | null; support?: string | null; profile?: string | null; sending?: string | null; owner?: string | null }) => {
    const db = new FakeSupabase()
    db.table("store_settings", {}, [{ creator_id: STORE, contact_email: s.contact ?? null }])
    db.table("creators", {}, [{ id: STORE, support_email: s.support ?? null, user_id: OWNER }])
    db.table("email_sending_domains", {}, s.sending ? [{ creator_id: STORE, domain: s.sending }] : [])
    db.table("business_links", {}, s.owner ? [{ member_id: OWNER, owner_id: s.owner }] : [])
    db.table("profiles", {}, [{ id: OWNER, email: s.profile ?? null }, { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "boss@gmail.com" }])
    return db
  }
  const login = (map: Record<string, string | null>) => async (id: string) => map[id] ?? null
  const r1 = await storeReplyTo(dbWith({ contact: "Hello@AnaPop.studio", support: "help@anapop.studio" }), STORE, { fresh: true, loginEmail: login({ [OWNER]: "ana@gmail.com" }) })
  check("Store details' contact email, lower case", r1?.address === "hello@anapop.studio" && r1.via === "contact", r1)
  const r2 = await storeReplyTo(dbWith({ support: "help@anapop.studio" }), STORE, { fresh: true, loginEmail: login({ [OWNER]: "ana@gmail.com" }) })
  check("no contact email: the support email", r2?.via === "support" && r2.address === "help@anapop.studio", r2)
  const r3 = await storeReplyTo(dbWith({ contact: "noreply@mail.anapop.studio", support: "support@storelib.com", sending: "mail.anapop.studio" }), STORE, { fresh: true, loginEmail: login({ [OWNER]: "ana@gmail.com" }) })
  check("neither usable: the owner's account email as the login has it", r3?.via === "account" && r3.address === "ana@gmail.com", r3)
  const r4 = await storeReplyTo(dbWith({ profile: "ana.old@gmail.com" }), STORE, { fresh: true, loginEmail: login({}) })
  check("the login unreadable: the profile's address", r4?.address === "ana.old@gmail.com", r4)
  const r5 = await storeReplyTo(dbWith({ owner: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }), STORE, { fresh: true, loginEmail: login({ [OWNER]: "boss+slb-12ab34cd@gmail.com", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb": "boss@gmail.com" }) })
  check("a second business answers to the login that owns it, untagged", r5?.address === "boss@gmail.com", r5)
  const r6 = await storeReplyTo(dbWith({}), STORE, { fresh: true, loginEmail: login({}) })
  check("nothing at all: null, never Storelib's support inbox", r6 === null, r6)
  check("no store: null", (await storeReplyTo(dbWith({}), null)) === null)

  /* ─── 4. Every store email path names its store ─────────────────────── */
  console.log("\n6. Every store email names its store, so the rule reaches it")
  const email = read("lib/email.tsx")
  check("receipts, the receipt copy and the lead magnet pass `store`", /store: creatorId,\n\s+to: customerEmail,\n\s+replyTo,/.test(email) && /store: params\.creatorId,/.test(email) && (email.match(/store: creatorId,/g) ?? []).length >= 3)
  check("campaigns: the sender's reply is storeReplyTo, never EMAIL_REPLY_TO, and each message names its store", /storeReplyTo\(db, creatorId\)/.test(read("lib/email-campaigns/queue.ts")) && !/EMAIL_REPLY_TO/.test(read("lib/email-campaigns/queue.ts")) && /store: frame\.sender\.creatorId/.test(read("lib/email-campaigns/queue.ts")))
  check("a campaign's test send replies as the real one does", /store: sender\.creatorId/.test(read("app/api/email/send-test/route.ts")))
  check("automations: the engine hands the run's store to the mailer", /store: run\.creator_id/.test(read("lib/automations/engine.ts")) && /store: mail\.store \?\? pending\?\.creatorId/.test(read("lib/automations/run.ts")))
  check("membership updates name their store", /store: loaded\.sender\.creatorId/.test(read("lib/memberships/update-email.ts")))
  check("notifications: a store's customer email names its store, and the provider adds Storelib's inbox only to Storelib's own", /store: job\.creator_id/.test(read("lib/notify/channels/email.ts")) && /email\.replyTo \|\| \(email\.store \? undefined : EMAIL_REPLY_TO\)/.test(read("lib/notify/providers/mailgun.ts")))
  const { MailgunEmailProvider } = await import("@/lib/notify/providers/mailgun")
  const seen: Array<{ replyTo?: string; store?: string | null }> = []
  const provider = new MailgunEmailProvider((async (o: { replyTo?: string; store?: string | null }) => {
    seen.push(o)
    return { success: true, status: 200, messageId: "<x>" }
  }) as never)
  await provider.send({ to: "buyer@example.com", subject: "s", html: "<p>h</p>", text: "h", store: STORE })
  await provider.send({ to: "creator@example.com", subject: "s", html: "<p>h</p>", text: "h" })
  check("notify provider: a store's email goes on with its store and no platform Reply-To", seen[0]?.store === STORE && seen[0]?.replyTo === undefined, seen[0])
  check("notify provider: Storelib's own email keeps support@storelib.com", seen[1]?.replyTo === "support@storelib.com" && !seen[1]?.store, seen[1])
  check("Customer emails never shows Storelib's inbox as the store's", /isPlatformReply\(identity\.replyTo\)/.test(read("app/api/store/emails/route.ts")) && /isPlatformReply\(identity\.replyTo\)/.test(read("lib/emails/customer-preview-server.ts")))

  /* ─── 5. Settings shows the real answer ─────────────────────────────── */
  console.log("\n7. Emails › Settings says where replies really go, and how to change it")
  const area = read("app/api/email/area/route.ts")
  const home = read("app/(storelib)/app/emails/emails-home.tsx")
  check("the sender part answers with storeReplyTo, fresh, and which address it is", /storeReplyTo\(db, gate\.creatorId, \{ fresh: true \}\)/.test(area) && /replyVia: reply\?\.via/.test(area))
  check("the Replies go to line says where it comes from and links to Store details", /tt\("Your contact email, from Settings › Store details\. Customers who reply to any of your emails write here\."\)/.test(home) && /tt\("Your account email\. Customers who reply to any of your emails write here\. Add a contact email in Store details to use another\."\)/.test(home) && /key: "reply", label: tt\("Replies go to"\)[^\n]*href: "\/app\/settings\?tab=store"/.test(home))

  /* ─── 6. One sending domain, one address ─────────────────────────────── */
  console.log("\n8. One sending domain and one sender address for every email")
  const server = read("lib/emails/sending-domain-server.ts")
  const ui = read("components/email/connected-platforms.tsx")
  check("one domain per store (creator_id unique) with one from_local, no purpose column", /creator_id uuid NOT NULL UNIQUE/.test(read("supabase/sql/RUN_PENDING_ROUND_50.sql")) && !/purpose|kind text|marketing_domain|transactional_domain/i.test(server))
  check("one lookup every sender reads (verifiedSender), no marketing/transactional variant", (server.match(/export async function verifiedSender/g) ?? []).length === 1 && !/verifiedSender\([^)]*(marketing|transactional)/i.test(read("lib/mailgun.ts") + read("lib/email-campaigns/queue.ts") + read("lib/notify/worker.ts")))
  check("the setup says it covers every email, once", /tt\("One domain for every email your store sends: campaigns, automations and order emails\. Set it up once\."\)/.test(ui) && /tt\("Used for all your emails: campaigns, automations and order emails\."\)/.test(ui))
  check("the sender address is one local part, prefilled hello, shown with its @domain", /React\.useState\("hello"\)/.test(ui) && /@\{cleanDomain \|\| "mail\.yourshop\.com"\}/.test(ui))
  check("the sender address needs no inbox: replies go to the reply address", /tt\("No inbox needed\. Replies go to your reply address, not this one\."\)/.test(ui))

  /* ─── 7. The phone tabs ─────────────────────────────────────────────── */
  console.log("\n9. Emails' top tabs fit a phone")
  check("the track spans the gutter and its places share it on a phone", /const PLACE_PILLS_PHONE = "max-sm:flex max-sm:w-full max-sm:\[&>\[role=tab\]\]:flex-auto max-sm:\[&>\[role=tab\]\]:px-1\.5 max-sm:\[&>\[role=tab\]\]:text-\[13px\]/.test(home))
  check("the nav no longer bleeds past the gutter to scroll edge to edge", !/app-gutter-bleed h-11/.test(home))
  check("Customer emails says Customers on a phone, the whole name for a screen reader and from sm up", /get short\(\) \{ return tt\("Customers"\) \}/.test(home) && /<span className="sm:hidden" aria-hidden>/.test(home) && /<span className="max-sm:sr-only">\{p\.label\}<\/span>/.test(home))
  check("still 44px to tap on a phone", /max-sm:\[&>\[role=tab\]\]:before:-inset-y-1/.test(home))
  for (const loc of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
    const cat = read(`lib/i18n/catalog/${loc}.ts`)
    check(`${loc}: the new words are translated`, ["Customers", "One domain for every email your store sends: campaigns, automations and order emails. Set it up once.", "No inbox needed. Replies go to your reply address, not this one.", "Your account email. Customers who reply to any of your emails write here. Add a contact email in Store details to use another."].every((w) => cat.includes(`${JSON.stringify(w)}:`)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
