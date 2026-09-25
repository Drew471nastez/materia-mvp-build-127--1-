/**
 * Home with its three cards under the banner and the globe in it, for
 * scripts/check-home-cards.mjs. `?plan=growth` renders a Pro account and
 * `?fresh=1` one that has done nothing yet but sign up.
 */
import { createRoot } from "react-dom/client"
import { Component, createElement, type ReactNode } from "react"
import { DashboardClient } from "@/components/app/dashboard-client"
import { LanguageProvider } from "@/lib/i18n/context"

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    ;(window as unknown as { __threw?: string }).__threw = `${error.name}: ${error.message}`
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

const params = new URLSearchParams(location.search)
const fresh = params.get("fresh") === "1"
const orders = fresh
  ? []
  : Array.from({ length: 6 }, (_, i) => ({
      id: `order-${i}`,
      product_id: "product-0",
      amount_cents: 2900,
      status: "paid",
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      stripe_session_id: `cs_${i}`,
      refund_amount_cents: 0,
    }))

createRoot(document.getElementById("app")!).render(
  createElement(Boundary, null, createElement(LanguageProvider, null, createElement(DashboardClient, {
    creatorId: "00000000-0000-4000-8000-000000000000",
    displayName: "Andrew",
    initialSetupSteps: [
      { id: "welcome", title: "Welcome", description: "", tooltip: "", completed: true, href: "/app/settings" },
      { id: "branding", title: "Branding", description: "", tooltip: "", completed: !fresh, href: "/app/settings" },
      { id: "product", title: "Product", description: "", tooltip: "", completed: !fresh, href: "/app/products/new" },
      { id: "payouts", title: "Payouts", description: "", tooltip: "", completed: false, href: "/app/payouts" },
      { id: "onepage", title: "OnePage", description: "", tooltip: "", completed: !fresh, href: "/app/onepage" },
      { id: "sale", title: "Sale", description: "", tooltip: "", completed: !fresh, href: "/app/orders" },
    ],
    productIds: fresh ? [] : ["product-0"],
    initialOrders: orders,
    creatorHandle: "andrewrullz",
    connectedDomain: null,
    websitePublished: false,
    subscriptionPlanId: params.get("plan") || "free",
    sharePlatforms: [],
  } as never))),
)
;(window as unknown as { __ran?: boolean }).__ran = true
