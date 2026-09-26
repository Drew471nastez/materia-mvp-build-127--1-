/**
 * ===========================================================================
 *  EVERY TEMPLATE, END TO END, ON A DATABASE WITH POSTGRES'S RULES
 * ===========================================================================
 * Each starting point in lib/automations/templates.ts is turned on and run
 * the way production runs it: through the real store
 * (lib/automations/supabase-store.ts) against tests/fake-supabase.ts, which
 * keeps the SQL's unique keys, checks and functions. For each one:
 *
 *   the trigger that starts it enters one run, and the same trigger again
 *   enters nothing
 *   every job is claimed and done, every wait holds until its time
 *   each email's send row is written, status "sending", BEFORE the mailer is
 *   called; a failed send is retried and never sent twice
 *   every {{field}} is filled, the store's brand is handed to the frame, and
 *   the email carries its unsubscribe link and header
 *   an open and a click are recorded once each
 *
 * and the rules that end a run early: a purchase ends a checkout reminder,
 * an unsubscribe ends anything, a buyer who never asked for news never gets
 * a flow that sells, a first order flow ignores a second order.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

process.env.AUTOMATION_LINK_SECRET = "a-test-secret-that-is-long-enough"

import { automationDb, type FakeSupabase } from "./fake-supabase"
import { contactStanding, exitContactRuns, supabaseStarts, supabaseStore } from "@/lib/automations/supabase-store"
import { enroll, runDue, type ComposeInput, type Mailer, type Store } from "@/lib/automations/engine"
import { TEMPLATES, templateById, type FlowTemplate } from "@/lib/automations/templates"
import { TRIGGERS, audienceOf, normalizeSteps, problemsOf, serializeSteps, stepsText, waitMs } from "@/lib/automations/flow-model"
import { fieldProblems, fieldsIn, fillFields, mergeField, mergeValues, textOn } from "@/lib/automations/merge-fields"
import { recordCheckoutStart, sweepAbandoned } from "@/lib/automations/abandoned"
import { recordClick, recordOpen } from "@/lib/automations/track-events"
import { APP_URL, automationEmail } from "@/lib/email-automation"
import { openPixel, readTarget, signTarget, trackLinks, verifyTarget } from "@/lib/automations/tracking"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ─── A creator with a store, a product and a published website ───────── */

const MIN = 60_000
const DAY = 86_400_000
const BRAND = { name: "Astrid Studio", logo: "https://cdn.example.com/logo.png", color: "#e4572e" }

interface World {
  db: FakeSupabase
  store: Store
  creatorId: string
  productId: string
}

function world(): World {
  const db = automationDb()
  const creatorId = randomUUID()
  const productId = randomUUID()
  const installId = randomUUID()
  db.tables.creators.push({ id: creatorId, slug: "astrid", headline: null, support_email: "hello@astrid.studio", user_id: "u1" })
  db.tables.profiles.push({ id: "u1", display_name: "Astrid Lens", username: "astrid", email: "astrid@example.com", avatar_url: "https://cdn.example.com/a.png" })
  db.tables.products.push({ id: productId, creator_id: creatorId, slug: "autumn-presets", title: "Autumn presets" })
  db.tables.store_theme_installs.push({ id: installId, creator_id: creatorId, status: "published", sort_order: 0 })
  db.tables.store_theme_settings.push({ id: randomUUID(), install_id: installId, settings: { brand_name: BRAND.name, logo_url: BRAND.logo, primary_color: BRAND.color } })
  return { db, store: supabaseStore(db), creatorId, productId }
}

function turnOn(w: World, t: FlowTemplate) {
  const id = randomUUID()
  w.db.tables.email_flows.push({
    id,
    creator_id: w.creatorId,
    name: t.name,
    trigger_type: t.trigger,
    trigger_config: { template: t.id, entry: t.entry, ...(t.audience ? { audience: t.audience } : {}) },
    status: "active",
    steps: serializeSteps(t.steps),
  })
  return id
}

function contact(w: World, email: string, status: string) {
  w.db.tables.subscribers.push({ id: randomUUID(), creator_id: w.creatorId, email, name: "Ada Lovelace", status, is_active: status !== "unsubscribed", unsubscribe_token: randomUUID(), source_detail: null })
}

function order(w: World, email: string, at = w.db.clock) {
  const id = randomUUID()
  w.db.tables.orders.push({ id, product_id: w.productId, buyer_email: email, buyer_first_name: "Ada", status: "completed", receipt_token: `rt_${id.slice(0, 8)}`, created_at: new Date(at).toISOString() })
  return id
}

function buy(w: World, email: string, orderId = order(w, email)) {
  return enroll(w.store, { triggerType: "purchase", creatorId: w.creatorId, email, name: "Ada Lovelace", productId: w.productId, productTitle: "Autumn presets", orderId }, w.db.clock)
}

function join_(w: World, email: string) {
  return enroll(w.store, { triggerType: "new_subscriber", creatorId: w.creatorId, email, name: "Ada Lovelace" }, w.db.clock)
}

async function leaveCheckout(w: World, email: string, optedIn = true) {
  await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, productTitle: "Autumn presets", email, firstName: "Ada", paymentIntentId: `pi_${randomUUID().replace(/-/g, "").slice(0, 20)}`, optedIn })
  w.db.clock += 61 * MIN
  return sweepAbandoned({ store: w.store, starts: supabaseStarts(w.db), now: w.db.clock })
}

/** The frame the other half of the product draws, built from the same parts run.ts uses. */
function mailer(w: World, opts: { fail?: (n: number) => string | null } = {}) {
  const sent: Array<{ to: string; subject: string; html: string; text: string; headers?: Record<string, string> }> = []
  const composed: ComposeInput[] = []
  const rowAtSend: string[] = []
  let calls = 0
  const m: Mailer = {
    compose(input) {
      composed.push(input)
      const body = `${trackLinks(input.step.config.body, input.token)}${openPixel(input.token)}`
      return { subject: input.step.config.subject, ...automationEmail({ body, fromName: input.identity.fromName, unsubscribeToken: input.standing.unsubscribeToken }) }
    },
    async send(mail) {
      calls++
      /* The row this send is recorded by, found through the token in its pixel. */
      const row = w.db.rows("email_flow_sends").find((s) => mail.html.includes(s.token))
      rowAtSend.push(row ? row.status : "missing")
      const f = opts.fail?.(calls) ?? null
      if (f) return { success: false, error: f }
      sent.push(mail)
      return { success: true, messageId: `mg-${calls}` }
    },
  }
  return { m, sent, composed, rowAtSend, calls: () => calls }
}

async function drain(w: World, m: Mailer) {
  return runDue({ store: w.store, mailer: m, worker: `w_${randomUUID()}`, budgetMs: 60_000, now: () => w.db.clock })
}

/** Runs everything due, then moves the clock past each wait, until the run ends. */
async function runToEnd(w: World, m: Mailer, flowId: string, limit = 12) {
  for (let i = 0; i < limit; i++) {
    await drain(w, m)
    const active = w.db.rows("email_flow_runs").some((r) => r.flow_id === flowId && r.status === "active")
    if (!active) return
    const next = w.db.rows("email_flow_jobs").filter((j) => j.flow_id === flowId && j.state === "queued").map((j) => Date.parse(j.run_at))
    w.db.clock = next.length ? Math.max(w.db.clock, Math.min(...next)) + MIN : w.db.clock + 3 * 3_600_000
  }
}

const runsOf = (w: World, flowId: string) => w.db.rows("email_flow_runs").filter((r) => r.flow_id === flowId)
const sendsOf = (w: World, flowId: string) => w.db.rows("email_flow_sends").filter((s) => s.flow_id === flowId)
const emailsIn = (t: FlowTemplate) => t.steps.filter((s) => s.type === "email").length

/** Starts one person through a template's trigger, the way the product does. */
async function start(w: World, t: FlowTemplate, email: string) {
  if (t.trigger === "new_subscriber") {
    contact(w, email, "subscribed")
    return join_(w, email)
  }
  if (t.trigger === "abandoned_checkout") return leaveCheckout(w, email, true)
  if (audienceOf(t.trigger, { template: t.id, audience: t.audience }) === "subscribers") contact(w, email, "subscribed")
  else contact(w, email, "customer")
  return buy(w, email)
}

async function again(w: World, t: FlowTemplate, email: string) {
  if (t.trigger === "new_subscriber") return join_(w, email)
  if (t.trigger === "abandoned_checkout") return sweepAbandoned({ store: w.store, starts: supabaseStarts(w.db), now: w.db.clock })
  const last = w.db.rows("orders").filter((o) => o.buyer_email === email).at(-1)!
  return buy(w, email, last.id)
}

async function main() {
  console.log("\nThe templates, as written")
  check("eight starting points", TEMPLATES.length === 8, TEMPLATES.map((t) => t.id))
  check("four of them new: a first order, a checkout reminder, how to use it, a review", ["first_order", "checkout_reminder", "how_to_use", "review_request"].every((id) => templateById(id)))
  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|game.?changer|journey|delve|leverage)\b/i
  for (const t of TEMPLATES) {
    const steps = normalizeSteps(t.steps)
    const words = `${t.name} ${t.purpose} ${steps.map((s) => (s.type === "email" ? `${s.config.subject} ${s.config.body}` : "")).join(" ")}`
    check(`${t.id}: can be turned on as it is`, problemsOf(t.trigger, steps).length === 0, problemsOf(t.trigger, steps))
    check(`${t.id}: no em dash, no spaced hyphen, none of the banned words`, !/[—–]/.test(words) && !/ - /.test(words) && !banned.test(words), words.match(banned)?.[0])
    check(`${t.id}: every field exists and this trigger can fill it`, steps.every((s) => s.type !== "email" || fieldProblems(`${s.config.subject} ${s.config.body}`, t.trigger).length === 0))
    check(`${t.id}: subjects under 60 characters`, steps.every((s) => s.type !== "email" || s.config.subject.length <= 60))
    check(`${t.id}: says its steps in plain words`, /^[A-Z]/.test(stepsText(steps)) && !/undefined/.test(stepsText(steps)), stepsText(steps))
  }
  check("the steps read as they happen", stepsText(normalizeSteps(templateById("welcome")!.steps)) === "Email, wait 3 days, email" && stepsText(normalizeSteps(templateById("win_back")!.steps)) === "Wait 60 days, only if they have not bought since, email")
  check("every trigger a template uses is one the product emits", TEMPLATES.every((t) => t.trigger in TRIGGERS))
  check("nothing starts from a date nobody records", !TEMPLATES.some((t) => /birthday|anniversary/i.test(`${t.id} ${t.name}`)))

  console.log("\nFields")
  {
    const v = mergeValues({ name: "  Ada   Lovelace ", storeName: "Astrid Studio", storeUrl: "https://storelib.com/astrid", productName: "Autumn presets", orderUrl: "https://storelib.com/receipt/rt_1" })
    check("a first name from a full one", fillFields("Hi {{first_name}}", v, "text") === "Hi Ada")
    check("no name reads there, and a field can carry its own fallback", fillFields("Hi {{first_name}}", mergeValues({ storeName: "S", storeUrl: "u" }), "text") === "Hi there" && fillFields("Hi {{first_name|friend}}", mergeValues({ storeName: "S", storeUrl: "u" }), "text") === "Hi friend")
    check("the review link is the order page at its review form", v.review_url === "https://storelib.com/receipt/rt_1#review")
    check("a link with nothing to point at is the creator's page, never empty", mergeValues({ storeName: "S", storeUrl: "https://storelib.com/astrid" }).checkout_url === "https://storelib.com/astrid")
    check("a name cannot write markup into a body", fillFields("<p>{{first_name}}</p>", mergeValues({ name: "<b>Ada", storeName: "S", storeUrl: "u" }), "html") === "<p>&lt;b&gt;Ada</p>")
    check("a subject is text, not entities", fillFields("{{store_name}}", mergeValues({ storeName: "Tea & Co", storeUrl: "u" }), "text") === "Tea & Co")
    check("the older {{customer_name}} is still read", mergeField("customer_name")?.key === "name")
    check("a typo is refused before it is sent", fieldProblems("Hi {{frist_name}}", "purchase").length === 1)
    check("a product in a welcome email is refused: nothing to fill it", fieldProblems("{{product_name}}", "new_subscriber").length === 1 && problemsOf("new_subscriber", [{ id: "e", type: "email", config: { subject: "{{product_name}}", body: "<p>x</p>" } }]).some((p) => /only known/.test(p.message)))
    check("white on a dark colour, ink on a light one", textOn("#1a1a2e") === "#ffffff" && textOn("#f5d90a") === "#1a1a2e")
    check("fields found as written", fieldsIn("{{ first_name }} {{store_url}}").join() === "first_name,store_url")
    const w = world()
    const odd = [{ id: "x", type: "email" as const, config: { subject: "Your order, {{email}}", body: "<p>Thanks.</p>" } }]
    const flowId = turnOn(w, { ...templateById("thank_you")!, steps: odd })
    await buy(w, "old.flow@example.com")
    check("a flow that was on before fields were checked keeps entering people", runsOf(w, flowId).length === 1)
    check("while turning it on or saving it names the field to fix", problemsOf("purchase", odd).some((p) => /\{\{email\}\} is not a field/.test(p.message)))
  }

  for (const t of TEMPLATES) {
    console.log(`\n${t.name} (${t.id}), end to end`)
    const w = world()
    const flowId = turnOn(w, t)
    const who = `ada.${t.id}@example.com`
    await start(w, t, who)
    check("the trigger enters one run", runsOf(w, flowId).length === 1, runsOf(w, flowId).map((r) => r.status))
    await again(w, t, who)
    check("the same trigger again enters nothing", runsOf(w, flowId).length === 1, runsOf(w, flowId).length)
    const { m, sent, composed, rowAtSend } = mailer(w)
    await runToEnd(w, m, flowId)
    const run = runsOf(w, flowId)[0]
    check("the run reaches its end", run?.status === "completed", { status: run?.status, why: run?.exit_reason })
    check("every job was claimed and finished", w.db.rows("email_flow_jobs").filter((j) => j.flow_id === flowId).every((j) => j.state === "done"), w.db.rows("email_flow_jobs").filter((j) => j.flow_id === flowId).map((j) => j.state))
    check(`${emailsIn(t)} email${emailsIn(t) === 1 ? "" : "s"}, each once`, sent.length === emailsIn(t) && sendsOf(w, flowId).length === emailsIn(t) && sendsOf(w, flowId).every((s) => s.status === "sent" && s.provider_id), { sent: sent.length, rows: sendsOf(w, flowId).map((s) => s.status) })
    check("each send was written down before the mailer was called", rowAtSend.length === sent.length && rowAtSend.every((s) => s === "sending"), rowAtSend)
    const waits = t.steps.filter((s) => s.type === "wait").reduce((n, s) => n + (s.type === "wait" ? waitMs(s) : 0), 0)
    const lastSend = Math.max(...sendsOf(w, flowId).map((s) => Date.parse(s.created_at)))
    check("the waits were waited", lastSend - Date.parse(run.started_at) >= waits, { waited: lastSend - Date.parse(run.started_at), waits })
    check("every field filled: no braces in any subject or body", sent.every((s) => !/\{\{|\}\}/.test(s.subject + s.html + s.text)), sent.map((s) => s.subject))
    check("greeted by name", sent.every((s) => /Hi Ada,/.test(s.html)))
    check("the product is named where the email names it", composed.every((c) => !/\{\{product_name\}\}/.test(t.steps.find((s) => s.id === c.step.id && s.type === "email")?.type === "email" ? (t.steps.find((s) => s.id === c.step.id) as { config: { body: string } }).config.body : "") || /Autumn presets/.test(c.step.config.body)))
    check("the frame is handed the store's brand", composed.every((c) => c.identity.brand?.name === BRAND.name && c.identity.brand?.logoUrl === BRAND.logo && c.identity.brand?.accentColor === BRAND.color && c.identity.brand?.onAccent === textOn(BRAND.color)), composed[0]?.identity.brand)
    check("and the filled values by name", composed.every((c) => c.merge?.store_name === BRAND.name && c.merge?.first_name === "Ada"), composed[0]?.merge)
    const buttons = composed.filter((c) => /<a\b[^>]*background-color/.test(c.step.config.body))
    check("buttons wear the store's colour", buttons.every((c) => c.step.config.body.includes(`background-color:${BRAND.color}`) && !/background-color:#1a1a2e/i.test(c.step.config.body)))
    const hrefs = sent.flatMap((s) => [...s.html.matchAll(/href="([^"]*)"/g)].map((h) => h[1]))
    check("links go where they say, and every one but the way out is tracked", buttons.every((c) => c.step.config.body.includes(`href="${APP_URL}/`)) && hrefs.every((h) => /\/api\/automations\/t\/c\?k=/.test(h) || /\/unsubscribe\?token=/.test(h)), hrefs)
    check("every email can be left: a link and the one-click header", sent.every((s) => /\/unsubscribe\?token=/.test(s.html) && s.headers?.["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && /Unsubscribe: /.test(s.text)), composed.map((c) => c.standing))
    check("and a plain text part", sent.every((s) => s.text.length > 40 && !/<p>/.test(s.text)))

    const first = sendsOf(w, flowId)[0]
    await recordOpen(w.db, first.token, "2026-10-01T10:00:00.000Z")
    await recordOpen(w.db, first.token, "2026-10-02T10:00:00.000Z")
    check("an open is recorded once, the first", first.opened_at === "2026-10-01T10:00:00.000Z", first.opened_at)
    await recordClick(w.db, first.token, "2026-10-03T10:00:00.000Z")
    check("a click is recorded and keeps the first open", first.clicked_at === "2026-10-03T10:00:00.000Z" && first.opened_at === "2026-10-01T10:00:00.000Z")
    await recordOpen(w.db, "not-a-token")
    check("a made-up token writes nothing", sendsOf(w, flowId).filter((s) => s.opened_at).length === 1)

    /* The same flow once more, with a mailer that fails its first call. */
    const r = world()
    const rid = turnOn(r, t)
    await start(r, t, who)
    const flaky = mailer(r, { fail: (n) => (n === 1 ? "Mailgun 503 Service Unavailable" : null) })
    await runToEnd(r, flaky.m, rid, 20)
    check("a failed send is retried and each email still goes once", flaky.sent.length === emailsIn(t) && flaky.calls() === emailsIn(t) + 1 && new Set(flaky.sent.map((s) => s.subject)).size === emailsIn(t), { sent: flaky.sent.length, calls: flaky.calls() })
    check("and the run still ends", runsOf(r, rid)[0]?.status === "completed", runsOf(r, rid)[0]?.exit_reason)
  }

  console.log("\nWhat ends a run early")
  {
    const w = world()
    const flowId = turnOn(w, templateById("checkout_reminder")!)
    const { m, sent } = mailer(w)
    await leaveCheckout(w, "ada@example.com")
    await drain(w, m)
    check("the reminder's first email goes", sent.length === 1 && /You left Autumn presets at checkout/.test(sent[0].subject), sent.map((s) => s.subject))
    await buy(w, "ada@example.com")
    const run = runsOf(w, flowId)[0]
    check("buying ends the reminder at once", run.status === "exited" && run.exit_reason === "Bought.", run)
    check("and its waiting email is cancelled", w.db.rows("email_flow_jobs").filter((j) => j.run_id === run.id && j.state === "queued").length === 0)
    w.db.clock += 2 * DAY
    await drain(w, m)
    check("so the second is never sent", sent.length === 1)
  }
  {
    const w = world()
    const flowId = turnOn(w, templateById("checkout_reminder")!)
    const { m, sent } = mailer(w)
    await leaveCheckout(w, "ada@example.com")
    await drain(w, m)
    /* An order that reached the table without the purchase trigger (the engine
       was down): the reminder checks for itself before its next step. */
    order(w, "ada@example.com")
    w.db.clock += 2 * DAY
    await drain(w, m)
    check("a purchase the trigger missed still ends the reminder at its next step", sent.length === 1 && runsOf(w, flowId)[0].status === "exited" && runsOf(w, flowId)[0].exit_reason === "Bought.", runsOf(w, flowId)[0])
  }
  {
    const w = world()
    const flowId = turnOn(w, templateById("checkout_reminder")!)
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, email: "Ada@Example.com", paymentIntentId: "pi_paidlater", optedIn: true })
    order(w, "ada@example.com", w.db.clock + 20 * MIN)
    w.db.clock += 61 * MIN
    const res = await sweepAbandoned({ store: w.store, starts: supabaseStarts(w.db), now: w.db.clock })
    check("a checkout paid for within the hour is not reminded of", runsOf(w, flowId).length === 0 && res.outcomes.bought === 1 && w.db.rows("checkout_starts")[0].outcome === "bought", res)
    check("the start is kept in lower case", w.db.rows("checkout_starts")[0].email === "ada@example.com")
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, email: "ada@example.com", paymentIntentId: "pi_paidlater", optedIn: true })
    check("one start per payment, however often it is reported", w.db.rows("checkout_starts").length === 1)
  }
  {
    const w = world()
    const flowId = turnOn(w, templateById("checkout_reminder")!)
    const res = await leaveCheckout(w, "bo@example.com", false)
    check("nobody is reminded who did not tick the box and is not on the list", runsOf(w, flowId).length === 0 && res.outcomes.no_consent === 1, res)
    contact(w, "cy@example.com", "unsubscribed")
    const res2 = await leaveCheckout(w, "cy@example.com", true)
    check("nor anybody who unsubscribed", runsOf(w, flowId).length === 0 && res2.outcomes.unsubscribed === 1, res2)
    const res3 = await sweepAbandoned({ store: w.store, starts: supabaseStarts(w.db), now: w.db.clock })
    check("a settled start is never looked at twice", res3.looked === 0)
  }
  {
    const w = world()
    const flowId = turnOn(w, templateById("checkout_reminder")!)
    await leaveCheckout(w, "ada@example.com")
    w.db.clock += 2 * 3_600_000
    await leaveCheckout(w, "ada@example.com")
    check("two left checkouts in a week are one reminder", runsOf(w, flowId).length === 1)
    const two = [supabaseStarts(w.db), supabaseStarts(w.db)]
    await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, email: "dee@example.com", paymentIntentId: "pi_twosweeps", optedIn: true })
    w.db.clock += 61 * MIN
    const [a, b] = await Promise.all(two.map((starts) => sweepAbandoned({ store: w.store, starts, now: w.db.clock })))
    check("two sweeps at once settle a start once and enter it once", a.outcomes.entered + b.outcomes.entered === 1 && runsOf(w, flowId).filter((r) => r.email === "dee@example.com").length === 1, { a: a.outcomes, b: b.outcomes })
  }
  {
    const w = world()
    delete w.db.tables.checkout_starts
    const res = await sweepAbandoned({ store: w.store, starts: supabaseStarts(w.db), now: w.db.clock })
    check("before the SQL there is no table: the sweep says so and does nothing", res.available === false)
    check("and recording a start is quiet", (await recordCheckoutStart(w.db, { creatorId: w.creatorId, productId: w.productId, email: "a@b.co", paymentIntentId: "pi_x1", optedIn: true })) === false)
  }
  {
    const w = world()
    const flowId = turnOn(w, templateById("welcome")!)
    contact(w, "ada@example.com", "subscribed")
    await join_(w, "ada@example.com")
    const { m, sent } = mailer(w)
    await drain(w, m)
    w.db.rows("subscribers")[0].status = "unsubscribed"
    w.db.rows("subscribers")[0].is_active = false
    w.db.clock += 4 * DAY
    await drain(w, m)
    check("unsubscribing between two emails stops the second", sent.length === 1 && runsOf(w, flowId)[0].status === "exited" && runsOf(w, flowId)[0].exit_reason === "Unsubscribed.")
  }
  {
    /*
      Round 5: the unsubscribe itself ends their runs (app/api/email/
      unsubscribe), so the builder and the contact's page say they left at
      once, not "in progress" until their next step comes up days later.
    */
    const w = world()
    const flowId = turnOn(w, templateById("welcome")!)
    contact(w, "ada@example.com", "subscribed")
    contact(w, "bo@example.com", "subscribed")
    await join_(w, "ada@example.com")
    await join_(w, "bo@example.com")
    const { m } = mailer(w)
    await drain(w, m)
    const ada = runsOf(w, flowId).find((r) => r.email === "ada@example.com")!
    const waiting = () => w.db.rows("email_flow_jobs").filter((j) => j.run_id === ada.id && j.state === "queued")
    check("(a welcome partway, its next email waiting)", ada.status === "active" && waiting().length === 1)
    const ended = await exitContactRuns(w.db, w.creatorId, " Ada@Example.com ", "Unsubscribed.")
    check("an unsubscribe ends that address's runs with the creator at once", ended === 1 && ada.status === "exited" && ada.exit_reason === "Unsubscribed." && waiting().length === 0, { ended, status: ada.status })
    check("and nobody else's", runsOf(w, flowId).find((r) => r.email === "bo@example.com")?.status === "active")
    check("and ending them again changes nothing", (await exitContactRuns(w.db, w.creatorId, "ada@example.com", "Unsubscribed.")) === 0)
    const route = read("app/api/email/unsubscribe/route.ts")
    check("the unsubscribe link and the one-click unsubscribe both end them", (route.match(/await endAutomations\(adminSupabase, subscriber\)/g) ?? []).length === 2 && /exitContactRuns\(db, subscriber\.creator_id, subscriber\.email, "Unsubscribed\."\)/.test(route))
  }
  {
    /* A welcome ends for an address with no contact row, so a read that failed must not look like one. */
    const answering = (result: { data: unknown; error: unknown }) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = async () => result
      return { from: () => q, rpc: () => null }
    }
    const failedRead = await contactStanding(answering({ data: null, error: { code: "08006" } }), "c", "a@b.co")
    const noRow = await contactStanding(answering({ data: null, error: null }), "c", "a@b.co")
    check("a contact read that failed leaves 'on the list' unknown; no row is a no", failedRead.subscribed === undefined && failedRead.suppressed === false && noRow.subscribed === false, { failedRead, noRow })
  }
  {
    /*
      Round 5: a link to a bare address ("https://shop.com", the commonest
      link in an email) was signed as written and checked as the browser
      reads it ("https://shop.com/"), so the click route found the signature
      wrong and sent the reader to storelib.com instead of the shop.
    */
    const token = "11111111-1111-4111-8111-111111111111"
    const clicked = (html: string) => {
      const m = html.match(/(?:^|[?&;])u=([^&"]+)&(?:amp;)?s=([0-9a-f]+)/)
      const t = m ? readTarget(m[1]) : null
      return t && m ? { href: t.href, ok: verifyTarget(token, t.href, m[2]) || verifyTarget(token, t.written, m[2]) } : null
    }
    const bare = clicked(trackLinks('<a href="https://Shop.example.com">Visit</a>', token))
    check("a link to a bare domain goes to that domain, not to storelib.com", bare?.ok === true && bare.href === "https://shop.example.com/", bare)
    const query = clicked(trackLinks('<a href="https://x.com/p?a=1&amp;b=2">a</a>', token))
    check("and a link with a query keeps it", query?.ok === true && query.href === "https://x.com/p?a=1&b=2", query)
    /* An email already sent carries a signature over the address as written. */
    const old = `u=${Buffer.from("https://shop.example.com", "utf8").toString("base64url")}&s=${signTarget(token, "https://shop.example.com")}`
    check("a link in an email sent before the fix still goes through", clicked(old)?.ok === true)
    check("an edited link does not", clicked(`u=${Buffer.from("https://evil.example", "utf8").toString("base64url")}&s=${signTarget(token, "https://shop.example.com")}`)?.ok === false)
    const click = read("app/api/automations/t/c/route.ts")
    check("the click route checks either form, and sends the reader to the address read as a URL", /verifyTarget\(token, target\.href, sig\) \|\| verifyTarget\(token, target\.written, sig\)/.test(click) && /NextResponse\.redirect\(target\.href, 302\)/.test(click))
  }
  {
    const w = world()
    const flowId = turnOn(w, templateById("win_back")!)
    contact(w, "cus@example.com", "customer")
    const res = await buy(w, "cus@example.com")
    check("a flow that sells skips a buyer who did not ask for news", runsOf(w, flowId).length === 0 && res.skipped.some((s) => s.why === "did not ask for news"), res.skipped)
    const legacy = turnOn(w, { ...templateById("win_back")!, audience: undefined })
    const legacyRow = w.db.rows("email_flows").find((f) => f.id === legacy)!
    check("and so does a win-back made before flows said who they were for", audienceOf("purchase", legacyRow.trigger_config) === "subscribers")
    legacyRow.status = "draft"
    contact(w, "sub@example.com", "subscribed")
    await buy(w, "sub@example.com")
    check("a subscriber who buys is entered", runsOf(w, flowId).filter((r) => r.email === "sub@example.com").length === 1)
    const { m, sent } = mailer(w)
    await drain(w, m)
    w.db.clock += 10 * DAY
    await buy(w, "sub@example.com")
    w.db.clock += 61 * DAY
    await runToEnd(w, m, flowId)
    const [older, newer] = runsOf(w, flowId).filter((r) => r.email === "sub@example.com")
    check("buying again ends the older countdown at its check, and the newer one sends once", older.status === "exited" && newer.status === "completed" && sent.length === 1, { older: older.status, newer: newer.status, sent: sent.length })
  }
  {
    const w = world()
    const flowId = turnOn(w, templateById("first_order")!)
    contact(w, "old@example.com", "customer")
    order(w, "old@example.com", w.db.clock - 30 * DAY)
    await buy(w, "old@example.com")
    check("somebody who bought before is not welcomed as new", runsOf(w, flowId).length === 0)
    await buy(w, "new@example.com")
    w.db.clock += MIN
    await buy(w, "new@example.com")
    check("a first order enters once, and the second order does not", runsOf(w, flowId).filter((r) => r.email === "new@example.com").length === 1)
    const thanks = turnOn(w, templateById("thank_you")!)
    await buy(w, "new@example.com")
    check("while the every-order thank you enters for each", runsOf(w, thanks).length === 1)
  }
  {
    const w = world()
    turnOn(w, templateById("review_request")!)
    const flowId = turnOn(w, templateById("how_to_use")!)
    contact(w, "ada@example.com", "customer")
    const orderId = order(w, "ada@example.com")
    await buy(w, "ada@example.com", orderId)
    const { m, composed } = mailer(w)
    for (let i = 0; i < 5; i++) {
      await drain(w, m)
      w.db.clock += 3 * DAY
    }
    const token = w.db.rows("orders").find((o) => o.id === orderId)!.receipt_token
    const use = composed.find((c) => c.run.flow_id === flowId)
    const review = composed.find((c) => c.run.flow_id !== flowId)
    check("how to use it links to their own order page", use?.merge?.order_url === `${APP_URL}/receipt/${token}` && use.step.config.body.includes(`href="${APP_URL}/receipt/${token}"`), use?.merge?.order_url)
    check("a review request opens the order page at its form", review?.merge?.review_url === `${APP_URL}/receipt/${token}#review`, review?.merge?.review_url)
    check("the product page is the creator's own address for it", use?.merge?.product_url === `${APP_URL}/astrid/autumn-presets`)
    const theirs = w.db.rows("orders").find((o) => o.id === orderId)!
    theirs.buyer_email = "someone.else@example.com"
    const links = await w.store.links({ ...use!.run })
    check("an order page is never linked for an address that did not place the order", links.orderUrl === null)
  }
  {
    const w = world()
    const flowId = turnOn(w, templateById("checkout_reminder")!)
    const { m, composed } = mailer(w)
    await leaveCheckout(w, "ada@example.com")
    await drain(w, m)
    check("a checkout reminder links back to checkout for that product", composed[0]?.merge?.checkout_url === `${APP_URL}/checkout?productId=${w.productId}` && runsOf(w, flowId).length === 1, composed[0]?.merge?.checkout_url)
  }
  {
    const w = world()
    w.db.tables.store_theme_installs.length = 0
    const identity = await w.store.identity(w.creatorId)
    check("without a website, the brand is the creator's name and picture, in the /app ink", identity.brand?.name === "Astrid Lens" && identity.brand?.logoUrl === "https://cdn.example.com/a.png" && identity.brand?.accentColor === "#1a1a2e")
  }

  console.log("\nTransactional mail is not marketing")
  {
    const src = read("lib/email.tsx")
    const between = (from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from) + from.length))
    const receipt = between("export function buyerReceiptEmailHtml", "export async function sendSellerNotificationEmail")
    check("a receipt carries no unsubscribe link and no List-Unsubscribe header", receipt.length > 500 && !/unsubscribe/i.test(receipt), receipt.match(/.{0,40}unsubscribe.{0,40}/i)?.[0])
    const automations = read("lib/automations/engine.ts")
    check("every automated email goes through the frame with its way out", /standing: Standing/.test(automations) && /unsubscribeToken/.test(automations))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
void main()
