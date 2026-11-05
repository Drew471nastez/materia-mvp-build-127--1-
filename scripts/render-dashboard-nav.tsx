/**
 * ===========================================================================
 *  THE REAL DASHBOARD, INSIDE THE REAL /app SHELL, UNDER THE REAL BAR
 * ===========================================================================
 * scripts/render-app-mobile-nav mounts the bar over a page of plain cards,
 * and a plain page is exactly what could not reproduce "there is still a
 * solid background there": it has no nested scroller, no announcement bar,
 * no artwork, and every layer in it is the same colour.
 *
 * This is the page somebody is actually looking at when they say that: the
 * DashboardClient the route renders, inside the div/main/scroll-container
 * nesting app/(storelib)/app/layout.tsx builds around it, with the bar floating over the
 * bottom of it. Driven by scripts/check-dashboard-nav.mjs.
 */
import { createRoot } from "react-dom/client"
import { Component, createElement, type ReactNode } from "react"
import { DashboardClient } from "@/components/app/dashboard-client"
import { LanguageProvider } from "@/lib/i18n/context"
import { MobileNavPill } from "@/components/app/sidebar-mobile-nav"
import { DocumentScrollGuard } from "@/components/app/document-scroll-guard"
import { NAV_ICONS, NAV_ICONS_EXTRA } from "@/components/app/sidebar-desktop-nav"

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

/* The nesting app/(storelib)/app/layout.tsx builds, copied class for class. */
function Shell({ children }: { children: ReactNode }) {
  return createElement(
    "div",
    { className: "h-svh overflow-hidden bg-[#111111] app-no-scrollbar" },
    createElement(DocumentScrollGuard),
    createElement(
      "header",
      { className: "fixed left-0 right-0 top-0 z-50 bg-[#111111]", style: { height: "68px" } },
      createElement("div", { className: "flex h-[68px] items-center px-4" },
        createElement("span", { className: "text-[13px] font-medium text-white/90" }, "AndrewRullz")),
    ),
    createElement(
      "main",
      { className: "h-svh pt-[68px] bg-[#f8f9fa] rounded-t-[20px] overflow-hidden app-main-content" },
      createElement("div", { className: "h-[calc(100svh-68px)] overflow-y-auto app-content-scroll" }, children),
    ),
    createElement(MobileNavPill, {
      menuOpen: false,
      onToggleMenu: () => {},
      onCloseMenu: () => {},
      onNavigate: () => {},
      icons: {
        home: NAV_ICONS.dashboard,
        orders: NAV_ICONS.orders,
        products: NAV_ICONS.products,
        analytics: NAV_ICONS.analytics,
        settings: NAV_ICONS_EXTRA.settings,
      },
    }),
  )
}

createRoot(document.getElementById("app")!).render(
  createElement(Boundary, null, createElement(LanguageProvider, null, createElement(Shell, null, createElement(DashboardClient, {
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
  } as never)))),
)
;(window as unknown as { __ran?: boolean }).__ran = true
