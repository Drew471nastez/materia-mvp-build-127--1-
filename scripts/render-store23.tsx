/**
 * Round 23, S23: the real checkout, receipt, order page and Store details
 * components for scripts/check-store23.mjs, with the routes they call
 * answered as the real routes answer. `?case=` picks one:
 *
 *   site-gate       the website's own checkout (custom domains, imported Shopify themes) while the store requires sign in
 *   site            the same checkout with Customer information all Required, the news box, and VAT 19% on top
 *   physical-gate   Storelib's cart checkout, signed out, sign in required
 *   physical        the cart checkout's form with the store's fields and its tax by name
 *   digital         the single product checkout with VAT 19% for a buyer in Romania
 *   receipt         the receipt page: the store's name and logo, its business details, VAT 19%
 *   order           the physical order page: date, VAT 19%, currency, Sold by
 *   store           Settings › Store details with Business details filled in
 */
import * as React from "react"
import CheckoutPageClient from "@/app/checkout/checkout-client"
import { SiteCheckout } from "@/app/checkout/site/site-checkout"
import { PhysicalCheckout } from "@/app/checkout/physical/physical-checkout"
import { ReceiptView } from "@/app/receipt/[token]/receipt-view"
import { OrderStatusView } from "@/app/checkout/physical/order/[token]/order-status-view"
import { StoreDetailsPanel } from "@/components/app/settings/store-details-panel"
import { checkoutConfig } from "@/lib/store/checkout-config"
import { encodeItems } from "@/lib/physical/cart-link"
import type { SiteQuote } from "@/lib/checkout/site-quote-server"

declare global {
  interface Window {
    __calls?: { url: string; body: unknown }[]
  }
}

const SHOP = "c0000000-0000-4000-8000-000000000001"
const MUG = "a0000000-0000-4000-8000-0000000000a1"
const STRICT = checkoutConfig({ nameFields: "first_and_last", company: "required", phone: "required", address2: "required", marketingOptIn: true })

const quote: SiteQuote = {
  kind: "ships",
  creatorId: SHOP,
  lines: [{ productId: MUG, variantId: null, title: "Stoneware mug", variantName: null, imageUrl: null, type: "physical", quantity: 2, unitCents: 2000, discountCents: 0, requiresShipping: true }],
  dropped: [],
  stockIssues: [],
  requiresShipping: true,
  coupon: null,
  couponError: null,
  delivery: { ok: true, options: [{ id: "r1", name: "Standard", priceCents: 500, estimate: "3 to 5 business days" }], selectedId: "r1", needsCountry: false },
  pickups: [],
  totals: { itemsSubtotalCents: 4000, discountCents: 0, shippingCents: 500, shippingDiscountCents: 0, taxCents: 760, taxIncluded: false, totalCents: 5260, taxLabel: "VAT 19%" },
}

const settings = {
  settings: {
    storeName: "Bread Studio",
    phone: "+40 721 234 567",
    phoneCountry: "RO",
    defaultCountry: "RO",
    checkout: STRICT,
    defaultSalesChannelId: null,
    logoUrl: null,
    legal: { company: "Bread Studio SRL", taxId: "RO12345678", country: "RO", line1: "Strada Lungă 4", line2: "", city: "Cluj-Napoca", postalCode: "400001", region: "Cluj" },
    ready: true,
  },
  detectedCountry: "RO",
  supportEmail: "hello@bread.studio",
  suggested: { storeName: "Ana Pop", contactEmail: "ana@example.com" },
  logoDefault: null,
}

function stubFetch() {
  const calls: { url: string; body: unknown }[] = (window.__calls = [])
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    let body: unknown = null
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null
    } catch {
      body = String(init?.body)
    }
    calls.push({ url, body })
    if (url.startsWith("/api/checkout/site")) return json(quote)
    if (url.startsWith("/api/physical/checkout/quote")) return json(quote)
    if (url.startsWith("/api/store/settings")) return json(settings)
    if (url.startsWith("/api/physical/settings")) return json({ settings: { defaultLocationId: null }, locations: [] })
    return json({})
  }) as typeof fetch
}

const brand = { name: "Bread Studio", imageUrl: null, kind: null } as never

export function boot(render: (el: React.ReactElement) => void) {
  stubFetch()
  const which = new URLSearchParams(location.search).get("case") || "site"
  const wrap = (el: React.ReactElement) => <div data-case={which}>{el}</div>
  if (which === "site-gate" || which === "site") {
    const gate = which === "site-gate"
    render(
      wrap(
        <SiteCheckout
          shopId={SHOP}
          brand={brand}
          shopUrl="https://bread.studio/"
          backTo="https://bread.studio/cart"
          items={[{ productId: MUG, variantId: null, quantity: 2 }]}
          wholeCart
          couponCode={null}
          initialQuote={quote}
          initialError={null}
          config={gate ? checkoutConfig({ requireAccount: true }) : STRICT}
          buyer={null}
          lockedEmail={null}
          needsSignIn={gate}
        />,
      ),
    )
    return
  }
  if (which === "physical-gate" || which === "physical") {
    if (!location.search.includes("items=")) history.replaceState(null, "", `${location.pathname}?case=${which}&shop=${SHOP}&items=${encodeItems([{ productId: MUG, variantId: null, quantity: 2 }])}`)
    const gate = which === "physical-gate"
    render(wrap(<PhysicalCheckout shopId={SHOP} shopName="Bread Studio" brand={brand} config={gate ? checkoutConfig({ requireAccount: true }) : STRICT} buyer={gate ? { signedIn: false, confirmed: false } : { signedIn: true, confirmed: true }} />))
    return
  }
  if (which === "digital") {
    render(
      wrap(
        <CheckoutPageClient
          product={{ id: "p1", title: "The bread baking course", slug: "bread", description: null, price_cents: 4900, thumbnail_url: null, type: "course" }}
          creator={{ id: SHOP, name: "Bread Studio", avatar_url: null, username: "bread" }}
          userEmail={null}
          isLoggedIn={false}
          checkoutConfig={checkoutConfig({ marketingOptIn: true })}
          checkoutTax={{ included: false, regions: [{ id: "r-ro", country: "RO", rateBps: 1900, name: "VAT" }, { id: "r-de", country: "DE", rateBps: 1900, name: "MwSt." }], overrides: [], country: "RO" }}
        />,
      ),
    )
    return
  }
  if (which === "receipt") {
    render(
      wrap(
        <ReceiptView
          locale="en-US"
          viewer={{ signedIn: false, isBuyer: false }}
          receipt={{
            number: "1042",
            createdAt: "2026-10-11T10:00:00Z",
            currency: "usd",
            state: "open",
            items: [{ orderId: "o1", productId: "p1", title: "The bread baking course", slug: "bread", thumbnailUrl: null, type: "course", variantName: null, state: "open", subtotalCents: 4900, tipCents: 0, totalCents: 5831, refundedCents: 0, refundedAt: null, files: [], courseHref: null }] as never,
            subtotalCents: 4900,
            tipCents: 0,
            totalCents: 5831,
            refundedCents: 0,
            taxCents: 931,
            taxIncluded: false,
            taxLabel: "VAT 19%",
            payment: { method: "card", brand: "visa", last4: "4242" },
            seller: { name: "Bread Studio", username: "bread", avatarUrl: null, supportEmail: "hello@bread.studio", legal: { name: "Bread Studio SRL", lines: ["Strada Lungă 4", "400001 Cluj-Napoca", "Cluj", "Romania"], taxId: "RO12345678", taxIdLabel: "VAT number" } },
            buyer: { firstName: "Maria", maskedEmail: "m***@example.com", email: "sent", unclaimed: true },
            primary: { orderId: "o1", token: "rt_" + "a".repeat(40) },
            invoice: true,
          }}
        />,
      ),
    )
    return
  }
  if (which === "order") {
    render(
      wrap(
        <OrderStatusView
          token={"t".repeat(30)}
          justPaid={false}
          canReturn={false}
          shop={{ name: "Bread Studio", avatar: null, email: "hello@bread.studio", phone: "+40 721 234 567", websiteUrl: "https://bread.studio", legal: { name: "Bread Studio SRL", lines: ["Strada Lungă 4", "400001 Cluj-Napoca", "Romania"], taxId: "RO12345678", taxIdLabel: "VAT number" } }}
          order={{
            id: "a0000000-0000-4000-8000-000000001042",
            status: "paid",
            fulfillmentStatus: "unfulfilled",
            cancelled: false,
            createdAt: "2026-10-11T10:00:00Z",
            email: "maria@example.com",
            name: "Maria Ionescu",
            address: { name: "Maria Ionescu", line1: "Bd. Eroilor 1", city: "Cluj-Napoca", postalCode: "400129", country: "RO" },
            delivery: { name: "Standard", priceCents: 500, minDays: 3, maxDays: 5 },
            pickup: null,
            processing: false,
            totals: { subtotal: 4000, discount: 0, shipping: 500, tax: 760, taxIncluded: false, taxLabel: "VAT 19%", total: 5260, refunded: 0, currency: "RON" },
            lines: [{ orderId: "o1", title: "Stoneware mug", variantName: null, imageUrl: null, quantity: 2, cents: 4000, type: "physical", receiptToken: null, returnable: 0 }],
            shipments: [],
            returns: [],
          }}
        />,
      ),
    )
    return
  }
  render(
    wrap(
      <div className="mx-auto max-w-[760px] bg-[#f8f9fa] p-4 sm:p-6">
        <StoreDetailsPanel />
      </div>,
    ),
  )
}
