/**
 * What a shop that ships has to do now: Home's lines (lib/physical/
 * action-reminders.ts), the counts behind them (action-counts-server.ts),
 * the Returns view they open, and the once-a-day "orders waiting to ship"
 * reminder through the real notification engine.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { actionReminders, NO_ACTIONS, OVERDUE_DAYS } from "@/lib/physical/action-reminders"
import { commerceActionCounts } from "@/lib/physical/action-counts-server"
import { NOTICE_HOUR_UTC, noteOrdersWaiting, storesWithOrdersWaiting } from "@/lib/physical/orders-waiting-server"
import { groupOrders, inView } from "@/lib/orders/order-view"
import { emailChannel } from "@/lib/notify/channels/email"
import { inAppChannel } from "@/lib/notify/channels/in-app"
import { runWork, type EngineDeps } from "@/lib/notify/engine"
import { handle } from "@/lib/notify/orchestrator"
import { emit } from "@/lib/notify/outbox"
import { REGISTRY } from "@/lib/notify/registry"
import { emailClass } from "@/lib/notify/email-budget"
import { renderEmail, renderInApp } from "@/lib/notify/templates"
import type { ChannelResult, DomainEvent, OutgoingEmail } from "@/lib/notify/types"
import { MemoryNotifyStore } from "./notify-memory-store"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── A database that answers by the filters it was given ──────────────── */

type Call = { table: string; ops: [string, unknown[]][] }
function fakeDb(answer: (c: Call) => { data?: unknown; count?: number | null; error?: unknown }) {
  const calls: Call[] = []
  const db = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const builder: Record<string, unknown> = {}
      for (const op of ["select", "eq", "neq", "in", "is", "lt", "gte", "or", "order", "limit", "range", "not", "maybeSingle"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, args])
          return builder
        }
      }
      builder.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer(call)).then(ok, bad)
      return builder
    },
  }
  return { db, calls }
}
const has = (c: Call, op: string, first?: unknown) => c.ops.some(([o, a]) => o === op && (first === undefined || a[0] === first))

async function main() {
  console.log("\nHome's lines")
  check("nothing waiting, nothing drawn", actionReminders(NO_ACTIONS).length === 0)
  const lines = actionReminders({ ...NO_ACTIONS, toFulfill: 3, returnsToReview: 2, overdue: 1, lowStock: 1, openDisputes: 1, only: { overdue: "line-1" } })
  check("most pressing first: late orders, then disputes, then the rest", lines.map((l) => l.id).join() === "overdue,disputes,to_fulfill,returns,low_stock", lines.map((l) => l.id).join())
  check("in the shop's words", lines.find((l) => l.id === "to_fulfill")?.text === "3 orders to fulfill" && lines.find((l) => l.id === "returns")?.text === "2 returns to review")
  check(`late orders are urgent, past ${OVERDUE_DAYS} days`, lines[0].tone === "critical" && lines[0].text === `1 order waiting more than ${OVERDUE_DAYS} days to ship`)
  check("one order opens that order", lines[0].href === "/app/orders?order=line-1")
  check("several open the list where they are done", lines.find((l) => l.id === "to_fulfill")?.href === "/app/orders?view=unfulfilled" && lines.find((l) => l.id === "returns")?.href === "/app/orders?view=returns")
  check("ordinary tasks are not alarms", lines.filter((l) => l.tone === "critical").map((l) => l.id).join() === "overdue,disputes")
  check("stock goes to Inventory, disputes to Payouts", lines.find((l) => l.id === "low_stock")?.href === "/app/inventory" && lines.find((l) => l.id === "disputes")?.href === "/app/payouts#disputes")
  const copy = lines.map((l) => l.text).join(" ")
  check("no em dash, no banned word", !/—/.test(copy) && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(copy))

  console.log("\nThe counts, from the rows")
  {
    const { db, calls } = fakeDb((c) => {
      if (c.table === "commerce_checkouts") {
        if (has(c, "eq", "delivery_method")) return { count: 2, data: [{ id: "co-p" }] }
        if (has(c, "lt", "paid_at")) return { count: 1, data: [{ id: "co-late" }] }
        return { count: 4, data: [{ id: "co-new" }] }
      }
      if (c.table === "commerce_returns") return { count: 1, data: [{ checkout_id: "co-ret" }] }
      if (c.table === "fulfillments") return { count: 0, data: [] }
      if (c.table === "payment_disputes") return { count: 3 }
      if (c.table === "orders") return { data: [{ id: "line-late", checkout_id: "co-late" }, { id: "line-ret", checkout_id: "co-ret" }] }
      if (c.table === "commerce_settings") return { data: null }
      if (c.table === "products") return { data: [{ id: "p1", title: "Mug", track_inventory: true, low_stock_threshold: 5 }] }
      if (c.table === "product_variants") return { data: [{ id: "v1", product_id: "p1", name: "Blue", active: true }, { id: "v2", product_id: "p1", name: "Red", active: true }, { id: "v3", product_id: "p1", name: "Green", active: true }] }
      if (c.table === "inventory_levels") return { data: [{ variant_id: "v1", available: 2 }, { variant_id: "v2", available: 0 }, { variant_id: "v3", available: 40 }] }
      return { data: null }
    })
    const now = Date.parse("2026-10-13T12:00:00Z")
    const c = await commerceActionCounts(db, "creator-1", now)
    check("late, new and pickup orders counted apart", c.overdue === 1 && c.toFulfill === 4 && c.pickupToPrepare === 2, JSON.stringify(c))
    check("returns, failed deliveries and open disputes", c.returnsToReview === 1 && c.deliveryProblems === 0 && c.openDisputes === 3)
    check("low and out of stock, untracked never", c.lowStock === 1 && c.outOfStock === 1)
    check("a single order is opened by its line", c.only?.overdue === "line-late" && c.only?.returnsToReview === "line-ret" && c.only?.toFulfill === undefined)
    const checkouts = calls.filter((x) => x.table === "commerce_checkouts")
    check("every read is this store's own", calls.filter((x) => ["commerce_checkouts", "commerce_returns", "fulfillments", "payment_disputes", "orders"].includes(x.table)).every((x) => x.ops.some(([o, a]) => o === "eq" && a[0] === "creator_id" && a[1] === "creator-1")))
    check("paid, not cancelled, still to send", checkouts.every((x) => has(x, "in", "status") && x.ops.some(([o, a]) => o === "is" && a[0] === "cancelled_at" && a[1] === null) && has(x, "in", "fulfillment_status")))
    const late = checkouts.find((x) => has(x, "lt", "paid_at"))
    check(`late means paid more than ${OVERDUE_DAYS} days ago`, late?.ops.find(([o]) => o === "lt")?.[1][1] === new Date(now - OVERDUE_DAYS * 86_400_000).toISOString())
    check("open disputes are the ones not closed", calls.some((x) => x.table === "payment_disputes" && x.ops.some(([o, a]) => o === "is" && a[0] === "closed_at" && a[1] === null)))
    check("returns are the ones still requested", calls.some((x) => x.table === "commerce_returns" && x.ops.some(([o, a]) => o === "eq" && a[0] === "status" && a[1] === "requested")))
  }
  {
    const { db } = fakeDb(() => ({ error: { message: "down" } }))
    const c = await commerceActionCounts(db, "creator-1")
    check("a database that does not answer is nothing to do, never an error", actionReminders(c).length === 0)
  }

  console.log("\nThe Returns view")
  {
    const row = (id: string, ret: string | null) => ({ id, created_at: "2026-10-01T00:00:00Z", amount_cents: 1000, currency: "usd", status: "completed", physical_fulfillment: "fulfilled", physical_return: ret, checkout_id: `co-${id}`, quantity: 1 }) as never
    const orders = groupOrders([row("a", "requested"), row("b", "in_progress"), row("c", "returned"), row("d", null)])
    const open = orders.filter((o) => inView(o, "returns")).map((o) => o.id).sort().join()
    check("orders with a return asked for or on its way back", open === "a,b", open)
  }

  console.log("\nThe daily reminder")
  const r = REGISTRY.ORDERS_WAITING_TO_SHIP
  check("to the seller, in Sales, on unless they turn it off", r.recipient === "creator" && r.category === "sales" && r.defaultOn && r.requirement === "optional_product")
  check("the bell and an email, a day apart at most, read again before it sends", r.channels.includes("in_app") && r.channels.includes("email") && r.cooldownSeconds === 86_400 && r.condition === "orders_still_waiting")
  check("under the daily email cap", emailClass("ORDERS_WAITING_TO_SHIP") === "budgeted")
  {
    const { db } = fakeDb((c) => (c.table === "commerce_checkouts" ? { data: [{ creator_id: "c1" }, { creator_id: "c1" }, { creator_id: "c2" }] } : c.table === "creators" ? { data: [{ id: "c1", user_id: "u1" }, { id: "c2", user_id: "u2" }] } : { data: [] }))
    const stores = await storesWithOrdersWaiting(db, Date.parse("2026-10-13T14:05:00Z"))
    check("one entry per store, with its count and owner", stores.length === 2 && stores.find((s) => s.creatorId === "c1")?.count === 2 && stores.find((s) => s.creatorId === "c2")?.userId === "u2")
    const quiet = fakeDb(() => ({ data: [] }))
    const off = await noteOrdersWaiting(quiet.db, Date.parse(`2026-10-13T${String((NOTICE_HOUR_UTC + 3) % 24).padStart(2, "0")}:05:00Z`))
    check(`outside ${NOTICE_HOUR_UTC}:00 UTC nothing is even read`, off.stores === 0 && quiet.calls.length === 0)
  }

  const MIN = 60_000
  const DAY = 1440 * MIN
  const USER = "11111111-1111-4111-8111-111111111111"
  const CREATOR = "22222222-2222-4222-8222-222222222222"
  class FakeProvider {
    readonly name = "fake"
    sent: OutgoingEmail[] = []
    async send(email: OutgoingEmail): Promise<ChannelResult> {
      this.sent.push(email)
      return { status: "sent", providerMessageId: `<m${this.sent.length}@mg.example.com>` }
    }
  }
  function world() {
    const store = new MemoryNotifyStore()
    store.users.set(USER, { email: "maker@example.com", name: "Maker" })
    store.creators.set(CREATOR, USER)
    let waiting: { count: number; days: number; orderId: string | null } | null = { count: 3, days: OVERDUE_DAYS, orderId: null }
    ;(store as unknown as { ordersWaiting: () => Promise<typeof waiting> }).ordersWaiting = async () => waiting
    const provider = new FakeProvider()
    const deps: EngineDeps = {
      store,
      providerName: provider.name,
      worker: "w1",
      now: () => store.clock.now,
      email: emailChannel({ provider, render: renderEmail, baseUrl: () => "https://storelib.com", unsubscribeUrl: (u, c) => `https://storelib.com/api/notify/unsubscribe?u=${u}&c=${c}`, preferencesUrl: () => "https://storelib.com/app/settings", messageDomain: "mg.example.com" }),
      inApp: inAppChannel(store, { render: renderInApp, baseUrl: () => "https://storelib.com", now: () => store.clock.now }),
    }
    const day = () => new Date(store.clock.now).toISOString().slice(0, 10)
    return {
      store,
      provider,
      set: (w: typeof waiting) => (waiting = w),
      raise: () => emit({ name: "physical.orders_waiting", key: `physical.orders_waiting:${CREATOR}:${day()}`, userId: USER, creatorId: CREATOR, entityType: "creator", entityId: CREATOR, payload: { day: day(), count: 3 }, occurredAt: new Date(store.clock.now).toISOString() }, { db: store, soon: false }),
      run: () => runWork(deps, 10_000),
      later: (ms: number) => (store.clock.now += ms),
      mail: () => provider.sent.filter((m) => m.tags?.includes("ORDERS_WAITING_TO_SHIP")),
    }
  }

  {
    const now = Date.parse("2026-10-13T14:00:00Z")
    const ev: DomainEvent = { name: "physical.orders_waiting", key: `physical.orders_waiting:${CREATOR}:2026-10-13`, userId: USER, creatorId: CREATOR, entityType: "creator", entityId: CREATOR, payload: { day: "2026-10-13", count: 3 }, occurredAt: new Date(now).toISOString() }
    const p = handle(ev, { now, userId: USER, creatorId: CREATOR })
    check("one job, at once, keyed by the store and the day", p.jobs.length === 1 && p.jobs[0].type === "ORDERS_WAITING_TO_SHIP" && Date.parse(p.jobs[0].runAt) === now && p.jobs[0].idempotencyKey.endsWith(":day_2026-10-13"))
    check("an event without its day plans nothing", handle({ ...ev, payload: {} }, { now, userId: USER, creatorId: CREATOR }).jobs.length === 0)
  }
  {
    const w = world()
    w.store.clock.now = Date.parse("2026-10-13T14:05:00Z")
    await w.raise()
    await w.raise()
    await w.run()
    const m = w.mail()
    check("raised twice in the hour: one email and one bell row", m.length === 1 && w.store.bell.filter((b) => b.type === "ORDERS_WAITING_TO_SHIP").length === 1)
    const body = `${m[0]?.subject} ${m[0]?.text}`
    check("it says how many and opens the orders to ship, oldest first", /3 orders are waiting to ship/.test(body) && /\/app\/orders\?view=unfulfilled&sort=oldest/.test(body), body.slice(0, 400))
    check("plain words: no em dash", !/—/.test(body + (m[0]?.html ?? "")))
    w.later(DAY)
    await w.raise()
    await w.run()
    check("the next day, still waiting: told again", w.mail().length === 2)
    w.set({ count: 0, days: OVERDUE_DAYS, orderId: null })
    w.later(DAY)
    await w.raise()
    await w.run()
    check("shipped in between: nothing sent", w.mail().length === 2)
    w.set({ count: 1, days: OVERDUE_DAYS, orderId: "line-9" })
    w.later(DAY)
    await w.raise()
    await w.run()
    const one = w.mail()[2]
    check("one order: says so and opens it", !!one && /An order is waiting to ship/.test(one.subject) && /\/app\/orders\?order=line-9/.test(one.text ?? ""))
  }

  console.log("\nWired in")
  check("Home reads the counts with the rest, bounded", /within\(commerceActionCounts\(adminSupabase, creator\.id, now\), 2_000, null\)/.test(read("app/app/page.tsx")) && /initialAttention=\{attention\}/.test(read("app/app/page.tsx")))
  check("and draws them under the readiness banner", /<AttentionList initial=\{initialAttention\}/.test(read("components/app/dashboard-client.tsx")))
  const list = read("components/app/home/attention-list.tsx")
  check("read again when the tab comes back, never on a timer", /visibilitychange/.test(list) && !/setInterval/.test(list) && /AGAIN_AFTER_MS = 30_000/.test(list))
  check("the route is the store's or a teammate's with Orders", /shopCaller\("orders"\)/.test(read("app/api/app/orders/attention/route.ts")))
  check("the physical cron raises the reminder", /await noteOrdersWaiting\(db\)/.test(read("app/api/cron/physical/route.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
