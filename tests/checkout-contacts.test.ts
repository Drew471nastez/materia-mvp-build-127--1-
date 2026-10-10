/**
 * ===========================================================================
 *  EVERY CHECKOUT RECORDS ITS BUYER, AND ONLY A YES IS A YES
 * ===========================================================================
 * lib/contacts/checkout-contact.ts against a subscribers table with the
 * database's own keys (tests/fake-supabase.ts): one row per creator and
 * address whatever its case, the status check, and the race two writers
 * run when Stripe's webhook and the buyer's browser report one payment.
 * Then every checkout route, read, to see it goes through here and nowhere
 * else, and never logs an address.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

import { automationDb } from "./fake-supabase"
import { CONSENT_TEXT, planContact, recordCheckoutContact, type CheckoutContactInput } from "@/lib/contacts/checkout-contact"
import { cleanContactSource, contactSourceOfOrder } from "@/lib/contacts/contact-source"
import { contactStanding } from "@/lib/automations/supabase-store"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const CREATOR = randomUUID()
const PRODUCT = randomUUID()
const base = (over: Partial<CheckoutContactInput> = {}): CheckoutContactInput => ({
  creatorId: CREATOR,
  email: "Ada@Example.com ",
  name: "Ada Lovelace",
  orderId: randomUUID(),
  basis: "none",
  bought: true,
  source: contactSourceOfOrder({ surface: "website", site: "shop.astrid.studio", from: "instagram" }, PRODUCT),
  ...over,
})

async function main() {
  /* Whatever is logged is captured: no address may appear in it. */
  const logged: string[] = []
  for (const k of ["log", "warn", "error"] as const) {
    const real = console[k].bind(console)
    console[k] = (...args: unknown[]) => {
      logged.push(args.map(String).join(" "))
      if (k === "log") real(...args)
    }
  }

  console.log("\nWho becomes what")
  {
    const now = "2026-09-25T10:00:00.000Z"
    const plan = (existing: { status: string | null; is_active?: boolean } | null, over: Partial<CheckoutContactInput>) =>
      planContact(existing ? { id: "x", status: existing.status, is_active: existing.is_active ?? true } : null, base({ email: "ada@example.com", ...over }), now)
    const ticked = plan(null, { basis: "ticked" })
    check("a buyer who ticked the box is subscribed, with the consent written down", ticked.kind === "insert" && ticked.row.status === "subscribed" && ticked.row.consent_text === CONSENT_TEXT.ticked && ticked.row.consent_timestamp === now && typeof ticked.row.unsubscribe_token === "string")
    const none = plan(null, { basis: "none" })
    check("a buyer who did not is a customer, with no consent claimed", none.kind === "insert" && none.row.status === "customer" && none.row.consent_timestamp === null && /Did not ask/.test(String(none.row.consent_text)))
    check("and still gets a way out of their order's emails", none.kind === "insert" && typeof none.row.unsubscribe_token === "string" && none.row.is_active === true)
    check("a started checkout without the tick is not a contact at all", plan(null, { basis: "none", bought: false }).kind === "none")
    check("a started checkout with the tick is subscribed before any payment", (plan(null, { basis: "ticked", bought: false }) as { row?: { status: string } }).row?.status === "subscribed")
    check("a customer who ticks the box on a later order becomes subscribed", (plan({ status: "customer" }, { basis: "ticked" }) as { patch?: { status: string } }).patch?.status === "subscribed")
    check("a subscriber who buys without ticking stays subscribed", plan({ status: "subscribed" }, { basis: "none" }).kind === "none")
    check("somebody who unsubscribed stays unsubscribed when they buy", plan({ status: "unsubscribed", is_active: false }, { basis: "none" }).kind === "none")
    check("and when they take a free download under the notice", plan({ status: "unsubscribed", is_active: false }, { basis: "notice" }).kind === "none")
    check("only a new tick puts them back on the list", (plan({ status: "unsubscribed", is_active: false }, { basis: "ticked" }) as { patch?: { status: string; is_active: boolean } }).patch?.status === "subscribed")
    check("a bounced or complained address is never put back, tick or not", ["bounced", "complained", "cleaned"].every((s) => plan({ status: s }, { basis: "ticked" }).kind === "none"))
    check("the OnePage notice subscribes a new address, as that page always has", (plan(null, { basis: "notice" }) as { row?: { status: string } }).row?.status === "subscribed")
  }

  console.log("\nWritten once, whatever retries")
  {
    const db = automationDb()
    const first = await recordCheckoutContact(db, base({ basis: "none" }))
    const again = await recordCheckoutContact(db, base({ basis: "none" }))
    const rows = db.rows("subscribers")
    check("a paid order without the tick records a customer", first === "customer" && rows.length === 1 && rows[0].status === "customer", rows)
    check("the webhook's retry of the same order changes nothing", again === "unchanged" && db.rows("subscribers").length === 1)
    check("the address is kept in lower case, trimmed", rows[0].email === "ada@example.com")
    check("with source checkout, the order, and where it happened", rows[0].source === "checkout" && typeof rows[0].source_id === "string" && rows[0].source_detail?.surface === "checkout" && rows[0].source_detail?.site === "shop.astrid.studio" && rows[0].source_detail?.product === PRODUCT, rows[0].source_detail)
    await recordCheckoutContact(db, base({ email: "ADA@EXAMPLE.COM", basis: "ticked" }))
    check("the same person in capitals ticking on a later order is the same row, now subscribed", db.rows("subscribers").length === 1 && db.rows("subscribers")[0].status === "subscribed")
    const standing = await contactStanding(db, CREATOR, "ada@example.com")
    check("and the engine reads them as on the list for news, with their token", standing.subscribed === true && standing.status === "subscribed" && standing.unsubscribeToken === db.rows("subscribers")[0].unsubscribe_token)
  }
  {
    const db = automationDb()
    const [a, b] = await Promise.all([recordCheckoutContact(db, base({ basis: "ticked" })), recordCheckoutContact(db, base({ basis: "ticked" }))])
    check("the browser and the webhook at the same moment write one row", db.rows("subscribers").length === 1 && [a, b].includes("subscribed"), { a, b, rows: db.rows("subscribers").length })
  }
  {
    const db = automationDb()
    db.tables.subscribers.push({ id: randomUUID(), creator_id: CREATOR, email: "ada@example.com", status: "unsubscribed", is_active: false, unsubscribe_token: randomUUID(), source_detail: { surface: "profile" } })
    const r = await recordCheckoutContact(db, base({ basis: "none" }))
    const row = db.rows("subscribers")[0]
    check("a checkout never re-subscribes somebody who left", r === "unchanged" && row.status === "unsubscribed" && row.is_active === false)
    check("and where they first joined is kept: the first door wins", row.source_detail.surface === "profile")
    const standing = await contactStanding(db, CREATOR, "ada@example.com")
    check("the engine reads them as not to be emailed at all", standing.suppressed === true && standing.subscribed === false)
  }
  {
    const db = automationDb()
    /* The database before RUN_CHECKOUT_CONTACTS.sql: an old status check without "customer". */
    db.specs.subscribers.checks = [(r) => (["subscribed", "unsubscribed", "bounced", "complained"].includes(r.status) ? null : "subscribers_status_check")]
    const r = await recordCheckoutContact(db, base({ basis: "none" }))
    check("before the SQL, a customer contact is refused by the old check and the checkout carries on", r === "unavailable" && db.rows("subscribers").length === 0)
    const t = await recordCheckoutContact(db, base({ basis: "ticked" }))
    check("while a buyer who ticked is subscribed as before", t === "subscribed" && db.rows("subscribers")[0].status === "subscribed")
  }
  {
    const db = automationDb()
    delete db.tables.subscribers
    check("a table that cannot be read fails quietly, never throws", (await recordCheckoutContact(db, base({ basis: "ticked" }))) === "failed")
    check("a nonsense address is not written", (await recordCheckoutContact(automationDb(), base({ email: "not an address" }))) === "skipped")
  }
  {
    const customer = await contactStanding(
      (() => { const db = automationDb(); db.tables.subscribers.push({ id: "1", creator_id: CREATOR, email: "c@x.co", status: "customer", is_active: true, unsubscribe_token: "t" }); return db })(),
      CREATOR,
      "c@x.co",
    )
    check("a customer is emailed about their order, not as a subscriber", customer.suppressed === false && customer.subscribed === false && customer.status === "customer" && customer.unsubscribeToken === "t")
  }
  check("a product id only rides on a checkout's source, and only as an id", cleanContactSource({ surface: "checkout", product: PRODUCT })?.product === PRODUCT && cleanContactSource({ surface: "website", product: PRODUCT })?.product === undefined && cleanContactSource({ surface: "checkout", product: "<b>x" })?.product === undefined)

  console.log("\nNo address in any log line")
  check("nothing written to the console carries an address or a name", logged.every((l) => !/@/.test(l) && !/Lovelace/.test(l)), logged.filter((l) => /@|Lovelace/.test(l)))

  console.log("\nEvery checkout goes through here")
  const routes: Array<[string, string, RegExp]> = [
    ["a paid checkout (the webhook and the browser)", "lib/checkout/fulfil-payment.ts", /basis: m\.email_opt_in === "true" \? "ticked" : "none"/],
    /* Changed on purpose (round T): "none" unless the physical checkout's news box was ticked (Settings › Checkout). */
    ["a basket on a creator's site", "lib/checkout/fulfil-cart-item.ts", /basis: "ticked" \| "none" = "none"\) \{[\s\S]*?\n    basis,\n/],
    ["a free claim", "app/api/checkout/process/route.ts", /basis: body\.emailOptIn === true \? "ticked" : "none"/],
    ["a OnePage free download", "app/api/checkout/quick-free/route.ts", /basis: "notice"/],
    ["an older Stripe session", "app/api/stripe/webhook/route.ts", /basis: metadata\.email_opt_in === "true" \? "ticked" : "none"/],
    ["a checkout that reached Pay", "app/api/checkout/stripe-session/route.ts", /basis: "ticked", bought: false/],
  ]
  for (const [what, file, basis] of routes) {
    const src = read(file)
    /* recordCheckoutContactAndWelcome is this, and the welcome on a join (lib/contacts/checkout-welcome, tests/checkout-welcome). */
    check(`${what}: recorded through recordCheckoutContact, with the consent it has`, /recordCheckoutContact(AndWelcome)?\(/.test(src) && basis.test(src))
    check(`${what}: no second, hand-written subscribe`, !/from\("subscribers"\)\s*\.insert\(/.test(src) && !/status: "subscribed"/.test(src))
  }
  console.log("\nA customer who signs up anywhere joins the list")
  {
    const site = read("app/api/website-builder/subscribe/route.ts")
    /* And somebody who only wrote through a contact form (lib/site-contact), the
       same way: the update is conditional on the status that was read. */
    check("a website's sign-up box turns a customer into a subscriber, with the welcome", /const customer = existing\?\.status === "customer" \|\| existing\?\.status === "wrote"/.test(site) && /if \(existing && !customer\) return/.test(site) && /\.update\(\{ status: "subscribed", is_active: true, subscribed_at: now, consent_text: consentFor\(body\.placement\), consent_timestamp: now \}\)\.eq\("id", existing!\.id\)\.eq\("status", existing!\.status\)/.test(site))
    for (const f of ["app/api/onepage/email-capture/route.ts", "app/api/onepage/leads/route.ts"]) {
      const src = read(f)
      check(`${f.replace("app/api/", "")}: a customer is subscribed like somebody coming back, and the consent is written`, /status === "unsubscribed" \|\| existing(Sub|Subscriber)\.status === "customer"/.test(src) && /consent_timestamp: new Date\(\)\.toISOString\(\),\s*\}\)\s*\.eq\("id", existing(Sub|Subscriber)\.id\)/.test(src))
    }
    for (const f of ["app/api/subscribers/route.ts", "app/api/subscribe/route.ts"]) {
      const src = read(f)
      check(`${f.replace("app/api/", "")}: anybody not already subscribed is subscribed, and the new yes is written down`, /consent_timestamp: new Date\(\)\.toISOString\(\),\s*\}\)\s*\.eq\("id", existing(Subscriber)?\.id\)/.test(src))
    }
  }

  const session = read("app/api/checkout/stripe-session/route.ts")
  check("the start and a ticked box are written after the answer, so Pay is not slower", /* Changed on purpose (round T): written only while the store sends checkout reminders. */ /after\(async \(\) => \{[\s\S]{0,200}?if \(checkoutConfig\.abandonedRecovery\) await recordCheckoutStart\(/.test(session) && /if \(optedIn\) \{\s*await recordCheckoutContact(AndWelcome)?\(/.test(session))
  const contactSrc = read("lib/contacts/checkout-contact.ts")
  check("the contact module logs a code and nothing else", !/console\.[a-z]+\([^)]*email/.test(contactSrc) && /note\("could not insert", error\.code\)/.test(contactSrc))

  console.log("\nThe SQL")
  {
    const sql = read("supabase/sql/RUN_CHECKOUT_CONTACTS.sql")
    const migration = read("supabase/migrations/20260929_checkout_contacts.sql")
    const statements = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.trim()).filter(Boolean)
    check("the migration and the file to paste carry the same statements", statements(sql).join("\n") === statements(migration).join("\n"))
    check("every statement is on one line", statements(sql).every((l) => /;$/.test(l)), statements(sql).filter((l) => !/;$/.test(l)))
    check("no -- comments to be cut in half", !/(^|\s)--\s/m.test(sql))
    check("customer is an allowed status, added NOT VALID", /CHECK \(status IS NULL OR status IN \([^)]*'customer'\)\) NOT VALID;/.test(sql))
    check("one contact per creator and lower(email), built only when the data allows it", /IF NOT EXISTS \(SELECT 1 FROM public\.subscribers GROUP BY creator_id, lower\(email\) HAVING count\(\*\) > 1\) THEN CREATE UNIQUE INDEX IF NOT EXISTS subscribers_creator_email_lower ON public\.subscribers \(creator_id, lower\(email\)\)/.test(sql))
    check("one start per PaymentIntent", /CREATE UNIQUE INDEX IF NOT EXISTS checkout_starts_intent ON public\.checkout_starts \(payment_intent_id\)/.test(sql))
    check("creators read their own starts and write none", /REVOKE INSERT, UPDATE, DELETE ON public\.checkout_starts FROM anon, authenticated/.test(sql) && /FOR SELECT USING \(creator_id IN \(SELECT id FROM public\.creators WHERE user_id = \(SELECT auth\.uid\(\)\)\)\)/.test(sql))
    check("safe to run twice", !/CREATE TABLE (?!IF NOT EXISTS)/.test(sql) && !/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/.test(sql) && (sql.match(/ADD CONSTRAINT/g) ?? []).length === (sql.match(/DROP CONSTRAINT IF EXISTS/g) ?? []).length)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
void main()
