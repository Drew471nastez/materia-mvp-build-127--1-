import { NextResponse } from "next/server"

import { loadBillingOverview } from "@/lib/billing/overview"
import { moneyCaller } from "@/lib/team/money"
import { withBillingRequest } from "@/lib/billing/request-reads"

/**
 * GET /api/billing/overview
 *
 * What the Billing tab draws itself from. It exists because billing used to
 * be a separate route: choosing it was a full navigation with a route-level
 * skeleton in front of it, and it came back wearing its own copy of the
 * settings tab bar — which is what made it read as somewhere else rather
 * than as one of the tabs.
 *
 * Now the tab switches instantly and this fills it in. The Stripe round trip
 * did not get faster; it stopped being in front of everything.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  /* The owner, or a team member who may see the store's plan (round 42, lib/team/money): the store's plan and invoices, never the member's own. */
  const who = await moneyCaller("billing", "view", { read: true })
  if (!who.ok) return who.response.status === 401 ? NextResponse.json({ error: "Not signed in" }, { status: 401 }) : who.response
  const canManage = who.isOwner || !!who.acting?.permissions.includes("billing_manage")
  /* The creator, its subscription row and its override are read once for this request and dropped with it (lib/billing/request-reads). */
  const overview = await withBillingRequest(() => loadBillingOverview({ creatorId: who.creatorId }))
  if (!overview) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  /* canManage: whether the tab shows the buttons that change the plan; the change routes ask again. */
  return NextResponse.json({ ...overview, canManage }, {
    /* Private and never cached: this is one person's invoices. */
    headers: { "Cache-Control": "private, no-store" },
  })
}
