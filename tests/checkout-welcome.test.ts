/**
 * ===========================================================================
 *  "EMAIL ME NEWS" AT CHECKOUT STARTS THE WELCOME, ONCE
 * ===========================================================================
 * lib/contacts/checkout-welcome.ts, end to end on a database with
 * Postgres's rules (tests/fake-supabase.ts): the checkout's contact write
 * (lib/contacts/checkout-contact) and the engine's own entry into the
 * creator's "Someone joins your email list" flow (lib/automations/engine
 * enroll, through the real store, lib/automations/supabase-store), which is
 * what triggerEmailFlows does in the app. Nothing is sent: no mailer runs.
 *
 *   a tick that puts the buyer on the list enters the welcome
 *   the webhook's retry, the browser's report of the same payment, the two
 *   at once, and the tick at Pay followed by the payment: one run
 *   no tick, or already on the list: nothing
 *   a customer who ticks later, or somebody who left and ticks again: a join
 *   the checkout reminder's sweep, when it is what records the tick
 *   a welcome that cannot start never fails the checkout
 *
 * Then every checkout route, read, to see a tick goes through here.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

process.env.AUTOMATION_LINK_SECRET = "a-test-secret-that-is-long-enough"

import { automationDb, type FakeSupabase } from "./fake-supabase"
import { supabaseStarts, supabaseStore } from "@/lib/automations/supabase-store"
import { enroll } from "@/lib/automations/engine"
import { templateById } from "@/lib/automations/templates"
import { serializeSteps } from "@/lib/automations/flow-model"
import { recordCheckoutStart, sweepAbandoned } from "@/lib/automations/abandoned"
import type { CheckoutContactInput } from "@/lib/contacts/checkout-contact"
import { joinedTheList, recordCheckoutContactAndWelcome, type StartWelcome } from "@/lib/contacts/checkout-welcome"
import { contactSourceOfOrder } from "@/lib/contacts/contact-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const MIN = 60_000

interface World {
  db: FakeSupabase
  creatorId: string
  productId: string
  welcomeId: string
  /** How many times the checkout asked for the welcome to start. */
  asked: number
  start: StartWelcome
}

/** A creator with the Welcome series turned on, and the app's way in to it (triggerEmailFlows) standing in as the engine itself. */
function world(): World {
  const db = automationDb()
  const creatorId = randomUUID()
  const productId = randomUUID()
  db.tables.creators.push({ id: creatorId, slug: "astrid", headline: null, support_email: "hello@astrid.studio", user_id: "u1" })
  db.tables.profiles.push({ id: "u1", display_name: "Astrid Lens", username: "astrid", email: "astrid@example.com", avatar_url: null })
  db.tables.products.push({ id: productId, creator_id: creatorId, slug: "autumn-presets", title: "Autumn presets" })
  const t = templateById("welcome")!
  const welcomeId = randomUUID()
  db.tables.email_flows.push({ id: welcomeId, creator_id: creatorId, name: t.name, trigger_type: t.trigger, trigger_config: { template: t.id, entry: t.entry }, status: "active", steps: serializeSteps(t.steps) })
  const w: World = {
    db,
    creatorId,
    productId,
    welcomeId,
    asked: 0,
    start: async (_db, who) => {
      w.asked++
      return enroll(supabaseStore(db), { triggerType: "new_subscriber", creatorId: who.creatorId, email: who.email, name: who.name, source: who.source }, db.clock)
    },
  }
  return w
}

const welcomes = (w: World, email = "ada@example.com") => w.db.rows("email_flow_runs").filter((r) => r.flow_id === w.welcomeId && r.email === email)

const input = (w: World, over: Partial<CheckoutContactInput> = {}): CheckoutContactInput => ({
  creatorId: w.creatorId,
  email: "Ada@Example.com ",
  name: "Ada Lovelace",
  orderId: randomUUID(),
  basis: "ticked",
  bought: true,
  source: contactSourceOfOrder({ surface: "website", site: "shop.astrid.studio", from: "instagram" }, w.productId),
  ...over,
})

function contact(w: World, email: string, status: string) {
  w.db.tables.subscribers.push({ id: randomUUID(), creator_id: w.creatorId, email, name: "Ada Lovelace", status, is_active: status !== "unsubscribed", unsubscribe_token: randomUUID(), source_detail: null })
}

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

  console.log("\nA tick that puts them on the list starts the welcome")
  {
    const w = world()
    const r = await recordCheckoutContactAndWelcome(w.db, input(w), w.start)
    const runs = welcomes(w)
    check("a new buyer who ticked the box is subscribed", r === "subscribed" && w.db.rows("subscribers")[0]?.status === "subscribed", r)
    check("and is in the creator's welcome, once, from its first step", runs.length === 1 && runs[0].status === "active" && w.asked === 1, { runs: runs.length, asked: w.asked })
    check("under the address as the list holds it, lower case", runs[0]?.email === "ada@example.com")
    check("with where they came from kept on the run, as every sign up box does", JSON.stringify(runs[0]?.source_detail ?? runs[0]?.source ?? null).includes("shop.astrid.studio"), runs[0])

    const again = await recordCheckoutContactAndWelcome(w.db, input(w), w.start)
    check("Stripe's webhook delivered again: already subscribed, nothing asked, still one run", again === "unchanged" && w.asked === 1 && welcomes(w).length === 1, { again, asked: w.asked })
    const later = await recordCheckoutContactAndWelcome(w.db, input(w, { orderId: randomUUID() }), w.start)
    check("a second order with the box ticked again: they joined before, no second welcome", later === "unchanged" && w.asked === 1 && welcomes(w).length === 1)
  }
  {
    const w = world()
    const same = input(w)
    const [a, b] = await Promise.all([recordCheckoutContactAndWelcome(w.db, same, w.start), recordCheckoutContactAndWelcome(w.db, same, w.start)])
    check("the browser and the webhook at the same moment: one row, one join, one run", w.db.rows("subscribers").length === 1 && [a, b].filter((o) => o === "subscribed").length === 1 && w.asked === 1 && welcomes(w).length === 1, { a, b, asked: w.asked })
  }
  {
    const w = world()
    await recordCheckoutContactAndWelcome(w.db, input(w, { bought: false, orderId: null }), w.start)
    check("the tick recorded when Pay is pressed starts it", welcomes(w).length === 1 && w.asked === 1)
    await recordCheckoutContactAndWelcome(w.db, input(w), w.start)
    check("and the payment's own record of the same tick starts nothing more", welcomes(w).length === 1 && w.asked === 1)
  }
  {
    const w = world()
    /* Even if the welcome were asked for twice, the engine enters a person once in its window. */
    const who = { creatorId: w.creatorId, email: "ada@example.com", name: null, source: null }
    contact(w, "ada@example.com", "subscribed")
    await w.start(w.db, who)
    await w.start(w.db, who)
    check("asked twice, the engine's own key still enters one run", welcomes(w).length === 1)
  }

  console.log("\nNo tick, or already on the list: nothing")
  {
    const w = world()
    const r = await recordCheckoutContactAndWelcome(w.db, input(w, { basis: "none" }), w.start)
    check("a buyer who left the box unticked is a customer, and not welcomed", r === "customer" && w.asked === 0 && welcomes(w).length === 0, r)
  }
  {
    const w = world()
    contact(w, "ada@example.com", "subscribed")
    const r = await recordCheckoutContactAndWelcome(w.db, input(w), w.start)
    check("somebody already subscribed who ticks it: unchanged, no welcome", r === "unchanged" && w.asked === 0 && welcomes(w).length === 0, r)
  }
  {
    const w = world()
    contact(w, "ada@example.com", "bounced")
    const r = await recordCheckoutContactAndWelcome(w.db, input(w), w.start)
    check("a bounced address is never put back, and never welcomed", r === "unchanged" && w.asked === 0 && welcomes(w).length === 0, r)
  }
  {
    const w = world()
    contact(w, "ada@example.com", "unsubscribed")
    const r = await recordCheckoutContactAndWelcome(w.db, input(w, { basis: "none" }), w.start)
    check("somebody who left and buys without ticking stays off the list, and is not welcomed", r === "unchanged" && w.asked === 0 && welcomes(w).length === 0, r)
  }

  console.log("\nA later yes is a join")
  {
    const w = world()
    contact(w, "ada@example.com", "customer")
    const r = await recordCheckoutContactAndWelcome(w.db, input(w), w.start)
    check("a customer who ticks the box on a later order joins, and is welcomed", r === "subscribed" && welcomes(w).length === 1, r)
  }
  {
    const w = world()
    contact(w, "ada@example.com", "unsubscribed")
    const r = await recordCheckoutContactAndWelcome(w.db, input(w), w.start)
    check("somebody who unsubscribed and ticks it again joins again, and is welcomed", r === "resubscribed" && welcomes(w).length === 1, r)
  }
  {
    const w = world()
    const r = await recordCheckoutContactAndWelcome(w.db, input(w, { basis: "notice" }), w.start)
    check("the OnePage free download under its notice joins the list, as its own sign up box does, and is welcomed", r === "subscribed" && welcomes(w).length === 1, r)
  }
  check("joins are subscribed and resubscribed, nothing else", joinedTheList("subscribed") && joinedTheList("resubscribed") && !["customer", "unchanged", "skipped", "unavailable", "failed"].some((o) => joinedTheList(o as never)))

  console.log("\nThe checkout reminder's sweep")
  {
    /* The route's write at Pay never happened (it runs after the answer): the sweep's is the join. */
    const w = world()
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, productTitle: "Autumn presets", email: "ada@example.com", firstName: "Ada", paymentIntentId: "pi_leftwithtick", optedIn: true })
    w.db.clock += 61 * MIN
    await sweepAbandoned({ store: supabaseStore(w.db), starts: supabaseStarts(w.db), now: w.db.clock })
    check("a tick only the sweep records is a join, and the welcome starts there", w.db.rows("subscribers")[0]?.status === "subscribed" && welcomes(w).length === 1)
  }
  {
    const w = world()
    await recordCheckoutContactAndWelcome(w.db, input(w, { bought: false, orderId: null }), w.start)
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, productTitle: "Autumn presets", email: "ada@example.com", firstName: "Ada", paymentIntentId: "pi_leftaftertick", optedIn: true })
    w.db.clock += 61 * MIN
    await sweepAbandoned({ store: supabaseStore(w.db), starts: supabaseStarts(w.db), now: w.db.clock })
    check("a tick the route already recorded: the sweep finds them subscribed and the welcome is still one run", welcomes(w).length === 1)
  }
  {
    const w = world()
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, productTitle: "Autumn presets", email: "bo@example.com", firstName: "Bo", paymentIntentId: "pi_nottick", optedIn: false })
    w.db.clock += 61 * MIN
    await sweepAbandoned({ store: supabaseStore(w.db), starts: supabaseStarts(w.db), now: w.db.clock })
    check("a start without the tick joins nobody and welcomes nobody", welcomes(w, "bo@example.com").length === 0 && w.db.rows("subscribers").length === 0)
  }

  console.log("\nNever a reason to fail the checkout")
  {
    const w = world()
    const r = await recordCheckoutContactAndWelcome(w.db, input(w), async () => { throw new Error("engine down") })
    check("a welcome that cannot start: the contact is still subscribed and nothing throws", r === "subscribed" && w.db.rows("subscribers")[0]?.status === "subscribed")
  }

  console.log("\nNo address in any log line")
  check("nothing written to the console carries an address or a name", logged.every((l) => !/@/.test(l) && !/Lovelace/.test(l)), logged.filter((l) => /@|Lovelace/.test(l)))

  console.log("\nEvery checkout with a yes goes through here")
  for (const [what, file] of [
    ["a paid checkout (the webhook and the browser)", "lib/checkout/fulfil-payment.ts"],
    ["a free claim", "app/api/checkout/process/route.ts"],
    ["a OnePage free download", "app/api/checkout/quick-free/route.ts"],
    ["an older Stripe session", "app/api/stripe/webhook/route.ts"],
    ["a checkout that reached Pay", "app/api/checkout/stripe-session/route.ts"],
  ] as const) {
    const src = read(file)
    check(`${what}: records the contact and starts the welcome on a join`, /recordCheckoutContactAndWelcome\(/.test(src) && !/\brecordCheckoutContact\(/.test(src))
  }
  const welcome = read("lib/contacts/checkout-welcome.ts")
  check("the welcome is the new_subscriber trigger every sign up box fires, imported only when needed",
    /triggerType: "new_subscriber"/.test(welcome) && /await import\("@\/lib\/email"\)/.test(welcome) && !/^import .*@\/lib\/email/m.test(welcome))
  check("and it starts only on a join", /if \(!joinedTheList\(outcome\)\) return outcome/.test(welcome))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
void main()
