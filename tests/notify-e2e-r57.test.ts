/**
 * ===========================================================================
 *  EVERY COMMERCE MESSAGE, THROUGH THE REAL CODE, STUBBED AT THE EDGE (r57)
 * ===========================================================================
 * The real modules run here: the outbox (emit), the engine's worker with its
 * email, bell and push channels, the Mailgun provider, lib/push/sender with
 * the real supabase-js client, the sale push (lib/orders/sale-events), the
 * order event queue (lib/physical/jobs-server queueSellerEmail), the push
 * token route (app/api/push/register) and Log out (lib/auth/log-out). What is
 * stubbed:
 *
 *   the network  globalThis.fetch answers PostgREST (an in memory table per
 *                name: push_tokens, creators, orders, commerce_jobs,
 *                notification_preferences, ...), Supabase Auth's admin read,
 *                and Mailgun's messages endpoint, and records each request
 *   Firebase     firebase-admin/app and firebase-admin/messaging: send()
 *                records the HTTP v1 Message it was handed, as FCM would
 *                receive it (the SDK only adds the OAuth header and the
 *                project path around it)
 *   who asks     lib/push/request-user (the cookie or bearer check), so a
 *                request says which user it is
 *
 * For each message it asserts: sent once, to the right person, with the
 * right content and a tap that opens the right page in the app; the
 * person's preferences and the required notices; and a webhook or job
 * retried sends nothing more. The engine's tables are the memory store the
 * other engine suites use (tests/notify-memory-store.ts).
 *
 * Run with:  npm run test:push
 */
import { register } from "node:module"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    out(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    out(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}

/* ── Firebase, as a recorder ───────────────────────────────────────────── */
const dir = mkdtempSync(join(tmpdir(), "notify-e2e-r57-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs: Record<string, string> = {
  "firebase-admin/app": stub("fb-app", `const apps = []
export const getApps = () => apps
export const cert = (c) => c
export const initializeApp = (o) => { const a = { name: "[DEFAULT]", options: o }; apps.push(a); return a }
`),
  "firebase-admin/messaging": stub("fb-messaging", `export const getMessaging = () => ({
  send: async (message) => {
    const g = globalThis.__fcm
    if (g.refuse && g.refuse.has(message.token)) { const e = new Error("Requested entity was not found."); e.code = "messaging/registration-token-not-registered"; throw e }
    g.sent.push(message)
    return "projects/storelib-test/messages/" + g.sent.length
  },
})
`),
  "@/lib/push/request-user": stub("request-user", `export async function pushRequestUser(req) {
  const m = /^Bearer user:(.+)$/.exec(req.headers.get("authorization") || "")
  return m ? { user: { id: m[1], email: "seller@example.com" }, via: "bearer" } : { user: null }
}
`),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

/* ── The network ───────────────────────────────────────────────────────── */
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const tables = new Map<string, Row[]>()
const T = (name: string) => (tables.has(name) ? tables.get(name)! : (tables.set(name, []), tables.get(name)!))
const mailgun: { to: string; from: string; subject: string; text: string; html: string; headers: Record<string, string> }[] = []
const requests: { method: string; url: string }[] = []
let routeDelete: ((r: Request) => Promise<Response>) | null = null
let seq = 0

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue
    if (k === "or") continue
    const m = /^(not\.)?(eq|in|is|gt|gte|lt|lte|neq|like|ilike)\.(.*)$/.exec(v)
    if (!m) continue
    const [, not, op, raw] = m
    const cell = row[k]
    let ok = true
    if (op === "eq") ok = String(cell) === raw
    else if (op === "neq") ok = String(cell) !== raw
    else if (op === "in") ok = raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(cell))
    else if (op === "is") ok = raw === "null" ? cell == null : String(cell) === raw
    else if (op === "gt") ok = cell > raw
    else if (op === "gte") ok = cell >= raw
    if (not) ok = !ok
    if (!ok) return false
  }
  return true
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
}

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
  requests.push({ method, url })
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  if (url === "/api/push/register" && method === "DELETE") {
    if (!routeDelete) return json({ error: "no route" }, 500)
    return routeDelete(new Request("https://storelib.com/api/push/register", { method, headers, body: init?.body as string }))
  }
  if (url.includes("mailgun.net/v3/")) {
    const form = init?.body as FormData
    const get = (k: string) => (form && typeof form.get === "function" ? String(form.get(k) ?? "") : "")
    const hdrs: Record<string, string> = {}
    if (form && typeof form.forEach === "function") form.forEach((v, k) => { if (k.startsWith("h:")) hdrs[k.slice(2)] = String(v) })
    mailgun.push({ to: get("to"), from: get("from"), subject: get("subject"), text: get("text"), html: get("html"), headers: hdrs })
    return json({ id: `<m${mailgun.length}@mg.storelib.com>`, message: "Queued. Thank you." })
  }
  if (url.includes("/auth/v1/admin/users/")) return json({ id: url.split("/").pop(), app_metadata: {}, email: "seller@example.com" })
  const m = /\/rest\/v1\/([a-z_]+)(\?.*)?$/.exec(url)
  if (!m) return json({ error: `unexpected ${method} ${url}` }, 404)
  const table = T(m[1])
  const params = new URLSearchParams((m[2] ?? "").slice(1))
  const single = (headers.get("accept") || "").includes("vnd.pgrst.object")
  const prefer = headers.get("prefer") || ""
  if (method === "GET" || method === "HEAD") {
    let rows = table.filter((r) => matches(r, params))
    const limit = Number(params.get("limit") ?? "")
    if (limit > 0) rows = rows.slice(0, limit)
    const range = { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` }
    if (method === "HEAD") return new Response(null, { status: 200, headers: range })
    if (single) return rows.length === 1 ? json(rows[0], 200, range) : json({ code: "PGRST116", message: "no rows" }, 406)
    return json(rows, 200, range)
  }
  if (method === "POST") {
    const body = JSON.parse(String(init?.body ?? "[]"))
    const list: Row[] = Array.isArray(body) ? body : [body]
    const conflict = params.get("on_conflict")
    const written: Row[] = []
    for (const r of list) {
      if (m[1] === "commerce_jobs" && table.some((x) => x.idempotency_key === r.idempotency_key)) return json({ code: "23505", message: "duplicate key" }, 409)
      const dup = conflict ? table.find((x) => conflict.split(",").every((c) => x[c] === r[c])) : null
      if (dup) {
        if (!prefer.includes("ignore-duplicates")) Object.assign(dup, r)
        written.push(dup)
      } else {
        const row = { id: r.id ?? `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, created_at: new Date().toISOString(), ...r }
        table.push(row)
        written.push(row)
      }
    }
    if (!prefer.includes("return=representation")) return new Response(null, { status: 201 })
    if (single) return json(written[0] ?? null, 201)
    return json(written, 201)
  }
  if (method === "DELETE") {
    const gone = table.filter((r) => matches(r, params))
    tables.set(m[1], table.filter((r) => !gone.includes(r)))
    return prefer.includes("return=representation") ? json(gone) : new Response(null, { status: 204 })
  }
  if (method === "PATCH") {
    const patch = JSON.parse(String(init?.body ?? "{}"))
    const hit = table.filter((r) => matches(r, params))
    for (const r of hit) Object.assign(r, patch)
    return prefer.includes("return=representation") ? json(hit) : new Response(null, { status: 204 })
  }
  return json({ error: "unsupported" }, 405)
}
globalThis.fetch = fakeFetch as typeof fetch

/* ── The people ────────────────────────────────────────────────────────── */
const SELLER = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"
const OTHER = "33333333-3333-4333-8333-333333333333"
const CHECKOUT = "44444444-4444-4444-8444-444444444444"
const ORDER = "55555555-5555-4555-8555-555555555555"
const SELLER_EMAIL = "maker@example.com"
const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b|\u2014/i

function seedTables() {
  tables.clear()
  T("creators").push({ id: CREATOR, user_id: SELLER, first_sale_email_sent: true })
  T("push_tokens").push(
    { id: "t-ios", user_id: SELLER, token: "ios-token-A", platform: "ios" },
    { id: "t-and", user_id: SELLER, token: "android-token-B", platform: "android" },
    { id: "t-other", user_id: OTHER, token: "ios-token-OTHER", platform: "ios" },
  )
  T("orders").push({ id: ORDER, checkout_id: CHECKOUT, creator_id: CREATOR, created_at: "2026-11-01T10:00:00Z" })
}

const fcm = (globalThis as unknown as { __fcm: { sent: any[]; refuse: Set<string> } }).__fcm = { sent: [], refuse: new Set() } // eslint-disable-line @typescript-eslint/no-explicit-any
/* next/server's after() in this harness hands its task here (scripts/push-test-loader.mjs); settle() runs them as Next does once a response has gone. */
const afterTasks: (() => unknown)[] = []
;(globalThis as unknown as { __PUSH_TEST_AFTER__: (t: () => unknown) => void }).__PUSH_TEST_AFTER__ = (t) => void afterTasks.push(t)
const settle = async () => {
  while (afterTasks.length) await Promise.resolve(afterTasks.shift()!()).catch(() => undefined)
  await new Promise((r) => setTimeout(r, 50))
}

async function main() {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "placeholder",
    FIREBASE_PROJECT_ID: "storelib-test",
    FIREBASE_CLIENT_EMAIL: "push@storelib-test.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nplaceholder\\n-----END PRIVATE KEY-----\\n",
    MAILGUN_API_KEY: "key-test",
    MAILGUN_DOMAIN: "mg.storelib.com",
    MAILGUN_BASE_URL: "https://api.eu.mailgun.net",
    MAILGUN_FROM_EMAIL: "notifications@storelib.com",
    MAILGUN_FROM_NAME: "Storelib",
    NOTIFY_UNSUBSCRIBE_SECRET: "test-secret-for-unsubscribe-links",
    NEXT_PUBLIC_APP_URL: "https://storelib.com",
  })
  const entry = `
export { emit } from "@/lib/notify/outbox"
export { runWork } from "@/lib/notify/engine"
export { emailChannel } from "@/lib/notify/channels/email"
export { inAppChannel } from "@/lib/notify/channels/in-app"
export { pushChannel, PUSH_TYPES } from "@/lib/notify/channels/push"
export { renderEmail, renderInApp } from "@/lib/notify/templates"
export { MailgunEmailProvider } from "@/lib/notify/providers/mailgun"
export { unsubscribeUrl } from "@/lib/notify/unsubscribe"
export { REGISTRY } from "@/lib/notify/registry"
export { NOTIFICATION_TYPES } from "@/lib/notify/types"
export { sendPushToUser, fcmMessage } from "@/lib/push/sender"
export { pushTapTarget } from "@/lib/push/tap"
export { pushPurchase } from "@/lib/orders/sale-events"
export { queueSellerEmail } from "@/lib/physical/jobs-server"
export { sellerOrderPush } from "@/lib/physical/seller-push"
export { sellerCommerceEmail } from "@/lib/notify/seller-commerce"
export { reviewPush } from "@/lib/reviews/review-push"
export { endDeviceSession } from "@/lib/auth/log-out"
export { createAdminClient } from "@/lib/supabase/admin"
export { MemoryNotifyStore } from "./tests/notify-memory-store"
export * as tokenRoute from "@/app/api/push/register/route"
`
  const file = join(process.env.PUSH_TEST_OUT || dir, "__notify-e2e-r57__", "entry.mjs")
  await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" },
    outfile: file,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "error",
    alias: { "@": process.cwd() },
    packages: "external",
    jsx: "automatic",
    plugins: [{ name: "stand-ins", setup(b) { b.onResolve({ filter: /.*/ }, (a) => (a.path in stubs ? { path: a.path, external: true } : undefined)) } }],
    external: ["next/*", "server-only"],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  })
  const quiet = { log: console.log, info: console.info, warn: console.warn, error: console.error }
  const logs: string[] = []
  console.log = console.info = console.warn = console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" "))
  const M = (await import(pathToFileURL(file).href)) as any // eslint-disable-line @typescript-eslint/no-explicit-any
  routeDelete = (r) => M.tokenRoute.DELETE(r)
  const say = (s: string) => quiet.log(s)

  /* ── The engine: event, worker, Mailgun, bell, phone ───────────────── */
  function world() {
    seedTables()
    fcm.sent.length = 0
    mailgun.length = 0
    const store = new M.MemoryNotifyStore()
    store.clock.now = Date.now()
    store.users.set(SELLER, { email: SELLER_EMAIL, name: "Maker" })
    store.creators.set(CREATOR, SELLER)
    const deps = {
      store,
      providerName: "mailgun",
      worker: "w1",
      now: () => store.clock.now,
      email: M.emailChannel({ provider: new M.MailgunEmailProvider(), render: M.renderEmail, baseUrl: () => "https://storelib.com", unsubscribeUrl: M.unsubscribeUrl, preferencesUrl: () => "https://storelib.com/app/settings/notifications", messageDomain: "mg.storelib.com" }),
      inApp: M.inAppChannel(store, { render: M.renderInApp, baseUrl: () => "https://storelib.com", now: () => store.clock.now }),
      push: M.pushChannel({ render: M.renderInApp, baseUrl: () => "https://storelib.com", send: (u: string, p: unknown) => M.sendPushToUser(u, p) }),
    }
    const run = () => M.runWork(deps, 10_000)
    const raise = (name: string, key: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      M.emit({ name, key, userId: SELLER, creatorId: CREATOR, payload, ...extra }, { db: store, soon: false })
    const delivery = (type: string, channel: string) => {
      const job = store.jobs.find((j: { type: string }) => j.type === type)
      return job ? store.deliveries.find((d: { job_id: string; channel: string }) => d.job_id === job.id && d.channel === channel) : undefined
    }
    return { store, deps, run, raise, delivery }
  }

  say("\nPayout sent: the seller's email, bell and phones, once")
  {
    const w = world()
    await w.raise("payout.sent", "po_1:paid", { payoutId: "po_1", amountCents: 12500, currency: "eur", arrivalDate: "2026-11-24", bankLast4: "4242" }, { entityType: "payout", entityId: "po_1" })
    await w.run()
    check("one email through Mailgun, to the seller", mailgun.length === 1 && mailgun[0].to.includes(SELLER_EMAIL), mailgun.map((x) => x.to))
    const mail = mailgun[0]
    check("  from Storelib's own sender", /notifications@storelib\.com|storelib\.com/.test(mail?.from ?? ""), mail?.from)
    check("  with a plain text part and the amount in euros", !!mail?.text && /125/.test(mail.text) && /€|EUR/.test(mail.text + mail.subject), mail?.text?.slice(0, 300))
    check("  optional with no signed link for its category: List-Unsubscribe is the settings page, and never One-Click (which would POST to a page)", /\/app\/settings/.test(mail?.headers["List-Unsubscribe"] ?? "") && !mail?.headers["List-Unsubscribe-Post"] && /\/app\/settings/.test(mail?.html ?? ""), mail?.headers)
    const lifecycle = { id: "j-life", type: "FIRST_PRODUCT_REMINDER", recipient_type: "creator", recipient_user_id: SELLER, recipient_email: null, creator_id: CREATOR, entity_type: "creator", entity_id: CREATOR, data: {}, idempotency_key: "k", correlation_id: null }
    const sent = mailgun.length
    await w.deps.email({ job: lifecycle, entry: M.REGISTRY.FIRST_PRODUCT_REMINDER, to: SELLER_EMAIL, recipientName: "Maker", deliveryId: "d-life" })
    const life = mailgun[sent]
    check("  a lifecycle nudge: the signed link, One-Click, and the same link in the email", /\/api\/notify\/unsubscribe\?token=/.test(life?.headers["List-Unsubscribe"] ?? "") && life?.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && /\/api\/notify\/unsubscribe\?token=/.test(life?.html ?? ""), life?.headers)
    mailgun.length = sent
    check("  no AI words and no em dashes", !BANNED.test(mail?.subject + mail?.text), mail?.subject)
    check("one bell row", w.store.bell.length === 1 && w.store.bell[0].userId === SELLER)
    check("one push to each of the seller's two phones, none to anybody else", fcm.sent.length === 2 && fcm.sent.every((m) => m.token !== "ios-token-OTHER"), fcm.sent.map((m) => m.token))
    const ios = fcm.sent.find((m) => m.token === "ios-token-A")
    const android = fcm.sent.find((m) => m.token === "android-token-B")
    check("  iOS: APNs alert from notification, sound, badge, thread id, collapse id, priority 10", !!ios?.notification?.title && ios.apns.payload.aps.sound === "default" && ios.apns.payload.aps.badge === 1 && ios.apns.payload.aps.threadId === "payouts" && /^n:/.test(ios.apns.headers["apns-collapse-id"]) && ios.apns.headers["apns-priority"] === "10", ios)
    check("  Android: priority high, the channel the app makes, a tag to replace itself", android?.android?.priority === "high" && android.android.notification.channelId === "default" && /^n:/.test(android.android.notification.tag), android)
    check("  data are strings only, as FCM requires", Object.values(ios?.data ?? {}).every((v) => typeof v === "string"), ios?.data)
    check("  the lock screen says no amount and no bank digits", !/125|4242/.test(`${ios?.notification?.title} ${ios?.notification?.body}`), ios?.notification)
    check("  a tap opens Payouts in the app", M.pushTapTarget(ios?.data) === "/app/payouts", ios?.data)
    check("the push delivery is recorded sent, by fcm", w.delivery("PAYOUT_SENT", "push")?.status === "sent" && w.delivery("PAYOUT_SENT", "push")?.provider === "fcm")

    await w.raise("payout.sent", "po_1:paid", { payoutId: "po_1", amountCents: 12500, currency: "eur" }, { entityType: "payout", entityId: "po_1" })
    await w.run()
    await w.run()
    check("Stripe delivers the webhook again, the worker runs twice more: nothing more sent", mailgun.length === 1 && fcm.sent.length === 2 && w.store.bell.length === 1, { mail: mailgun.length, push: fcm.sent.length })
  }

  say("\nRefund: the seller's phone, the emails already sent by lib/email.tsx")
  {
    const w = world()
    await w.raise("order.refunded", `re_1:${ORDER}`, { orderId: ORDER, amountCents: 900, currency: "usd", productTitle: "Mug", buyerEmail: "buyer@example.com" }, { entityType: "order", entityId: ORDER })
    await w.run()
    check("no engine email (sendRefundEmails sends both, once, through email_logs)", mailgun.length === 0)
    check("one push to each phone", fcm.sent.length === 2, fcm.sent.length)
    check("  it opens the order", fcm.sent.every((m) => /^\/app\//.test(M.pushTapTarget(m.data))), fcm.sent.map((m) => M.pushTapTarget(m.data)))
    check("  stacked with sales on iOS", fcm.sent.find((m) => m.apns)?.apns.payload.aps.threadId === "sales")

    w.store.setPreference(SELLER, "sales", "in_app", false, "settings")
    fcm.sent.length = 0
    await w.raise("order.refunded", "re_2:o2", { orderId: "o2", amountCents: 500, currency: "usd" }, { entityType: "order", entityId: "o2" })
    await w.run()
    check("a refund is a required notice (registry): the bell switch does not hold its push", fcm.sent.length === 2, fcm.sent.length)
  }

  say("\nAn optional notice follows the person's switch")
  {
    const w = world()
    w.store.setPreference(SELLER, "payouts_and_payments", "in_app", false, "settings")
    await w.raise("payout.sent", "po_2:paid", { payoutId: "po_2", amountCents: 100, currency: "usd" }, { entityType: "payout", entityId: "po_2" })
    await w.run()
    check("payouts turned off in the bell: no bell row and no push, the email still goes", fcm.sent.length === 0 && w.store.bell.length === 0 && mailgun.length === 1 && w.delivery("PAYOUT_SENT", "push")?.skip_reason === "PREFERENCE_OFF", { push: fcm.sent.length, bell: w.store.bell.length })
  }

  say("\nA required notice goes whatever the switches say")
  {
    const w = world()
    w.store.setPreference(SELLER, "payouts_and_payments", "in_app", false, "settings")
    w.store.setPreference(SELLER, "payouts_and_payments", "push", false, "settings")
    await w.raise("payout_method.problem", "ba_1:errored", { bankLast4: "4242" })
    await w.run()
    check("a bank Stripe could not verify reaches both phones", fcm.sent.length === 2, fcm.sent.length)
    check("  and the email, with no unsubscribe link (required)", mailgun.length === 1 && !mailgun[0].headers["List-Unsubscribe"], mailgun[0]?.headers)
  }

  say("\nWhat the engine leaves to its own push")
  {
    const w = world()
    await w.raise("dispute.created", "dp_1:created", { disputeId: "dp_1", amountCents: 2000, currency: "usd" }, { entityType: "dispute", entityId: "dp_1" })
    await w.raise("order.created", `order:${ORDER}:created`, { orderId: ORDER, amountCents: 2000, currency: "usd" }, { entityType: "order", entityId: ORDER })
    await w.run()
    check("a dispute (the bell rule pushes it at the webhook) and a sale (sale-events pushes it) are not pushed again here", fcm.sent.length === 0 && !M.PUSH_TYPES.has("DISPUTE_CREATED") && !M.PUSH_TYPES.has("NEW_SALE"), fcm.sent.length)
  }

  say("\nNo phone registered")
  {
    const w = world()
    tables.set("push_tokens", [])
    await w.raise("payout.sent", "po_9:paid", { payoutId: "po_9", amountCents: 100, currency: "usd" }, { entityType: "payout", entityId: "po_9" })
    await w.run()
    const job = w.store.jobs.find((j: { type: string }) => j.type === "PAYOUT_SENT")
    check("the email and the bell still go; the push is skipped, not failed or retried", mailgun.length === 1 && w.store.bell.length === 1 && w.delivery("PAYOUT_SENT", "push")?.status === "skipped" && job?.state === "sent", { job: job?.state, push: w.delivery("PAYOUT_SENT", "push") })
  }

  say("\nA token FCM no longer knows")
  {
    seedTables()
    fcm.sent.length = 0
    fcm.refuse.add("android-token-B")
    const r = await M.sendPushToUser(SELLER, { title: "t", body: "b", data: { type: "payout_available" } })
    fcm.refuse.clear()
    check("is removed from push_tokens, the other phone still gets it", r.sent === 1 && r.removed === 1 && !T("push_tokens").some((t) => t.token === "android-token-B"), r)
  }

  /* ── The sale ───────────────────────────────────────────────────────── */
  say("\nA sale: the seller's phones, in the sale's currency, opening the order")
  {
    seedTables()
    fcm.sent.length = 0
    await M.pushPurchase(M.createAdminClient(), CREATOR, { orderId: ORDER, productId: null, productTitle: "Mug", amountCents: 2400, currency: "gbp", lineCount: 3 })
    const ios = fcm.sent.find((m) => m.token === "ios-token-A")
    check("one push to each phone", fcm.sent.length === 2, fcm.sent.length)
    check("  names the item, how many more, the amount in pounds", /Mug and 2 more/.test(ios?.notification?.body ?? "") && /£/.test(ios?.notification?.body ?? ""), ios?.notification)
    check("  the cash sound on iOS, collapsed by order", ios?.apns.payload.aps.sound === "cash.wav" && ios.apns.headers["apns-collapse-id"] === `sale:${ORDER}`, ios?.apns)
    check("  a tap opens that order, not the list", M.pushTapTarget(ios?.data) === `/app/orders?order=${ORDER}`, ios?.data)
  }

  /* ── Orders that need the seller ─────────────────────────────────────── */
  say("\nA return asked for, an order cancelled: pushed once, by the call that queued the email")
  {
    seedTables()
    fcm.sent.length = 0
    const db = M.createAdminClient()
    const e = { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "return.requested", message: "Return requested", detail: null, key: "ret_1" }
    await M.queueSellerEmail(db, e)
    await settle()
    check("the email job is queued once", T("commerce_jobs").length === 1 && T("commerce_jobs")[0].idempotency_key === "email:seller:return.requested:ret_1")
    check("one push to each phone", fcm.sent.length === 2, fcm.sent.length)
    const ios = fcm.sent.find((m) => m.token === "ios-token-A")
    check("  says what happened, nothing about the buyer", ios?.notification?.title === "A buyer asked to return an order", ios?.notification)
    check("  a tap opens the order", M.pushTapTarget(ios?.data) === `/app/orders?order=${ORDER}`, ios?.data)
    await M.queueSellerEmail(db, e)
    await settle()
    check("the same event again (a retry): no second job, no second push", T("commerce_jobs").length === 1 && fcm.sent.length === 2, { jobs: T("commerce_jobs").length, push: fcm.sent.length })
    T("notification_preferences").push({ user_id: SELLER, category: "sales", channel: "in_app", enabled: false, updated_at: new Date().toISOString(), source: "settings" })
    await M.queueSellerEmail(db, { ...e, kind: "order.cancelled", key: "cx_1" })
    await settle()
    check("sales turned off in the bell: the email is still queued, no push", T("commerce_jobs").length === 2 && fcm.sent.length === 2, fcm.sent.length)
  }
  {
    const all = ["return_requested", "cancel_requested", "order_cancelled", "delivery_exception", "delivery_unconfirmed", "payment_failed", "low_stock"] as const
    const pushes = all.map((k) => M.sellerOrderPush(k, { orderId: ORDER, key: k, lowItems: [{ title: "Mug" }] }))
    check("every order event has its words, none banned, each opens its page", pushes.every((p: any) => p.title && !BANNED.test(p.title + p.body) && M.pushTapTarget(p.data)?.startsWith("/app/")), pushes.map((p: any) => p.title)) // eslint-disable-line @typescript-eslint/no-explicit-any
    check("low stock opens Inventory, filtered to low", M.pushTapTarget(pushes[6].data) === "/app/inventory?filter=low" && pushes[6].title === "Mug is running low")
    const emails = all.map((k) => M.sellerCommerceEmail(k, { orderId: ORDER, orderNumber: "#1042", lines: [{ title: "Mug", quantity: 1 }], items: [{ title: "Mug", variantName: null, available: 1, threshold: 5 }], currency: "usd", totalCents: 2400 }, { baseUrl: "https://storelib.com", preferencesUrl: "https://storelib.com/app/settings/notifications" }))
    check("their emails: a subject, a text part, only https links, no AI words or em dashes", emails.every((m: any) => m.subject && m.text.length > 40 && !/href="(?!https:\/\/|mailto:)/.test(m.html) && !BANNED.test(m.subject + m.text)), emails.map((m: any) => m.subject)) // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  /* ── A review ───────────────────────────────────────────────────────── */
  say("\nA review")
  {
    const r = { userId: SELLER, reviewId: "rv1", rating: 5, productTitle: "Mug", pending: false, url: "/app/reviews?review=rv1" }
    const p = M.reviewPush(r, false)
    check("stars and the product, never the reviewer's words; opens the review", p.title === "New 5 star review" && p.body === "5 stars on Mug" && M.pushTapTarget(p.data) === "/app/reviews?review=rv1", p)
    check("the first review is the milestone's title, one push", M.reviewPush(r, true).title === "Your first review")
    check("one waiting for approval says so and opens Pending", M.reviewPush({ ...r, pending: true, url: "/app/reviews?status=pending&review=rv1" }, false).title === "A review is waiting for approval")
  }

  /* ── The phone's token ──────────────────────────────────────────────── */
  say("\nThe phone's token: register, several phones, log out")
  {
    seedTables()
    const post = (user: string, body: unknown) => M.tokenRoute.POST(new Request("https://storelib.com/api/push/register", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer user:${user}` }, body: JSON.stringify(body) }))
    const a = await post(SELLER, { token: "ios-token-C", platform: "ios" })
    check("a third phone is saved beside the other two", a.status === 200 && T("push_tokens").filter((t) => t.user_id === SELLER).length === 3)
    await post(OTHER, { token: "ios-token-C", platform: "ios" })
    check("somebody else signs in on that phone: the token moves to them, once", T("push_tokens").filter((t) => t.token === "ios-token-C").length === 1 && T("push_tokens").find((t) => t.token === "ios-token-C")?.user_id === OTHER)
    check("signed out: 401", (await post("", { token: "x", platform: "ios" })).status === 401)

    const forgotten: string[] = []
    ;(globalThis as any).window = { __storelibPushToken: "ios-token-A", dispatchEvent: (e: Event) => (forgotten.push(e.type), true) } // eslint-disable-line @typescript-eslint/no-explicit-any
    const order: string[] = []
    const auth = { signOut: async () => (order.push("signOut"), { error: null }), getSession: async () => (order.push("getSession"), { data: { session: { access_token: `user:${SELLER}` } } }) }
    const server = (async () => (order.push("server"), new Response(JSON.stringify({ ok: true, auth: true }), { status: 200 }))) as unknown as typeof fetch
    const res = await M.endDeviceSession("local", auth, server, async () => undefined)
    check("Log out takes this phone off the account before the session ends", res.ended && !T("push_tokens").some((t) => t.token === "ios-token-A") && order.indexOf("getSession") < order.indexOf("signOut"), { order, tokens: T("push_tokens").map((t) => t.token) })
    check("  and only this phone: the seller's Android and the other account's phone stay", T("push_tokens").some((t) => t.token === "android-token-B") && T("push_tokens").some((t) => t.token === "ios-token-OTHER"))
    check("  the push client is told to send the token again at the next sign in", forgotten.includes("storelib:push-forget"))
    ;(globalThis as any).window.__storelibPushToken = "ios-token-OTHER" // eslint-disable-line @typescript-eslint/no-explicit-any
    await M.endDeviceSession("local", auth, server, async () => undefined)
    check("a token that is another account's is never removed by this one", T("push_tokens").some((t) => t.token === "ios-token-OTHER"))
    ;(globalThis as any).window = { dispatchEvent: () => true } // eslint-disable-line @typescript-eslint/no-explicit-any
    await M.endDeviceSession("global", auth, server, async () => undefined)
    check("Log out everywhere takes every phone of the account off, from a browser with no token", !T("push_tokens").some((t) => t.user_id === SELLER) && T("push_tokens").some((t) => t.user_id === OTHER), T("push_tokens"))
    delete (globalThis as any).window // eslint-disable-line @typescript-eslint/no-explicit-any
    const before = requests.length
    await M.endDeviceSession("local", auth, server, async () => undefined)
    check("on the server (no window) Log out asks nothing of push", !requests.slice(before).some((r) => r.url.includes("push/register")))
  }

  /* ── Every engine email ─────────────────────────────────────────────── */
  say("\nEvery engine email renders")
  {
    const bad: string[] = []
    for (const type of M.NOTIFICATION_TYPES as string[]) {
      const entry = M.REGISTRY[type]
      const optional = entry.requirement !== "required_service"
      const e = M.renderEmail(type, { amountCents: 1200, currency: "usd", productTitle: "Mug", orderId: ORDER, payoutId: "po_1", bankLast4: "4242" }, { baseUrl: "https://storelib.com", recipientName: "Maker", unsubscribeUrl: optional ? "https://storelib.com/api/notify/unsubscribe?t=x" : null, preferencesUrl: "https://storelib.com/app/settings/notifications", when: null })
      const why = !e.subject ? "no subject" : !e.text || e.text.length < 20 ? "no text part" : /href="(?!https:\/\/|mailto:)/.test(e.html) ? "a link that is not https" : /<img[^>]+src="(?!https:\/\/|data:)/.test(e.html) ? "an image that is not https" : BANNED.test(e.subject + e.text) ? "AI words or an em dash" : optional && !/unsubscribe/i.test(e.html) ? "optional with no unsubscribe link" : !optional && /api\/notify\/unsubscribe/.test(e.html) ? "required with an unsubscribe link" : null
      if (why) bad.push(`${type}: ${why}`)
    }
    check(`all ${(M.NOTIFICATION_TYPES as string[]).length} types: subject, text part, https links and images, plain words, unsubscribe exactly where optional`, bad.length === 0, bad)
  }

  Object.assign(console, quiet)
  out(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) out(`  - ${f}`)
    const tail = logs.filter((l) => /error|fail|✗/i.test(l)).slice(-15)
    if (tail.length) out(tail.join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error = console.log = out
  out(e)
  process.exit(1)
})
