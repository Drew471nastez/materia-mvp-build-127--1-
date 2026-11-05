/**
 * ===========================================================================
 *  A MESSAGE FROM A CREATOR'S WEBSITE
 * ===========================================================================
 * The contact route's work, run for real against a database that keeps
 * Postgres's promises (tests/fake-supabase.ts), with the limiter, the mailer
 * and the automations replaced by recorders. Held:
 *
 *   SPAM          the invisible field and a form sent too fast are answered
 *                 "sent" and do nothing at all; the limiter's refusal stops
 *                 everything before a row is written
 *   CONSENT       only a ticked box subscribes; an unticked sender is a
 *                 contact who wrote; nobody who left is put back
 *   THE EMAIL     to the creator's inbox, Reply to the visitor, every typed
 *                 value escaped, no line break in the subject
 *   NO PII LOGGED every console line from every scenario, checked for the
 *                 visitor's address, name and words
 *   BEFORE SQL    the email still goes; nothing is claimed that is not so
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase, type Row } from "./fake-supabase"
import {
  CONTACT_CONSENT_TEXT,
  WROTE_TEXT,
  creatorEmail,
  creatorInbox,
  looksAutomated,
  planSender,
  recordSender,
  validateContact,
  type ContactMessage,
} from "@/lib/site-contact/contact"
import { handleContact, type ContactDeps } from "@/lib/site-contact/handle"
import { formIntent } from "@/lib/website-builder/form-intent"
import { cleanContactSource, sourceView, legacySurface } from "@/lib/contacts/contact-source"
import { planContact } from "@/lib/contacts/checkout-contact"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; process.stdout.write(`  ok    ${label}\n`) }
  else { failed++; failures.push(label); process.stdout.write(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}\n`) }
}
function section(title: string) { process.stdout.write(`\n${title}\n`) }
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const CREATOR = "11111111-1111-4111-8111-111111111111"
const VISITOR_EMAIL = "jo.visitor@example.org"
const VISITOR_NAME = "Jo Quentin Visitor"
const SECRET_WORDS = "my order number is 55821 and my address is 9 Elm Row"

/* ── Every console line, from every scenario ─────────────────────────────── */
const logged: string[] = []
const original = { log: console.log, warn: console.warn, error: console.error, info: console.info }
for (const k of ["log", "warn", "error", "info"] as const) {
  console[k] = (...args: unknown[]) => {
    logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "))
  }
}

function statusCheck(allowWrote: boolean) {
  const allowed = ["subscribed", "unsubscribed", "bounced", "complained", "cleaned", "customer", ...(allowWrote ? ["wrote"] : [])]
  return (r: Row) => (r.status === null || allowed.includes(r.status) ? null : "subscribers_status_check")
}

function contactDb(opts: { wroteAllowed?: boolean; messages?: boolean; support?: string | null } = {}) {
  const db = new FakeSupabase()
  db.table("creators", {}, [{ id: CREATOR, user_id: "u-1", support_email: opts.support === undefined ? "help@maralind.com" : opts.support }])
  db.table("profiles", {}, [{ id: "u-1", email: "owner@maralind.com" }])
  db.table("store_theme_installs", {}, [{ id: "inst-1", creator_id: CREATOR, status: "published", sort_order: 0 }])
  db.table("store_theme_pages", {}, [{ install_id: "inst-1", page_key: "contact", sections: [{ id: "legacy-form", type: "contact_form", settings: { recipient_email: "Orders@Maralind.com" } }, { id: "new-form", type: "contact", settings: {} }] }])
  db.table("subscribers", {
    defaults: () => ({ id: `s-${Math.random().toString(36).slice(2, 10)}`, source_detail: null }),
    unique: [(r) => `${r.creator_id}|${String(r.email).toLowerCase()}`],
    checks: [statusCheck(opts.wroteAllowed !== false)],
  })
  if (opts.messages !== false) db.table("site_contact_messages", { defaults: (d) => ({ id: `m-${Math.random().toString(36).slice(2, 10)}`, created_at: d.now() }) })
  return db
}

function body(extra: Record<string, unknown> = {}) {
  return {
    creator_id: CREATOR,
    name: VISITOR_NAME,
    email: VISITOR_EMAIL,
    subject: "About my order",
    message: SECRET_WORDS,
    consent: false,
    company: "",
    elapsed: 9000,
    page: "contact",
    section_id: "new-form",
    ...extra,
  }
}

interface Recorder {
  sent: { to: string; replyTo: string; subject: string; html: string; text: string; fromName: string }[]
  welcomed: number
  limited: number
  sources: unknown[]
}

function deps(db: FakeSupabase, over: Partial<ContactDeps> = {}): { deps: ContactDeps; rec: Recorder } {
  const rec: Recorder = { sent: [], welcomed: 0, limited: 0, sources: [] }
  return {
    rec,
    deps: {
      db,
      platform: "https://storelib.com",
      limit: async () => { rec.limited++; return null },
      send: async (mail) => { rec.sent.push(mail); return { success: true } },
      welcome: async () => { rec.welcomed++ },
      source: (msg) => ({ site: "maralind.storelib.com", detail: cleanContactSource({ surface: "website", site: "maralind.storelib.com", form: "contact", page: msg.page }) }),
      brand: async () => "Maralind",
      recordSource: async (_c, _e, detail) => { rec.sources.push(detail) },
      ...over,
    },
  }
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("What the form sent, checked")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const ok = validateContact(body({ email: "  Jo.Visitor@Example.ORG ", name: "Jo\r\nBcc: x@y.z", subject: "Hi\nthere" }))
    check("a good message passes, the address lower cased", ok.ok === true && ok.value.email === VISITOR_EMAIL, ok)
    check("line breaks cannot survive into a name or a subject", ok.ok === true && !/[\r\n]/.test(ok.value.name + ok.value.subject))
    check("a bad address is refused", validateContact(body({ email: "not-an-email" })).ok === false)
    check("an empty message is refused", validateContact(body({ message: "   " })).ok === false)
    check("a very long one is refused, not cut", validateContact(body({ message: "x".repeat(5001) })).ok === false)
    check("a form not connected to a store is refused", validateContact(body({ creator_id: "nope" })).ok === false)
    check("a page that is not a page key reads as contact", (() => { const v = validateContact(body({ page: "../../etc" })); return v.ok === true && v.value.page === "contact" })())
    check("only a real true is consent", (() => { const v = validateContact(body({ consent: "yes" })); return v.ok === true && v.value.consent === false })())
  }

  section("Scripts are told it went, and nothing happens")
  {
    check("a person passes", looksAutomated(body()) === false)
    check("the invisible field filled in is a script", looksAutomated(body({ company: "Acme" })) === true)
    check("sent within two and a half seconds is a script", looksAutomated(body({ elapsed: 800 })) === true)
    check("no timing at all is a script", looksAutomated(body({ elapsed: undefined })) === true)
    check("a non-string trap is a script", looksAutomated(body({ company: 1 })) === true)

    const db = contactDb()
    const { deps: d, rec } = deps(db)
    const reply = await handleContact(body({ company: "http://spam.example" }), d)
    check("the trap answers 200 ok", reply.status === 200 && (reply.body as { ok?: boolean }).ok === true)
    check("and writes, counts and sends nothing", db.rows("subscribers").length === 0 && db.rows("site_contact_messages").length === 0 && rec.sent.length === 0 && rec.limited === 0)
    const fast = await handleContact(body({ elapsed: 300 }), d)
    check("a form sent too fast the same", fast.status === 200 && db.rows("subscribers").length === 0 && rec.sent.length === 0)
  }

  section("The rate limit stops it before anything is written")
  {
    const db = contactDb()
    const { deps: d, rec } = deps(db, { limit: async () => ({ status: 429, error: "That is a lot of messages at once. Try again in a few minutes." }) })
    const reply = await handleContact(body(), d)
    check("429 with words a person can read", reply.status === 429 && /Try again/.test((reply.body as { error: string }).error))
    check("and no row, no message, no email", db.rows("subscribers").length === 0 && db.rows("site_contact_messages").length === 0 && rec.sent.length === 0)
    const route = read("app/api/website-builder/contact/route.ts")
    check("the route limits per visitor, per address and per store with the platform limiter",
      /rateLimit\(\{\s*bucket: "site-contact",\s*subjects: \[addressSubject\(req\), emailSubject\(msg\.email\)\]/.test(route) && /bucket: "site-contact-inbox"/.test(route) && /from "@\/lib\/api\/rate-limit"/.test(route))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Only a tick is a yes")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const now = "2026-09-25T12:00:00.000Z"
    const who = { creatorId: CREATOR, email: VISITOR_EMAIL, name: "Jo" }
    const fresh = planSender(null, { ...who, consent: false }, now)
    check("a new sender who did not tick is a contact who wrote", fresh.kind === "insert" && fresh.row.status === "wrote" && fresh.row.consent_text === WROTE_TEXT && fresh.row.consent_timestamp === null && fresh.row.source === "contact_form")
    const yes = planSender(null, { ...who, consent: true }, now)
    check("a new sender who ticked is subscribed, and the record says where", yes.kind === "insert" && yes.row.status === "subscribed" && yes.row.consent_text === CONTACT_CONSENT_TEXT && yes.row.consent_timestamp === now)
    check("a subscriber stays a subscriber either way", planSender({ id: "1", status: "subscribed", is_active: true }, { ...who, consent: false }, now).kind === "none")
    check("somebody who unsubscribed is never put back by a typed address", planSender({ id: "1", status: "unsubscribed", is_active: false }, { ...who, consent: true }, now).kind === "none")
    check("nor a bounced address", planSender({ id: "1", status: "bounced", is_active: true }, { ...who, consent: true }, now).kind === "none")
    check("a customer who ticks joins the list", planSender({ id: "1", status: "customer", is_active: true }, { ...who, consent: true }, now).kind === "subscribe")
    check("a customer who does not tick stays a customer", planSender({ id: "1", status: "customer", is_active: true }, { ...who, consent: false }, now).kind === "none")
    check("somebody who wrote before and ticks now joins", planSender({ id: "1", status: "wrote", is_active: true }, { ...who, consent: true }, now).kind === "subscribe")
  }
  {
    const db = contactDb()
    const { deps: d, rec } = deps(db)
    const reply = await handleContact(body({ consent: false }), d)
    const row = db.rows("subscribers")[0]
    check("unticked: 200, a contact who wrote, no welcome", reply.status === 200 && row?.status === "wrote" && rec.welcomed === 0, row)
    check("the message is kept, with where it came from", db.rows("site_contact_messages").length === 1 && db.rows("site_contact_messages")[0].site === "maralind.storelib.com" && db.rows("site_contact_messages")[0].subscriber_id === row.id)
    check("and marked emailed once the email went", !!db.rows("site_contact_messages")[0].emailed_at)
    check("the source names the website, the form and the page", JSON.stringify(rec.sources[0]) === JSON.stringify({ surface: "website", form: "contact", site: "maralind.storelib.com", page: "contact" }), rec.sources)

    const again = await handleContact(body({ consent: true }), d)
    check("the same person ticking next time joins the list and gets the welcome", again.status === 200 && db.rows("subscribers")[0].status === "subscribed" && rec.welcomed === 1)
    check("one contact, not two", db.rows("subscribers").length === 1)
  }
  {
    const db = contactDb({ wroteAllowed: false })
    const out = await recordSender(db, { creatorId: CREATOR, email: VISITOR_EMAIL, name: "", consent: false })
    check("before the SQL runs an unticked sender is not recorded, and says why", out.outcome === "unavailable" && db.rows("subscribers").length === 0)
    const ticked = await recordSender(db, { creatorId: CREATOR, email: VISITOR_EMAIL, name: "", consent: true })
    check("a ticked one is subscribed all the same", ticked.outcome === "subscribed" && db.rows("subscribers")[0]?.status === "subscribed")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The email to the creator")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = contactDb()
    const { deps: d, rec } = deps(db)
    await handleContact(body({ message: `<script>alert(1)</script>\n\nSecond paragraph & more`, subject: "Order <b>7</b>" }), d)
    const mail = rec.sent[0]
    check("goes to the store's support email", mail?.to === "help@maralind.com", mail?.to)
    check("with Reply going to the visitor", mail?.replyTo === VISITOR_EMAIL)
    check("typed markup is escaped, never markup", !!mail && !/<script>/.test(mail.html) && /&lt;script&gt;/.test(mail.html) && /&amp; more/.test(mail.html) && !/<b>7<\/b>/.test(mail.html))
    check("the subject is one line", !!mail && !/[\r\n]/.test(mail.subject))
    check("it links to the sender in Emails", !!mail && /\/app\/emails\?contact=/.test(mail.html))
    check("from the store's name, on Storelib's address", mail?.fromName === "Maralind website" && /buildMailgunFromHeader\(mail\.fromName\)/.test(read("app/api/website-builder/contact/route.ts")))
  }
  {
    const db = contactDb()
    check("the older section's own Recipient Email wins, read from the published page", (await creatorInbox(db, CREATOR, "legacy-form")) === "orders@maralind.com")
    check("otherwise the support email", (await creatorInbox(db, CREATOR, "new-form")) === "help@maralind.com")
    const noSupport = contactDb({ support: null })
    check("and without one, the account's email", (await creatorInbox(noSupport, CREATOR, null)) === "owner@maralind.com")
    const inbox = creatorEmail({ store: "Maralind", site: "maralind.storelib.com", contactUrl: "https://storelib.com/app/emails", msg: { creatorId: CREATOR, name: "", email: VISITOR_EMAIL, subject: "", message: "hi", consent: true, page: "home", sectionId: null } as ContactMessage })
    /* "New message from <name> on <site>", the owner's words, with the address when there is no name. */
    check("with no name the subject names the address, and the website", inbox.subject === `New message from ${VISITOR_EMAIL} on maralind.storelib.com`, inbox.subject)
  }
  {
    const db = contactDb({ messages: false })
    const { deps: d, rec } = deps(db)
    const reply = await handleContact(body(), d)
    check("before the messages table exists the email still goes and the visitor is told it went", reply.status === 200 && rec.sent.length === 1)
  }
  {
    const db = contactDb({ messages: false })
    const { deps: d } = deps(db, { send: async () => ({ success: false }) })
    const reply = await handleContact(body(), d)
    check("neither kept nor sent is the one answer that says it failed", reply.status === 502)
  }
  {
    /* The account's address, as lib/seller-inbox reads it for every message to a seller. */
    const tagged = contactDb({ support: null })
    tagged.rows("profiles")[0].email = "owner+slb-1a2b3c4d@maralind.com"
    check("a second business's tagged address reaches the owner without the tag", (await creatorInbox(tagged, CREATOR, null)) === "owner@maralind.com")
    const now = contactDb({ support: null })
    check("the login's address as it is now wins over the profile's older copy", (await creatorInbox(now, CREATOR, null, async (id) => (id === "u-1" ? "Owner.New@Maralind.com" : null))) === "owner.new@maralind.com")
  }
  {
    /* No address anywhere: kept, the creator reads it in Emails; not kept either, the visitor is told it did not send. */
    const kept = contactDb({ support: null })
    kept.rows("profiles")[0].email = null
    const { deps: d1, rec: r1 } = deps(kept)
    const keptReply = await handleContact(body(), d1)
    check("no address but the message is kept: 200, nothing emailed", keptReply.status === 200 && r1.sent.length === 0)
    const lost = contactDb({ support: null, messages: false })
    lost.rows("profiles")[0].email = null
    const { deps: d2, rec: r2 } = deps(lost)
    const lostReply = await handleContact(body(), d2)
    check("no address and nowhere to keep it: 502, never a quiet 'sent'", lostReply.status === 502 && r2.sent.length === 0, lostReply)
  }
  {
    const db = contactDb()
    const { deps: d } = deps(db)
    const reply = await handleContact(body({ creator_id: "99999999-9999-4999-8999-999999999999" }), d)
    check("a store that does not exist gets nothing written", reply.status === 404 && db.rows("subscribers").length === 0)
  }
  {
    const db = contactDb()
    db.rows("creators")[0].banned_at = "2026-09-20T00:00:00Z"
    const { deps: d, rec } = deps(db)
    const reply = await handleContact(body(), d)
    check("a banned store's form is no store's: nothing written, nothing sent", reply.status === 404 && db.rows("subscribers").length === 0 && db.rows("site_contact_messages").length === 0 && rec.sent.length === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Nothing personal in the logs")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const leaked = logged.filter((l) => l.toLowerCase().includes(VISITOR_EMAIL) || l.includes(VISITOR_NAME) || l.includes("55821") || l.includes("Elm Row") || l.includes("help@maralind.com") || l.includes("owner@maralind.com"))
    check(`${logged.length} log lines across every scenario, none with an address, a name or a message`, leaked.length === 0, leaked)
    const sources = read("lib/site-contact/contact.ts") + read("lib/site-contact/handle.ts") + read("app/api/website-builder/contact/route.ts")
    check("no log line in the code prints the message, the name or the address", !/console\.\w+\([^)]*(msg\.|\.email|\.name|\.message|input\.email)/.test(sources))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The forms, the page and the list")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const form = (attrs: Record<string, string>, hasEmail = true) => ({
      getAttribute: (n: string) => attrs[n] ?? null,
      querySelector: (s: string) => (hasEmail && s.includes("email") ? {} : null),
    })
    check("a form that says contact is a contact form", formIntent(form({ "data-storelib-form": "contact" })) === "contact")
    check("an email box with nothing said is still a sign up, never a contact", formIntent(form({})) === "subscribe")
    const host = read("components/website-builder/sections/StorelibSection.tsx")
    check("the page sends a contact form to the contact route, with the trap and the timing", /intent === "contact"/.test(host) && /sendContactMessage\(/.test(host) && /company: field\("company"\)/.test(host) && /elapsed:/.test(host))
    check("and never from the builder's canvas", /if \(intent === "contact"\) settle\(form, "done", "Messages reach your email on your live site\."\)/.test(host))
    const legacy = read("components/website-builder/sections/renderers/ContactFormSection.tsx")
    check("the older Contact Form posts to the same route, no mail app", /sendContactMessage\(/.test(legacy) && !/mailto:/.test(legacy.replace(/\/\*[\s\S]*?\*\//g, "")))
    check("and still subscribes only on a ticked, unticked-by-default box", /<input type="checkbox" name="subscribe" value="yes"/.test(legacy) && !/defaultChecked/.test(legacy) && /consent: offerOptIn && data\.get\("subscribe"\) === "yes"/.test(legacy))
    const section = read("themes/default/sections/contact.storelib")
    check("the Contact form section's box starts unticked", /type="checkbox" name="consent" value="yes">/.test(section) && !/checked/.test(section.split("<schema>")[0].replace(/:checked/g, "")))
    check("the Contact form section carries the trap", /name="company" type="text" tabindex="-1" autocomplete="off"/.test(section))
    check("a website's contact source reads as the website, with the form and the page", sourceView({ surface: "website", site: "maralind.storelib.com", form: "contact", page: "contact" }).detail === "Contact form on /contact")
    check("the old one word source for a contact form reads as a website", legacySurface("contact_form") === "website")
    check("a page key is only kept for a website", cleanContactSource({ surface: "checkout", page: "contact" })?.page === undefined)
    check("a checkout by somebody who only wrote makes them a customer", (() => {
      const plan = planContact({ id: "1", status: "wrote", is_active: true }, { creatorId: CREATOR, email: VISITOR_EMAIL, basis: "none", bought: true }, "2026-09-25T00:00:00Z")
      return plan.kind === "update" && plan.patch.status === "customer"
    })())
    check("a campaign never goes to somebody who only wrote", /if \(status === "wrote"\) continue/.test(read("lib/email-campaigns/queue.ts")))
    check("the newsletter box upgrades somebody who wrote, like a customer", /existing\?\.status === "customer" \|\| existing\?\.status === "wrote"/.test(read("app/api/website-builder/subscribe/route.ts")))
    const detail = read("app/(storelib)/app/emails/contact-detail.tsx")
    /* Changed on purpose (round 40 team permissions): read on the server (app/api/email/area?part=contact) for the store the session works in, found by requireTeamPermission("marketing") and filtered by its creator id, so a team member given Marketing sees it too and nobody else does. */
    const area = read("app/api/email/area/route.ts")
    check("a contact's page shows what they wrote, read for the session's own store", /\/api\/email\/area\?part=contact&email=/.test(detail) && /data-contact-messages/.test(detail) && /await requireTeamPermission\("marketing"\)/.test(area) && /from\("site_contact_messages"\)[\s\S]{0,120}\.eq\("creator_id", creatorId\)/.test(area))
    check("and the list has words and a filter for them", /if \(s\.status === "wrote"\) return "Wrote to you"/.test(detail) && /value: "wrote", label: "Wrote to you"/.test(read("app/(storelib)/app/emails/emails-home.tsx")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The SQL: one statement per line, safe twice, nobody but the server writes")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* By its topic, not its number: it is XX_ until the lead numbers it. */
    const partName = readdirSync(join(process.cwd(), "supabase/sql/run-now")).find((f) => /_site_accounts_contact\.sql$/.test(f)) ?? ""
    const migrationName = readdirSync(join(process.cwd(), "supabase/migrations")).find((f) => /_site_accounts_contact\.sql$/.test(f)) ?? ""
    const part = partName ? read(`supabase/sql/run-now/${partName}`) : ""
    const migration = migrationName ? read(`supabase/migrations/${migrationName}`) : ""
    check("there is a run-now part and a migration", !!partName && !!migrationName)
    check("the migration and the run-now part are the same text", part === migration)
    check("every line is a comment or one whole statement", part.trim().split("\n").every((l) => l.startsWith("/*") ? l.endsWith("*/") : l.trim().endsWith(";")))
    check("no -- comments", !/^\s*--/m.test(part))
    check("safe to run twice", /CREATE TABLE IF NOT EXISTS public\.site_contact_messages/.test(part) && /CREATE TABLE IF NOT EXISTS public\.site_account_codes/.test(part) && /DROP POLICY IF EXISTS/.test(part) && /DROP CONSTRAINT IF EXISTS subscribers_status_check/.test(part))
    check("checks are NOT VALID, so old rows are not rechecked", (part.match(/ADD CONSTRAINT/g) ?? []).length === (part.match(/NOT VALID;/g) ?? []).length)
    check("the creator reads their own messages under row level security", /ENABLE ROW LEVEL SECURITY/.test(part) && /FOR SELECT TO authenticated USING \(creator_id IN \(SELECT id FROM public\.creators WHERE user_id = \(SELECT auth\.uid\(\)\)\)\)/.test(part))
    check("and nobody but the server writes them", /REVOKE INSERT, UPDATE, DELETE ON public\.site_contact_messages FROM anon, authenticated/.test(part))
    check("the codes are the server's alone", /REVOKE ALL ON public\.site_account_codes FROM anon, authenticated/.test(part))
    check("the status list keeps every status it had and adds wrote", /'subscribed', 'unsubscribed', 'bounced', 'complained', 'cleaned', 'customer', 'wrote'/.test(part))
    /* Its column in 99 comes with its number: the four paste files end with 99 word for word, and carry numbered parts only. */
    const numbered = /^\d{2}_/.test(partName)
    check("it is listed in the README, and checked after once it is numbered",
      read("supabase/sql/run-now/README.md").includes(partName) &&
        (!numbered || /as p\d{2}_site_accounts_contact/.test(read("supabase/sql/run-now/99_check_after.sql"))))
  }

  for (const k of ["log", "warn", "error", "info"] as const) console[k] = original[k]
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  for (const k of ["log", "warn", "error", "info"] as const) console[k] = original[k]
  console.error(e)
  process.exit(1)
})
