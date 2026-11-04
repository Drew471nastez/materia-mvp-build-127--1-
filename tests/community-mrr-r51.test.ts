/**
 * ===========================================================================
 *  ROUND 51: A COMMUNITY'S MRR IS MONEY THAT COMES IN
 * ===========================================================================
 * The owner: "community MRR shows €74 although I have no paying members".
 * A $1,000 a year plan is $83.33 a month, €74 at the week's rate, and the
 * Overview's Paid members said 0 beside it. Rows that bring no money in were
 * counted as paying: a subscription made with Stripe's test keys, a period
 * whose payment was refunded in full while the subscription went on, and the
 * community owner's own membership.
 *
 * Every screen is computed by its real code from one dataset, as round 43's
 * suite does:
 *
 *   list, Overview   lib/communities/server/membership-money communityMrr
 *   money stats      lib/communities/server/stats loadMoneyAndGrowth
 *   Analytics        lib/communities/server/analytics-report loadCommunityReport
 *   /app/analytics   lib/communities/membership-money moneyTotal of that answer
 *
 * and the cases the brief names: test sales, free claims, cancelled and
 * refunded subscriptions, currency, trials, admin granted access.
 *
 *   npx tsx --conditions=react-server tests/community-mrr-r51.test.ts
 */
import { fakeDb } from "./_fake-db"
import { readFileSync } from "node:fs"
import { moneyTotal, mrrAt, payingAt } from "@/lib/communities/membership-money"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}
type Row = Record<string, unknown>

const CID = "c5100000-0000-4000-8000-000000000001"
const STORE = "s5100000-0000-4000-8000-000000000001"
const OWNER = "u5100000-0000-4000-8000-0000000000aa"
const YEARLY = "c5100000-0000-4000-8000-0000000000a1"
const MONTHLY = "c5100000-0000-4000-8000-0000000000a2"
const FREE = "c5100000-0000-4000-8000-0000000000a3"
const NOW = Date.parse("2026-11-04T12:00:00Z")
const SPAN = { start: Date.parse("2026-10-29T00:00:00Z"), end: NOW }
/* 1 € = 1.12 $: $1,000 a year is 892.86 € a year, 74.40 € a month (the owner's €74). */
const RATE = { USD: 1.12 }
const euros = (usd: number) => Math.round(usd / 1.12)

const plan = (id: string, extra: Row = {}): Row => ({ id, buyer_id: `u-${id}`, product_id: YEARLY, status: "active", billing_interval: "year", amount_cents: 100_000, currency: "usd", created_at: "2026-08-01T10:00:00Z", started_at: "2026-08-01T10:00:00Z", canceled_at: null, ended_at: null, trial_end: null, ...extra })

function tables(memberships: Row[], extra: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
  return {
    communities: [{ id: CID, owner_user_id: OWNER, creator_id: STORE, created_at: "2026-06-01T00:00:00Z" }],
    store_settings: [{ creator_id: STORE, currency: "EUR" }],
    fx_rates: [{ as_of: "2026-11-03", rates: RATE }],
    community_members: [],
    community_activity: [],
    community_daily_stats: [],
    community_daily_traffic: [],
    community_view_days: [],
    community_feed_posts: [],
    community_events: [],
    community_tiers: [
      { community_id: CID, product_id: YEARLY, billing: "recurring", kind: "paid", name: "Yearly" },
      { community_id: CID, product_id: MONTHLY, billing: "recurring", kind: "paid", name: "Monthly" },
      { community_id: CID, product_id: FREE, billing: "recurring", kind: "free", name: "Free" },
    ],
    products: [],
    memberships,
    membership_invoices: [],
    orders: [],
    community_program_access: [],
    community_module_access: [],
    community_event_tickets: [],
    profiles: [],
    ...extra,
  } as Record<string, Row[]>
}

async function everyScreen(t: Record<string, Row[]>) {
  const base = fakeDb(t)
  const db = { from: base.from, rpc: async () => ({ data: null, error: null }) }
  const { communityMrr } = await import("@/lib/communities/server/membership-money")
  const { loadMoneyAndGrowth } = await import("@/lib/communities/server/stats")
  const { loadCommunityReport } = await import("@/lib/communities/server/analytics-report")
  const list = await communityMrr(db as never, CID, NOW)
  const stats = (await loadMoneyAndGrowth(db as never, CID, 30, NOW)).revenue
  const report = await loadCommunityReport(db as never, t.communities[0] as never, { start: SPAN.start, end: SPAN.end, compare: null, timeZone: "UTC" }, NOW)
  const m = report.money
  const card = m ? moneyTotal([m]) : null
  return {
    list: { cents: list.cents, currency: list.currency, paying: list.paying },
    stats: stats ? { cents: stats.mrrCents, currency: stats.currency, paying: stats.activeSubscribers } : null,
    analytics: m ? { cents: m.figures.mrr.value, currency: m.currency, paying: m.figures.subscribers.value } : null,
    card: card ? { cents: card.mrr.value, currency: card.currency, paying: card.paying } : null,
    line: m?.lines.mrr.current ?? null,
  }
}
const agree = (s: Awaited<ReturnType<typeof everyScreen>>, want: { cents: number; paying: number }) =>
  [s.list, s.stats, s.analytics, s.card].every((x) => !!x && x.cents === want.cents && x.currency === "eur" && x.paying === want.paying)

/* What round 43's rule said for the same rows: every row whatever its mode, refunds and buyer, in euros. */
const before = (rows: Row[]) => mrrAt(rows.map((r) => ({ ...r, livemode: undefined, refunded: undefined, amount_cents: euros(Number(r.amount_cents)), currency: "eur" })) as never, NOW)

async function main() {
  console.log("\nThe owner's community: three $1,000 a year rows, none of them money")
  const owners = [
    plan("own", { buyer_id: OWNER }),
    plan("test", { livemode: false }),
    plan("refunded"),
  ]
  const refundedTables = {
    membership_invoices: [{ membership_id: "refunded", order_id: "o-refunded", period_start: "2026-08-01T10:00:00Z", period_end: "2027-08-01T10:00:00Z", amount_cents: 100_000, status: "paid" }],
    orders: [{ id: "o-refunded", status: "refunded", amount_cents: 100_000, refund_amount_cents: 100_000, product_id: YEARLY, created_at: "2026-08-01T10:00:00Z", refunded_at: "2026-08-02T10:00:00Z", currency: "usd" }],
  }
  const was = before(owners.slice(0, 1))
  console.log(`   before, the owner's own plan alone: ${was.cents} cents (€${(was.cents / 100).toFixed(2)}) from ${was.paying} "paying"`)
  check("before: one $1,000 a year plan read as €74 MRR", was.cents === Math.round(euros(100_000) / 12) && Math.floor(was.cents / 100) === 74, was)
  const all = before(owners)
  console.log(`   before, all three: ${all.cents} cents from ${all.paying} "paying"`)
  const s = await everyScreen(tables(owners, refundedTables))
  console.log("   after:", JSON.stringify(s))
  check("after: every screen €0.00 MRR from 0 paying members", agree(s, { cents: 0, paying: 0 }), s)
  check("  and the MRR line is flat at 0 through the period", !!s.line && s.line.every((v) => v === 0), s.line)

  console.log("\nOne real member beside them is counted, once, on every screen")
  const real = [...owners, plan("real")]
  const r = await everyScreen(tables(real, refundedTables))
  const one = Math.round(euros(100_000) / 12)
  check(`every screen €${(one / 100).toFixed(2)} from 1 paying member`, agree(r, { cents: one, paying: 1 }), r)

  console.log("\nThe other cases the brief names")
  const at = (row: Row) => payingAt(row as never, NOW)
  check("a free claim (a free tier, or a plan at 0) adds nothing", mrrAt([plan("f", { product_id: FREE, amount_cents: 0 })] as never, NOW).cents === 0)
  check("a trial still running is not paying", !at(plan("t", { status: "trialing", trial_end: "2026-11-10T00:00:00Z" })))
  check("a trial with no end date is not paying", !at(plan("t2", { status: "trialing" })))
  check("a cancelled subscription stops paying when it was cancelled", !at(plan("c", { status: "canceled", canceled_at: "2026-10-01T00:00:00Z" })))
  check("an ended one is not paying", !at(plan("e", { status: "expired", ended_at: "2026-10-01T00:00:00Z" })))
  check("a period refunded in full is not paying; a later paid period is", at(plan("r", { refunded: [["2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"]] })) && !at(plan("r", { refunded: [["2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z"]] })))
  check("a test mode subscription is never paying; one synced before the mark is read as live", !at(plan("x", { livemode: false })) && at(plan("y", { livemode: null })))
  const partial = await everyScreen(
    tables([plan("p")], {
      membership_invoices: [{ membership_id: "p", order_id: "o-p", period_start: "2026-08-01T10:00:00Z", period_end: "2027-08-01T10:00:00Z" }],
      orders: [{ id: "o-p", status: "refunded", amount_cents: 100_000, refund_amount_cents: 20_000, product_id: YEARLY, created_at: "2026-08-01T10:00:00Z", refunded_at: "2026-08-02T10:00:00Z", currency: "usd" }],
    }),
  )
  check("a part refund leaves the member paying (the plan goes on, most of it paid)", agree(partial, { cents: one, paying: 1 }), partial)
  check("admin granted access is a community_members row, never a memberships row: nothing to count", !readFileSync("lib/communities/server/creator.ts", "utf8").match(/grantComplimentary[\s\S]{0,3000}from\("memberships"\)\.insert/))

  console.log("\nThe sync marks a test mode subscription")
  const sync = readFileSync("lib/memberships/sync.ts", "utf8")
  check("syncSubscription writes livemode false on a test subscription, its own write", /livemode === false\)[\s\S]{0,200}update\(\{ livemode: false \}\)/.test(sync))
  const sql = readFileSync("supabase/sql/run-now/363_membership_livemode.sql", "utf8")
  check("part 363 adds the column, safe to run again", /ADD COLUMN IF NOT EXISTS livemode boolean/.test(sql) && /Safe to run again/.test(sql))

  console.log("\nA database without part 363 reads as before")
  const base = fakeDb(tables([plan("real")]), { failWith: {} })
  let tries = 0
  const db = {
    from: (t: string) => {
      const q = base.from(t)
      if (t !== "memberships") return q
      const select = q.select.bind(q)
      ;(q as { select: (c: string) => unknown }).select = (c: string) => {
        tries++
        if (c.includes("livemode")) {
          const fail = { in: () => fail, gt: () => fail, order: () => fail, limit: async () => ({ data: null, error: { code: "42703", message: 'column memberships.livemode does not exist' } }) }
          return fail
        }
        return select(c)
      }
      return q
    },
  }
  const { membershipsOf } = await import("@/lib/communities/server/membership-money")
  const rows = await membershipsOf(db as never, [YEARLY])
  check("no livemode column: one retry without it, the row still there", rows?.length === 1 && tries === 2, { rows, tries })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
