/**
 * The plans page as the route draws it: the real layout (a layer over the
 * whole shell) around the real client, over a shell shaped like /app with its
 * header and nav pill, so the probe can see what is covered and what is not.
 * `?history=1` stands for "there is an /app page behind this one".
 */
import React from "react"
import { createRoot } from "react-dom/client"

import UpgradeLayout from "@/app/(storelib)/app/settings/billing/upgrade/layout"
import { UpgradePageClient } from "@/components/app/billing/upgrade-page-client"
import { markLanded } from "@/lib/ui/app-navigation"

if (new URLSearchParams(location.search).has("history")) markLanded()

const plans = [
  { id: "free", name: "Free", price_cents: 0, billing_period: null },
  { id: "growth", name: "Growth", price_cents: 2990, billing_period: "month" },
  { id: "pro", name: "Pro", price_cents: 9900, billing_period: "month" },
]

createRoot(document.getElementById("app")!).render(
  <div className="h-svh overflow-hidden bg-[#111111]">
    <header data-shell-header="" className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
    <div data-app-nav-pill="" className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center md:hidden">
      <button data-pill-tab="" className="pointer-events-auto mb-4 h-14 w-64 rounded-full bg-black" />
    </div>
    <main className="h-svh overflow-hidden bg-[#f8f9fa] pt-[68px] md:pl-[240px] md:pt-[58px]">
      <div className="app-content-scroll h-full overflow-y-auto">
        <UpgradeLayout>
          <UpgradePageClient plans={plans} currentPlanId="free" hasActiveSubscription={false} />
        </UpgradeLayout>
      </div>
    </main>
  </div>,
)
