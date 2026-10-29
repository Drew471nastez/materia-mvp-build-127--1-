/**
 * ===========================================================================
 *  PUT A CREATOR'S PLAN BACK TO WHAT STRIPE SAYS, DRY RUN FIRST
 * ===========================================================================
 * For creators the billing read wrongly put on Free (see
 * supabase/sql/runbooks/billing-1-free-plan-audit.sql). It uses the same sync
 * the Stripe webhook uses (lib/billing/subscription-sync.ts): Stripe is
 * listed now, for every customer the creator has had, and only what that
 * says is written.
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply, and even then only
 * restorations (Stripe says a paid plan, the database says something else)
 * unless --allow-downgrade is also given. A creator Stripe could not be
 * asked about is reported and skipped.
 *
 *   # who to look at: from the audit's shapes A and B (read only)
 *   npx tsx scripts/reconcile-creator-plans.ts --candidates
 *   # or named creators
 *   npx tsx scripts/reconcile-creator-plans.ts --creators <uuid>,<uuid>
 *   # also look for Stripe customers made for the creator that the database lost
 *   npx tsx scripts/reconcile-creator-plans.ts --candidates --search-customers
 *   # then, with the same list, after reading the dry run
 *   npx tsx scripts/reconcile-creator-plans.ts --creators <uuid>,<uuid> --apply
 *
 * Needs STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * in the environment. Run it against staging first.
 */
import { readFileSync } from "node:fs"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { applyCreatorSync, planCreatorSync, stripeListForSync, type CreatorBilling, type SyncDeps } from "../lib/billing/subscription-sync"
import { recordPaidPlan } from "../lib/billing/plan-override"

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const value = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

async function main() {
  const apply = flag("--apply")
  const allowDowngrade = flag("--allow-downgrade")
  const searchCustomers = flag("--search-customers")
  const key = process.env.STRIPE_SECRET_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || !url || !service) {
    console.error("STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.")
    process.exit(2)
  }
  const stripe = new Stripe(key)
  const db = createClient(url, service, { auth: { persistSession: false } })

  let ids: string[] = []
  if (value("--creators")) ids = value("--creators")!.split(",").map((s) => s.trim()).filter(Boolean)
  if (value("--file")) ids.push(...readFileSync(value("--file")!, "utf8").split(/\s+/).filter(Boolean))
  if (flag("--candidates")) {
    /* Shapes A and B of the audit: Free on creators while the row says paying, or the stored customer replaced. */
    const { data, error } = await db
      .from("subscriptions")
      .select("creator_id, stripe_customer_id, status, creators!inner(id, subscription_plan_id, stripe_customer_id)")
      .in("status", ["active", "trialing", "past_due"])
    if (error) throw new Error(`candidates not read: ${error.message}`)
    for (const r of (data ?? []) as unknown as { creator_id: string; stripe_customer_id: string | null; creators: { subscription_plan_id: string | null; stripe_customer_id: string | null } }[]) {
      if ((r.creators.subscription_plan_id ?? "free") === "free" || r.creators.stripe_customer_id !== r.stripe_customer_id) ids.push(r.creator_id)
    }
  }
  ids = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (!ids.length) {
    console.error("No creators. Pass --creators, --file or --candidates.")
    process.exit(2)
  }
  if (apply && flag("--candidates") && !value("--creators") && !value("--file")) {
    console.error("--apply takes a named list (--creators or --file), not --candidates: read the dry run first.")
    process.exit(2)
  }

  const deps: SyncDeps = {
    db,
    listSubscriptions: stripeListForSync((p, o) => stripe.subscriptions.list(p, o) as never, 15_000),
    recordPaidPlan: (creatorId, planId, status) => recordPaidPlan(db, creatorId, planId, status),
    log: (m, d) => console.error(m, d ?? ""),
  }

  console.error(`${apply ? "APPLY" : "DRY RUN"}: ${ids.length} creator(s)${apply && !allowDowngrade ? ", restorations only" : ""}`)
  const summary: Record<string, number> = {}
  for (const id of ids) {
    const { data: c } = await db.from("creators").select("id, stripe_customer_id, subscription_plan_id, subscription_status").eq("id", id).maybeSingle()
    if (!c) {
      console.log(JSON.stringify({ creatorId: id, result: "no_creator" }))
      continue
    }
    const { data: row } = await db.from("subscriptions").select("stripe_subscription_id, stripe_customer_id, plan_id, status, cancel_at_period_end").eq("creator_id", id).maybeSingle()
    const creator = { ...(c as Omit<CreatorBilling, "row">), row: (row as CreatorBilling["row"]) ?? null }

    const extra: string[] = []
    if (searchCustomers) {
      try {
        const found = await stripe.customers.search({ query: `metadata['creator_id']:'${id}'`, limit: 20 })
        extra.push(...found.data.map((x) => x.id))
      } catch (e) {
        console.error(`[${id}] customer search failed: ${e instanceof Error ? e.message : e}`)
      }
    }

    let plan
    try {
      plan = await planCreatorSync(deps, creator, extra)
    } catch (e) {
      console.log(JSON.stringify({ creatorId: id, result: "stripe_unavailable_skipped", error: e instanceof Error ? e.message : String(e) }))
      summary.skipped = (summary.skipped ?? 0) + 1
      continue
    }
    const restores = plan.outcome === "paid" && plan.creatorUpdate !== null
    const downgrades = plan.outcome === "free" && plan.creatorUpdate?.subscription_plan_id === "free"
    const willWrite = apply && (restores || (downgrades && allowDowngrade) || (plan.outcome === "paid" && !!plan.subscriptionUpsert))
    console.log(JSON.stringify({
      creatorId: id,
      outcome: plan.outcome,
      before: plan.before,
      stripePlan: plan.planId,
      stripeStatus: plan.status,
      subscription: plan.chosenSubscriptionId,
      customersRead: plan.customersRead,
      creatorUpdate: plan.creatorUpdate,
      kind: restores ? "restore" : downgrades ? "downgrade" : "no_change",
      written: willWrite,
    }))
    summary[restores ? "restore" : downgrades ? "downgrade" : plan.outcome] = (summary[restores ? "restore" : downgrades ? "downgrade" : plan.outcome] ?? 0) + 1
    if (willWrite) await applyCreatorSync(deps, plan)
    await new Promise((r) => setTimeout(r, 150))
  }
  console.error("summary", summary)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
