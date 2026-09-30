/**
 * ===========================================================================
 *  A STRIPE REFUND, WRITTEN BACK ONCE AND TO THE RIGHT ROWS
 * ===========================================================================
 * lib/stripe/refund-allocation.ts decides which order rows a refund is for;
 * lib/stripe/refund-sync.ts writes it to them and to the seller's balance.
 * What this pins:
 *
 *   a refund started from the Orders page goes to the row it named
 *   a dashboard refund on a basket is shared, and the parts add up exactly
 *   a second refund sees what the first gave back
 *   each refund is applied to each row once, and the marker is written first
 *   the refund email is given cents, which is what it formats
 *   a held sale releases only what its refunds left
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { allocateRefund, feeShare, refundableOf, refundedSoFar } from "../lib/stripe/refund-allocation"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const line = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({ id, amount_cents: amount, status: "completed", ...extra })

console.log("\nWhich rows a refund is for")
check("the row the Orders page named gets all of it", JSON.stringify(allocateRefund([line("a", 1000), line("b", 2000)], 500, "b")) === JSON.stringify([{ id: "b", cents: 500 }]))
check("a named row that is not in this payment falls back to the split", allocateRefund([line("a", 1000), line("b", 3000)], 400, "zzz").reduce((n, s) => n + s.cents, 0) === 400)
check("a payment with one row: all of it", JSON.stringify(allocateRefund([line("a", 1000)], 700)) === JSON.stringify([{ id: "a", cents: 700 }]))
{
  const shares = allocateRefund([line("a", 1000), line("b", 2000), line("c", 3000)], 6000)
  check("a full basket refund gives each row its whole amount", JSON.stringify(shares) === JSON.stringify([{ id: "a", cents: 1000 }, { id: "b", cents: 2000 }, { id: "c", cents: 3000 }]), shares)
}
{
  const shares = allocateRefund([line("a", 1000), line("b", 2000), line("c", 3001)], 1001)
  check("a partial one is shared by what each row has left, and adds up to the refund exactly", shares.reduce((n, s) => n + s.cents, 0) === 1001 && shares.length === 3, shares)
}
{
  const rows = [line("a", 1000, { status: "refunded", refund_amount_cents: 1000 }), line("b", 2000)]
  check("a row already fully refunded takes none of a later refund", JSON.stringify(allocateRefund(rows, 500)) === JSON.stringify([{ id: "b", cents: 500 }]))
}
check("a refunded row with no amount recorded gave back all of it", refundedSoFar(line("a", 900, { status: "refunded" })) === 900 && refundableOf(line("a", 900, { status: "refunded" })) === 0)
check("a partly refunded row can still give back the rest", refundableOf(line("a", 900, { status: "refunded", refund_amount_cents: 300 })) === 600)
check("nothing to allocate is nothing", allocateRefund([line("a", 1000)], 0).length === 0 && allocateRefund([], 500).length === 0)

console.log("\nThe fee that goes with it")
check("a full refund takes the whole fee", feeShare(60, 1000, 1000) === 60)
check("a partial one takes the same share of it", feeShare(60, 1000, 500) === 30)
check("no fee, no share", feeShare(0, 1000, 500) === 0)

console.log("\nApplied once, to the right rows")
const sync = strip(read("lib/stripe/refund-sync.ts"))
check("every row of the payment is read, not one", /\.from\("orders"\)\.select\("\*"\)\.eq\("stripe_payment_intent_id", paymentIntentId\)\)?/.test(sync) && !/maybeSingle\(\)\s*\n?\s*if \(order && order\.status !== "refunded"\)/.test(sync))
check("every refund of the charge is taken, oldest first, asking Stripe when the event leaves them out",
  /stripe\.refunds\.list\(\{ charge: charge\.id, limit: 100 \}\)/.test(sync) && /\.sort\(\(a, b\) => a\.created - b\.created\)/.test(sync))
check("what each row gave back is read from the ledger events, which only the sync writes, not from the row",
  /const events = await refundEventsFor\(db, rows\.map\(\(r\) => r\.id\)\)/.test(sync) && /e\.order_id === id && e\.stripe_refund_id !== refund\.id/.test(sync))
check("a refund already applied in full is skipped, and one applied in part shares only what is left over the rows it missed",
  /const left = refund\.amount - mine\.reduce/.test(sync) && /if \(left <= 0\) \{/.test(sync) && /\.filter\(\(r\) => !done\.has\(r\.id\)\)/.test(sync) && /allocateRefund\(open, left, named\)/.test(sync))
check("two deliveries at once: the unique index refuses the second, read as already applied",
  /if \(eventError && \(eventError as \{ code\?: string \}\)\.code === "23505"\) return "duplicate"/.test(sync)
    && /CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_refund_once\s*\n\s*ON public\.ledger_events \(stripe_refund_id, order_id\)/.test(read("supabase/sql/RUN_REFUND_LEDGER_ONCE.sql")))
check("anything not recorded is thrown after the loop, so the webhook answers 500 and Stripe retries",
  /if \(failures\.length > 0\) throw new Error/.test(sync))
check("a refund comes out of pending only while its sale is still held", /const held = Array\.isArray\(sale\) && sale\.length > 0 && !sale\[0\]\.released_at/.test(sync))
{
  const fn = sync.slice(sync.indexOf("async function applyToLedger"), sync.indexOf("export async function syncChargeRefund"))
  const marker = fn.indexOf('.from("ledger_events").insert(')
  const balance = fn.indexOf('.from("seller_ledger")\n      .update(')
  check("and that event is written before the balance moves", marker > 0 && balance > 0 && marker < balance, { marker, balance })
}
check("a refund from the Orders page is known by its own metadata, not by a row it may not have written yet",
  /const startedHere = named === row\.id && typeof refund\.metadata\?\.creator_id === "string" && refund\.metadata\?\.settled_by !== "webhook"/.test(sync))
check("a refund Stripe had not confirmed on the Orders page is finished here, told once", /settled_by: "webhook"/.test(read("app/api/stripe/refund/route.ts")) && /\.filter\(\(r\) => r\.status === "succeeded"\)/.test(sync))
check("and it neither rewrites the amount nor sends a second email", /if \(startedHere\) return/.test(sync) && /if \(!startedHere\) touched\.push/.test(sync))
check("the refund email is given cents", /refundAmount: touched\.reduce\(\(n, t\) => n \+ t\.cents, 0\)/.test(sync) && !/\/ 100,?\s*\n?\s*currency/.test(sync))
check("the Orders page tags its refunds so the webhook can tell", /metadata: \{\s*\n\s*order_id: orderId,\s*\n\s*creator_id: creator\.id,/.test(read("app/api/stripe/refund/route.ts")))
{
  const route = read("app/api/stripe/refund/route.ts")
  check("the Orders page takes the seller's part back (destination charges do not on their own)", /refundParams\.reverse_transfer = true/.test(route))
  check("and a double submit refunds once", /idempotencyKey: `storelib-refund:\$\{orderId\}:\$\{alreadyRefunded\}:\$\{refundAmountCents\}`/.test(route))
}
check("no page counts the tip twice in a refund", !/amount_cents \|\| 0\) \+ \((line|order)\.tip_cents/.test(read("lib/orders/metrics.ts") + read("app/app/orders/sales/page.tsx")))
const hook = strip(read("app/api/stripe/webhook/route.ts"))
check("the webhook hands charge.refunded to it, and asks Stripe to retry when it fails",
  /syncChargeRefund\(supabaseAdmin, stripe, charge\)/.test(hook) && /Refund not recorded yet" \}, \{ status: 500 \}/.test(hook))

console.log("\nA held sale releases what is left of it")
const release = strip(read("app/api/cron/release-holds/route.ts"))
check("refunds taken from pending are subtracted before a sale is released",
  /\.eq\("event_type", "refund"\)\s*\.in\("order_id", orderIds\)/.test(release) && /Math\.max\(0, \(event\.net_seller_cents \|\| 0\) - refunded\)/.test(release))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
