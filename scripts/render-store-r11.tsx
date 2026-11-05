/**
 * Every checkout's real component for scripts/check-store-r11.mjs, `?case=`:
 *
 *   site, site-cod, physical, physical-cod, digital   as scripts/render-store23.tsx draws them
 *   free          the single product checkout of a free product (Get it free)
 *   membership    a membership's checkout
 */
import * as React from "react"
import CheckoutPageClient from "@/app/(storelib)/checkout/checkout-client"
import MembershipCheckout from "@/app/(storelib)/checkout/membership-checkout"
import { boot as boot23 } from "./render-store23"

export function boot(render: (el: React.ReactElement) => void) {
  const which = new URLSearchParams(location.search).get("case") || "site"
  const wrap = (el: React.ReactElement) => <div data-case={which}>{el}</div>
  const creator = { id: "c1", name: "Clay Studio", avatar_url: null, username: "claystudio" }
  if (which === "free") {
    render(
      wrap(
        <CheckoutPageClient
          product={{ id: "p1", title: "Glaze recipes, the whole notebook", slug: "glaze-notebook", description: null, price_cents: 0, thumbnail_url: null, type: "digital" }}
          creator={creator}
          userEmail={null}
          isLoggedIn={false}
        />,
      ),
    )
    return
  }
  if (which === "membership") {
    render(
      wrap(
        <MembershipCheckout
          product={{ id: "prod1", title: "Film photography club", slug: "film-club", thumbnail_url: null }}
          creator={creator}
          plan={{ monthlyPriceCents: 900, yearlyPriceCents: 9000, trialDays: 7, benefits: ["Monthly film reviews", "Member chat"] }}
          userEmail={null}
          isLoggedIn={false}
        />,
      ),
    )
    return
  }
  boot23(render)
}
