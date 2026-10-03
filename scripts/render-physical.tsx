/**
 * The physical commerce screens, one per ?view=, for
 * scripts/check-physical-commerce.mjs: the buyer's checkout, the product
 * page's buy box, the buyer's order page, and the merchant's Shipping
 * settings, product cards, Inventory and order panel. The switch is on
 * (?off=1 turns it off); the probe's server answers every /api call.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { PhysicalCheckout } from "@/app/checkout/physical/physical-checkout"
import { PhysicalBuyBox } from "@/components/physical/buy-box"
import { ShippingSettings } from "@/components/physical/shipping-settings"
import { PhysicalProductCards, type PhysicalEditorHandle } from "@/components/physical/product-cards"
import { InventoryClient } from "@/app/app/inventory/inventory-client"
import { PhysicalOrderPanel } from "@/components/physical/order-panel"
import { OrderStatusView } from "@/app/checkout/physical/order/[token]/order-status-view"
import { CollectionsClient } from "@/app/app/collections/collections-client"
import { ArticleBody } from "@/components/help/help-parts"
import { helpArticle } from "@/lib/help/articles"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "checkout"
const SHOP = "0f3a9c2e-1111-2222-3333-444455556666"

function ProductCardsView() {
  const handle = React.useRef<PhysicalEditorHandle | null>(null)
  ;(window as unknown as { physicalHandle: typeof handle }).physicalHandle = handle
  return (
    <div className="mx-auto max-w-[760px] space-y-4 bg-[#f8f9fa] p-4">
      <PhysicalProductCards productId={params.get("product") || null} basePrice="25.00" handle={handle} onDirty={() => {}} images={["https://images.example/a.jpg"]} uploadImage={async () => "https://images.example/new.jpg"} />
    </div>
  )
}

function App() {
  switch (view) {
    case "buybox":
      return (
        <div className="mx-auto max-w-[420px] p-4">
          <PhysicalBuyBox productId={SHOP} />
        </div>
      )
    case "shipping":
      return (
        <div className="mx-auto max-w-[900px] bg-[#f8f9fa] p-4">
          <form onSubmit={(e) => { e.preventDefault(); (window as unknown as { submitted: number }).submitted = ((window as unknown as { submitted: number }).submitted || 0) + 1 }}>
            <ShippingSettings />
          </form>
        </div>
      )
    case "product":
      return <ProductCardsView />
    case "inventory":
      return (
        <div className="h-screen">
          <InventoryClient />
        </div>
      )
    case "collections":
      return (
        <div className="h-screen">
          <CollectionsClient />
        </div>
      )
    case "order":
      return (
        <div className="mx-auto max-w-[760px] bg-[#f8f9fa] p-4">
          <PhysicalOrderPanel orderRowId={params.get("pickup") ? "pickup" : SHOP} />
        </div>
      )
    case "help": {
      const a = helpArticle("physical-products", params.get("article") || "how-physical-products-work")
      return (
        <div className="mx-auto max-w-[760px] bg-white p-4 sm:p-8">
          <h1 className="text-[28px] font-bold">{a?.title}</h1>
          {a ? <ArticleBody blocks={a.body} /> : null}
        </div>
      )
    }
    case "status":
      return (
        <OrderStatusView
          token="tok_abcdefghijklmnopqrstuv"
          justPaid
          shop={{ name: "Linen & Co", avatar: null, email: "hello@linen.example" }}
          canReturn
          order={{
            id: SHOP,
            status: "paid",
            fulfillmentStatus: "partially_fulfilled",
            cancelled: false,
            createdAt: "2026-10-01T10:00:00Z",
            email: "mara@example.com",
            name: "Mara Lind",
            address: params.get("pickup") ? null : { name: "Mara Lind", line1: "Str. Lunga 5", city: "Cluj-Napoca", postalCode: "400001", country: "RO" },
            delivery: { name: "Standard", priceCents: 1500, minDays: 3, maxDays: 5 },
            pickup: params.get("pickup") ? { name: "Studio", address: ["Str 1", "Cluj, 400001", "Romania"], instructions: "Ring the bell at the side door.", ready: "Usually ready in 24 hours" } : null,
            processing: true,
            totals: { subtotal: 9000, discount: 900, shipping: 1500, tax: 0, taxIncluded: false, total: 9600, refunded: 0 },
            lines: [
              { orderId: "11111111-1111-4111-8111-111111111111", title: "Linen shirt", variantName: "M / Sand", imageUrl: null, quantity: 2, cents: 7200, type: "physical", receiptToken: null, returnable: 2 },
              { orderId: "22222222-2222-4222-8222-222222222222", title: "Sewing pattern PDF", variantName: null, imageUrl: null, quantity: 1, cents: 900, type: "digital", receiptToken: "rcpt_x", returnable: 1 },
            ],
            shipments: params.get("pickup") ? [] : [{ id: "s1", status: "in_transit", carrier: "DHL Express", trackingNumber: "1234567890", trackingUrl: "https://www.dhl.com/x", shippedAt: "2026-10-02T09:00:00Z", deliveredAt: null, items: [{ orderId: "11111111-1111-4111-8111-111111111111", quantity: 2 }] }],
            returns: [],
          }}
        />
      )
    default:
      return <PhysicalCheckout shopId={params.get("empty") ? null : SHOP} shopName="Linen & Co" shopAvatar={null} />
  }
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce={params.get("off") !== "1"}>
    <App />
  </PlatformSettingsProvider>,
)
