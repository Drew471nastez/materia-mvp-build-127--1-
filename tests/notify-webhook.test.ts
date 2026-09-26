/**
 * ===========================================================================
 *  THE MAILGUN WEBHOOK, CHECKED AND APPLIED ONCE
 * ===========================================================================
 * lib/notify/webhook.ts handleMailgunWebhook with a memory store
 * (tests/notify-memory-store.ts) and a signing key: what is refused (no key,
 * a bad signature, an old timestamp), what a retry by Mailgun changes (nothing),
 * and what each event does to the engine's delivery row, the suppression
 * list and the person's preferences. The route's list and campaign handling
 * is the `legacy` callback, counted here.
 *
 * Run with:  npm run test:push
 */
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { handleMailgunWebhook, providerEventOf, WINDOW_MS } from "../lib/notify/webhook"
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

const realLog = console.log
console.log = (...a: unknown[]) => {
  if (typeof a[0] === "string" && a[0].startsWith("{")) return
  realLog(...a)
}

const KEY = "whsec-test-key"
const USER = "11111111-1111-4111-8111-111111111111"
const EMAIL = "maker@example.com"

let tokenSeq = 0
function signed(event: Record<string, unknown>, o: { key?: string; at?: number; token?: string } = {}) {
  const timestamp = String(Math.floor((o.at ?? Date.now()) / 1000))
  const token = o.token ?? `tok${++tokenSeq}`.padEnd(50, "x")
  const signature = createHmac("sha256", o.key ?? KEY).update(timestamp + token).digest("hex")
  return { signature: { timestamp, token, signature }, "event-data": { timestamp: Number(timestamp), ...event } }
}

async function world() {
  const store = new MemoryNotifyStore()
  store.clock.now = Date.now()
  /* One engine email already sent: a lifecycle reminder to the creator. */
  await store.insertJobs([{ type: "FIRST_PRODUCT_REMINDER", recipientType: "creator", recipientUserId: USER, creatorId: "c1", idempotencyKey: "j1", runAt: new Date().toISOString(), data: {}, eventId: null, correlationId: null, maxAttempts: 5 }])
  const job = store.jobs[0]
  const begun = await store.beginDelivery({ jobId: job.id, channel: "email", provider: "mailgun", type: "FIRST_PRODUCT_REMINDER", category: "lifecycle", requirement: "optional_product", recipientEmail: EMAIL, recipientUserId: USER, correlationId: null })
  const deliveryId = begun.kind === "go" ? begun.deliveryId : ""
  await store.finishDelivery(deliveryId, { status: "sent", providerMessageId: "<notify.abc@mg.storelib.com>" })
  let legacy = 0
  const hook = (body: unknown, keys: string[] = [KEY]) =>
    handleMailgunWebhook(body, {
      signingKeys: keys,
      store,
      legacy: async () => {
        legacy++
      },
    })
  const delivery = () => store.deliveries.find((d) => d.id === deliveryId)!
  return { store, hook, delivery, deliveryId, legacyCount: () => legacy }
}

async function main() {
  console.log("\nWhat is refused")
  {
    const w = await world()
    const body = signed({ id: "e1", event: "delivered", recipient: EMAIL, "user-variables": { delivery_id: w.deliveryId } })
    check("no signing key configured: 401", (await w.hook(body, [])).status === 401)
    check("unsigned: 401", (await w.hook({ "event-data": body["event-data"] })).status === 401)
    check("invalid signature (another key): 401", (await w.hook(signed({ id: "e2", event: "delivered" }, { key: "someone-else" }))).status === 401)
    const tampered = signed({ id: "e3", event: "delivered" })
    tampered.signature.signature = tampered.signature.signature.replace(/.$/, (c) => (c === "a" ? "b" : "a"))
    check("a signature changed by one character: 401", (await w.hook(tampered)).status === 401)
    check("a stale timestamp (older than five minutes): 401", (await w.hook(signed({ id: "e4", event: "delivered" }, { at: Date.now() - WINDOW_MS - 30_000 }))).status === 401)
    check("one from the future beyond the window: 401", (await w.hook(signed({ id: "e5", event: "delivered" }, { at: Date.now() + WINDOW_MS + 30_000 }))).status === 401)
    check("nothing refused reached the handlers", w.legacyCount() === 0 && w.store.webhooks.size === 0 && w.delivery().status === "sent")
    check("a fresh one inside the window is taken", (await w.hook(signed({ id: "e6", event: "delivered", recipient: EMAIL }, { at: Date.now() - 60_000 }))).status === 200)
  }

  console.log("\nOnce, however often Mailgun sends it")
  {
    const w = await world()
    const body = signed({ id: "evt-open-1", event: "opened", recipient: EMAIL, "user-variables": { delivery_id: w.deliveryId } })
    const first = await w.hook(body)
    const second = await w.hook(body)
    check("the first is handled", first.status === 200 && !first.body.duplicate)
    check("the retry answers 200 and is marked duplicate", second.status === 200 && second.body.duplicate === true)
    check("the list and campaign handling ran once", w.legacyCount() === 1)
    const noId = signed({ event: "clicked", recipient: EMAIL }, { token: "same-token".padEnd(50, "y") })
    await w.hook(noId)
    await w.hook(noId)
    check("without an event id the token is the key", w.legacyCount() === 2)
  }

  console.log("\nWhat each event does to the delivery")
  {
    const w = await world()
    const vars = { "user-variables": { delivery_id: w.deliveryId } }
    await w.hook(signed({ id: "a1", event: "accepted", recipient: EMAIL, ...vars, message: { headers: { "message-id": "notify.abc@mg.storelib.com" } } }))
    check("accepted keeps the row as sent", w.delivery().status === "sent")
    await w.hook(signed({ id: "a2", event: "delivered", recipient: EMAIL, ...vars }))
    check("delivered: status and time", w.delivery().status === "delivered" && !!w.delivery().delivered_at)
    await w.hook(signed({ id: "a3", event: "opened", recipient: EMAIL, ...vars }))
    await w.hook(signed({ id: "a4", event: "clicked", recipient: EMAIL, ...vars }))
    check("opened and clicked stamp their time", !!w.delivery().opened_at && !!w.delivery().clicked_at && w.delivery().status === "delivered")
    await w.hook(signed({ id: "a5", event: "failed", severity: "temporary", recipient: EMAIL, ...vars }))
    check("a temporary failure notes the reason and does not suppress", w.delivery().status === "delivered" && !!w.delivery().failure_reason && w.store.suppressed.size === 0)

    const m = await world()
    await m.hook(signed({ id: "b1", event: "delivered", recipient: EMAIL, message: { headers: { "message-id": "notify.abc@mg.storelib.com" } } }))
    check("found by Message-Id when the variable is missing", m.delivery().status === "delivered")
  }

  console.log("\nA permanent failure")
  {
    const w = await world()
    await w.hook(signed({ id: "p1", event: "failed", severity: "permanent", recipient: "Maker@Example.com", "user-variables": { delivery_id: w.deliveryId } }))
    check("the delivery is bounced", w.delivery().status === "bounced" && !!w.delivery().failed_at)
    check("the address is suppressed for all email, lower case, from mailgun", w.store.suppressed.get(`${EMAIL}|all`)?.source === "mailgun" && w.store.suppressed.get(`${EMAIL}|all`)?.reason === "bounce")
    await w.hook(signed({ id: "p2", event: "opened", recipient: EMAIL, "user-variables": { delivery_id: w.deliveryId } }))
    check("a later open does not move it back", w.delivery().status === "bounced")
    const other = await world()
    await other.hook(signed({ id: "p3", event: "failed", severity: "permanent", recipient: "someone@example.com" }))
    check("an address from any email (a campaign, a receipt) is suppressed too", other.store.suppressed.has("someone@example.com|all"))
  }

  console.log("\nA complaint")
  {
    const w = await world()
    await w.hook(signed({ id: "c1", event: "complained", recipient: EMAIL, "user-variables": { delivery_id: w.deliveryId } }))
    check("the delivery is complained", w.delivery().status === "complained")
    check("the address is suppressed for optional email only", w.store.suppressed.has(`${EMAIL}|optional`) && !w.store.suppressed.has(`${EMAIL}|all`))
    const prefs = await w.store.preferences(USER)
    check("lifecycle, tips and marketing email turned off, from mailgun", ["lifecycle", "tips", "marketing"].every((c) => prefs.some((p) => p.category === c && p.channel === "email" && p.enabled === false)) && [...w.store.prefs.values()].every((p) => p.source === "mailgun"))
    check("security is left alone", !prefs.some((p) => p.category === "security"))
  }

  console.log("\nAn unsubscribe")
  {
    const w = await world()
    await w.hook(signed({ id: "u1", event: "unsubscribed", recipient: EMAIL, "user-variables": { delivery_id: w.deliveryId } }))
    check("the delivery is unsubscribed", w.delivery().status === "unsubscribed")
    const prefs = await w.store.preferences(USER)
    check("that email's category is turned off by email", prefs.length === 1 && prefs[0].category === "lifecycle" && prefs[0].channel === "email" && prefs[0].enabled === false)
    check("the list handling still ran", w.legacyCount() === 1)
    const x = await world()
    await x.store.insertJobs([{ type: "PASSWORD_CHANGED", recipientType: "creator", recipientUserId: USER, creatorId: "c1", idempotencyKey: "j2", runAt: new Date().toISOString(), data: {}, eventId: null, correlationId: null, maxAttempts: 5 }])
    const b = await x.store.beginDelivery({ jobId: x.store.jobs[1].id, channel: "email", provider: "mailgun", type: "PASSWORD_CHANGED", category: "security", requirement: "required_service", recipientEmail: EMAIL, recipientUserId: USER, correlationId: null })
    await x.hook(signed({ id: "u2", event: "unsubscribed", recipient: EMAIL, "user-variables": { delivery_id: b.kind === "go" ? b.deliveryId : "" } }))
    check("an unsubscribe from a required email turns nothing off", (await x.store.preferences(USER)).length === 0)
  }

  console.log("\nParsing")
  {
    const ev = providerEventOf({ event: "failed", severity: "permanent", recipient: " A@B.com ", timestamp: 1_700_000_000, "user-variables": { delivery_id: "d" }, message: { headers: { "message-id": "m@x" } }, "delivery-status": { message: "550 no such user" } })
    check("event, severity, recipient in lower case, ids, time and reason", ev.event === "failed" && ev.severity === "permanent" && ev.recipient === "a@b.com" && ev.deliveryId === "d" && ev.messageId === "m@x" && ev.at === new Date(1_700_000_000_000).toISOString() && ev.reason === "550 no such user")
  }

  console.log("\nThe route")
  {
    const route = readFileSync(join(process.cwd(), "app/api/webhooks/mailgun/route.ts"), "utf8")
    check("the route hands every delivery to handleMailgunWebhook with its store and the list handling", /handleMailgunWebhook\(body, \{/.test(route) && /store: supabaseNotifyStore\(/.test(route) && /legacy: handleListEvent/.test(route))
    check("and still refuses without a key or a valid signature", /SIGNING_KEYS\.length === 0/.test(route) && /verifyWebhookSignature\(body\?\.signature\)/.test(route))
  }

  console.log = realLog
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
