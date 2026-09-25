/**
 * Home, the real DashboardClient, mounted with the account in one of a few
 * states, for scripts/check-home-banner.mjs and scripts/check-home-scroll.mjs.
 *
 *   ?state=new        signed up, nothing else
 *   ?state=product    a product, no payouts
 *   ?state=payouts    a product and payouts, no website, no sale
 *   ?state=firstsale  the first sale yesterday, website live, Free
 *   ?state=selling    forty sales in 30 days on Free, website live, no domain
 *   ?state=pro        Pro, everything done, a domain, automations, subscribers
 *
 * `&subs=N` and `&flows=N` are what the database answers for subscribers and
 * active automations (the Supabase stub in the probes reads them).
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
const state = params.get("state") || "selling"
const DAY = 86_400_000

type Fixture = {
  product: boolean
  payouts: boolean
  site: boolean
  domain: boolean
  plan: string
  /** Days ago, one sale each, at this price. */
  sales: number[]
  price: number
}

const FIXTURES: Record<string, Fixture> = {
  new: { product: false, payouts: false, site: false, domain: false, plan: "free", sales: [], price: 0 },
  product: { product: true, payouts: false, site: false, domain: false, plan: "free", sales: [], price: 0 },
  payouts: { product: true, payouts: true, site: false, domain: false, plan: "free", sales: [], price: 0 },
  firstsale: { product: true, payouts: true, site: true, domain: false, plan: "free", sales: [1], price: 2900 },
  selling: { product: true, payouts: true, site: true, domain: false, plan: "free", sales: Array.from({ length: 40 }, (_, i) => 1 + (i % 29) + i / 40), price: 4500 },
  pro: { product: true, payouts: true, site: true, domain: true, plan: "growth", sales: Array.from({ length: 30 }, (_, i) => 2 + i * 3), price: 3900 },
}
const f = FIXTURES[state] ?? FIXTURES.selling

const orders = f.sales.map((days, i) => ({
  id: `order-${i}`,
  product_id: "product-0",
  amount_cents: f.price,
  status: "completed",
  created_at: new Date(Date.now() - days * DAY).toISOString(),
  stripe_session_id: `cs_${i}`,
  refund_amount_cents: 0,
}))

createRoot(document.getElementById("app")!).render(
  createElement(Boundary, null, createElement(LanguageProvider, null, createElement(DashboardClient, {
    creatorId: "00000000-0000-4000-8000-000000000000",
    displayName: "Andrew",
    initialSetupSteps: [
      { id: "welcome", title: "Welcome", description: "", tooltip: "", completed: true, href: "/app/settings" },
      { id: "branding", title: "Branding", description: "", tooltip: "", completed: f.product, href: "/app/settings" },
      { id: "product", title: "Product", description: "", tooltip: "", completed: f.product, href: "/app/products/new" },
      { id: "payouts", title: "Payouts", description: "", tooltip: "", completed: f.payouts, href: "/app/payouts" },
      { id: "onepage", title: "OnePage", description: "", tooltip: "", completed: f.product, href: "/app/onepage" },
      { id: "sale", title: "Sale", description: "", tooltip: "", completed: f.sales.length > 0, href: "/app/orders" },
    ],
    productIds: f.product ? ["product-0", "product-1"] : [],
    initialOrders: orders,
    creatorHandle: "andrewrullz",
    connectedDomain: f.domain ? "andrewrullz.com" : null,
    websiteDomain: f.domain ? "andrewrullz.com" : null,
    websitePublished: f.site,
    subscriptionPlanId: params.get("plan") || f.plan,
    sharePlatforms: [],
    onePageLive: f.product,
  } as never))),
)
;(window as unknown as { __ran?: boolean }).__ran = true
