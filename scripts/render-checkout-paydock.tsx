/**
 * The checkout for scripts/check-checkout-paydock.mjs: the real page on the Airwallex path, whose card is entered on the
 * next page, so nothing here waits on Stripe's network.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import CheckoutPageClient from "@/app/checkout/checkout-client"

createRoot(document.getElementById("app")!).render(
  <CheckoutPageClient
    product={{ id: "p1", title: "Glaze recipes, the whole notebook", slug: "glaze-notebook", description: null, price_cents: 2900, thumbnail_url: null, type: "digital" }}
    creator={{ id: "c1", name: "Clay Studio", avatar_url: null, username: "claystudio" }}
    userEmail={null}
    isLoggedIn={false}
    paymentProvider="airwallex"
  />,
)
