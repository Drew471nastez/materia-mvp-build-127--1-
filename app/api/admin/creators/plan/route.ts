import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { UUID_RE } from "@/lib/admin/platform-metrics"
import { ASSIGNABLE_PLANS, OVERRIDES_TABLE, isAssignablePlan, readPlanOverride, setPlanOverride } from "@/lib/billing/plan-override"
import { planDisplayName } from "@/lib/billing/plans"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * ===========================================================================
 *  GET  /api/admin/creators/plan?id=…   the plan, and any plan set from here
 *  POST /api/admin/creators/plan        { creatorId, plan: "free" | "growth" | "pro" | null }
 * ===========================================================================
 * The owner: "for each creator I can assign the kind of plan I want for him".
 * A plan set here is an override (lib/billing/plan-override.ts): written in
 * one transaction into the columns every plan check reads, with their paid
 * plan kept beside it, and never sent to Stripe. `null` clears it and puts
 * the paid plan back. Each change is written to the audit log with the plan
 * before and after.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const id = new URL(req.url).searchParams.get("id") ?? ""
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "No creator has this id." }, { status: 400, headers: NO_STORE })

  const admin = createAdminClient()
  const { data: creator, error } = await admin.from("creators").select("id, subscription_plan_id, subscription_status").eq("id", id).maybeSingle()
  if (error) return adminFailure("creator plan read", error, "The plan could not be read.")
  if (!creator) return NextResponse.json({ error: "No creator has this id." }, { status: 404, headers: NO_STORE })

  /* Whether part 252 has run: the table answers, even with no row. */
  const probe = await admin.from(OVERRIDES_TABLE).select("creator_id").limit(1)
  const override = await readPlanOverride(admin, id)
  return NextResponse.json(
    {
      plan: creator.subscription_plan_id || "free",
      status: creator.subscription_status || "active",
      override,
      available: !probe.error,
      plans: ASSIGNABLE_PLANS,
    },
    { headers: NO_STORE },
  )
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as { creatorId?: unknown; plan?: unknown } | null
  const creatorId = typeof body?.creatorId === "string" ? body.creatorId : ""
  if (!UUID_RE.test(creatorId)) return NextResponse.json({ error: "No creator has this id." }, { status: 400, headers: NO_STORE })
  const plan = body?.plan === null ? null : body?.plan
  if (plan !== null && !isAssignablePlan(plan)) return NextResponse.json({ error: "Choose Free, Grow or Pro." }, { status: 400, headers: NO_STORE })

  const admin = createAdminClient()
  const done = await setPlanOverride(admin, creatorId, plan)
  if (done.ok === false) {
    const failed = done as { status: number; error: string }
    return NextResponse.json({ error: failed.error }, { status: failed.status, headers: NO_STORE })
  }
  const result = done as { from: string | null; to: string | null; paidPlanId: string | null }

  const recorded = await recordAdminAction(admin, {
    action: plan === null ? "plan_override_cleared" : "plan_override_set",
    targetType: "creator",
    targetId: creatorId,
    detail: { from: result.from, to: result.to ?? result.paidPlanId ?? "free", paid_plan: result.paidPlanId, override: plan },
  })

  /* The Storelib badge on their website follows the plan: their pages are drawn again on the next visit. */
  await revalidatePublishedSite(creatorId).catch(() => undefined)

  const now = plan ?? result.paidPlanId ?? "free"
  return NextResponse.json(
    {
      ok: true,
      plan: now,
      override: plan,
      message: plan === null ? `Back to their paid plan, ${planDisplayName(now)}.` : `Now on ${planDisplayName(plan)}. Their Stripe subscription is unchanged.`,
      recorded,
    },
    { headers: NO_STORE },
  )
}
