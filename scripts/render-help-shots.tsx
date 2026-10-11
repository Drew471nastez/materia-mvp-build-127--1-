/**
 * Help Center screenshots: the real components with made up demo data
 * (a ceramics studio called Fern & Clay). `?view=` picks a screen; every
 * /api request is answered here from the demo data.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { ShippingSettings } from "@/components/physical/shipping-settings"
import { PhysicalProductCards, type PhysicalEditorHandle } from "@/components/physical/product-cards"
import { PhysicalOrderPanel } from "@/components/physical/order-panel"
import { InventoryClient } from "@/app/app/inventory/inventory-client"
import { PhysicalCheckout } from "@/app/checkout/physical/physical-checkout"
import { PhysicalBuyBox } from "@/components/physical/buy-box"
import { OrderStatusView } from "@/app/checkout/physical/order/[token]/order-status-view"
import { TaxesPanel } from "@/components/app/settings/taxes-panel"
import { CheckoutPanel } from "@/components/app/settings/checkout-panel"
import { ChannelsPanel } from "@/components/app/settings/channels-panel"
import { CustomerEmailsPanel } from "@/components/app/settings/customer-emails-panel"
import { ReasonsPanel } from "@/components/app/settings/reasons-panel"
import { KindList } from "@/app/app/products/new/kind-chooser"
import { PayoutsDemo } from "@/components/app/payouts-demo/payouts-demo"
import { OffersClient } from "@/app/app/offers/offers-client"
import { ProjectSettings } from "@/components/website-builder/project-settings"
import type { SettingsSection } from "@/components/website-builder/website-settings/types"
import { SiteCheckout } from "@/app/checkout/site/site-checkout"
import { checkoutConfig } from "@/lib/store/checkout-config"
import { StoreDetailsPanel } from "@/components/app/settings/store-details-panel"
import { IntegrationsDirectory } from "@/components/app/settings/integrations-directory"
import { shipmentEmail } from "@/lib/physical/email-templates"
import { lowStockEmail } from "@/lib/notify/seller-commerce"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "delivery"

/* ── Demo data ─────────────────────────────────────────────────────────── */

const PRODUCT = "0f3a9c2e-1111-4222-8333-444455556666"
const V = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const LOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LOC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

/** A plain product picture: a mug or a bowl on a warm background. */
function pic(kind: "mug" | "bowl" | "apron", bg: string, ink: string) {
  const shape =
    kind === "mug"
      ? `<rect x="230" y="200" width="260" height="300" rx="34" fill="${ink}"/><path d="M490 270 h40 a60 60 0 0 1 0 120 h-40" fill="none" stroke="${ink}" stroke-width="34"/><ellipse cx="360" cy="205" rx="130" ry="22" fill="#00000022"/>`
      : kind === "bowl"
        ? `<path d="M170 300 h380 a190 170 0 0 1 -380 0z" fill="${ink}"/><ellipse cx="360" cy="300" rx="190" ry="34" fill="#00000026"/>`
        : `<path d="M280 160 h160 l30 120 l40 300 h-300 l40 -300z" fill="${ink}"/><rect x="300" y="330" width="120" height="80" rx="10" fill="#ffffff33"/>`
  return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720"><rect width="720" height="720" fill="${bg}"/>${shape}</svg>`)
}
const MUG_SAND = pic("mug", "#efe6da", "#c9b49a")
const MUG_MOSS = pic("mug", "#e7ebe1", "#7f8f6a")
const BOWL = pic("bowl", "#ece7e1", "#a7988a")
const APRON = pic("apron", "#e9e6e1", "#4b5563")

const location1 = { id: LOC, name: "Studio", kind: "home", country: "US", city: "Portland", addressLine1: "120 Alder Street", addressLine2: null, region: "OR", postalCode: "97204", phone: null, email: null, active: true, fulfillsOrders: true, holdsInventory: true, priority: 0, forwarding: "none", pickupEnabled: true, pickupInstructions: "Ring the bell at the side door. Open Tuesday to Saturday, 10am to 5pm.", pickupReady: "24h" }
/* The location Printful made when it was connected (lib/integrations/fulfilment/forward-server.ts ensureProviderLocation). */
const location3 = { id: "loc-printful", name: "Printful", kind: "print_on_demand", country: null, city: null, addressLine1: null, addressLine2: null, region: null, postalCode: null, phone: null, email: null, active: true, fulfillsOrders: true, holdsInventory: false, priority: 2, forwarding: "provider", pickupEnabled: false, pickupInstructions: null, pickupReady: "24h", partner: { provider: "printful", name: "Printful", connected: true } }
const location2 = { id: LOC2, name: "Print partner", kind: "print_on_demand", country: "US", city: null, addressLine1: null, addressLine2: null, region: null, postalCode: null, phone: null, email: "orders@printpartner.example", active: true, fulfillsOrders: true, holdsInventory: false, priority: 1, forwarding: "email", pickupEnabled: false, pickupInstructions: null, pickupReady: "24h" }

const onboarded = !params.has("first")
const physicalSettings = () => ({
  settings: { fulfillmentModel: onboarded ? "self" : null, defaultLocationId: LOC, defaultPackageId: "pk1", unitSystem: "metric", returnsEnabled: true, returnWindowDays: 30, taxMode: "manual", pricesIncludeTax: false, taxOnShipping: false, lowStockDefault: 5, lowStockAlerts: true, onboardedAt: onboarded ? "2026-10-01T00:00:00Z" : null },
  locations: [location1, location2, location3],
  profiles: [
    {
      id: "p1",
      name: "General",
      isDefault: true,
      zones: [
        { id: "z1", profileId: "p1", name: "United States", countries: ["US"], regions: [], restOfWorld: false, rates: [
          { id: "r1", zoneId: "z1", name: "Standard", kind: "flat", priceCents: 600, minValue: null, maxValue: null, tiers: [], freeOverCents: 7500, minDays: 3, maxDays: 5, active: true, position: 0 },
          { id: "r2", zoneId: "z1", name: "Express", kind: "flat", priceCents: 1400, minValue: null, maxValue: null, tiers: [], freeOverCents: null, minDays: 1, maxDays: 2, active: true, position: 1 },
        ] },
        { id: "z2", profileId: "p1", name: "Rest of world", countries: [], regions: [], restOfWorld: true, rates: [
          { id: "r3", zoneId: "z2", name: "International", kind: "weight", priceCents: 1800, minValue: null, maxValue: 20000, tiers: [{ from: 0, priceCents: 1800 }, { from: 1000, priceCents: 2800 }, { from: 5000, priceCents: 4500 }], freeOverCents: null, minDays: 7, maxDays: 14, active: true, position: 0 },
        ] },
      ],
    },
  ],
  packages: [{ id: "pk1", name: "Mug box", kind: "box", lengthMm: 150, widthMm: 150, heightMm: 150, weightGrams: 180, isDefault: true }],
  taxRates: [],
  integrations: [],
  shippingProducts: [
    { id: PRODUCT, title: "Speckled mug", imageUrl: MUG_SAND, profileId: null },
    { id: "p-bowl", title: "Serving bowl", imageUrl: BOWL, profileId: null },
    { id: "p-apron", title: "Linen apron", imageUrl: APRON, profileId: null },
  ],
})

const options = [
  { position: 1, name: "Size", values: ["12 oz", "16 oz"] },
  { position: 2, name: "Glaze", values: ["Sand", "Moss", "Ink"] },
]
const combos: [string, string][] = [["12 oz", "Sand"], ["12 oz", "Moss"], ["12 oz", "Ink"], ["16 oz", "Sand"], ["16 oz", "Moss"], ["16 oz", "Ink"]]
const stock = [14, 9, 0, 11, 6, 3]
const physicalProduct = {
  vendor: "Fern & Clay", tags: ["mugs", "stoneware"], requiresShipping: true, weightGrams: 450, lengthMm: null, widthMm: null, heightMm: null, weightUnit: "kg", dimensionUnit: "cm", originCountry: "US", hsCode: null, taxable: true, taxCategory: null, trackInventory: true, continueSelling: false, lowStockThreshold: 3, fulfillmentLocationId: null, fulfillmentMethod: "self", shippingProfileId: null,
  options: params.has("simple") ? [] : options,
  variants: params.has("simple")
    ? [{ id: V(0), productId: PRODUCT, name: "Speckled mug", options: [null, null, null], priceCents: 3200, compareAtCents: null, costCents: null, sku: null, barcode: null, weightGrams: 450, imageUrl: null, trackInventory: true, inventoryPolicy: "deny", requiresShipping: true, taxable: true, active: true, fulfillmentLocationId: null, fulfillmentMethod: null, position: 0 }]
    : combos.map(([a, b], n) => ({ id: V(n), productId: PRODUCT, name: `${a} / ${b}`, options: [a, b, null], priceCents: a === "16 oz" ? 3600 : 3200, compareAtCents: null, costCents: null, sku: `MUG-${a.replace(" oz", "")}-${b.slice(0, 1)}`, barcode: null, weightGrams: a === "16 oz" ? 550 : 450, imageUrl: b === "Moss" ? MUG_MOSS : MUG_SAND, trackInventory: true, inventoryPolicy: "deny", requiresShipping: true, taxable: true, active: true, fulfillmentLocationId: null, fulfillmentMethod: null, position: n })),
  levels: params.has("simple") ? [{ variantId: V(0), locationId: LOC, onHand: 24, committed: 2 }] : combos.map((_, n) => ({ variantId: V(n), locationId: LOC, onHand: stock[n], committed: n === 0 ? 2 : 0 })),
}

function order(kind: "new" | "shipped" | "pickup") {
  const shipped = kind === "shipped"
  const pickup = kind === "pickup"
  return {
    deliveryMethod: pickup ? "pickup" : "ship",
    pickup: pickup ? { locationId: LOC, name: "Studio", address: ["120 Alder Street", "Portland, OR 97204", "United States"], instructions: location1.pickupInstructions, ready: "24h" } : null,
    processingAt: null, buyerName: "Sam Rivera", buyerPhone: null,
    id: PRODUCT, status: "paid", fulfillmentStatus: shipped ? "fulfilled" : "unfulfilled", returnStatus: "none", currency: "USD", totalCents: 11400, refundedCents: 0, shippingCents: pickup ? 0 : 600, shippingDiscountCents: 0,
    address: pickup ? null : { name: "Sam Rivera", line1: "48 Maple Avenue", city: "Denver", region: "CO", postalCode: "80203", country: "US" },
    delivery: pickup ? null : { name: "Standard", priceCents: 600, minDays: 3, maxDays: 5 },
    buyerNote: "It's a gift, please leave the price off.", merchantNote: null, cancelledAt: null,
    lines: [
      { orderId: "11111111-1111-4111-8111-111111111111", title: "Speckled mug", variantName: "12 oz / Sand", sku: "MUG-12-S", imageUrl: MUG_SAND, type: "physical", quantity: 2, unitCents: 3200, discountCents: 0, requiresShipping: true, locationId: LOC, fulfillmentMethod: "self", fulfilled: shipped ? 2 : 0, returned: 0, amountCents: 6400, refundedCents: 0 },
      { orderId: "22222222-2222-4222-8222-222222222222", title: "Serving bowl", variantName: null, sku: "BOWL-L", imageUrl: BOWL, type: "physical", quantity: 1, unitCents: 4400, discountCents: 0, requiresShipping: true, locationId: LOC, fulfillmentMethod: "self", fulfilled: shipped ? 1 : 0, returned: 0, amountCents: 4400, refundedCents: 0 },
    ],
    shipments: shipped ? [{ id: "f1", status: "shipped", carrier: "USPS", trackingNumber: "9400 1000 0000 0000 0000 00", trackingUrl: "https://tools.usps.com/go/TrackConfirmAction", shippedAt: "2026-10-08T15:00:00Z", deliveredAt: null, createdAt: "2026-10-08T15:00:00Z", locationId: LOC, items: [{ orderId: "11111111-1111-4111-8111-111111111111", quantity: 2 }, { orderId: "22222222-2222-4222-8222-222222222222", quantity: 1 }] }] : [],
    returns: [],
    events: [
      { id: 2, kind: "email.sent", message: "Order confirmation emailed to the buyer", actor: "system", createdAt: "2026-10-07T10:00:05Z" },
      { id: 1, kind: "payment.paid", message: "Payment of $114.00 received", actor: "webhook", createdAt: "2026-10-07T10:00:00Z" },
    ],
  }
}

function quote(body: { items?: { productId: string; variantId: string; quantity: number }[]; country?: string; deliveryOptionId?: string }) {
  const items = body.items?.length ? body.items : [{ productId: PRODUCT, variantId: V(0), quantity: 2 }]
  const lines = items.map((i, n) => ({ productId: i.productId, variantId: i.variantId, title: n ? "Serving bowl" : "Speckled mug", variantName: n ? null : "12 oz / Sand", imageUrl: n ? BOWL : MUG_SAND, type: "physical", quantity: i.quantity, unitCents: n ? 4400 : 3200, discountCents: 0, requiresShipping: true }))
  const sub = lines.reduce((t, l) => t + l.unitCents * l.quantity, 0)
  const opts = body.country === "US" ? [{ id: "r1", name: "Standard", priceCents: 600, estimate: "3 to 5 business days" }, { id: "r2", name: "Express", priceCents: 1400, estimate: "1 to 2 business days" }] : []
  const selected = opts.find((o) => o.id === body.deliveryOptionId) ?? opts[0] ?? null
  const ship = selected ? selected.priceCents : 0
  return {
    creatorId: PRODUCT, lines, dropped: [], stockIssues: [], requiresShipping: true, coupon: null, couponError: null,
    delivery: { ok: true, options: opts, selectedId: selected?.id ?? null, needsCountry: !body.country },
    pickups: [{ id: `pickup:${LOC}`, name: "Studio", address: ["120 Alder Street", "Portland, OR 97204", "United States"], instructions: location1.pickupInstructions, ready: "Usually ready in 24 hours" }],
    totals: { itemsSubtotalCents: sub, discountCents: 0, shippingCents: ship, shippingDiscountCents: 0, taxCents: 0, taxIncluded: false, taxRateBps: 0, totalCents: sub + ship },
  }
}

const inventory = {
  locations: [location1, location2],
  rows: [
    ...combos.map(([a, b], n) => ({ variantId: V(n), productId: PRODUCT, productTitle: "Speckled mug", productImage: b === "Moss" ? MUG_MOSS : MUG_SAND, variantName: `${a} / ${b}`, sku: `MUG-${a.replace(" oz", "")}-${b.slice(0, 1)}`, trackInventory: true, lowStockThreshold: 3, levels: [{ variantId: V(n), locationId: LOC, onHand: stock[n] + (n === 0 ? 2 : 0), committed: n === 0 ? 2 : 0, incoming: 0, available: stock[n] }], onHand: stock[n] + (n === 0 ? 2 : 0), committed: n === 0 ? 2 : 0, available: stock[n], incoming: 0 })),
    { variantId: "00000000-0000-4000-8000-000000000016", productId: "p-bowl", productTitle: "Serving bowl", productImage: BOWL, variantName: "Default", sku: "BOWL-L", trackInventory: true, lowStockThreshold: 3, levels: [{ variantId: "x", locationId: LOC, onHand: 8, committed: 1, incoming: 12, available: 7 }], onHand: 8, committed: 1, available: 7, incoming: 12 },
    { variantId: "00000000-0000-4000-8000-000000000017", productId: "p-apron", productTitle: "Linen apron", productImage: APRON, variantName: "Default", sku: "APR-1", trackInventory: true, lowStockThreshold: 5, levels: [{ variantId: "y", locationId: LOC, onHand: 4, committed: 0, incoming: 0, available: 4 }], onHand: 4, committed: 0, available: 4, incoming: 0 },
  ],
  lowStockDefault: 5,
}

const taxes = {
  enabled: true, included: false, onShipping: false, digital: false, ready: true, detectedCountry: "US", currency: "USD",
  regions: [
    { id: "r-or", country: "US", region: "WA", name: "Sales tax", rateBps: 650 },
    { id: "r-ca", country: "CA", region: null, name: "GST", rateBps: 500 },
    { id: "r-de", country: "DE", region: null, name: "VAT", rateBps: 1900 },
  ],
  overrides: [{ id: "o-1", taxRateId: "r-de", productId: "p-book", name: "", rateBps: 700, productTitle: "Glaze recipe book" }],
  products: [{ id: "p-book", title: "Glaze recipe book" }, { id: PRODUCT, title: "Speckled mug" }],
}

const channels = {
  ready: true, defaultKey: null, channels: [
    { id: null, kind: "storefront", name: "Online store", description: "Your website: its product lists, collections and search.", enabled: true, off: 0 },
    { id: null, kind: "creator_page", name: "Creator page", description: "storelib.com/you and your one page.", enabled: true, off: 1 },
    { id: null, kind: "marketplace", name: "Explore", description: "Storelib's marketplace, where buyers find new creators.", enabled: true, off: 0 },
    { id: "11111111-1111-4111-8111-111111111111", kind: "custom", name: "Saturday market", description: "Our stall at the farmers market", enabled: true, off: 0 },
  ],
}

const store = { settings: { storeName: "Fern & Clay", phone: "5035550142", phoneCountry: "US", defaultCountry: "US", logoUrl: null, checkout: { nameFields: "first_and_last", phone: "optional", company: "off", address2: "optional", marketingOptIn: true, abandonedRecovery: true, requireAccount: false, requireConfirmedEmail: false }, defaultSalesChannelId: null, ready: true }, detectedCountry: "US", supportEmail: "hello@fernandclay.example", currency: "USD", suggested: { storeName: "Fern & Clay", contactEmail: "hello@fernandclay.example" }, logoDefault: null }

import { DEFAULT_RETURN_REASONS, DEFAULT_REFUND_REASONS } from "@/lib/store/reasons"
const reasons = { ready: true, return: DEFAULT_RETURN_REASONS.map((r, i) => ({ ...r, id: `rr${i}` })), refund: DEFAULT_REFUND_REASONS.map((r, i) => ({ ...r, id: `rf${i}` })) }

const P = (id: string, title: string, priceCents: number, imageUrl: string | null) => ({ id, title, type: "physical", published: true, priceCents, imageUrl })
const offers = {
  ready: true,
  products: [P(PRODUCT, "Speckled mug", 3200, MUG_SAND), P("p-bowl", "Serving bowl", 4400, BOWL), P("p-apron", "Linen apron", 3800, APRON)],
  offers: [
    { id: "o1", kind: "bundle", title: "Breakfast set", productIds: [PRODUCT, "p-bowl"], triggerIds: [], discountType: "percent", discountValue: 10, active: true },
    { id: "o2", kind: "checkout", title: "Add an apron", productIds: ["p-apron"], triggerIds: [], discountType: "fixed", discountValue: 500, active: true },
  ],
}

const buyBoxProduct = {
  product: { id: PRODUCT, creatorId: PRODUCT, title: "Speckled mug", slug: "speckled-mug", imageUrl: MUG_SAND },
  options: [{ name: "Size", values: ["12 oz", "16 oz"] }, { name: "Glaze", values: ["Sand", "Moss", "Ink"] }],
  variants: combos.map(([a, b], n) => ({ id: V(n), name: `${a} / ${b}`, options: [a, b, null], priceCents: a === "16 oz" ? 3600 : 3200, compareAtCents: null, imageUrl: null, soldOut: stock[n] === 0, left: stock[n] > 0 && stock[n] <= 3 ? stock[n] : null, maxQuantity: stock[n] })),
}

/* The website's own checkout (app/checkout/site): its quote, in the shape app/api/checkout/site answers. */
function siteQuote(body: { country?: string; deliveryOptionId?: string; deliveryMethod?: string } = {}) {
  const q = quote({ items: [{ productId: PRODUCT, variantId: V(0), quantity: 2 }, { productId: "p-bowl", variantId: "", quantity: 1 }], country: body.country, deliveryOptionId: body.deliveryOptionId })
  /* Pick up is asked for as the pickup point's id in deliveryOptionId: nothing to pay for delivery. */
  if (body.deliveryOptionId?.startsWith("pickup:")) return { ...q, kind: "ships", totals: { ...q.totals, shippingCents: 0, totalCents: q.totals.itemsSubtotalCents } }
  return { ...q, kind: "ships", delivery: body.country ? q.delivery : { ok: true, options: [], selectedId: null, needsCountry: true } }
}

/* ── The API ───────────────────────────────────────────────────────────── */

function route(method: string, path: string, body: Record<string, unknown>): unknown {
  if (path === "/api/checkout/site") return body.action === "quote" ? siteQuote(body as never) : {}
  if (path.startsWith("/api/physical/checkout/quote")) return quote(body as never)
  if (path === "/api/physical/checkout") return { url: "#", free: false }
  if (path.startsWith("/api/physical/storefront/product")) return buyBoxProduct
  if (path.startsWith("/api/physical/settings")) return physicalSettings()
  if (path.startsWith("/api/physical/shipping/profiles")) return { profiles: physicalSettings().profiles }
  if (path.startsWith("/api/physical/catalog-context")) return { locations: [location1, location2], profiles: [{ id: "p1", name: "General", isDefault: true, zoneCount: 2 }], settings: physicalSettings().settings }
  if (path.startsWith("/api/physical/products/")) return { product: physicalProduct }
  if (path.startsWith("/api/physical/inventory/movements")) return { movements: [] }
  if (path.startsWith("/api/physical/inventory")) return inventory
  if (path.startsWith("/api/physical/transfers")) return { transfers: [] }
  if (path.startsWith("/api/physical/orders/")) return { order: order(params.get("order") === "shipped" ? "shipped" : params.get("order") === "pickup" ? "pickup" : "new"), locations: [{ id: LOC, name: "Studio" }] }
  if (path === "/api/store/integrations/catalog") return { overrides: [] }
  if (path.startsWith("/api/store/integrations")) return { tracking: { ga4: "G-1A2B3C4D5E" }, ready: true }
  /* Printful connected to the demo store (?printful): the location it made, drafts to approve, tracking by webhook. */
  if (path.startsWith("/api/physical/integrations")) return { integrations: params.has("printful") ? [{ provider: "printful", status: "connected", url: null, keyHint: "7Qx2", secretHint: null, lastSyncAt: "2026-10-10T09:12:00Z", lastError: null, account: "Fern & Clay", verifiedAt: "2026-10-10T09:12:00Z", mode: null, autoConfirm: false, webhooks: "on", webhookNote: null, location: { id: "loc-printful", name: "Printful" } }] : [] }
  if (path.startsWith("/api/store/reviews-app")) return { settings: { enabled: false } }
  if (path.startsWith("/api/store/taxes")) return taxes
  if (path.startsWith("/api/store/channels")) return channels
  if (path.startsWith("/api/store/settings")) return store
  if (path.startsWith("/api/store/reasons")) return reasons
  if (path.startsWith("/api/store/offers")) return offers
  if (path === "/api/store/emails") return { shop: { name: "Fern & Clay", supportEmail: "hello@fernandclay.example", storeUrl: null, logoUrl: null, phone: null, currency: "USD" }, copy: {}, ready: true }
  if (path.startsWith("/api/store/emails/preview")) return { subject: "Order confirmed", html: "<p>Preview</p>" }
  if (path.startsWith("/api/domains")) return { domains: [{ id: "d1", domain: "fernandclay.example", status: "active", ssl_status: "active", verified_at: "2026-09-01T10:00:00Z" }] }
  if (path.includes("/backups")) return { backups: [] }
  void method
  return {}
}

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const u = new URL(url, location.href)
  if (u.origin !== location.origin || !u.pathname.startsWith("/api/")) return realFetch(input, init)
  let body: Record<string, unknown> = {}
  try {
    body = init?.body ? JSON.parse(String(init.body)) : {}
  } catch {
    body = {}
  }
  const out = route((init?.method || "GET").toUpperCase(), u.pathname, body)
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } })
}

/* ── Screens ───────────────────────────────────────────────────────────── */

const Page = ({ children, width = 760, bg = "#f8f9fa" }: { children: React.ReactNode; width?: number; bg?: string }) => (
  <div style={{ background: bg, minHeight: "100vh" }}>
    <div id="shot" style={{ maxWidth: width, margin: "0 auto", padding: 16 }}>
      {children}
    </div>
  </div>
)

function ProductCards() {
  const handle = React.useRef<PhysicalEditorHandle | null>(null)
  return (
    <Page>
      <div className="space-y-4">
        <PhysicalProductCards productId={PRODUCT} basePrice="32.00" handle={handle} onDirty={() => {}} images={[MUG_SAND, MUG_MOSS]} uploadImage={async () => MUG_SAND} />
      </div>
    </Page>
  )
}

function WebsiteSettings({ section }: { section: SettingsSection }) {
  return (
    <ProjectSettings
      open
      onClose={() => {}}
      installId="install-1"
      name="Fern & Clay"
      onRenamed={() => {}}
      websiteUrl="https://fernandclay.storelib.com"
      websiteUrlDisplay="fernandclay.storelib.com"
      onAddressChanged={() => {}}
      live
      publishedAt="2026-10-05T09:30:00Z"
      initialSection={section}
      settings={{ brand_name: "Fern & Clay" }}
      onSettingChange={() => {}}
      pages={[{ key: "home", name: "Home", path: "/" }, { key: "about", name: "About", path: "/about" }]}
      productCount={12}
      onUnpublished={() => {}}
      onNavigate={() => {}}
    />
  )
}

/** A Stripe.js stand in: a card form drawn as boxes, so the page shows where the card goes. Nothing is ever paid. */
function fakeStripe() {
  const box = (t: string) => `<div style="height:44px;border:1px solid #e1e3e7;border-radius:8px;padding:12px 14px;font:15px Inter,sans-serif;color:#a2a7b0;box-sizing:border-box">${t}</div>`
  const element = (type: string) => ({
    mount(el: HTMLElement | string) {
      const node = typeof el === "string" ? (document.querySelector(el) as HTMLElement) : el
      if (type === "payment") node.innerHTML = `<div style="display:grid;gap:12px">${box("1234 1234 1234 1234")}<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${box("MM / YY")}${box("CVC")}</div></div>`
    },
    on() { return this }, off() { return this }, update() {}, destroy() {}, unmount() {}, collapse() {}, focus() {}, blur() {}, clear() {},
  })
  ;(window as unknown as { Stripe: unknown }).Stripe = Object.assign(() => ({
    _registerWrapper() {}, registerAppInfo() {}, createToken() {}, createPaymentMethod() {}, confirmCardPayment() {}, confirmSetup: async () => ({}),
    elements: () => ({ create: (t: string) => element(t), getElement: () => null, update() {}, submit: async () => ({}), fetchUpdates: async () => ({}) }),
    confirmPayment: async () => ({}),
  }), { version: 3 })
}

const SITE_LOGO = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><text x="0" y="56" font-size="48" font-family="Georgia" font-weight="700" fill="#2f2a24">Fern &amp; Clay</text></svg>')

function SiteCheckoutView() {
  fakeStripe()
  return (
    <div id="shot">
      <SiteCheckout
        shopId={PRODUCT}
        brand={{ name: "Fern & Clay", imageUrl: SITE_LOGO, kind: "logo" } as never}
        shopUrl={`${location.origin}/`}
        backTo={`${location.origin}/cart`}
        items={[{ productId: PRODUCT, variantId: V(0), quantity: 2 }, { productId: "p-bowl", variantId: null, quantity: 1 }] as never}
        wholeCart
        couponCode={null}
        initialQuote={siteQuote() as never}
        initialError={null}
        config={checkoutConfig({ marketingOptIn: true })}
        buyer={null}
        lockedEmail={null}
        needsSignIn={false}
      />
    </div>
  )
}

/** A real email, as its template writes it, in a frame the size of an email client's reading pane. */
function EmailView({ html }: { html: string }) {
  const ref = React.useRef<HTMLIFrameElement | null>(null)
  const [h, setH] = React.useState(900)
  return (
    <div id="shot" style={{ background: "#f8f9fa", padding: 0 }}>
      <iframe
        ref={ref}
        title="Email"
        srcDoc={html}
        style={{ display: "block", width: "100%", height: h, border: 0 }}
        onLoad={() => {
          const d = ref.current?.contentDocument
          if (!d) return
          /* The email's own card: the largest box with rounded corners. The frame ends a little under it. */
          const card = [...d.querySelectorAll<HTMLElement>("table, td, div")].filter((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius) > 0).sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)[0]
          setH(Math.ceil(card ? card.getBoundingClientRect().bottom + 32 : d.documentElement.scrollHeight))
        }}
      />
    </div>
  )
}

function App() {
  switch (view) {
    case "site-checkout":
      return <SiteCheckoutView />
    case "kinds":
      return (
        <Page width={460} bg="#ffffff">
          <div className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="px-3 pb-2 pt-1 text-[17px] font-semibold text-[#1a1a2e]">What are you selling?</p>
            <KindList communities={false} onChoose={() => {}} />
          </div>
        </Page>
      )
    case "delivery":
    case "first":
      return <Page width={820}><ShippingSettings part="delivery" /></Page>
    case "locations":
      return <Page width={820}><ShippingSettings part="locations" /></Page>
    case "returns":
      return (
        <Page width={820}>
          <div className="space-y-4 sm:space-y-6">
            <ShippingSettings part="returns" />
            <ReasonsPanel kinds={["return", "refund"]} />
          </div>
        </Page>
      )
    case "product":
      return <ProductCards />
    case "order":
      return <Page><PhysicalOrderPanel orderRowId={PRODUCT} /></Page>
    case "inventory":
      return <div id="shot" style={{ height: "100vh", background: "#f8f9fa" }}><InventoryClient /></div>
    case "checkout": {
      return <div id="shot"><PhysicalCheckout shopId={PRODUCT} shopName="Fern & Clay" /></div>
    }
    case "buybox":
      return (
        <Page width={460} bg="#ffffff">
          <p className="mb-1 text-[22px] font-semibold text-[#1a1a2e]">Speckled mug</p>
          <PhysicalBuyBox productId={PRODUCT} />
        </Page>
      )
    case "status":
      return (
        <div id="shot">
          <OrderStatusView
            token="tok_demo_demo_demo_demo_demo"
            justPaid={false}
            shop={{ name: "Fern & Clay", avatar: null, email: "hello@fernandclay.example" }}
            canReturn
            order={{
              id: PRODUCT, status: "paid", fulfillmentStatus: "fulfilled", cancelled: false, createdAt: "2026-10-07T10:00:00Z", email: "sam@example.com", name: "Sam Rivera",
              address: { name: "Sam Rivera", line1: "48 Maple Avenue", city: "Denver", region: "CO", postalCode: "80203", country: "US" },
              delivery: { name: "Standard", priceCents: 600, minDays: 3, maxDays: 5 }, pickup: null, processing: true,
              totals: { subtotal: 10800, discount: 0, shipping: 600, tax: 0, taxIncluded: false, total: 11400, refunded: 0 },
              lines: [
                { orderId: "11111111-1111-4111-8111-111111111111", title: "Speckled mug", variantName: "12 oz / Sand", imageUrl: MUG_SAND, quantity: 2, cents: 6400, type: "physical", receiptToken: null, returnable: 2 },
                { orderId: "22222222-2222-4222-8222-222222222222", title: "Serving bowl", variantName: null, imageUrl: BOWL, quantity: 1, cents: 4400, type: "physical", receiptToken: null, returnable: 1 },
              ],
              shipments: [{ id: "s1", status: "in_transit", carrier: "USPS", trackingNumber: "9400 1000 0000 0000 0000 00", trackingUrl: "https://tools.usps.com/go/TrackConfirmAction", shippedAt: "2026-10-08T15:00:00Z", deliveredAt: null, items: [{ orderId: "11111111-1111-4111-8111-111111111111", quantity: 2 }] }],
              returns: [],
            } as never}
          />
        </div>
      )
    case "store":
      return <Page width={760}><StoreDetailsPanel /></Page>
    case "integrations":
      return <Page width={980}><IntegrationsDirectory /></Page>
    case "email-low-stock":
      return <EmailView html={lowStockEmail({ shopName: "Fern & Clay", inventoryUrl: "https://storelib.com/app/inventory?filter=low", items: [{ title: "Speckled mug", variantName: "12 oz / Ink", available: 0, threshold: 3 }, { title: "Speckled mug", variantName: "16 oz / Ink", available: 3, threshold: 3 }, { title: "Linen apron", variantName: null, available: 4, threshold: 5 }] }).html} />
    case "email-shipped":
      return (
        <EmailView
          html={shipmentEmail({
            kind: "shipped", shopName: "Fern & Clay", orderNumber: "#0F3A9C2E", buyerFirstName: "Sam", carrier: "USPS", trackingNumber: "9400100000000000000000",
            trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000000000000000", statusUrl: "https://fernandclay.storelib.com/checkout/order",
            address: { name: "Sam Rivera", line1: "48 Maple Avenue", city: "Denver", region: "CO", postalCode: "80203", country: "US" }, deliveryName: "Standard, 3 to 5 business days",
            lines: [{ title: "Speckled mug", variantName: "12 oz / Sand", quantity: 2, cents: 6400, imageUrl: null }, { title: "Serving bowl", variantName: null, quantity: 1, cents: 4400, imageUrl: null }] as never,
          }).html}
        />
      )
    case "taxes":
      return <Page width={760}><TaxesPanel /></Page>
    case "checkout-settings":
      return <Page width={760}><CheckoutPanel /></Page>
    case "channels":
      return <Page width={760}><ChannelsPanel /></Page>
    case "emails":
      return <Page width={760}><CustomerEmailsPanel /></Page>
    case "payouts":
      return <div id="shot"><PayoutsDemo /></div>
    case "offers":
      return <div id="shot" style={{ height: "100vh" }}><OffersClient /></div>
    case "website-commerce":
      return <WebsiteSettings section="commerce" />
    case "website-policies":
      return <WebsiteSettings section="policies" />
    case "website-domains":
      return <WebsiteSettings section="domains" />
    default:
      return <p>Unknown view</p>
  }
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce>
    <App />
  </PlatformSettingsProvider>,
)
