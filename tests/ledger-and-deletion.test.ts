/**
 * ===========================================================================
 *  THE SELLER BALANCE CHANGES ONCE PER EVENT, AND DELETING KEEPS OTHER
 *  PEOPLE'S THINGS
 * ===========================================================================
 * Two halves of one promise: money is never counted twice or lost, and it is
 * never deleted out from under somebody.
 *
 *   The balance: every change goes through public.ledger_post (run-now part
 *   64) under an idempotency key, the hold release through
 *   ledger_release_due, and the webhook skips a Stripe event it already
 *   finished. The code that read, added and wrote back is left only as the
 *   path before part 64 has run.
 *
 *   Deleting: lib/account/delete-account refuses while money is owed either
 *   way or a dispute is open, RETIRES an account that has sold, paid out or
 *   been billed (store closed, person erased, records kept) and removes one
 *   that has not. Every caller uses it; the old wipe is gone.
 */
import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { deleteAccount, deletionBlockers } from "../lib/account/delete-account"
import { postLedger, releaseDueHolds } from "../lib/payments/ledger"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

async function main() {
  console.log("\nThe SQL")
  {
    const sql = read("supabase/sql/run-now/64_ledger_once_and_atomic.sql")
    check("part 64 and its migration are the same text", sql === read("supabase/migrations/20261014_ledger_once_and_atomic.sql"))
    check("the balance row is locked before it is changed", /SELECT \* INTO l FROM public\.seller_ledger WHERE creator_id = p_creator FOR UPDATE/.test(sql))
    check("a key already written changes nothing", /EXISTS \(SELECT 1 FROM public\.ledger_events WHERE idempotency_key = p_key\) THEN RETURN jsonb_build_object\('applied', false\)/.test(sql))
    check("the history row and the balance move together", sql.indexOf("INSERT INTO public.ledger_events (creator_id, event_type") < sql.indexOf("UPDATE public.seller_ledger SET pending_amount = pending_amount + d_p"))
    check("one key, one row", sql.includes("CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_once ON public.ledger_events (idempotency_key) WHERE idempotency_key IS NOT NULL"))
    check("old rows get their keys before the index, first row only", sql.indexOf("UPDATE public.ledger_events e SET idempotency_key = 'sale:'") < sql.indexOf("CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_once") && sql.includes("(x.created_at, x.id) < (e.created_at, e.id)"))
    check("holds are released under a lock, skipping rows another run holds", sql.includes("FOR UPDATE SKIP LOCKED") && sql.includes("'release:' || c || ':' || md5("))
    check("only the server may change a balance", /REVOKE ALL ON FUNCTION public\.ledger_post\(uuid, text, text, bigint, jsonb\) FROM PUBLIC, anon, authenticated;/.test(sql))
    check("finished Stripe events are recorded", sql.includes("CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (event_id text PRIMARY KEY"))
    const del = read("supabase/sql/run-now/65_account_deletion_keeps_records.sql")
    check("part 65 and its migration are the same text", del === read("supabase/migrations/20261015_account_deletion_keeps_records.sql"))
    check("a deleted buyer's orders stay, the link cleared", del.includes("ALTER COLUMN buyer_id DROP NOT NULL") && del.includes("ON DELETE SET NULL NOT VALID"))
    check("every deletion is logged, failed steps included", del.includes("CREATE TABLE IF NOT EXISTS public.account_deletions") && del.includes("failures jsonb"))
    const after = read("supabase/sql/run-now/99_check_after.sql")
    check("the check after has both parts", after.includes("as p64_ledger_once_and_atomic") && after.includes("as p65_account_deletion_keeps_records"))
  }

  console.log("\nEvery balance change goes through the database")
  {
    const users: Array<[string, string]> = [
      ["lib/checkout/fulfil-payment.ts", "key: `sale:${s.orderId}`"],
      ["app/api/stripe/webhook/route.ts", "key: `sale:${order.id}`"],
      ["app/api/stripe/webhook/route.ts", 'key: `payout:${payout.id}:${returned ? "cashout_failed" : "cashout_completed"}`'],
      ["app/api/stripe/webhook/route.ts", "key: `dispute:${dispute.id}:dispute_created`"],
      ["app/api/stripe/webhook/route.ts", "key: `dispute:${dispute.id}:dispute_closed`"],
      ["lib/stripe/refund-sync.ts", "key: `refund:${refund.id}:${row.id}`"],
    ]
    for (const [file, key] of users) check(`${file} posts ${key.slice(5, 40)}…`, read(file).includes(key))
    check("the old paths run only when the function is not there", /if \(!posted\.unavailable\) return\n/.test(read("lib/checkout/fulfil-payment.ts")) && /if \(posted\.unavailable === false\) return posted\.applied \? "recorded" : "duplicate"/.test(read("lib/stripe/refund-sync.ts")))
    check("the hold release asks the database first", /const done = await releaseDueHolds\(adminSupabase\)\n\s*if \(done\) \{/.test(read("app/api/cron/release-holds/route.ts")))
    const hook = read("app/api/stripe/webhook/route.ts")
    check("the webhook answers a finished event without running it again", /if \(eventId && \(await stripeEventHandled\(supabaseAdmin, eventId\)\)\) \{\s*return NextResponse\.json\(\{ received: true, duplicate: true \}\)/.test(hook))
    check("  and records an event only after the signed handler answered 200", /if \(eventId && answer\.status === 200\) await noteStripeEvent\(supabaseAdmin, \{ id: eventId, type: eventType, account, ok: true \}\)/.test(hook))

    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const db = { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return { data: { applied: calls.length === 1, pending_delta: 900 }, error: null } } }
    const first = await postLedger(db, { creatorId: "c1", key: "sale:o1", op: "sale", amountCents: 900, event: { event_type: "sale" } })
    const again = await postLedger(db, { creatorId: "c1", key: "sale:o1", op: "sale", amountCents: 900, event: { event_type: "sale" } })
    check("postLedger hands the change to ledger_post with its key", calls[0]?.fn === "ledger_post" && calls[0].args.p_key === "sale:o1" && calls[0].args.p_amount === 900)
    check("  and says whether it was new", first.unavailable === false && first.applied === true && again.unavailable === false && again.applied === false)
    const missing = await postLedger({ rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) }, { creatorId: "c1", key: "k", op: "sale", amountCents: 1, event: { event_type: "sale" } })
    check("before part 64 the caller is told to do it the old way", missing.unavailable === true)
    let threw = false
    try { await postLedger({ rpc: async () => ({ data: null, error: { code: "40001", message: "serialization failure" } }) }, { creatorId: "c1", key: "k", op: "sale", amountCents: 1, event: { event_type: "sale" } }) } catch { threw = true }
    check("any other failure is an error, so the webhook answers 500 and Stripe tries again", threw)
    check("a negative amount is sent as zero", (await (async () => { let a = -1; await postLedger({ rpc: async (_f: string, x: Record<string, unknown>) => { a = x.p_amount as number; return { data: { applied: true }, error: null } } }, { creatorId: "c", key: "k", op: "sale", amountCents: -50, event: { event_type: "sale" } }); return a })()) === 0)
    check("hold release before part 64 falls back", (await releaseDueHolds({ rpc: async () => ({ data: null, error: { code: "PGRST202", message: "x" } }) })) === null)
  }

  console.log("\nDeleting an account")
  {
    for (const f of ["app/api/auth/delete-account/route.ts", "app/api/admin/delete-user/route.ts", "app/api/admin/accounts/delete/route.ts", "app/api/admin/creators/moderate/route.ts", "app/api/admin/spam-purge/route.ts"]) {
      const src = read(f)
      check(`${f} deletes through lib/account/delete-account`, src.includes('from "@/lib/account/delete-account"') && /deleteAccount\(/.test(src) && !/deleteAllUserData/.test(src))
    }
    check("the person is told what to settle before a code is even sent", /if \(action === "send-code" \|\| action === "verify"\) \{\s*const blockers = await deletionBlockers\(adminSupabase, user\.id\)/.test(read("app/api/auth/delete-account/route.ts")))

    const C = "c0000000-0000-4000-8000-000000000001"
    const U = "u0000000-0000-4000-8000-000000000001"
    const B = "b0000000-0000-4000-8000-000000000001"
    const P = "p0000000-0000-4000-8000-000000000001"
    const withAuth = (db: ReturnType<typeof fakeDb>, auth: { deleted: string[]; closed: Array<{ id: string; attrs: Record<string, unknown> }> }) => ({
      ...db,
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) },
      auth: { admin: {
        deleteUser: async (id: string) => { auth.deleted.push(id); return { error: null } },
        updateUserById: async (id: string, attrs: Record<string, unknown>) => { auth.closed.push({ id, attrs }); return { error: null } },
      } },
    })

    {
      const db = fakeDb({
        creators: [{ id: C, user_id: U, slug: "andrew", store_published: true, display_name: "Andrew" }],
        products: [{ id: P, creator_id: C, status: "published" }],
        orders: [{ id: "o1", product_id: P, buyer_id: B, status: "completed" }],
        entitlements: [{ id: "e1", product_id: P, buyer_id: B, creator_id: C }],
        digital_assets: [{ id: "d1", product_id: P, creator_id: C }],
        seller_ledger: [{ creator_id: C, pending_amount: 0, available_amount: 0, in_transit_amount: 0, negative_balance: 0 }],
        ledger_events: [{ id: "l1", creator_id: C, event_type: "sale" }],
        payouts: [], invoices: [], subscribers: [{ id: "s1", creator_id: C }],
        profiles: [{ id: U, email: "andrew@x.com", username: "andrew", display_name: "Andrew" }],
        account_deletions: [],
      })
      const auth = { deleted: [] as string[], closed: [] as Array<{ id: string; attrs: Record<string, unknown> }> }
      const out = await deleteAccount(withAuth(db, auth), U, "self")
      check("a creator who has sold is retired, not wiped", out.mode === "retired" && out.ok, out.failures.join("; "))
      check("  the buyer keeps the product in their library", db.tables.entitlements.some((e) => e.buyer_id === B && e.product_id === P))
      check("  the file they bought is still there", db.tables.digital_assets.length === 1)
      check("  the order and the balance history stay", db.tables.orders.length === 1 && db.tables.ledger_events.length === 1)
      check("  the product is off sale", db.tables.products[0].status === "archived")
      check("  the store is closed and its handle free", db.tables.creators[0].store_published === false && db.tables.creators[0].slug !== "andrew")
      check("  the marketing list is gone", db.tables.subscribers.length === 0)
      check("  the person's details are erased", db.tables.profiles[0].username === null && db.tables.profiles[0].email !== "andrew@x.com")
      check("  the sign in account is closed, not deleted (its records hang off it)", auth.deleted.length === 0 && auth.closed[0]?.id === U && String(auth.closed[0].attrs.email).endsWith("@deleted.storelib.invalid") && auth.closed[0].attrs.ban_duration === "876000h")
      check("  and the deletion is logged", db.tables.account_deletions.length === 1 && db.tables.account_deletions[0].mode === "retired")
    }
    {
      const db = fakeDb({
        creators: [{ id: C, user_id: U }], products: [{ id: P, creator_id: C }],
        orders: [{ id: "o2", product_id: "other", buyer_id: U, status: "completed" }],
        entitlements: [{ id: "e2", product_id: "other", buyer_id: U }],
        ledger_events: [], payouts: [], invoices: [], profiles: [{ id: U, email: "a@x.com" }], account_deletions: [],
      })
      const auth = { deleted: [] as string[], closed: [] as Array<{ id: string; attrs: Record<string, unknown> }> }
      const out = await deleteAccount(withAuth(db, auth), U, "self")
      check("an account that never sold is removed completely", out.mode === "removed" && auth.deleted[0] === U && db.tables.creators.length === 0 && db.tables.products.length === 0)
      check("  its own purchases leave its library, the seller keeps the order", db.tables.entitlements.length === 0 && db.tables.orders.length === 1 && db.tables.orders[0].buyer_id === null)
    }
    {
      const db = fakeDb({
        creators: [{ id: C, user_id: U }], products: [{ id: P, creator_id: C }],
        seller_ledger: [{ creator_id: C, pending_amount: 1200, available_amount: 500, in_transit_amount: 0, negative_balance: 300 }],
        orders: [{ id: "o3", product_id: P, status: "disputed" }],
      })
      const blockers = await deletionBlockers(db, U)
      check("money waiting, owed or disputed stops a deletion, each said", blockers.length === 4 && blockers.some((b) => b.includes("$5.00")) && blockers.some((b) => b.includes("$12.00")) && blockers.some((b) => b.includes("$3.00")) && blockers.some((b) => /disputed/.test(b)), blockers.join(" | "))
      check("a buyer with no store has nothing to settle", (await deletionBlockers(fakeDb({ creators: [] }), B)).length === 0)
      const broken = fakeDb({ creators: [{ id: C, user_id: U }] }, { failWith: { seller_ledger: { code: "57014", message: "timeout" } } })
      check("a balance that cannot be read stops it too", (await deletionBlockers(broken, U)).length === 1)
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
