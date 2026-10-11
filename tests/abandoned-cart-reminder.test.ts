/**
 * Settings › Checkout › Abandoned checkouts, end to end on a database with
 * Postgres's rules (tests/fake-supabase.ts):
 *
 *   the single product checkout, the physical checkout and a signed in
 *   buyer's website basket each write a start when they reach Pay, only
 *   while the setting is on;
 *   the hourly sweep reminds an hour later, only a buyer who asked for news
 *   or is on the list, never one who bought since, never one who left the
 *   list, and not at all once the store turned the setting off;
 *   a store with no reminder automation of its own gets Storelib's one
 *   reminder email (it used to get nothing), with the person's own
 *   unsubscribe link; a store with one gets its automation, never both;
 *   "Finish checkout" goes back to the cart's own checkout with its items.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/abandoned-cart-reminder.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

process.env.AUTOMATION_LINK_SECRET = "a-test-secret-that-is-long-enough"

import { automationDb, type FakeSupabase } from "./fake-supabase"
import { supabaseStarts, supabaseStore } from "@/lib/automations/supabase-store"
import { cleanReturnPath, recordCheckoutStart, sweepAbandoned, type CheckoutStart } from "@/lib/automations/abandoned"
import { serializeSteps } from "@/lib/automations/flow-model"
import type { RunRow } from "@/lib/automations/engine"
import { templateById } from "@/lib/automations/templates"
import { physicalCheckoutHref } from "@/lib/physical/cart-link"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const MIN = 60_000

interface World {
  db: FakeSupabase
  creatorId: string
  productId: string
  mugId: string
}

function world(): World {
  const db = automationDb()
  const creatorId = randomUUID()
  const productId = randomUUID()
  const mugId = randomUUID()
  db.tables.creators.push({ id: creatorId, slug: "astrid", headline: null, support_email: "hello@astrid.studio", user_id: "u1" })
  db.tables.profiles.push({ id: "u1", display_name: "Astrid Lens", username: "astrid", email: "astrid@example.com", avatar_url: null })
  db.tables.products.push({ id: productId, creator_id: creatorId, slug: "autumn-presets", title: "Autumn presets", type: "digital", status: "published" })
  db.tables.products.push({ id: mugId, creator_id: creatorId, slug: "mug", title: "Stoneware mug", type: "physical", status: "published" })
  return { db, creatorId, productId, mugId }
}

function subscribe(w: World, email: string, status = "subscribed") {
  w.db.tables.subscribers.push({ id: randomUUID(), creator_id: w.creatorId, email, name: "Ada", status, is_active: status !== "unsubscribed", unsubscribe_token: `tok_${randomUUID().slice(0, 8)}`, source_detail: null })
}

function turnOnReminderFlow(w: World) {
  const t = templateById("checkout_reminder")!
  w.db.tables.email_flows.push({ id: randomUUID(), creator_id: w.creatorId, name: t.name, trigger_type: t.trigger, trigger_config: { template: t.id, entry: t.entry }, status: "active", steps: serializeSteps(t.steps) })
}

async function sweep(w: World, opts: { on?: boolean } = {}) {
  const reminded: { start: CheckoutStart; token: string }[] = []
  w.db.clock += 61 * MIN
  const res = await sweepAbandoned({
    store: supabaseStore(w.db),
    starts: supabaseStarts(w.db),
    now: w.db.clock,
    recoveryOn: async () => opts.on !== false,
    remind: async (start, token) => {
      reminded.push({ start, token })
      return true
    },
  })
  return { res, reminded }
}

const cartPath = (w: World) => physicalCheckoutHref(w.creatorId, [{ productId: w.mugId, variantId: null, quantity: 2 }], "https://astrid.example/cart")

async function main() {
  console.log("\nA start is written when a checkout reaches Pay\n")
  {
    const w = world()
    const okPi = await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, email: "Ada@Example.com", paymentIntentId: "pi_123abc", optedIn: true })
    const okCs = await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.mugId, email: "bo@example.com", paymentIntentId: "cs_test_a1B2c3", optedIn: false, returnPath: cartPath(w) })
    check("a PaymentIntent (single product) and a Checkout Session (a cart) each make one start", okPi && okCs && w.db.rows("checkout_starts").length === 2)
    check("  the cart's way back is kept", w.db.rows("checkout_starts")[1].return_path === cartPath(w))
    check("  the same page twice is one start", (await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.mugId, email: "bo@example.com", paymentIntentId: "cs_test_a1B2c3", optedIn: false })) === false && w.db.rows("checkout_starts").length === 2)
    check("anything else is not a payment and makes nothing", (await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, email: "c@example.com", paymentIntentId: "co_123", optedIn: true })) === false)
    check("only a path on Storelib's own cart checkouts is ever a way back", cleanReturnPath(cartPath(w)) === cartPath(w) && cleanReturnPath("/checkout/cart?shop=x&items=y") !== null && cleanReturnPath("https://evil.example/checkout/physical?x") === null && cleanReturnPath("/checkout/physical?x=<script>") === null && cleanReturnPath("//evil.example") === null)
  }

  console.log("\nThe sweep, with no reminder automation of the store's own\n")
  {
    const w = world()
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.mugId, email: "ada@example.com", firstName: "Ada", paymentIntentId: "cs_ada", optedIn: true, returnPath: cartPath(w) })
    const { res, reminded } = await sweep(w)
    check("a buyer who ticked the news box gets Storelib's one reminder (this used to send nothing)", res.outcomes.entered === 1 && res.reminded === 1 && reminded.length === 1, res)
    check("  with their own unsubscribe link: the tick put them on the list with a token", reminded[0]?.token.length > 0 && w.db.rows("subscribers").some((s) => s.email === "ada@example.com" && s.status === "subscribed" && s.unsubscribe_token === reminded[0].token))
    check("  and the cart's way back", reminded[0]?.start.return_path === cartPath(w))
    check("  once: the next sweep finds nothing", (await sweep(w)).reminded.length === 0)
  }
  {
    const w = world()
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, email: "bo@example.com", paymentIntentId: "pi_bo", optedIn: false })
    const { res, reminded } = await sweep(w)
    check("a buyer who did not tick it and is not on the list: nothing (a reminder is marketing)", res.outcomes.no_consent === 1 && reminded.length === 0)
  }
  {
    const w = world()
    subscribe(w, "cy@example.com")
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, email: "cy@example.com", paymentIntentId: "cs_cy", optedIn: false })
    const { reminded } = await sweep(w)
    check("a buyer already on the list is reminded (a signed in website basket has no news box)", reminded.length === 1)
  }
  {
    const w = world()
    subscribe(w, "di@example.com", "unsubscribed")
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, email: "di@example.com", paymentIntentId: "pi_di", optedIn: true })
    const { res, reminded } = await sweep(w)
    check("somebody who left the list is never reminded, ticked box or not", res.outcomes.unsubscribed === 1 && reminded.length === 0)
  }
  {
    const w = world()
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, email: "ed@example.com", paymentIntentId: "pi_ed", optedIn: true })
    w.db.tables.orders.push({ id: randomUUID(), product_id: w.productId, buyer_email: "ed@example.com", status: "completed", created_at: new Date(w.db.clock + 10 * MIN).toISOString() })
    const { res, reminded } = await sweep(w)
    check("a checkout paid for within the hour is never reminded of", res.outcomes.bought === 1 && reminded.length === 0)
  }
  {
    const w = world()
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, email: "fi@example.com", paymentIntentId: "pi_fi", optedIn: true })
    const { res, reminded } = await sweep(w, { on: false })
    check("the store turned the setting off since: settled, nobody reminded", res.outcomes.no_consent === 1 && reminded.length === 0 && w.db.rows("checkout_starts")[0].handled_at)
  }

  console.log("\nA store with its own reminder automation\n")
  {
    const w = world()
    turnOnReminderFlow(w)
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.mugId, email: "gu@example.com", paymentIntentId: "cs_gu", optedIn: true, returnPath: cartPath(w) })
    const { res, reminded } = await sweep(w)
    const run = w.db.rows("email_flow_runs")[0] as RunRow
    check("its automation is entered, and Storelib's reminder is not sent as well", res.entered === 1 && reminded.length === 0 && !!run, res)
    check("  the run knows the cart's checkout", run?.context?.checkout_path === cartPath(w), run?.context)
    const links = await supabaseStore(w.db).links(run)
    check("  {{checkout_url}} goes back to the cart's checkout with its items", links.checkoutUrl === `https://storelib.com${cartPath(w)}` || (links.checkoutUrl ?? "").endsWith(cartPath(w)), links)
    const noPath = await supabaseStore(w.db).links({ ...run, context: { product_id: w.mugId } } as RunRow)
    check("  a product that ships, with no cart kept, goes to the product, never the single product checkout that refuses it", !!noPath.checkoutUrl && !/\/checkout\?productId=/.test(noPath.checkoutUrl!) && noPath.checkoutUrl === noPath.productUrl, noPath)
    const digital = await supabaseStore(w.db).links({ ...run, context: { product_id: w.productId } } as RunRow)
    check("  a download goes to its own checkout, as before", /\/checkout\?productId=/.test(digital.checkoutUrl ?? ""))
  }

  console.log("\nWhere the starts are written, and the reminder sent\n")
  {
    const physical = read("lib/physical/checkout-server.ts")
    check("the physical checkout writes a start per Stripe page, only while the setting is on", /if \(config\.abandonedRecovery\) \{\s*await recordCheckoutStart\(db, \{/.test(physical) && /paymentIntentId: session\.id,/.test(physical))
    check("  with the news box's answer, only when the store shows the box", /optedIn: config\.marketingOptIn && input\.emailOptIn === true/.test(physical))
    check("  and the way back to this checkout with its items", /returnPath: physicalCheckoutHref\(priced\.creatorId, q\.lines\.map/.test(physical))
    const basket = read("app/api/checkout/cart/route.ts")
    check("the website basket writes one for a signed in buyer, only while the setting is on, never ticked for them", /if \(user\?\.email\) \{\s*const config = await loadCheckoutConfig\(admin, creatorId\)\s*if \(config\.abandonedRecovery\)/.test(basket) && /optedIn: false,/.test(basket) && /returnPath: basketCheckoutHref\(/.test(basket))
    check("the single product checkout still writes one only while the setting is on", /if \(checkoutConfig\.abandonedRecovery\) await recordCheckoutStart\(admin, \{/.test(read("app/api/checkout/stripe-session/route.ts")))
    const run = read("lib/automations/abandoned-run.ts")
    check("the hourly sweep checks the setting again and sends Storelib's reminder", /loadCheckoutConfig\(db, creatorId\)\.then\(\(c\) => c\.abandonedRecovery\)/.test(run) && /sendCheckoutReminder\(db, start, token\)/.test(run) && /recoveryOn, remind/.test(run))
    check("  every hour (vercel.json)", /"path": "\/api\/cron\/process-scheduled-emails",\s*"schedule": "0 \* \* \* \*"/.test(read("vercel.json")) && /runAbandonedSweep\(\)/.test(read("app/api/cron/process-scheduled-emails/route.ts")))
    const reminder = read("lib/automations/abandoned-reminder.ts")
    check("the reminder carries the List-Unsubscribe header and is never sent without a token", /"List-Unsubscribe": `<\$\{unsubscribeUrl\}>`/.test(reminder) && /if \(!unsubscribeToken\) return false/.test(reminder))
    check("  a product no longer on sale is not reminded of", /product\.status !== "published"/.test(reminder))
    check("the database part keeps the way back, only ever a Storelib checkout path", /ADD COLUMN IF NOT EXISTS return_path text/.test(read("supabase/sql/run-now/129_customer_email_words_and_tax_on_receipts.sql")) && /return_path ~ '\^\/checkout\/\(physical\|cart\)\[\?\]'/.test(read("supabase/sql/run-now/129_customer_email_words_and_tax_on_receipts.sql")))
    check("  a database without it still sweeps (read again without the column)", /error\.code === "42703" \|\| error\.code === "PGRST204"/.test(read("lib/automations/supabase-store.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main()
