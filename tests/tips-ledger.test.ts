/**
 * ===========================================================================
 *  A ONEPAGE TIP ON THE SELLER'S BALANCE, ONCE, AND TAKEN BACK WHEN IT GOES
 * ===========================================================================
 * Tips are Stripe destination charges to the creator's connected account,
 * so Stripe pays them out; they were kept in onepage_tips and never posted
 * to seller_ledger / ledger_events, so Payouts left them out. What this pins
 * (lib/onepage/tips-ledger, lib/onepage/tips-server, the webhook, part 471):
 *
 *   a paid tip is one sale on the ledger, the amount less the fee Stripe kept
 *   the webhook and the visitor's return, in either order, post it once
 *   a refund comes off the balance once, as an order's does
 *   a dispute finds the tip on the balance and marks it, as an order's does
 *   a tip in another currency is posted in the wallet's, or kept and labelled
 *   part 471 posts the tips from before once (an anti-join and ledger_post's key)
 *   Payouts lists them as "Tip from <name or Anonymous>"
 *
 * The database is tests/_fake-db with public.ledger_post (run-now part 64)
 * played in memory; Stripe and the currency are stubs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { TIP_SESSION_KIND, confirmTip, recordTipFromSession } from "@/lib/onepage/tips-server"
import { noteTipDispute, payoutTips, postTipSale, syncTipRefunds, tipFeeCents, tipLedgerKey, tipperLabel, type TipLedgerDeps } from "@/lib/onepage/tips-ledger"
import { postLedger } from "@/lib/payments/ledger"
import type { LedgerAmounts } from "@/lib/payments/ledger-currency"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const PAGE = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"
const SESSION = "cs_test_tip_aaaaaaaa"

/** run-now part 64's ledger_post, in memory: one row per key, the balance moved by the same amounts. */
function ledgerDb(tables: Record<string, Row[]> = {}) {
  const db = fakeDb({ onepage_tips: [], ledger_events: [], seller_ledger: [], ...tables }, { unique: { onepage_tips: [["checkout_session_id"]] } })
  const calls: Array<Record<string, unknown>> = []
  const rpc = async (fn: string, a: Row) => {
    calls.push({ fn, ...a })
    if (fn !== "ledger_post") return { data: null, error: { code: "PGRST202", message: "Could not find the function" } }
    let found: Row | undefined = db.tables.seller_ledger.find((x: Row) => x.creator_id === a.p_creator)
    if (!found) {
      found = { creator_id: a.p_creator, pending_amount: 0, available_amount: 0, in_transit_amount: 0, negative_balance: 0, lifetime_earnings: 0, lifetime_fees: 0, lifetime_refunds: 0 }
      db.tables.seller_ledger.push(found)
    }
    const l: Row = found
    if (a.p_key && db.tables.ledger_events.some((e: Row) => e.idempotency_key === a.p_key)) return { data: { applied: false }, error: null }
    let dp = 0, da = 0, dn = 0
    const amt = Number(a.p_amount)
    if (a.p_op === "sale") {
      const take = Math.min(amt, l.negative_balance)
      dn = -take
      dp = amt - take
    } else if (a.p_op === "credit_available") {
      const take = Math.min(amt, l.negative_balance)
      dn = -take
      da = amt - take
    } else if (a.p_op === "debit_pending_first" || a.p_op === "debit_available_first") {
      let rem = amt
      const takeP = () => { const t = Math.min(rem, l.pending_amount); dp = -t; rem -= t }
      const takeA = () => { const t = Math.min(rem, l.available_amount); da = -t; rem -= t }
      if (a.p_op === "debit_pending_first") { takeP(); takeA() } else { takeA(); takeP() }
      dn = rem
    }
    const ev = a.p_event ?? {}
    db.tables.ledger_events.push({
      id: `ev_${db.tables.ledger_events.length + 1}`,
      creator_id: a.p_creator,
      event_type: ev.event_type,
      amount_cents: ev.amount_cents ?? amt,
      net_seller_cents: ev.net_seller_cents ?? amt,
      fee_cents: ev.fee_cents ?? 0,
      currency: ev.currency ?? "usd",
      pending_delta: dp,
      available_delta: da,
      order_id: ev.order_id ?? null,
      stripe_refund_id: ev.stripe_refund_id ?? null,
      stripe_dispute_id: ev.stripe_dispute_id ?? null,
      hold_until: ev.hold_until ?? null,
      released_at: null,
      description: ev.description ?? null,
      metadata: ev.metadata ?? {},
      idempotency_key: a.p_key ?? null,
      created_at: new Date().toISOString(),
    })
    l.pending_amount += dp
    l.available_amount += da
    l.negative_balance += dn
    l.lifetime_earnings += Number(ev.add_lifetime_earnings ?? 0)
    l.lifetime_fees += Number(ev.add_lifetime_fees ?? 0)
    l.lifetime_refunds += Number(ev.add_lifetime_refunds ?? 0)
    return { data: { applied: true, pending_delta: dp, available_delta: da }, error: null }
  }
  return Object.assign(db, { rpc, calls })
}

const AVAILABLE = new Date("2026-11-25T00:00:00Z")
/** The real thing's shape: one rate for every amount; a currency with no rate is kept and labelled. */
function deps(over: Partial<TipLedgerDeps> & { rate?: Record<string, number>; stripeFee?: number | null } = {}): TipLedgerDeps {
  const rate = over.rate ?? {}
  return {
    toLedger: async (amounts: number[], currency: string | null | undefined): Promise<LedgerAmounts> => {
      const from = String(currency || "usd").toLowerCase()
      if (from === "usd") return { amounts: amounts.map(Math.round), currency: "usd", converted: false }
      const r = rate[from]
      if (!r) return { amounts: amounts.map(Math.round), currency: from, converted: false }
      return { amounts: amounts.map((a) => Math.round(a * r)), currency: "usd", converted: true }
    },
    chargeFacts: async () => ({ availableOn: AVAILABLE, applicationFeeCents: over.stripeFee === undefined ? 45 : over.stripeFee }),
    amountText: (amount, ledger, original) => `${ledger.currency.toUpperCase()} ${(amount / 100).toFixed(2)}${ledger.converted ? ` (from ${String(original.currency).toUpperCase()} ${(original.amount / 100).toFixed(2)})` : ""}`,
    now: () => Date.parse("2026-11-20T00:00:00Z"),
    ...over,
  }
}

const session = (over: Record<string, unknown> = {}, meta: Record<string, string> = {}) =>
  ({
    id: SESSION,
    payment_status: "paid",
    amount_total: 500,
    currency: "usd",
    payment_intent: "pi_tip_1",
    customer_details: { name: "Sam", email: "sam@x.co" },
    metadata: { kind: TIP_SESSION_KIND, onepage_id: PAGE, block_id: "tip1", creator_id: CREATOR, amount_cents: "500", platform_fee_cents: "45", tipper_name: "Sam", ...meta },
    ...over,
  }) as never

const tipSales = (db: { tables: Record<string, Row[]> }) => db.tables.ledger_events.filter((e) => e.event_type === "sale" && String(e.idempotency_key).startsWith("tip:"))
const balance = (db: { tables: Record<string, Row[]> }) => db.tables.seller_ledger.find((l) => l.creator_id === CREATOR) ?? {}

const charge = (refunds: Array<{ id: string; amount: number }>, over: Record<string, unknown> = {}) =>
  ({ id: "ch_tip_1", payment_intent: "pi_tip_1", currency: "usd", refunds: { data: refunds.map((r, i) => ({ ...r, status: "succeeded", created: i + 1 })) }, ...over }) as never
const noList = { refunds: { list: async () => ({ data: [] }) } }

async function main() {
  console.log("\nA paid tip is one sale on the balance")
  {
    const db = ledgerDb()
    const first = await recordTipFromSession(db, session(), undefined, deps())
    const again = await recordTipFromSession(db, session(), undefined, deps())
    const sales = tipSales(db)
    check("the first record posts it", first.ok === true && (first as { posted?: string }).posted === "posted", first)
    check("  a second record changes nothing", again.ok === true && (again as { posted?: string }).posted === "already" && sales.length === 1, { again, sales: sales.length })
    const s = sales[0] ?? {}
    check("  under the session's key, as a sale with no order", s.idempotency_key === tipLedgerKey(SESSION) && s.order_id === null && s.event_type === "sale")
    check("  the amount less the fee Stripe kept back: 500 - 45", s.amount_cents === 500 && s.fee_cents === 45 && s.net_seller_cents === 455, s)
    check("  held until Stripe makes it available", s.hold_until === AVAILABLE.toISOString())
    check("  on the balance: pending, lifetime earnings and fees", balance(db).pending_amount === 455 && balance(db).lifetime_earnings === 500 && balance(db).lifetime_fees === 45, balance(db))
    check("  labelled with the tipper", /^Tip from Sam: USD 5\.00 \(net USD 4\.55\)$/.test(String(s.description)), s.description)
    check("  and carries the tip's facts", s.metadata?.kind === "tip" && s.metadata?.tip_key === tipLedgerKey(SESSION) && s.metadata?.payment_intent_id === "pi_tip_1" && s.metadata?.charged_cents === 500)

    check("Stripe's real application fee wins over the session's", tipFeeCents({ amount_cents: 500, platform_fee_cents: 45 }, 60) === 60 && tipFeeCents({ amount_cents: 500, platform_fee_cents: 45 }, null) === 45)
    check("  and a fee is never below 0 or above the tip", tipFeeCents({ amount_cents: 500, platform_fee_cents: -3 }, null) === 0 && tipFeeCents({ amount_cents: 500, platform_fee_cents: 45 }, 900) === 500)
    const real = ledgerDb()
    await recordTipFromSession(real, session(), undefined, deps({ stripeFee: 60 }))
    check("  posted with the fee Stripe charged", tipSales(real)[0]?.net_seller_cents === 440 && tipSales(real)[0]?.fee_cents === 60)

    const anon = ledgerDb()
    await recordTipFromSession(anon, session({ customer_details: { name: null, email: null } }, { tipper_name: "" }), undefined, deps())
    check("a tip with no name reads Anonymous", /^Tip from Anonymous:/.test(String(tipSales(anon)[0]?.description)) && tipperLabel("  ") === "Anonymous" && tipperLabel(null) === "Anonymous")

    const before64 = fakeDb({ onepage_tips: [] }, { unique: { onepage_tips: [["checkout_session_id"]] } }) as unknown as Row
    delete before64.rpc
    const kept = await recordTipFromSession(before64, session(), undefined, deps())
    check("before part 64 the tip is kept and nothing is posted (part 471 posts it)", kept.ok === true && (kept as { posted?: string }).posted === "unavailable")

    const refused = ledgerDb()
    refused.rpc = (async () => ({ data: null, error: { code: "XX000", message: "down" } })) as never
    const failedPost = await recordTipFromSession(refused, session(), undefined, deps())
    check("a post the database refused is said, and the tip is still kept", failedPost.ok === true && (failedPost as { posted?: string }).posted === "failed" && refused.tables.onepage_tips.length === 1)
    const hook = read("app/api/stripe/webhook/route.ts")
    check("  and the webhook answers 500 for it, so Stripe sends it again", /if \(done\.ok && done\.posted === "failed"\) \{[\s\S]{0,200}status: 500/.test(hook))
  }

  console.log("\nThe webhook and the visitor's return, in either order, post it once")
  {
    const stripe = { checkout: { sessions: { create: async () => ({ id: "", url: null }), retrieve: async () => session() } } }
    for (const order of [["webhook", "return"], ["return", "webhook"]] as const) {
      const db = ledgerDb()
      const results: Array<{ ok: boolean; posted?: string }> = []
      for (const who of order) {
        if (who === "webhook") results.push((await recordTipFromSession(db, session(), undefined, deps())) as never)
        else results.push((await confirmTip(db, stripe, { sessionId: SESSION, onepageId: PAGE }, deps())) as never)
      }
      check(`${order.join(" then ")}: one tip row, one ledger sale, one balance`, db.tables.onepage_tips.length === 1 && tipSales(db).length === 1 && balance(db).pending_amount === 455, { rows: db.tables.onepage_tips.length, sales: tipSales(db).length, balance: balance(db) })
      check(`  ${order[0]} posted it, ${order[1]} found it there`, results[0].posted === "posted" && results[1].posted === "already", results)
    }
    const db = ledgerDb()
    await Promise.all([recordTipFromSession(db, session(), undefined, deps()), confirmTip(db, stripe, { sessionId: SESSION, onepageId: PAGE }, deps())])
    check("both at once: still one sale (the database's key)", tipSales(db).length === 1 && balance(db).pending_amount === 455)
  }

  console.log("\nA refund comes off the balance once, as an order's does")
  {
    const db = ledgerDb()
    await recordTipFromSession(db, session(), undefined, deps())
    const one = await syncTipRefunds(db, noList, charge([{ id: "re_1", amount: 500 }]), deps())
    const again = await syncTipRefunds(db, noList, charge([{ id: "re_1", amount: 500 }]), deps())
    const refunds = db.tables.ledger_events.filter((e) => e.event_type === "refund")
    check("a full refund is one refund row", one.applied === 1 && again.applied === 0 && again.skipped === 1 && refunds.length === 1, { one, again, refunds: refunds.length })
    check("  the refund less its share of the fee, from pending while held", refunds[0]?.amount_cents === 500 && refunds[0]?.fee_cents === 45 && refunds[0]?.net_seller_cents === 455 && refunds[0]?.pending_delta === -455, refunds[0])
    check("  the balance back where it was, lifetime refunds counted", balance(db).pending_amount === 0 && balance(db).available_amount === 0 && balance(db).negative_balance === 0 && balance(db).lifetime_refunds === 500, balance(db))
    check("  keyed by the refund and the tip, linked to the tip for the hold release", refunds[0]?.idempotency_key === `refund:re_1:${tipLedgerKey(SESSION)}` && refunds[0]?.metadata?.tip_key === tipLedgerKey(SESSION) && refunds[0]?.stripe_refund_id === "re_1")
    check("  and the tip reads refunded", db.tables.onepage_tips[0]?.status === "refunded")

    const partial = ledgerDb()
    await recordTipFromSession(partial, session(), undefined, deps())
    partial.tables.ledger_events[0].released_at = "2026-11-26T00:00:00Z"
    partial.tables.seller_ledger[0].pending_amount = 0
    partial.tables.seller_ledger[0].available_amount = 455
    await syncTipRefunds(partial, noList, charge([{ id: "re_2", amount: 200 }]), deps())
    const r = partial.tables.ledger_events.find((e) => e.event_type === "refund") ?? {}
    check("a part refund of a released tip: from available, its fee share only (200 - 18)", r.net_seller_cents === 182 && r.fee_cents === 18 && r.available_delta === -182 && partial.tables.seller_ledger[0].available_amount === 273, r)
    check("  and the tip still reads paid", partial.tables.onepage_tips[0]?.status === "paid")

    const early = ledgerDb({ onepage_tips: [{ id: "tip_old", checkout_session_id: SESSION, payment_intent_id: "pi_tip_1", creator_id: CREATOR, onepage_id: PAGE, amount_cents: 500, currency: "usd", platform_fee_cents: 45, tipper_name: null, status: "paid" }] })
    await syncTipRefunds(early, noList, charge([{ id: "re_3", amount: 500 }]), deps())
    check("a refund of a tip never posted posts the sale first: nothing goes negative", tipSales(early).length === 1 && balance(early).pending_amount === 0 && balance(early).negative_balance === 0, balance(early))
    const none = ledgerDb()
    check("a charge that paid no tip is left to the orders", (await syncTipRefunds(none, noList, charge([{ id: "re_x", amount: 100 }], { payment_intent: "pi_order" }), deps())).applied === 0 && none.tables.ledger_events.length === 0)

    const hook = read("app/api/stripe/webhook/route.ts")
    const settle = hook.slice(hook.indexOf("async function settleChargeRefund"), hook.indexOf("async function handlePOST"))
    check("the webhook's one refund settle runs it, for charge.refunded and refund.updated", /syncTipRefunds\(supabaseAdmin, stripe, charge\)/.test(settle) && settle.indexOf("syncChargeRefund(supabaseAdmin") < settle.indexOf("syncTipRefunds("))
    const sql = read("supabase/sql/run-now/471_tips_in_ledger.sql")
    check("the hold release takes a tip's refunds by its key (a tip has no order)", sql.includes("(r.order_id = s.order_id OR (s.order_id IS NULL AND s.idempotency_key LIKE 'tip:%' AND r.metadata ->> 'tip_key' = s.idempotency_key))") && sql.includes("CREATE OR REPLACE FUNCTION public.ledger_release_due(p_now timestamptz DEFAULT now())"))
  }

  console.log("\nA dispute takes it back, as an order's does")
  {
    const db = ledgerDb({ onepage_tips: [{ id: "tip_d", checkout_session_id: SESSION, payment_intent_id: "pi_tip_1", creator_id: CREATOR, onepage_id: PAGE, amount_cents: 500, currency: "usd", platform_fee_cents: 45, tipper_name: "Sam", status: "paid" }] })
    check("a dispute of a tip is found by its PaymentIntent", (await noteTipDispute(db, "pi_tip_1", "opened", deps())) === true && (await noteTipDispute(db, "pi_other", "opened", deps())) === false)
    check("  the tip is on the balance before the dispute takes it back", tipSales(db).length === 1 && balance(db).pending_amount === 455)
    check("  and reads disputed", db.tables.onepage_tips[0].status === "disputed")
    /* The webhook's own takeBack: the creator's share reversed, debit_available_first under the dispute's key. */
    await postLedger(db, { creatorId: CREATOR, key: "dispute:dp_1:dispute_created", op: "debit_available_first", amountCents: 455, event: { event_type: "dispute_created", amount_cents: 455, stripe_dispute_id: "dp_1" } })
    await postLedger(db, { creatorId: CREATOR, key: "dispute:dp_1:dispute_created", op: "debit_available_first", amountCents: 455, event: { event_type: "dispute_created", amount_cents: 455, stripe_dispute_id: "dp_1" } })
    check("  the reversal leaves the balance where it was before the tip, once", balance(db).pending_amount === 0 && balance(db).available_amount === 0 && balance(db).negative_balance === 0, balance(db))
    await noteTipDispute(db, "pi_tip_1", "opened", deps())
    check("  a second delivery posts nothing again", tipSales(db).length === 1)
    await postLedger(db, { creatorId: CREATOR, key: "dispute:dp_1:dispute_closed", op: "credit_available", amountCents: 455, event: { event_type: "dispute_closed", amount_cents: 455, stripe_dispute_id: "dp_1" } })
    await noteTipDispute(db, "pi_tip_1", "won", deps())
    check("won: given back, and the tip reads paid again", balance(db).available_amount === 455 && db.tables.onepage_tips[0].status === "paid")

    const hook = read("app/api/stripe/webhook/route.ts")
    const created = hook.slice(hook.indexOf('if (event.type === "charge.dispute.created") {'), hook.indexOf('if (event.type === "charge.dispute.closed") {'))
    check("the webhook posts the tip before the dispute takes it back", /noteTipDispute\(supabaseAdmin, paymentIntentId, "opened"\)\n\s*if \(!inquiry\) await takeBack\(\)/.test(created))
    check("  on an inquiry turned chargeback too, and on the close", /noteTipDispute\(supabaseAdmin, paymentIntentId, "opened"\)\n\s*const taken = await takeBack\(\)/.test(hook) && /noteTipDispute\(supabaseAdmin, paymentIntentId, dispute\.status === "won" \? "won" : "lost"\)/.test(hook))
  }

  console.log("\nA currency other than USD")
  {
    const eur = ledgerDb()
    await recordTipFromSession(eur, session({ amount_total: 1000, currency: "eur" }, { amount_cents: "1000", platform_fee_cents: "90" }), undefined, deps({ rate: { eur: 1.1 }, stripeFee: 90 }))
    const s = tipSales(eur)[0] ?? {}
    check("a euro tip is posted in the wallet's currency at the day's rate", s.currency === "usd" && s.amount_cents === 1100 && s.fee_cents === 99 && s.net_seller_cents === 1001 && balance(eur).pending_amount === 1001, s)
    check("  its line says what was paid", /\(from EUR 10\.00\)/.test(String(s.description)) && s.metadata?.charged_currency === "eur" && s.metadata?.charged_cents === 1000, s.description)
    await syncTipRefunds(eur, noList, charge([{ id: "re_eur", amount: 1000 }], { currency: "eur" }), deps({ rate: { eur: 1.1 }, stripeFee: 90 }))
    check("  and its refund comes off in the same currency, exactly", balance(eur).pending_amount === 0 && balance(eur).negative_balance === 0, balance(eur))

    const ron = ledgerDb()
    await recordTipFromSession(ron, session({ amount_total: 2500, currency: "ron" }, { amount_cents: "2500", platform_fee_cents: "200" }), undefined, deps({ stripeFee: 200 }))
    const k = tipSales(ron)[0] ?? {}
    check("with no rate it keeps its own currency, never a number in the wrong one", k.currency === "ron" && k.amount_cents === 2500 && k.net_seller_cents === 2300, k)
  }

  console.log("\nPart 471: the tips from before, posted once")
  {
    const sql = read("supabase/sql/run-now/471_tips_in_ledger.sql")
    check("part 471 and its migration are the same text", sql === read("supabase/migrations/20271471_tips_in_ledger.sql"))
    check("it opens with one comment saying what it does, like every part", /^\/\* OnePage tips on the seller's balance[^\n]*part 471[^\n]*Safe to run again[^\n]*\*\/\n/.test(sql))
    check("only paid tips with an amount and a known fee", /WHERE p\.status = 'paid' AND p\.amount_cents > 0 AND p\.platform_fee_cents IS NOT NULL/.test(sql))
    check("an anti-join: none already under its key", /AND NOT EXISTS \(SELECT 1 FROM public\.ledger_events e WHERE e\.idempotency_key = 'tip:' \|\| p\.checkout_session_id\)/.test(sql))
    check("  none with a refund recorded against it", /AND NOT EXISTS \(SELECT 1 FROM public\.ledger_events r WHERE r\.event_type = 'refund' AND r\.metadata ->> 'tip_key' = 'tip:' \|\| p\.checkout_session_id\)/.test(sql))
    check("posted through ledger_post under the same key the app uses, so a second run changes nothing", /k := 'tip:' \|\| t\.checkout_session_id;/.test(sql) && /public\.ledger_post\(t\.creator_id, k, 'sale', greatest\(w_total - w_fee, 0\)/.test(sql))
    check("the amount less the fee, held three days from the tip", /'net_seller_cents', greatest\(w_total - w_fee, 0\)/.test(sql) && /'hold_until', t\.created_at \+ interval '3 days'/.test(sql))
    check("labelled as the app labels it", sql.includes("'Tip from ' || coalesce(nullif(left(btrim(t.tipper_name), 80), ''), 'Anonymous')"))
    check("another currency converted at its own day's ECB rate, else kept", /FROM public\.fx_rates f WHERE f\.as_of <= t\.created_at::date/.test(sql) && /w_cur := lower\(t\.currency\);/.test(sql))
    check("does nothing before parts 64 and 411", /IF to_regclass\('public\.onepage_tips'\) IS NULL OR to_regclass\('public\.ledger_events'\) IS NULL OR to_regprocedure\('public\.ledger_post\(uuid,text,text,bigint,jsonb\)'\) IS NULL THEN/.test(sql))
    check("ledger_release_due stays the server's only", sql.includes("REVOKE ALL ON FUNCTION public.ledger_release_due(timestamptz) FROM PUBLIC, anon, authenticated;") && sql.includes("GRANT EXECUTE ON FUNCTION public.ledger_release_due(timestamptz) TO service_role;"))
    check("its indexes are made only when the tables are there", /CREATE INDEX IF NOT EXISTS onepage_tips_intent_idx ON public\.onepage_tips \(payment_intent_id\)/.test(sql) && /CREATE INDEX IF NOT EXISTS ledger_events_tip_key_idx ON public\.ledger_events \(\(metadata ->> 'tip_key'\)\)/.test(sql))
    check("it ends by reloading the schema", sql.trimEnd().endsWith("notify pgrst, 'reload schema';"))
  }

  console.log("\nPayouts lists them")
  {
    const db = ledgerDb()
    await recordTipFromSession(db, session(), undefined, deps())
    await recordTipFromSession(db, session({ id: "cs_test_tip_bbbbbbbb", payment_intent: "pi_tip_2", customer_details: { name: null } }, { tipper_name: "" }), undefined, deps())
    await syncTipRefunds(db, noList, charge([{ id: "re_9", amount: 500 }]), deps())
    const rows = await payoutTips(db, CREATOR)
    check("each tip on the balance, with what was paid and what reached it", rows.length === 2 && rows.every((r) => r.amountCents === 500 && r.netCents === 455 && r.currency === "usd"), rows)
    check("  a name, or none for Anonymous", rows.some((r) => r.name === "Sam") && rows.some((r) => r.name === null))
    check("  and where it stands", rows.find((r) => r.name === "Sam")?.status === "refunded" && rows.find((r) => r.name === null)?.status === "paid")
    check("a failed read is an empty list, never a failed page", (await payoutTips({ from: () => { throw new Error("down") } }, CREATOR)).length === 0)
    const client = read("app/(storelib)/app/payouts/payouts-client.tsx")
    check("the page draws them as \"Tip from <name or Anonymous>\" in their own tab", client.includes('tt("Tip from {name}", { name: name || tt("Anonymous") })') && client.includes('{ value: "tips" as const, label: tt("Tips") }') && /recentTab === "tips" \? \(\n\s*<TipsList tips=\{initialTips\}/.test(client))
    check("  only when there are tips", client.includes('...(initialTips.length > 0 ? [{ value: "tips" as const, label: tt("Tips") }] : [])'))
    const page = read("app/(storelib)/app/payouts/page.tsx")
    check("the page reads them from the ledger", /const tipsRead = payoutTips\(adminSupabase, creator\.id\);/.test(page) && /initialTips=\{await tipsRead\}/.test(page))
    for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
      const words = read(`lib/i18n/catalog/${lang}.ts`)
      check(`  in ${lang}`, ['"Tip from {name}"', '"Anonymous"', '"You keep"'].every((k) => words.includes(`\n ${k}: `)) && /"Tip from \{name\}": "[^"]*\{name\}[^"]*"/.test(words))
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
