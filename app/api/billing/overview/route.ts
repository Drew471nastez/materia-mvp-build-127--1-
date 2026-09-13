import { NextResponse } from "next/server"

import { loadBillingOverview } from "@/lib/billing/overview"

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
  const overview = await loadBillingOverview()
  if (!overview) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  return NextResponse.json(overview, {
    /* Private and never cached: this is one person's invoices. */
    headers: { "Cache-Control": "private, no-store" },
  })
}
