/**
 * ===========================================================================
 *  THE NOTIFICATION ENGINE, RUN AGAINST MEMORY
 * ===========================================================================
 * Events go in through emit(), the worker (lib/notify/engine.ts runWork)
 * plans and sends, and what comes out is read from the tables: jobs, their
 * states and skip reasons, deliveries, the bell and the emails a fake
 * provider was handed. No network and no database: the store is
 * tests/notify-memory-store.ts, the provider records what it is given.
 *
 * Time is the store's clock. A reminder "tomorrow" is a job whose run_at is
 * tomorrow; the test moves the clock and runs the worker again.
 *
 * Run with:  npm run test:push
 */
import { NO_FACTS, setupSteps } from "../lib/home/progress"
import { emailChannel } from "../lib/notify/channels/email"
import { nextNudgeStep, readableRequirements } from "../lib/notify/conditions"
import { inAppChannel } from "../lib/notify/channels/in-app"
import { runWork, retryDelayMs, type EngineDeps } from "../lib/notify/engine"
import { handle } from "../lib/notify/orchestrator"
import { emit } from "../lib/notify/outbox"
import { allowed, setPreference } from "../lib/notify/preferences"
import { MailgunEmailProvider, notifyFrom, resultOf } from "../lib/notify/providers/mailgun"
import { NOTIFICATION_TYPES, type ChannelResult, type DomainEvent, type OutgoingEmail } from "../lib/notify/types"
import { REGISTRY } from "../lib/notify/registry"
import { DATA_KEYS, renderEmail, renderInApp } from "../lib/notify/templates"
import { MemoryNotifyStore } from "./notify-memory-store"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : `: ${JSON.stringify(detail)}`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}

/* Quiet: the engine logs a JSON line per step. */
const realLog = console.log
const realWarn = console.warn
const quiet = () => {
  console.log = (...a: unknown[]) => {
    if (typeof a[0] === "string" && a[0].startsWith("{")) return
    realLog(...a)
  }
  console.warn = (...a: unknown[]) => {
    if (typeof a[0] === "string" && a[0].startsWith("{")) return
    realWarn(...a)
  }
}
quiet()

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const USER = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"
const EMAIL = "maker@example.com"

class FakeProvider {
  readonly name = "fake"
  sent: OutgoingEmail[] = []
  calls = 0
  answers: ChannelResult[] = []
  async send(email: OutgoingEmail): Promise<ChannelResult> {
    this.calls++
    const answer = this.answers.shift() ?? { status: "sent", providerMessageId: `<m${this.calls}@mg.example.com>` }
    if (answer.status === "sent") this.sent.push(email)
    return answer
  }
}

function world() {
  const store = new MemoryNotifyStore()
  store.users.set(USER, { email: EMAIL, name: "Maker" })
  store.creators.set(CREATOR, USER)
  const provider = new FakeProvider()
  const deps: EngineDeps = {
    store,
    providerName: provider.name,
    worker: "w1",
    now: () => store.clock.now,
    email: emailChannel({
      provider,
      render: renderEmail,
      baseUrl: () => "https://storelib.com",
      unsubscribeUrl: (u, c) => `https://storelib.com/api/notify/unsubscribe?u=${u}&c=${c}`,
      preferencesUrl: () => "https://storelib.com/app/settings",
      messageDomain: "mg.example.com",
    }),
    inApp: inAppChannel(store, { render: renderInApp, baseUrl: () => "https://storelib.com", now: () => store.clock.now }),
  }
  const run = (worker = "w1") => runWork({ ...deps, worker }, 10_000)
  const raise = (e: Partial<DomainEvent> & Pick<DomainEvent, "name" | "key">) =>
    emit({ userId: USER, creatorId: CREATOR, payload: {}, ...e, occurredAt: new Date(store.clock.now).toISOString() }, { db: store, soon: false })
  const jobsOf = (type: string) => store.jobs.filter((j) => j.type === type)
  const job = (type: string) => jobsOf(type)[0]
  const emailsOf = (type: string) => provider.sent.filter((m) => m.tags?.includes(type))
  const delivery = (jobId: string, channel: "email" | "in_app") => store.deliveries.find((d) => d.job_id === jobId && d.channel === channel)
  const later = (ms: number) => {
    store.clock.now += ms
  }
  return { store, provider, deps, run, raise, jobsOf, job, emailsOf, delivery, later }
}

async function main() {
  realLog("\nThe registry and the orchestrator")
  check("every notification type has a registry entry and a template data list", NOTIFICATION_TYPES.every((t) => REGISTRY[t]?.type === t && Array.isArray(DATA_KEYS[t])))
  check("the receipts and the seller's sale email are sent elsewhere, not twice", ["PURCHASE_CONFIRMATION", "DIGITAL_PRODUCT_ACCESS", "NEW_SALE", "FIRST_SALE", "CUSTOMER_REFUND_PROCESSED"].every((t) => REGISTRY[t as keyof typeof REGISTRY].emailSentElsewhere === true))
  check("security and money notices are required, lifecycle nudges are optional", REGISTRY.PASSWORD_CHANGED.requirement === "required_service" && REGISTRY.PAYOUT_METHOD_CHANGED.requirement === "required_service" && REGISTRY.FIRST_PRODUCT_REMINDER.requirement === "optional_product")
  const ev = (name: DomainEvent["name"], payload: Record<string, unknown> = {}): DomainEvent => ({ name, key: `${name}:k`, payload, occurredAt: "2026-10-01T09:00:00Z", creatorId: CREATOR, userId: USER })
  const ctx = { now: Date.parse("2026-10-01T09:00:00Z"), userId: USER, creatorId: CREATOR }
  check("an event nobody listens to plans nothing", ["user.created", "product.updated", "store.updated", "product.created"].every((n) => handle(ev(n as DomainEvent["name"]), ctx).jobs.length === 0))
  const a = handle(ev("store.created"), ctx)
  const b = handle(ev("store.created"), ctx)
  check("the same event planned twice gives the same keys", JSON.stringify(a.jobs.map((j) => j.idempotencyKey)) === JSON.stringify(b.jobs.map((j) => j.idempotencyKey)))
  check("store.created: a welcome now, day 1 and day 3 reminders later", a.jobs.some((j) => j.type === "WELCOME_TO_STORELIB" && Date.parse(j.runAt) === ctx.now) && a.jobs.some((j) => j.type === "FIRST_PRODUCT_REMINDER" && j.step === "day_1" && Date.parse(j.runAt) === ctx.now + DAY) && a.jobs.some((j) => j.type === "PAYMENT_SETUP_REMINDER_2" && j.step === "day_3" && Date.parse(j.runAt) === ctx.now + 3 * DAY))
  const mail = handle(ev("user.email_changed", { previousEmail: "old@example.com", newEmail: "new@example.com" }), ctx)
  check("an email change tells the new address and the previous one", mail.jobs.length === 2 && mail.jobs.some((j) => j.recipientEmail === "old@example.com"))
  check("and neither job carries an address in full", mail.jobs.every((j) => !JSON.stringify(j.data).includes("new@example.com") && !JSON.stringify(j.data).includes("old@example.com")))
  const sale = handle(ev("order.created", { orderId: "o1", buyerEmail: "buyer@example.com", amountCents: 1200 }), ctx)
  check("a sale: NEW_SALE for the creator and the receipt job for the buyer", sale.jobs.some((j) => j.type === "NEW_SALE" && j.recipientUserId === USER) && sale.jobs.some((j) => j.type === "PURCHASE_CONFIRMATION" && j.recipientEmail === "buyer@example.com" && j.recipientType === "customer"))
  check("nothing secret reaches a job's data", !JSON.stringify(handle(ev("payout_method.changed", { bankLast4: "4242", accountNumber: "000123456789", apiKey: "k" }), ctx).jobs[0].data).match(/000123456789|apiKey/))

  realLog("\nAn event becomes the notification it means")
  {
    const w = world()
    await w.raise({ name: "store.created", key: "store.created:c1", entityType: "creator", entityId: CREATOR, payload: { storeName: "Maker Shop" } })
    const s = await w.run()
    check("the welcome is sent at once, by email and in the bell", w.emailsOf("WELCOME_TO_STORELIB").length === 1 && w.store.bell.some((r) => r.type === "WELCOME_TO_STORELIB"), s)
    check("to the creator's address, by their name", w.provider.sent[0]?.to === EMAIL && /Maker/.test(w.provider.sent[0]?.text ?? ""))
    check("the reminders wait for their day", w.jobsOf("FIRST_PRODUCT_REMINDER").every((j) => j.state === "pending") && w.jobsOf("PAYMENT_SETUP_REMINDER").length === 1)
    check("with a delivery_id and job_id carried to the webhook", !!w.provider.sent[0]?.variables?.delivery_id && !!w.provider.sent[0]?.variables?.job_id)
    check("required email has no unsubscribe header", !w.provider.sent[0]?.headers?.["List-Unsubscribe"])
    check("the event is marked processed", w.store.events.every((e) => !!e.processed_at))
    check("every job and delivery shares the event's correlation id", w.store.jobs.every((j) => j.correlation_id === w.store.events[0].correlation_id) && w.store.deliveries.every((d) => d.correlation_id === w.store.events[0].correlation_id))

    w.later(DAY + MIN)
    await w.run()
    check("a day later, with no product, the first product reminder is sent", w.job("FIRST_PRODUCT_REMINDER").state === "sent")
    check("the finish and publish reminders do not apply", w.job("FINISH_PRODUCT_REMINDER").skip_reason === "CONDITION_NO_LONGER_TRUE" && w.job("PUBLISH_PRODUCT_REMINDER").skip_reason === "CONDITION_NO_LONGER_TRUE")
    check("one lifecycle email a day: the payment reminder waits instead of sending the same day", w.job("PAYMENT_SETUP_REMINDER").state === "pending" && w.job("PAYMENT_SETUP_REMINDER").attempts === 0)
    check("lifecycle email carries List-Unsubscribe and the one click header", (() => {
      const m = w.emailsOf("FIRST_PRODUCT_REMINDER")[0]
      return !!m && /^<https:\/\/storelib\.com\/api\/notify\/unsubscribe/.test(m.headers?.["List-Unsubscribe"] ?? "") && m.headers?.["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click"
    })())
  }

  realLog("\nAn irrelevant event plans nothing")
  {
    const w = world()
    await w.raise({ name: "product.updated", key: "product.updated:p1" })
    await w.raise({ name: "user.created", key: "user.created:u1" })
    await w.run()
    check("no jobs, no email, no bell row", w.store.jobs.length === 0 && w.provider.calls === 0 && w.store.bell.length === 0)
    check("and the events are done with", w.store.events.every((e) => !!e.processed_at))
  }

  realLog("\nFinishing a task stops its reminders")
  {
    const w = world()
    await w.raise({ name: "store.created", key: "store.created:c1" })
    await w.run()
    w.store.productFacts.set(CREATOR, [{ id: "p1", status: "published", type: "digital", title: "Guide", archived: false, hasFile: true }])
    await w.raise({ name: "product.first_published", key: `product.first_published:${CREATOR}`, entityType: "product", entityId: "p1", payload: { productId: "p1", productTitle: "Guide", paymentsReady: false } })
    await w.run()
    check("the first product published is celebrated", w.job("FIRST_PRODUCT_PUBLISHED")?.state === "sent")
    check("the pending product reminders are cancelled", ["FIRST_PRODUCT_REMINDER", "FIRST_PRODUCT_REMINDER_2", "FINISH_PRODUCT_REMINDER", "PUBLISH_PRODUCT_REMINDER"].every((t) => w.job(t).state === "cancelled" && w.job(t).skip_reason === "WORKFLOW_CANCELLED"))
    /* Changed on purpose: a first product live with no way to be paid is a sharper thing to say than "set up payments",
       so the generic reminders give way to the payout setup sequence (lib/notify/workflows/unfinished.ts). One
       sequence about payments at a time, and the person is still nudged. */
    check("the payment reminders give way to the payout setup sequence rather than being dropped", w.job("PAYMENT_SETUP_REMINDER").state === "cancelled" && w.job("PAYOUT_SETUP_UNFINISHED").state === "pending" && w.job("PAYOUT_SETUP_UNFINISHED_2").state === "pending")
    w.later(4 * DAY)
    const before = w.provider.sent.length
    await w.run()
    check("a cancelled job is never delivered", w.emailsOf("FIRST_PRODUCT_REMINDER").length === 0 && w.emailsOf("FIRST_PRODUCT_REMINDER_2").length === 0 && w.provider.sent.length >= before)
  }

  realLog("\nThe condition is read again right before sending")
  {
    const w = world()
    await w.raise({ name: "store.created", key: "store.created:c1" })
    await w.run()
    /* Payments done, and the event lost: only the condition can stop the reminder. */
    w.store.paymentFacts.set(CREATOR, { stripeAccountId: "acct_1", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, status: "connected", requirements: [], requirementsDueBy: null })
    w.store.productFacts.set(CREATOR, [{ id: "p9", status: "draft", type: "digital", title: "Half done", archived: false, hasFile: false }])
    w.later(DAY + MIN)
    await w.run()
    check("payout setup complete: the day 1 payment reminder is skipped CONDITION_NO_LONGER_TRUE", w.job("PAYMENT_SETUP_REMINDER").state === "skipped" && w.job("PAYMENT_SETUP_REMINDER").skip_reason === "CONDITION_NO_LONGER_TRUE")
    check("a draft without its file: the finish reminder goes instead of the first product one", w.job("FINISH_PRODUCT_REMINDER").state === "sent" && w.job("FIRST_PRODUCT_REMINDER").skip_reason === "CONDITION_NO_LONGER_TRUE")
    check("and names the draft as it is now", /Half done/.test(w.emailsOf("FINISH_PRODUCT_REMINDER")[0]?.html ?? ""))

    const v = world()
    await v.raise({ name: "store.created", key: "store.created:c1" })
    await v.run()
    await v.raise({ name: "payment_setup.completed", key: "payment_setup.completed:c1:1" })
    await v.run()
    check("payment_setup.completed sends its notice and cancels the payment reminders", v.job("PAYMENT_SETUP_COMPLETED").state === "sent" && v.job("PAYMENT_SETUP_REMINDER").state === "cancelled" && v.job("PAYMENT_SETUP_REMINDER_2").state === "cancelled")

    const u = world()
    await u.raise({ name: "store.created", key: "store.created:c1" })
    await u.run()
    u.store.failReads = true
    u.later(DAY + MIN)
    await u.run()
    check("a condition that cannot be read waits and asks again, it does not send", u.job("FIRST_PRODUCT_REMINDER").state === "pending" && u.emailsOf("FIRST_PRODUCT_REMINDER").length === 0)
  }

  realLog("\nOnce, however often it is said")
  {
    const w = world()
    const r1 = await w.raise({ name: "payout.failed", key: "stripe:evt_1", entityType: "payout", entityId: "po_1", payload: { amountCents: 5000, currency: "usd" } })
    const r2 = await w.raise({ name: "payout.failed", key: "stripe:evt_1", entityType: "payout", entityId: "po_1", payload: { amountCents: 5000, currency: "usd" } })
    check("emit answers ok both times", r1.ok && r2.ok)
    check("a duplicate event is one row", w.store.events.length === 1)
    await Promise.all([w.run("w1"), w.run("w2"), w.run("w3")])
    await w.run("w4")
    check("one job", w.jobsOf("PAYOUT_FAILED").length === 1)
    check("three workers at once and a fourth after: one email", w.emailsOf("PAYOUT_FAILED").length === 1 && w.provider.calls === 1)
    check("and one bell row", w.store.bell.filter((b) => b.type === "PAYOUT_FAILED").length === 1)
    /* The same event raised again after it was handled. */
    await w.raise({ name: "payout.failed", key: "stripe:evt_1", entityType: "payout", entityId: "po_1" })
    await w.run()
    check("raised again later: still one email", w.provider.calls === 1)
  }

  realLog("\nPreferences")
  {
    const w = world()
    await setPreference(w.store, USER, "product_and_store", "email", false, "settings")
    await w.raise({ name: "domain.connected", key: "domain.connected:d1:1", entityType: "domain", entityId: "d1", payload: { domain: "shop.example.com" } })
    await w.run()
    const j = w.job("DOMAIN_CONNECTED")
    check("an optional email turned off is skipped PREFERENCE_OFF", w.delivery(j.id, "email")?.skip_reason === "PREFERENCE_OFF" && w.provider.calls === 0)
    check("the bell still has it", w.delivery(j.id, "in_app")?.status === "sent" && j.state === "sent")

    await setPreference(w.store, USER, "security", "email", false, "settings")
    check("security cannot be turned off", !w.store.prefs.has(`${USER}|security|email`))
    w.store.prefs.set(`${USER}|security|email`, { category: "security", channel: "email", enabled: false, updatedAt: null, source: "admin" })
    await w.store.suppress(EMAIL, "optional", "complaint", "mailgun")
    await w.raise({ name: "user.password_changed", key: `user.password_changed:${USER}:1` })
    await w.run()
    check("a required security email still goes, whatever the row and an optional suppression say", w.job("PASSWORD_CHANGED").state === "sent" && w.emailsOf("PASSWORD_CHANGED").length === 1)
    check("allowed() says the same", await allowed(w.store, USER, REGISTRY.PASSWORD_CHANGED, "email"))
    await setPreference(w.store, USER, "lifecycle", "email", false, "unsubscribe_link")
    check("and an optional one follows the row", !(await allowed(w.store, USER, REGISTRY.FIRST_PRODUCT_REMINDER, "email")))
  }


  realLog("\nStarted and not finished: what each moment plans")
  {
    const keys = (r: ReturnType<typeof handle>, prefix: string) => r.jobs.filter((j) => j.type.startsWith(prefix)).map((j) => `${j.idempotencyKey}@${Date.parse(j.runAt) - ctx.now}`).sort()
    const started = handle(ev("payment_setup.started"), ctx)
    check("starting Stripe and stopping plans a day 2 and a day 7 reminder, nothing now", started.jobs.length === 2 && started.jobs.every((j) => Date.parse(j.runAt) > ctx.now) && started.jobs.some((j) => j.type === "PAYOUT_SETUP_UNFINISHED" && Date.parse(j.runAt) === ctx.now + 2 * DAY) && started.jobs.some((j) => j.type === "PAYOUT_SETUP_UNFINISHED_2" && Date.parse(j.runAt) === ctx.now + 7 * DAY))
    check("and cancels the reminders written for somebody who never started", started.cancel.some((c) => c.workflow === "onboarding_payment" && c.recipientUserId === USER))
    check("each one expires two days after its day", started.jobs.every((j) => Date.parse(j.expiresAt ?? "") === Date.parse(j.runAt) + 2 * DAY))
    const live = handle(ev("product.first_published", { productId: "p1", productTitle: "Guide", paymentsReady: false }), ctx)
    check("a first product live with no way to be paid plans the very same two keys, so it is one sequence and not two", JSON.stringify(keys(live, "PAYOUT_SETUP")) === JSON.stringify(keys(started, "PAYOUT_SETUP")))
    check("the two read differently though: one was begun, the other was not", started.jobs[0].data.started === true && live.jobs.find((j) => j.type === "PAYOUT_SETUP_UNFINISHED")?.data.started === false)
    const paid = handle(ev("product.first_published", { productId: "p1", paymentsReady: true }), ctx)
    check("a first product live with payouts already on plans no payout nudge", !paid.jobs.some((j) => j.type.startsWith("PAYOUT_SETUP")))
    const created = handle(ev("store.created"), ctx)
    check("a new store is nudged about the rest of its setup on day 5 and day 12, after the product and payment ones", created.jobs.some((j) => j.type === "STORE_SETUP_UNFINISHED" && Date.parse(j.runAt) === ctx.now + 5 * DAY) && created.jobs.some((j) => j.type === "STORE_SETUP_UNFINISHED_2" && Date.parse(j.runAt) === ctx.now + 12 * DAY))
    const asked = handle(ev("payout.action_required", { reason: "requirements_due", requirementCount: 2 }), ctx)
    check("Stripe asking for details plans two follow ups, day 2 and day 7", asked.jobs.some((j) => j.type === "VERIFICATION_REMINDER" && Date.parse(j.runAt) === ctx.now + 2 * DAY) && asked.jobs.some((j) => j.type === "VERIFICATION_REMINDER_2" && Date.parse(j.runAt) === ctx.now + 7 * DAY))
    const again = handle({ ...ev("payout.action_required", { reason: "requirements_due" }), key: "stripe_requirements:acct:9" }, ctx)
    check("Stripe saying it again is the same two keys, so it is told once however often the webhook repeats", JSON.stringify(keys(again, "VERIFICATION")) === JSON.stringify(keys(asked, "VERIFICATION")))
    check("no sequence is longer than two: a first reminder, one more, then nothing", ["PAYOUT_SETUP", "STORE_SETUP_UNFINISHED", "VERIFICATION"].every((p) => [started, created, asked].flatMap((r) => r.jobs).filter((j) => j.type.startsWith(p)).length <= 2))
  }

  realLog("\nThe payout setup nudge waits, goes once, and stops when it is done")
  {
    const w = world()
    await w.raise({ name: "store.created", key: "store.created:c1" })
    await w.run()
    await w.raise({ name: "payment_setup.started", key: "payment_setup.started:c1:1", entityType: "payment_setup", entityId: CREATOR })
    await w.run()
    check("the reminders for somebody who never started are cancelled: one payments sequence at a time", w.job("PAYMENT_SETUP_REMINDER").state === "cancelled" && w.job("PAYMENT_SETUP_REMINDER_2").state === "cancelled")
    check("and nothing is sent at the moment they stop", w.provider.sent.length === 1 && w.job("PAYOUT_SETUP_UNFINISHED").state === "pending")
    w.later(DAY + MIN)
    await w.run()
    check("nor a day later", w.emailsOf("PAYOUT_SETUP_UNFINISHED").length === 0)
    w.later(DAY + MIN)
    await Promise.all([w.run("a"), w.run("b")])
    await w.run("c")
    check("two days in it goes, once, however many workers run at once", w.emailsOf("PAYOUT_SETUP_UNFINISHED").length === 1 && w.job("PAYOUT_SETUP_UNFINISHED").state === "sent")
    const mail = w.emailsOf("PAYOUT_SETUP_UNFINISHED")[0]
    check("it says they cannot be paid and links to the page that finishes it", /cannot pay you/.test(mail?.text ?? "") && (mail?.text ?? "").includes("https://storelib.com/app/settings?tab=payments"))
    check("it is optional mail and carries the unsubscribe header", !!mail?.headers?.["List-Unsubscribe"])
    w.store.paymentFacts.set(CREATOR, { stripeAccountId: "acct_1", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, status: "connected", requirements: [], requirementsDueBy: null })
    await w.raise({ name: "payment_setup.completed", key: "payment_setup.completed:c1:1" })
    await w.run()
    check("connecting cancels the rest of the sequence", w.job("PAYOUT_SETUP_UNFINISHED_2").state === "cancelled" && w.job("PAYOUT_SETUP_UNFINISHED_2").skip_reason === "WORKFLOW_CANCELLED")
    w.later(6 * DAY)
    await w.run()
    check("and a week later nothing else goes", w.emailsOf("PAYOUT_SETUP_UNFINISHED_2").length === 0)

    /* The same sequence, with the task done quietly: no event, only the condition. */
    const v = world()
    await v.raise({ name: "payment_setup.started", key: "payment_setup.started:c1:1" })
    await v.run()
    v.store.paymentFacts.set(CREATOR, { stripeAccountId: "acct_1", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, status: "connected", requirements: null, requirementsDueBy: null })
    v.later(2 * DAY + MIN)
    await v.run()
    check("payments connected with no event at all: the nudge is skipped when it comes due", v.job("PAYOUT_SETUP_UNFINISHED").state === "skipped" && v.job("PAYOUT_SETUP_UNFINISHED").skip_reason === "CONDITION_NO_LONGER_TRUE" && v.emailsOf("PAYOUT_SETUP_UNFINISHED").length === 0)
  }

  realLog("\nThe store setup nudge names the next step and counts the same as Home")
  {
    const w = world()
    /* A store with a product and payments done, so those reminders skip themselves: what is left is the website and the domain. */
    w.store.productFacts.set(CREATOR, [{ id: "p1", status: "published", type: "digital", title: "Guide", archived: false, hasFile: true }])
    w.store.paymentFacts.set(CREATOR, { stripeAccountId: "acct_1", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, status: "connected", requirements: null, requirementsDueBy: null })
    w.store.setupFacts.set(USER, { ...NO_FACTS, products: 1, publishedProducts: 1, paymentsReady: true, guideOpened: true, sales: 1 })
    await w.raise({ name: "store.created", key: "store.created:c1" })
    await w.run()
    w.later(4 * DAY)
    await w.run()
    check("four days in, nothing about the setup yet", w.emailsOf("STORE_SETUP_UNFINISHED").length === 0)
    w.later(DAY + MIN)
    await w.run()
    const mail = w.emailsOf("STORE_SETUP_UNFINISHED")[0]
    check("day 5: one email, counting the steps the way Home's card does", w.job("STORE_SETUP_UNFINISHED").state === "sent" && /5 of 7 steps done/.test(mail?.text ?? ""), mail?.subject)
    check("it names the next step and links to the page that finishes it", /publish your website/.test(mail?.text ?? "") && (mail?.text ?? "").includes("https://storelib.com/app/website-builder"))
    check("and the bell says the same", w.store.bell.some((b) => b.type === "STORE_SETUP_UNFINISHED" && b.actionUrl === "/app/website-builder"))
    w.store.setupFacts.set(USER, { ...NO_FACTS, products: 1, publishedProducts: 1, paymentsReady: true, guideOpened: true, sales: 1, websiteLive: true, domainConnected: true, creatorPageDomain: true })
    w.later(7 * DAY)
    await w.run()
    check("setup finished in between: the second one is skipped, not sent", w.job("STORE_SETUP_UNFINISHED_2").skip_reason === "CONDITION_NO_LONGER_TRUE" && w.emailsOf("STORE_SETUP_UNFINISHED_2").length === 0)

    const steps = setupSteps({ ...NO_FACTS, guideOpened: true })
    check("the step to nudge about is never the product or the payments one: those have their own emails", nextNudgeStep(steps)?.id === "store")
    check("and never one with no page to finish it on", setupSteps(NO_FACTS).filter((s) => !s.done && !s.href).every((s) => nextNudgeStep(setupSteps(NO_FACTS))?.id !== s.id))
    check("nothing is nudged once every step is done", nextNudgeStep(setupSteps({ ...NO_FACTS, products: 1, paymentsReady: true, websiteLive: true, domainConnected: true, sales: 1, guideOpened: true })) === null)
  }

  realLog("\nStripe asking for an identity document is followed up twice, then left alone")
  {
    const w = world()
    await w.raise({ name: "payout.action_required", key: "stripe_requirements:acct_1:a", entityType: "payment_setup", entityId: CREATOR, payload: { reason: "requirements_due", requirementCount: 2 } })
    await w.raise({ name: "payout.action_required", key: "stripe_requirements:acct_1:b", entityType: "payment_setup", entityId: CREATOR, payload: { reason: "requirements_due", requirementCount: 2 } })
    await w.run()
    check("the notice itself goes once, as before", w.emailsOf("PAYOUT_ACTION_REQUIRED").length === 1)
    check("and the two follow ups are one pair, however many times Stripe says it", w.jobsOf("VERIFICATION_REMINDER").length === 1 && w.jobsOf("VERIFICATION_REMINDER_2").length === 1)
    w.later(2 * DAY + MIN)
    await w.run()
    check("with nothing recorded from Stripe (run-now part 63 not run): skipped, never guessed", w.job("VERIFICATION_REMINDER").skip_reason === "CONDITION_NO_LONGER_TRUE" && w.emailsOf("VERIFICATION_REMINDER").length === 0)

    const v = world()
    v.store.paymentFacts.set(CREATOR, { stripeAccountId: "acct_1", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, status: "connected", requirements: ["individual.verification.document", "individual.id_number"], requirementsDueBy: "2026-10-20T12:00:00Z" })
    await v.raise({ name: "payout.action_required", key: "stripe_requirements:acct_1:a", entityType: "payment_setup", entityId: CREATOR, payload: { reason: "requirements_due", requirementCount: 2 } })
    await v.run()
    v.later(2 * DAY + MIN)
    await v.run()
    const mail = v.emailsOf("VERIFICATION_REMINDER")[0]
    check("two days later, with the ask still open, the reminder goes", v.job("VERIFICATION_REMINDER").state === "sent" && !!mail)
    check("it names what Stripe still wants and the date it gave", /Photo ID/.test(mail?.text ?? "") && /October 20, 2026/.test(mail?.text ?? ""))
    check("it is service mail: no unsubscribe link, whatever the lifecycle preference says", !mail?.headers?.["List-Unsubscribe"] && !/Unsubscribe/.test(mail?.text ?? ""))
    v.store.paymentFacts.set(CREATOR, { stripeAccountId: "acct_1", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, status: "connected", requirements: [], requirementsDueBy: null })
    v.later(5 * DAY)
    await v.run()
    check("Stripe satisfied in between: the last one is skipped", v.job("VERIFICATION_REMINDER_2").skip_reason === "CONDITION_NO_LONGER_TRUE" && v.emailsOf("VERIFICATION_REMINDER_2").length === 0)

    check("Stripe's keys read as words a person knows, at most three of them", readableRequirements(["individual.verification.document", "individual.id_number", "company.tax_id", "external_account"]) === "Photo ID, ID number, Tax ID")
    check("and a date of birth asked for in three keys is said once", readableRequirements(["individual.dob.day", "individual.dob.month", "individual.dob.year"]) === "Date of birth")
    check("and nothing at all when Stripe named nothing", readableRequirements([]) === "")
  }

  realLog("\nThe provider says try later")
  {
    const w = world()
    w.provider.answers = [{ status: "retry", error: "429" }, { status: "retry", error: "503" }]
    await w.raise({ name: "payout.sent", key: "stripe:evt_ps", entityType: "payout", entityId: "po_2", payload: { amountCents: 100, currency: "usd" } })
    await w.run()
    const j = () => w.job("PAYOUT_SENT")
    const t0 = w.store.clock.now
    check("the job goes back to pending a minute later", j().state === "pending" && Date.parse(j().run_at) === t0 + retryDelayMs(1))
    check("the bell row is already there and is not written twice", w.store.bell.filter((b) => b.type === "PAYOUT_SENT").length === 1)
    await w.run()
    check("not before its time", w.provider.calls === 1)
    w.later(MIN + 1)
    await w.run()
    check("then five minutes after the second try", j().state === "pending" && Date.parse(j().run_at) === w.store.clock.now + retryDelayMs(2) && retryDelayMs(2) === 5 * MIN)
    w.later(5 * MIN + 1)
    await w.run()
    check("the third try goes, on the same delivery row", j().state === "sent" && w.delivery(j().id, "email")?.attempt_count === 3 && w.emailsOf("PAYOUT_SENT").length === 1)
    check("the backoff is 1m, 5m, 30m, 2h, 6h", [1, 2, 3, 4, 5, 9].map(retryDelayMs).join() === [MIN, 5 * MIN, 30 * MIN, 2 * HOUR, 6 * HOUR, 6 * HOUR].join())

    const x = world()
    x.provider.answers = Array.from({ length: 6 }, () => ({ status: "retry" as const, error: "503" }))
    await x.raise({ name: "payout.sent", key: "stripe:evt_px", entityType: "payout", entityId: "po_3" })
    for (let i = 0; i < 6; i++) {
      await x.run()
      x.later(7 * HOUR)
    }
    check("after five attempts it fails", x.job("PAYOUT_SENT").state === "failed" && x.provider.calls === 5)
  }

  realLog("\nA timeout is never sent again")
  {
    const w = world()
    w.provider.answers = [{ status: "unknown", error: "timeout" }]
    await w.raise({ name: "payout.sent", key: "stripe:evt_t", entityType: "payout", entityId: "po_t" })
    await w.run()
    w.later(DAY)
    await w.run()
    check("an unknown answer is recorded as unknown and the email is not tried again", w.provider.calls === 1 && w.delivery(w.job("PAYOUT_SENT").id, "email")?.status === "unknown" && w.job("PAYOUT_SENT").state !== "pending")

    const v = world()
    await v.raise({ name: "payout.sent", key: "stripe:evt_d", entityType: "payout", entityId: "po_d" })
    /* A worker that died mid-send: the job processing with a lapsed lease, its delivery row in sending. */
    await v.store.claimEvents(10, 60).then(async (rows) => {
      const { handleEvent, emptySummary } = await import("../lib/notify/engine")
      for (const r of rows) await handleEvent(v.deps, r, emptySummary())
    })
    const claimed = await v.store.claimJobs("dead", 10, 120)
    const dj = claimed.find((j) => j.type === "PAYOUT_SENT")!
    await v.store.beginDelivery({ jobId: dj.id, channel: "email", provider: "fake", type: "PAYOUT_SENT", category: "payouts_and_payments", requirement: "optional_product", recipientEmail: EMAIL, recipientUserId: USER, correlationId: null })
    v.later(3 * MIN)
    await v.run()
    check("the lease runs out, the next worker takes the job and does not send it again", v.provider.calls === 0 && v.job("PAYOUT_SENT").state !== "processing" && v.delivery(dj.id, "email")?.status === "unknown")
  }

  realLog("\nA permanent failure suppresses the address")
  {
    const w = world()
    w.provider.answers = [{ status: "failed", error: "mailbox does not exist", permanent: true }]
    await w.raise({ name: "payout.sent", key: "stripe:evt_b", entityType: "payout", entityId: "po_b" })
    await w.run()
    check("the delivery is bounced at once, no retry", w.delivery(w.job("PAYOUT_SENT").id, "email")?.status === "bounced" && w.job("PAYOUT_SENT").state !== "pending" && w.provider.calls === 1)
    check("the address is suppressed for everything", w.store.suppressed.has(`${EMAIL}|all`))
    await w.raise({ name: "user.password_changed", key: `user.password_changed:${USER}:9` })
    await w.run()
    check("even a required email is then skipped SUPPRESSED", w.delivery(w.job("PASSWORD_CHANGED").id, "email")?.skip_reason === "SUPPRESSED" && w.provider.calls === 1)
  }

  realLog("\nCooldowns and daily caps")
  {
    const w = world()
    await w.raise({ name: "payment_setup.action_required", key: "payment_setup.action_required:c1:1" })
    await w.run()
    w.later(2 * HOUR)
    await w.raise({ name: "payment_setup.action_required", key: "payment_setup.action_required:c1:2" })
    await w.run()
    const [first, second] = w.jobsOf("PAYMENT_VERIFICATION_REQUIRED")
    check("the verification notice goes once", first.state === "sent" && w.emailsOf("PAYMENT_VERIFICATION_REQUIRED").length === 1)
    check("and again within 24 hours is skipped COOLDOWN", second?.state === "skipped" && second.skip_reason === "COOLDOWN")
    w.later(DAY)
    await w.raise({ name: "payment_setup.action_required", key: "payment_setup.action_required:c1:3" })
    await w.run()
    check("after the cooldown it may go again", w.emailsOf("PAYMENT_VERIFICATION_REQUIRED").length === 2)

    const v = world()
    for (let i = 1; i <= 4; i++) await v.raise({ name: "domain.connected", key: `domain.connected:d${i}`, entityType: "domain", entityId: `d${i}`, payload: { domain: `s${i}.example.com` } })
    await v.run()
    const jobs = v.jobsOf("DOMAIN_CONNECTED")
    check("three optional emails a day, the fourth is skipped DAILY_CAP", v.emailsOf("DOMAIN_CONNECTED").length === 3 && jobs.filter((j) => v.delivery(j.id, "email")?.skip_reason === "DAILY_CAP").length === 1)
    check("the fourth still reaches the bell", v.store.bell.filter((b) => b.type === "DOMAIN_CONNECTED").length === 4)
    await v.raise({ name: "user.password_changed", key: `user.password_changed:${USER}:2` })
    await v.run()
    check("required email is not counted against the cap", v.emailsOf("PASSWORD_CHANGED").length === 1)
  }

  realLog("\nExpired, cancelled, the wrong person")
  {
    const w = world()
    await w.store.insertJobs([
      { type: "PAYOUT_SENT", recipientType: "creator", recipientUserId: USER, creatorId: CREATOR, idempotencyKey: "old", runAt: new Date(w.store.clock.now - 2 * DAY).toISOString(), expiresAt: new Date(w.store.clock.now - DAY).toISOString(), data: {}, eventId: null, correlationId: null, maxAttempts: 5 },
      { type: "PASSWORD_CHANGED", recipientType: "customer", recipientEmail: "buyer@example.com", creatorId: CREATOR, idempotencyKey: "wrong", runAt: new Date(w.store.clock.now).toISOString(), data: {}, eventId: null, correlationId: null, maxAttempts: 5 },
      { type: "PURCHASE_CONFIRMATION", recipientType: "creator", recipientUserId: USER, creatorId: CREATOR, idempotencyKey: "wrong2", runAt: new Date(w.store.clock.now).toISOString(), data: {}, eventId: null, correlationId: null, maxAttempts: 5 },
      { type: "PAYOUT_SENT", recipientType: "creator", recipientUserId: USER, creatorId: CREATOR, idempotencyKey: "gone", workflow: "x", runAt: new Date(w.store.clock.now).toISOString(), data: {}, eventId: null, correlationId: null, maxAttempts: 5 },
    ])
    await w.store.cancelJobs({ workflow: "x", recipientUserId: USER, reason: "test" })
    await w.run()
    const by = (k: string) => w.store.jobs.find((j) => j.idempotency_key === k)!
    check("an expired job is skipped EXPIRED and not delivered", by("old").state === "skipped" && by("old").skip_reason === "EXPIRED")
    check("a creator template to a customer is blocked WRONG_RECIPIENT_TYPE", by("wrong").skip_reason === "WRONG_RECIPIENT_TYPE")
    check("and a customer template to a creator", by("wrong2").skip_reason === "WRONG_RECIPIENT_TYPE")
    check("a cancelled job stays cancelled", by("gone").state === "cancelled")
    check("nothing was sent", w.provider.calls === 0 && w.store.bell.length === 0)
  }

  realLog("\nThe email change reaches the previous address too")
  {
    const w = world()
    w.store.users.set(USER, { email: "new@example.com", name: "Maker" })
    await w.raise({ name: "user.email_changed", key: `user.email_changed:${USER}:1`, payload: { previousEmail: "old@example.com", newEmail: "new@example.com" } })
    await w.run()
    const to = w.emailsOf("EMAIL_CHANGED").map((m) => m.to).sort()
    check("two security emails, one to each address", JSON.stringify(to) === JSON.stringify(["new@example.com", "old@example.com"]))
  }

  realLog("\nemit() never breaks its caller")
  {
    const broken = { from: () => { throw new Error("db down") }, rpc: () => { throw new Error("db down") } }
    const r = await emit({ name: "sale.created", key: "k", payload: {} }, { db: broken, soon: false })
    check("a database that throws: ok false, no throw", r.ok === false)
    const w = world()
    check("an unknown event name is refused", (await emit({ name: "nope" as DomainEvent["name"], key: "k", payload: {} }, { db: w.store, soon: false })).ok === false)
    check("an event without a key is refused", (await emit({ name: "sale.created", key: "", payload: {} }, { db: w.store, soon: false })).ok === false)
  }

  realLog("\nMailgun")
  {
    check("from MAILGUN_FROM_NAME and MAILGUN_FROM_EMAIL", notifyFrom({ MAILGUN_FROM_NAME: "Storelib", MAILGUN_FROM_EMAIL: "notifications@mg.storelib.com" }) === "Storelib <notifications@mg.storelib.com>")
    check("else EMAIL_FROM", /@/.test(notifyFrom({})))
    /* A review request goes out under the seller's name, from Storelib's own address either way. */
    const env = { MAILGUN_FROM_NAME: "Storelib", MAILGUN_FROM_EMAIL: "notifications@mg.storelib.com" }
    check("a named sender replaces the name and keeps the address", notifyFrom(env, "Loudlib via Storelib") === '"Loudlib via Storelib" <notifications@mg.storelib.com>', notifyFrom(env, "Loudlib via Storelib"))
    check("a name with a comma or a quote cannot split the header", notifyFrom(env, 'A, B" <x@y.z>') === '"A, B x@y.z" <notifications@mg.storelib.com>', notifyFrom(env, 'A, B" <x@y.z>'))
    check("a name with a line break is one line", !/[\r\n]/.test(notifyFrom(env, "A\r\nBcc: x@y.z")))
    check("no name given: Storelib, as before", notifyFrom(env, null) === "Storelib <notifications@mg.storelib.com>" && notifyFrom(env, "  ") === "Storelib <notifications@mg.storelib.com>")
    check("a timeout is unknown, never retry", resultOf({ success: false, timedOut: true } as never).status === "unknown")
    check("a 429 or 5xx is retry", resultOf({ success: false, status: 429 } as never).status === "retry" && resultOf({ success: false, status: 502 } as never).status === "retry")
    check("a 400 about the address is a permanent failure", (() => {
      const r = resultOf({ success: false, status: 400, error: "to parameter is not a valid address" } as never)
      return r.status === "failed" && r.permanent === true
    })())
    let given: Record<string, unknown> | null = null
    const provider = new MailgunEmailProvider((async (o: Record<string, unknown>) => {
      given = o
      return { success: true, status: 200, messageId: "<x@mg>" }
    }) as never)
    const r = await provider.send({ to: EMAIL, subject: "S", html: "<p>h</p>", text: "h", tags: ["PAYOUT_SENT"], variables: { delivery_id: "d1", job_id: "j1" }, messageId: "<notify.d1@mg>", headers: { "List-Unsubscribe": "<u>" } })
    const g = given as Record<string, unknown> | null
    check("one call through sendMailgunOnce, with the tag, variables, headers and Message-Id", r.status === "sent" && r.providerMessageId === "<x@mg>" && JSON.stringify(g?.tags) === '["PAYOUT_SENT"]' && (g?.metadata as Record<string, string>)?.delivery_id === "d1" && g?.messageId === "<notify.d1@mg>" && (g?.headers as Record<string, string>)?.["List-Unsubscribe"] === "<u>")
  }

  console.log = realLog
  console.warn = realWarn
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.log = realLog
  console.error(error)
  process.exit(1)
})
