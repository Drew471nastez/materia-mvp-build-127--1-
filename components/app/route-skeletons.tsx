"use client"

import AppDashboardLoading from "@/app/app/dashboard-skeleton"
import AnalyticsLoading from "@/app/app/analytics/skeleton"
import CouponsLoading from "@/app/app/coupons/skeleton"
import CreateCouponLoading from "@/app/app/coupons/new/skeleton"
import OrdersLoading from "@/app/app/orders/sales/skeleton"
import PayoutsLoading from "@/app/app/payouts/skeleton"
import SettingsLoading from "@/app/app/settings/skeleton"
import WebsiteBuilderLoading from "@/app/app/website-builder/skeleton"

/**
 * ===========================================================================
 *  THE OUTLINE OF THE PAGE BEING OPENED
 * ===========================================================================
 * These used to be each route's loading.tsx, and a loading.tsx is a Suspense
 * boundary Next.js swaps in the instant a navigation starts: the page you were
 * on was gone on the first frame, replaced by an invisible skeleton that
 * faded in 200ms later, on every click whose page was not already cached.
 * That is the skeleton on normal navigation the owner asked to be rid of.
 *
 * Now the page you were on stays until the next one is ready, and these are
 * drawn over it by the shell only when that has taken more than a second
 * (components/app/app-stage.tsx). Same shapes at the same sizes as before, so
 * the real page still lands where its outline was.
 *
 * Products keeps its own loading.tsx, which is looked after with that page.
 */
export function RouteSkeleton({ href }: { href: string }) {
  const url = new URL(href, "https://storelib.invalid")
  const path = url.pathname.replace(/\/+$/, "") || "/"
  if (path === "/app") return <AppDashboardLoading />
  if (path === "/app/orders" || path === "/app/orders/sales") return <OrdersLoading order={url.searchParams.get("order")} />
  if (path.startsWith("/app/orders/")) return <OrdersLoading order="pending" />
  if (path.startsWith("/app/analytics")) return <AnalyticsLoading />
  if (path === "/app/coupons/new") return <CreateCouponLoading />
  if (path.startsWith("/app/coupons")) return <CouponsLoading />
  if (path.startsWith("/app/payouts")) return <PayoutsLoading />
  if (path === "/app/settings" || path === "/app/settings/payments") return <SettingsLoading />
  if (path === "/app/website-builder") return <WebsiteBuilderLoading />
  return <PageOutline />
}

/** Any other /app page: its title, and the first card under it. */
function PageOutline() {
  return (
    <div className="h-full overflow-hidden bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="h-[28px] w-36 rounded-md bg-[#e9ebee] sm:h-[32px]" />
        <div className="mt-2.5 h-4 w-56 rounded bg-[#eef0f3]" />
        <div className="mt-6 h-[320px] rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
      </div>
    </div>
  )
}
