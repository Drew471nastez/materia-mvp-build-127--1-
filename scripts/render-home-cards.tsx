/**
 * Home with its three cards under the banner and the globe in it, for
 * scripts/check-home-cards.mjs and scripts/check-home-flow.mjs. The account's
 * facts are lib/home/progress's own shape:
 *
 *   (none)          a Free store with a product and six sales: 3 of 7 done
 *   ?plan=growth    the same on Pro: 3 of 7 (the plan is not a step)
 *   ?fresh=1        one that has done nothing yet but sign up: 1 of 7
 *   ?all=1          every step done, so the card shows the challenges
 *   ?handle=x       the creator's handle, for the address pill
 */
import { createRoot } from "react-dom/client"
import { Component, createElement, type ReactNode } from "react"
import { DashboardClient } from "@/components/app/dashboard-client"
import { LanguageProvider } from "@/lib/i18n/context"
import { NO_FACTS, salesFrom, type ProgressFacts } from "@/lib/home/progress"

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
const all = params.get("all") === "1"
const plan = params.get("plan") || (all ? "growth" : "free")
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

const facts: ProgressFacts = fresh
  ? NO_FACTS
  : {
      ...NO_FACTS,
      products: all ? 3 : 1,
      publishedProducts: all ? 2 : 1,
      /* The six orders above, counted: Home reads its sales from the facts, not the rows (lib/home/progress). */
      ...salesFrom(orders as never),
      paymentsReady: all,
      websiteLive: all,
      domainConnected: all,
      guideOpened: all,
      pro: plan === "growth" || plan === "pro",
      subscribers: all ? 12 : 0,
      automationsOn: all ? 1 : 0,
    }

createRoot(document.getElementById("app")!).render(
  createElement(Boundary, null, createElement(LanguageProvider, null, createElement(DashboardClient, {
    creatorId: "00000000-0000-4000-8000-000000000000",
    displayName: "Andrew",
    initialProgress: facts,
    productIds: fresh ? [] : ["product-0"],
    initialOrders: orders,
    creatorHandle: params.get("handle") || "andrewrullz",
    connectedDomain: null,
    websitePublished: all,
    subscriptionPlanId: plan,
  } as never))),
)
;(window as unknown as { __ran?: boolean }).__ran = true
