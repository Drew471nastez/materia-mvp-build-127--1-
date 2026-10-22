/**
 * The checkout page (app/checkout/checkout-client.tsx) for scripts/check-checkout-page.mjs:
 * the real component with a fixture product and creator, Next's router and
 * links stood in for. Served by the probe at a storelib.com address so the
 * live Stripe.js draws its real fields into it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import CheckoutPageClient from "@/app/checkout/checkout-client"
import { checkoutConfig } from "@/lib/store/checkout-config"

createRoot(document.getElementById("app")!).render(
  <CheckoutPageClient
    product={{
      id: "2bfe1ed7-0769-4ff0-a4a4-efb90f13e897",
      title: "SEO + GEO/AEO Content Guide for Product Brands",
      slug: "seo-geo-aeo-content-guide",
      description: null,
      price_cents: 999900,
      thumbnail_url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/product-images/31672c1b-0b7f-4ed9-af8f-f48c980bdf37/temp/1790331718087_cover-the-buyer-question-playbook.png",
      type: "digital",
    }}
    creator={{ id: "c1", name: "Luca Dragoste", avatar_url: null, username: "lucadragoste" }}
    userEmail={null}
    isLoggedIn={false}
    /* The store offers company invoices (Settings › Checkout, off by default): the probe measures "Buying for a business". */
    checkoutConfig={checkoutConfig({ businessInvoice: true })}
  />,
)
