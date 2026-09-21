/**
 * The creator dashboard, mounted at phone size with a realistic amount of
 * data, so a browser can scroll it and say where the frames go. Bundled and
 * driven by scripts/check-dashboard-scroll.mjs.
 */
import { createRoot } from "react-dom/client"
import { Component, createElement, type ReactNode } from "react"
import { DashboardClient } from "@/components/app/dashboard-client"
import { LanguageProvider } from "@/lib/i18n/context"

/* Enough orders that the lists below the chart are not empty, which is the
   part of the page somebody scrolls to. */
const orders = Array.from({ length: 24 }, (_, i) => ({
  id: `order-${i}`,
  created_at: new Date(Date.now() - i * 86400000).toISOString(),
  total_cents: 1900 + i * 100,
  status: "paid",
  product_title: `A product with a reasonably long name ${i}`,
  buyer_email: `buyer${i}@example.com`,
}))

/*
  A render error on file:// reaches window.onerror as "Script error." and
  nothing else, so the probe would report a page that mounted and was simply
  short. This says what actually threw.
*/
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    const w = window as unknown as { __threw?: string }
    w.__threw = `${error.name}: ${error.message}`
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

createRoot(document.getElementById("app")!).render(
  createElement(Boundary, null, createElement(LanguageProvider, null, createElement(DashboardClient, {
    creatorId: "00000000-0000-4000-8000-000000000000",
    displayName: "AndrewRullz",
    /* The same five the page builds, because the setup card's height and the
       progress ring both come off this list. */
    initialSetupSteps: [
      { id: "welcome", title: "Welcome", description: "Account created", tooltip: "", completed: true, href: "/app/settings" },
      { id: "branding", title: "Branding", description: "Set your name, image, and bio", tooltip: "", completed: true, href: "/app/settings" },
      { id: "product", title: "Product", description: "Add your first product", tooltip: "", completed: true, href: "/app/products" },
      { id: "payouts", title: "Payouts", description: "Connect a payout account", tooltip: "", completed: false, href: "/app/payouts" },
      { id: "share", title: "Share", description: "Share your page", tooltip: "", completed: false, href: "/app" },
    ],
    productIds: Array.from({ length: 12 }, (_, i) => `product-${i}`),
    initialOrders: orders,
    initialTotalOrders: orders.length,
    initialTotalRevenue: 48900,
    creatorHandle: "andrewrullz",
    connectedDomain: null,
    brandingDetail: null,
    websitePublished: true,
    subscriptionPlanId: "free",
  } as never))),
)
;(window as unknown as { __ran?: boolean }).__ran = true
