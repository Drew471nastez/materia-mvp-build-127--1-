import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { loadActiveFeeConfig } from "@/lib/payments/fees/active"
import { batchSimulate, simulatePayment, type RefundScenario, type SimulationKind } from "@/lib/payments/fees/simulate"
import type { StorelibSellerPlan } from "@/lib/payments/fees/types"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body." }, { status: 400, headers: NO_STORE })
    }

    const db = createAdminClient()
    const { config } = await loadActiveFeeConfig(db)

    if (body.mode === "batch") {
      const plan: StorelibSellerPlan = body.plan === "paid" ? "paid" : "free"
      const rows = batchSimulate({
        startMinor: Number(body.startMinor),
        endMinor: Number(body.endMinor),
        incrementMinor: Number(body.incrementMinor),
        currency: String(body.currency || "USD"),
        sellerPlan: plan,
        config,
        safetyEffectivePercent: body.safetyEffectivePercent != null ? Number(body.safetyEffectivePercent) : undefined,
      })
      return NextResponse.json({ simulationOnly: true, rows }, { headers: NO_STORE })
    }

    const plan: StorelibSellerPlan = body.plan === "paid" || body.plan === "pro" ? "paid" : "free"
    const kind: SimulationKind = body.kind === "subscription" ? "subscription" : "one_time"
    const refund: RefundScenario =
      body.refund === "full" || body.refund === "partial" ? body.refund : "none"

    const result = simulatePayment({
      sellerPlan: plan,
      grossMinor: Math.floor(Number(body.grossMinor)),
      currency: String(body.currency || "USD"),
      kind,
      refund,
      partialRefundMinor: body.partialRefundMinor != null ? Math.floor(Number(body.partialRefundMinor)) : undefined,
      config,
    })

    return NextResponse.json(result, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments simulate", e, "Simulation failed.")
  }
}
