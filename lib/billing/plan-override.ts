/**
 * ===========================================================================
 *  A PLAN SET FROM /admin, OVER WHATEVER THE CREATOR PAYS FOR
 * ===========================================================================
 * The owner: "for each creator I can assign the kind of plan I want for him,
 * pro plan or whatever, so I can switch them from there, and it updates in
 * real time across its accounts and everything."
 *
 * ONE SOURCE OF TRUTH, AND IT IS THE COLUMN EVERY CHECK ALREADY READS. Fees,
 * site limits, storage, uploads, the team, OnePage, email campaigns, the
 * Storelib badge and the Pro themes all read `creators.subscription_plan_id`
 * and `subscription_status`. An override is a row in `creator_plan_overrides`
 * (part 252), and setting one writes the plan into those columns as well, in
 * the same transaction (`admin_set_plan_override`). While it is set, a
 * trigger on creators keeps it there: a Stripe webhook or the billing page's
 * sync that writes a plan has its plan kept on the override row as the paid
 * plan instead, and the columns keep the override. Clearing it puts the paid
 * plan and its status back. Stripe is never called: the subscription, its
 * invoices and its card are exactly as they were.
 *
 * The three readers that ask Stripe for the plan rather than the columns
 * (the billing overview, /api/billing/subscription and the upgrade page) ask
 * readPlanOverride as well, so they say the same thing as everything else.
 *
 * Before part 252 runs there is no table and no function: reads answer null
 * and the admin control says to run it.
 */
import type { PlanId } from "./plans"
import { dataOrThrow } from "@/lib/net/service-error"

/** Every tier an admin can assign: what is sold (Free, Pro as `growth`) and the older $99 Pro. */
export const ASSIGNABLE_PLANS: readonly { id: PlanId; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "growth", label: "Pro" },
  { id: "pro", label: "Pro, $99 legacy" },
]

export function isAssignablePlan(v: unknown): v is PlanId {
  return typeof v === "string" && ASSIGNABLE_PLANS.some((p) => p.id === v)
}

export const OVERRIDES_TABLE = "creator_plan_overrides"
export const SET_OVERRIDE_FN = "admin_set_plan_override"

export interface PlanOverride {
  planId: PlanId
  /** What billing last wrote while the override was on: the plan clearing it returns to. */
  paidPlanId: string | null
  paidStatus: string | null
  setAt: string | null
}

type Db = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The table or its columns are not there yet (SQL part 252 not run): no override, as before. */
function overridesMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return ["42P01", "PGRST205", "PGRST204", "42703"].includes(error.code ?? "") || /creator_plan_overrides|does not exist|schema cache/i.test(error.message ?? "")
}

/**
 * The override in force for a creator, or null (none, or the SQL has not run).
 *
 * Round rel2-auth: a read that FAILED throws a ServiceUnavailable
 * (lib/net/service-error). It was null, "no override", so a store given Pro
 * from /admin read as Free for as long as the database was slow; the routes
 * that show or decide the plan answer 503 Try again instead.
 */
export async function readPlanOverride(db: Db, creatorId: string): Promise<PlanOverride | null> {
  let read: { data: any; error: any; status?: number } // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    read = await db.from(OVERRIDES_TABLE).select("plan_id, paid_plan_id, paid_status, set_at").eq("creator_id", creatorId).maybeSingle()
  } catch (e) {
    read = { data: null, error: { message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) } }
  }
  if (read.error && overridesMissing(read.error)) return null
  const data = dataOrThrow("plan override", read)
  if (!data || !isAssignablePlan(data.plan_id)) return null
  return { planId: data.plan_id, paidPlanId: data.paid_plan_id ?? null, paidStatus: data.paid_status ?? null, setAt: data.set_at ?? null }
}

/**
 * What Stripe says they pay for, noted on an override in force, so clearing
 * it returns to the right plan. The trigger already does this when a write
 * changes the columns; this covers a paid plan that happens to equal the
 * override (comped Pro, then they buy Pro), which the trigger cannot tell
 * from no change. No override: nothing is written.
 */
export async function recordPaidPlan(db: Db, creatorId: string, planId: string, status: string | null): Promise<void> {
  try {
    await db.from(OVERRIDES_TABLE).update({ paid_plan_id: planId, paid_status: status }).eq("creator_id", creatorId).not("plan_id", "is", null)
  } catch {
    /* Before part 252, or a database hiccup: the trigger's record stands. */
  }
}

/** The plan a screen should show: the override when one is set, otherwise what billing says. */
export function effectivePlanId(paid: string | null | undefined, override: PlanOverride | null): string {
  return override?.planId ?? ((paid || "free").toLowerCase().trim() || "free")
}

export type SetOverrideResult =
  | { ok: true; from: string | null; to: string | null; paidPlanId: string | null }
  | { ok: false; status: number; error: string }

export const OVERRIDE_SQL_MISSING = "Assigning a plan needs SQL part 252 (supabase/sql/run-now/252_theme_marketplace_and_plan_overrides.sql) to run first."

/**
 * Set (planId) or clear (null) a creator's override, through the one SQL
 * function that writes the row and the creator's columns together. Server
 * only callers with the service role; the function is not granted to anyone
 * else.
 */
export async function setPlanOverride(db: Db, creatorId: string, planId: PlanId | null): Promise<SetOverrideResult> {
  if (!db.rpc) return { ok: false, status: 500, error: "No database." }
  try {
    const { data, error } = await db.rpc(SET_OVERRIDE_FN, { p_creator: creatorId, p_plan: planId })
    if (error) {
      const missing = error.code === "42883" || error.code === "PGRST202" || error.code === "42P01" || /does not exist|could not find the function/i.test(error.message ?? "")
      if (missing) return { ok: false, status: 503, error: OVERRIDE_SQL_MISSING }
      if (/no creator/i.test(error.message ?? "")) return { ok: false, status: 404, error: "No creator has this id." }
      return { ok: false, status: 500, error: "The plan did not change. Try again." }
    }
    const d = (data ?? {}) as { from?: string | null; to?: string | null; paid_plan_id?: string | null }
    return { ok: true, from: d.from ?? null, to: d.to ?? null, paidPlanId: d.paid_plan_id ?? null }
  } catch {
    return { ok: false, status: 500, error: "The plan did not change. Try again." }
  }
}
