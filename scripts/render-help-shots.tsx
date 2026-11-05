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
import { EMPTY_CARRIER_PREFS } from "@/lib/physical/carrier-prefs"
import { InventoryClient } from "@/app/(storelib)/app/inventory/inventory-client"
import { PhysicalCheckout } from "@/app/(storelib)/checkout/physical/physical-checkout"
import { PhysicalBuyBox } from "@/components/physical/buy-box"
import { OrderStatusView } from "@/app/(storelib)/checkout/physical/order/[token]/order-status-view"
import { TaxesPanel } from "@/components/app/settings/taxes-panel"
import { CheckoutPanel } from "@/components/app/settings/checkout-panel"
import { ChannelsPanel } from "@/components/app/settings/channels-panel"
import { CustomerEmailsPanel } from "@/components/app/settings/customer-emails-panel"
import { ReasonsPanel } from "@/components/app/settings/reasons-panel"
import { KindList } from "@/app/(storelib)/app/products/new/kind-chooser"
import { PayoutsDemo } from "@/components/app/payouts-demo/payouts-demo"
import { OffersClient } from "@/app/(storelib)/app/offers/offers-client"
import type { Offer } from "@/lib/offers/offers"
import { ProjectSettings } from "@/components/website-builder/project-settings"
import type { SettingsSection } from "@/components/website-builder/website-settings/types"
import { SiteCheckout } from "@/app/(storelib)/checkout/site/site-checkout"
import { checkoutConfig } from "@/lib/store/checkout-config"
import { StoreDetailsPanel } from "@/components/app/settings/store-details-panel"
import { IntegrationsDirectory } from "@/components/app/settings/integrations-directory"
import { OrderMessagesCard } from "@/components/support/order-messages-card"
import { CaseView } from "@/app/(storelib)/order-help/[id]/case-view"
import { shipmentEmail } from "@/lib/physical/email-templates"
import { lowStockEmail } from "@/lib/notify/seller-commerce"
import { MarketsPanel } from "@/components/app/settings/markets-panel"
import { TranslateSheet } from "@/components/app/settings/translate-sheet"
import { LanguageSwitch } from "@/components/website-builder/theme/language-switch"
import { languageChoiceOf } from "@/lib/markets/choice"
import { ProductBlock } from "@/components/website-builder/sections/renderers/product/product-blocks"

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
  vendor: "Fern & Clay", tags: ["mugs", "stoneware"], requiresShipping: true, weightGrams: 450, lengthMm: null, widthMm: null, heightMm: null, weightUnit: "kg", dimensionUnit: "cm", originCountry: "US", hsCode: null, taxable: true, taxCategory: null, trackInventory: true, continueSelling: false, lowStockThreshold: 3, fulfillmentLocationId: params.has("pod") ? "loc-printful" : null, fulfillmentMethod: params.has("pod") ? "print_on_demand" : "self", shippingProfileId: null,
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
    /* ?local: the shop brings it itself (Local delivery), so Fulfill items starts on no tracking and offers no label. */
    delivery: pickup ? null : params.has("local") ? { name: "Local delivery", priceCents: 500, minDays: null, maxDays: null, kind: "local", note: "Delivered Tuesdays and Fridays" } : { name: "Standard", priceCents: 600, minDays: 3, maxDays: 5 },
    buyerNote: "It's a gift, please leave the price off.", merchantNote: null, cancelledAt: null,
    lines: [
      { orderId: "11111111-1111-4111-8111-111111111111", title: "Speckled mug", variantName: "12 oz / Sand", sku: "MUG-12-S", imageUrl: MUG_SAND, type: "physical", quantity: 2, unitCents: 3200, discountCents: 0, requiresShipping: true, locationId: LOC, fulfillmentMethod: "self", fulfilled: shipped ? 2 : 0, returned: 0, amountCents: 6400, refundedCents: 0 },
      { orderId: "22222222-2222-4222-8222-222222222222", title: "Serving bowl", variantName: null, sku: "BOWL-L", imageUrl: BOWL, type: "physical", quantity: 1, unitCents: 4400, discountCents: 0, requiresShipping: true, locationId: LOC, fulfillmentMethod: "self", fulfilled: shipped ? 1 : 0, returned: 0, amountCents: 4400, refundedCents: 0 },
    ],
    shipments: shipped ? [{ id: "f1", status: params.has("problem") ? "failed" : "shipped", carrier: "USPS", trackingNumber: "9400 1000 0000 0000 0000 00", trackingUrl: "https://tools.usps.com/go/TrackConfirmAction", shippedAt: "2026-10-08T15:00:00Z", deliveredAt: null, createdAt: "2026-10-08T15:00:00Z", locationId: LOC, items: [{ orderId: "11111111-1111-4111-8111-111111111111", quantity: 2 }, { orderId: "22222222-2222-4222-8222-222222222222", quantity: 1 }] }] : [],
    returns: [],
    events: [
      /* ?cancel: the buyer pressed Cancel order on their page (lib/physical/buyer-cancel.ts). */
      ...(params.has("cancel") && !shipped ? [{ id: 3, kind: "order.cancel_requested", message: "The buyer asked to cancel this order: Ordered the wrong size", actor: "buyer", createdAt: "2026-10-07T12:00:00Z", detail: { reason: "Ordered the wrong size" } }] : []),
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

const store = { settings: { storeName: "Fern & Clay", phone: "5035550142", phoneCountry: "US", defaultCountry: "US", logoUrl: null, checkout: { nameFields: "first_and_last", phone: "optional", company: "off", address2: "optional", marketingOptIn: true, abandonedRecovery: true, requireAccount: false, requireConfirmedEmail: false }, defaultSalesChannelId: null, ready: true, ...(params.has("business") ? { legal: { company: "Fern & Clay LLC", country: "US", line1: "120 Alder Street", line2: "", city: "Portland", postalCode: "97204", region: "OR", taxId: "12-3456789" } } : {}) }, detectedCountry: "US", supportEmail: "hello@fernandclay.example", currency: "USD", suggested: { storeName: "Fern & Clay", contactEmail: "hello@fernandclay.example" }, logoDefault: null }

import { DEFAULT_RETURN_REASONS, DEFAULT_REFUND_REASONS } from "@/lib/store/reasons"
const reasons = { ready: true, return: DEFAULT_RETURN_REASONS.map((r, i) => ({ ...r, id: `rr${i}` })), refund: DEFAULT_REFUND_REASONS.map((r, i) => ({ ...r, id: `rf${i}` })) }

const P = (id: string, title: string, priceCents: number, imageUrl: string | null) => ({ id, title, type: "physical", published: true, priceCents, imageUrl, payWhatYouWant: false })
const offers = {
  ready: true,
  products: [P(PRODUCT, "Speckled mug", 3200, MUG_SAND), P("p-bowl", "Serving bowl", 4400, BOWL), P("p-apron", "Linen apron", 3800, APRON)],
  offers: [
    { id: "o1", kind: "bundle", title: "Breakfast set", productIds: [PRODUCT, "p-bowl"], triggerIds: [], discountType: "percent", discountValue: 10, active: true },
    { id: "o2", kind: "checkout", title: "Add an apron", productIds: ["p-apron"], triggerIds: [], discountType: "fixed", discountValue: 500, active: true },
    /* A quantity break on the mug: Buy 2 get 1 free, and Buy 3 get 2 free (lib/offers/pricing.ts). */
    {
      id: "o3", kind: "quantity_break", title: "Mug offer", productIds: [PRODUCT], triggerIds: [], discountType: "none", discountValue: 0, active: true,
      tiers: [
        { quantity: 2, freeQuantity: 1, discountType: "none", discountValue: 0, label: "Buy 2 get 1 free", badge: "Most popular" },
        { quantity: 3, freeQuantity: 2, discountType: "none", discountValue: 0, label: "Buy 3 get 2 free", badge: "Best value" },
      ],
    },
  ] satisfies Offer[],
}

const buyBoxProduct = {
  product: { id: PRODUCT, creatorId: PRODUCT, title: "Speckled mug", slug: "speckled-mug", imageUrl: MUG_SAND },
  options: [{ name: "Size", values: ["12 oz", "16 oz"] }, { name: "Glaze", values: ["Sand", "Moss", "Ink"] }],
  variants: combos.map(([a, b], n) => ({ id: V(n), name: `${a} / ${b}`, options: [a, b, null], priceCents: a === "16 oz" ? 3600 : 3200, compareAtCents: null, imageUrl: null, soldOut: stock[n] === 0, left: stock[n] > 0 && stock[n] <= 3 ? stock[n] : null, maxQuantity: stock[n] })),
}

/* The website's own checkout (app/(storelib)/checkout/site): its quote, in the shape app/api/checkout/site answers. */
function siteQuote(body: { country?: string; deliveryOptionId?: string; deliveryMethod?: string } = {}) {
  const q = quote({ items: [{ productId: PRODUCT, variantId: V(0), quantity: 2 }, { productId: "p-bowl", variantId: "", quantity: 1 }], country: body.country, deliveryOptionId: body.deliveryOptionId })
  /* Pick up is asked for as the pickup point's id in deliveryOptionId: nothing to pay for delivery. */
  if (body.deliveryOptionId?.startsWith("pickup:")) return { ...q, kind: "ships", totals: { ...q.totals, shippingCents: 0, totalCents: q.totals.itemsSubtotalCents } }
  return { ...q, kind: "ships", delivery: body.country ? q.delivery : { ok: true, options: [], selectedId: null, needsCountry: true } }
}

/* ── Round 24 screens: labels, courier tracking, Contact the shop, partners ── */

const H = 3_600_000
/* A fixed "now" for the pictures, so the dates in them never drift: Monday 12 October 2026, 3pm. */
const NOW = Date.parse("2026-10-12T15:00:00Z")
const hoursAgo = (h: number) => new Date(NOW - h * H).toISOString()

/* Shippo connected with a test key: the label flow in Fulfill items (the shapes app/api/physical/orders/[id]/label answers). */
/* A bought USPS label (lib/integrations/shipping/labels-server.ts labelView): ?labels=shipped puts it on the shipment, ?labels=loose leaves it without one. */
const demoLabel = (fulfillmentId: string | null) => ({
  id: "1abe1000-0000-4000-8000-000000000001", provider: "shippo", providerName: "Shippo", carrier: "USPS", service: "Ground Advantage", trackingNumber: "9400100000000000000000",
  labelUrl: "https://shippo-delivery.example/label.pdf", cents: 812, currency: "USD", cost: "$8.12", status: "purchased", testMode: false, fulfillmentId, createdAt: "2026-10-08T14:40:00Z",
})
const labelState: { shipments: unknown[]; labels: unknown[] } = { shipments: [], labels: params.get("labels") === "shipped" ? [demoLabel("f1")] : params.get("labels") === "loose" ? [demoLabel(null)] : [] }
const labelOptions = () => ({
  ready: true,
  apps: params.has("label") ? [{ id: "shippo", name: "Shippo", test: true }] : [],
  packages: [
    { id: "pk1", name: "Mug box", kind: "box", lengthMm: 150, widthMm: 150, heightMm: 150, weightGrams: 180, isDefault: true },
    { id: "pk2", name: "Padded mailer", kind: "envelope", lengthMm: 305, widthMm: 229, heightMm: 0, weightGrams: 40, isDefault: false },
  ],
  defaultPackageId: "pk1",
  unitSystem: "metric",
  itemsGrams: 1340,
  from: { locationId: LOC, name: "Studio", line: "120 Alder Street, Portland, OR, 97204, United States", address: {} },
  to: { line: "Sam Rivera, 48 Maple Avenue, Denver, CO, 80203, United States", complete: true },
  labels: labelState.labels,
})
const LABEL_RATES = [
  { id: "rate_ga", shipmentId: "shp_1", carrier: "USPS", service: "Ground Advantage", serviceCode: "usps_ground_advantage", cents: 812, currency: "USD", days: 5, price: "$8.12" },
  { id: "rate_pri", shipmentId: "shp_1", carrier: "USPS", service: "Priority Mail", serviceCode: "usps_priority", cents: 1145, currency: "USD", days: 2, price: "$11.45" },
  { id: "rate_ups", shipmentId: "shp_1", carrier: "UPS", service: "Ground", serviceCode: "ups_ground", cents: 1320, currency: "USD", days: 4, price: "$13.20" },
]

/* The carrier's scans for one parcel, newest first (lib/physical/tracking), as both order pages draw them. */
const CHECKPOINTS = [
  { at: hoursAgo(5), status: "out_for_delivery", message: "Out for delivery", location: "Denver, CO, USA" },
  { at: hoursAgo(14), status: "in_transit", message: "Arrived at USPS Regional Destination Facility", location: "Denver, CO, USA" },
  { at: hoursAgo(30), status: "in_transit", message: "In transit to next facility", location: "Salt Lake City, UT, USA" },
  { at: hoursAgo(44), status: "in_transit", message: "Departed USPS Regional Facility", location: "Portland, OR, USA" },
  { at: hoursAgo(50), status: "in_transit", message: "Accepted at USPS Origin Facility", location: "Portland, OR, USA" },
  { at: hoursAgo(52), status: "info_received", message: "Shipping label created, USPS awaiting item", location: "Portland, OR, USA" },
]
const ETA = "2026-10-13T00:00:00.000Z"
const trackedShipment = {
  id: "f1", status: "out_for_delivery", carrier: "USPS", trackingNumber: "9400100000000000000000", trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000000000000000",
  shippedAt: hoursAgo(52), deliveredAt: null, createdAt: hoursAgo(52), locationId: LOC, provider: "manual",
  items: [{ orderId: "11111111-1111-4111-8111-111111111111", quantity: 2 }, { orderId: "22222222-2222-4222-8222-222222222222", quantity: 1 }],
  events: [{ status: "out_for_delivery", message: "From USPS", occurredAt: hoursAgo(5) }, { status: "in_transit", message: "From USPS", occurredAt: hoursAgo(44) }, { status: "shipped", message: "USPS 9400100000000000000000", occurredAt: hoursAgo(52) }],
  checkpoints: CHECKPOINTS,
  tracking: { mode: "auto", status: "out_for_delivery", estimatedDelivery: ETA, checkedAt: hoursAgo(0.4), providerName: "AfterShip", error: null },
}

/* A buyer wrote with Contact the shop (lib/support/cases.ts): the thread on the order, and the buyer's own page. */
const CASE_ID = "ca5e0000-0000-4000-8000-000000000001"
const caseSummary = { id: CASE_ID, reason: "damaged", status: "store", escalated: false, escalatedBy: null, orderRef: "0F3A9C2E", kind: "physical", buyerEmail: "sam@example.com", buyerName: "Sam Rivera", createdAt: hoursAgo(98), lastMessageAt: hoursAgo(26), unread: true }
const caseThread = [
  { id: 1, author: "buyer", internal: false, body: "The serving bowl arrived with a crack down the side. Photo attached.", createdAt: hoursAgo(98), photos: [{ url: BOWL, name: "bowl.jpg" }] },
  { id: 2, author: "buyer", internal: false, body: "Any news? A replacement or a refund would both be fine.", createdAt: hoursAgo(26) },
]

/* Partners and shipping apps, connected to the demo store (?partners): the cards as their pages show them. */
const connected = (provider: string, extra: Record<string, unknown>) => ({ provider, status: "connected", url: null, keyHint: "4f2a", secretHint: null, lastSyncAt: hoursAgo(1), lastError: null, account: null, verifiedAt: hoursAgo(48), mode: null, autoConfirm: false, webhooks: null, webhookNote: null, location: null, ...extra })
const partnerStates = () => [
  connected("gelato", { webhooks: "off", webhookNote: "Gelato's webhooks are added in Gelato, under Developer › Webhooks: paste the address below and tick order status and tracking code updates. Until the first one arrives, Storelib checks Gelato for tracking every few hours.", location: { id: "loc-g", name: "Gelato" }, shipmentMethod: "normal", webhookAddress: "https://storelib.com/api/integrations/webhooks/gelato/demo.Q2hlY2tlZEJ5U3RvcmVsaWI" }),
  connected("cj_dropshipping", { account: "CJ account 1234567", webhooks: "on", webhookNote: "CJ sends order, tracking and stock updates to Storelib.", location: { id: "loc-c", name: "CJ Dropshipping" }, logistic: "cheapest", fromCountry: "US" }),
  connected("shipstation", { keyHint: "3210", account: "Fern & Clay in ShipStation", webhooks: "on", ordersSent: 37, labelsBought: 0 }),
  connected("shippo", { keyHint: "8f7a", mode: "test", labelsBought: 14, ordersSent: 0 }),
]
const partnerRows = (provider: string) => [
  { variantId: "v-tee-m", productId: "p-tee", productTitle: "Glaze club tee", variantName: "Sand / M", sku: "TEE-SAND-M", atPartner: true, link: provider === "gelato" ? { providerVariantId: "apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_gqa_classic_gsi_m_gco_sand", label: "Classic unisex crewneck, M, Sand", providerSku: null, fileUrl: "https://fernandclay.example/print/tee.png", stockSync: false, stockLevel: null, stockSyncedAt: null, stockError: null } : { providerVariantId: "1424608152007086080", label: "Cotton tee Sand M", providerSku: "CJNS0000001-Sand-M", fileUrl: null, stockSync: true, stockLevel: 120, stockSyncedAt: hoursAgo(3), stockError: null } },
  { variantId: "v-tee-l", productId: "p-tee", productTitle: "Glaze club tee", variantName: "Sand / L", sku: "TEE-SAND-L", atPartner: true, link: null },
  { variantId: "v-poster", productId: "p-poster", productTitle: "Kiln poster", variantName: "50 x 70 cm", sku: null, atPartner: true, link: null },
]
const marketing = () => [
  { provider: "klaviyo", connected: params.has("klaviyo"), keyHint: "a91c", account: "Fern & Clay", listId: "Xy12Ab", listName: "Newsletter", backfill: true, backfillState: "done", lastSyncAt: hoursAgo(0.3), lastError: null, counts: { subscribed: 412, unsubscribed: 9, customers: 268, events: 1544, pulled: 6 }, scopes: [], ready: true },
  { provider: "omnisend", connected: false, keyHint: null, account: null, listId: null, listName: null, backfill: true, backfillState: null, lastSyncAt: null, lastError: null, counts: { subscribed: 0, unsubscribed: 0, customers: 0, events: 0, pulled: 0 }, scopes: [], ready: true },
]

/* ── The API ───────────────────────────────────────────────────────────── */

/*
  LANGUAGES & CURRENCY (the currency and translation articles): Fern & Clay
  sells in US dollars from the United States, shows euros in four European
  countries, pounds in the United Kingdom and yen in Japan (a currency
  Storelib shows but does not charge), and is in French and German with
  Spanish translating. ?written=1: a store whose default is Spanish on a
  theme written in English, its texts being translated into Spanish.
*/
const written = params.has("written")
const storeCurrency = {
  ready: true, country: "US", currency: "USD", chosen: "USD", suggested: "USD", unsupportedLocal: null, detectedCountry: "US",
  currencies: ["USD", "EUR", "GBP", "RON", "CAD", "AUD"].map((code) => ({ code, label: code })),
  catalog: { products: 12, variants: 30, shippingRates: 4, coupons: 2, total: 48 },
  lastChange: null,
}
const storeCurrencyPreview = { from: "USD", to: "EUR", counts: storeCurrency.catalog, rate: 0.9184, asOf: "2026-10-14", examples: [{ title: "Speckled mug", before: 3200, converted: 2939 }] }
const markets = {
  ready: true,
  localization: {
    defaultLanguage: written ? "es" : "en",
    languages: written ? [] : [{ code: "fr", published: true }, { code: "de", published: true }, { code: "es", published: false }],
    markets: [
      { id: "home", name: "Home", primary: true, countries: ["US"], currency: null, language: null, rounding: "none", adjustBps: 0, active: true },
      { id: "eu", name: "Europe", primary: false, countries: ["DE", "FR", "IT", "ES"], currency: "EUR", language: null, rounding: "nine_nine", adjustBps: 0, active: true },
      { id: "uk", name: "United Kingdom", primary: false, countries: ["GB"], currency: "GBP", language: null, rounding: "whole", adjustBps: 0, active: true },
      { id: "jp", name: "Japan", primary: false, countries: ["JP"], currency: "JPY", language: null, rounding: "none", adjustBps: 0, active: true },
    ],
    visitorLanguage: false,
    autoTranslate: true,
  },
  autoTranslate: { run: { at: "2026-10-15T09:00:00Z", translated: 6, left: 0 }, available: true },
  baseCurrency: "USD",
  homeCountry: "US",
  chargeCurrency: "USD",
  fx: { asOf: "2026-10-14", fresh: true, currencies: ["EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "PLN", "RON", "SEK"], rates: { EUR: 1, USD: 1.0888, GBP: 0.8412, JPY: 163.2 } },
}
const translationSummary = written
  ? { ready: true, progress: { es: { done: 96, draft: 0, todo: 44, total: 140 } }, writtenIn: "en" }
  : { ready: true, progress: { fr: { done: 140, draft: 0, todo: 0, total: 140 }, de: { done: 138, draft: 0, todo: 2, total: 140 }, es: { done: 61, draft: 0, todo: 79, total: 140 } }, writtenIn: "en" }
const translationJobs = { ready: true, jobs: written ? {} : { es: { locale: "es", status: "running", done: 61, total: 140, drafted: 61, error: null, startedAt: hoursAgo(0.05), updatedAt: hoursAgo(0.01) } } }
/* The French sheet: a page's sections, a product and its description; most done, one edited by the owner, one changed since, one to do. */
const frenchTexts = {
  ready: true,
  locale: "fr",
  defaultLanguage: "en",
  progress: { done: 138, total: 140 },
  groups: [
    { id: "page:home", title: "Home page", items: [
      { key: "s1:heading", source: "Handmade stoneware for slow mornings", label: "Heading", where: "Hero", multiline: false, rich: false, value: "Grès fait main pour les matins tranquilles", status: "done", ai: false },
      { key: "s1:text", source: "Every piece is thrown, glazed and fired in our Portland studio.", label: "Text", where: "Hero", multiline: true, rich: false, value: "Chaque pièce est tournée, émaillée et cuite dans notre atelier de Portland.", status: "done", ai: true },
      { key: "s2:heading", source: "New this autumn", label: "Heading", where: "Featured collection", multiline: false, rich: false, value: "Nouveautés de l'automne", status: "outdated", ai: false },
    ] },
    { id: "products", title: "Products", items: [
      { key: "product:mug:title", source: "Speckled mug", label: "Title", where: "Speckled mug", multiline: false, rich: false, value: "Tasse mouchetée", status: "done", ai: true },
      { key: "product:mug:description", source: "A 12 oz mug with a speckled sand glaze. Dishwasher safe.", label: "Description", where: "Speckled mug", multiline: true, rich: false, value: "Une tasse de 35 cl à l'émail sable moucheté. Va au lave-vaisselle.", status: "done", ai: true },
      { key: "product:bowl:title", source: "Serving bowl", label: "Title", where: "Serving bowl", multiline: false, rich: false, value: "", status: "missing", ai: false },
    ] },
  ],
}

/* The studio's linen aprons, measured flat in cm: the chart the Size chart card and its editor show. */
const sizeCharts = [
  {
    id: "chart-aprons",
    name: "Linen aprons",
    unit: "cm",
    columns: [{ name: "Size", measure: false }, { name: "Width", measure: true }, { name: "Length", measure: true }, { name: "Neck strap", measure: true }],
    rows: [["S/M", "70", "80", "56-62"], ["L/XL", "76", "86", "60-68"], ["Long", "76", "96", "60-68"]],
    notes: "Measured flat. The neck strap slides, so it fits either range.",
    imageUrl: null,
    productCount: 3,
    updatedAt: "2026-10-20T10:00:00Z",
  },
  { id: "chart-tees", name: "Studio tees", unit: "cm", columns: [{ name: "Size", measure: false }, { name: "Chest", measure: true }, { name: "Length", measure: true }], rows: [["S", "92", "69"], ["M", "98", "71"], ["L", "104", "74"]], notes: "", imageUrl: null, productCount: 2, updatedAt: "2026-10-18T10:00:00Z" },
]

function route(method: string, path: string, body: Record<string, unknown>, query: URLSearchParams = new URLSearchParams()): unknown {
  if (path === "/api/store/currency") return method === "POST" ? storeCurrencyPreview : storeCurrency
  if (path === "/api/store/markets") return markets
  if (path === "/api/store/translations/jobs") return translationJobs
  if (path === "/api/store/translations") return query.get("summary") === "1" ? translationSummary : frenchTexts
  /* The carrier picker in Fulfill items: no stars or own carriers yet, nothing on a provider account. */
  if (path === "/api/physical/carriers") return query.get("connected") === "1" ? { carriers: [], errors: [] } : { ...EMPTY_CARRIER_PREFS, ready: true }
  /* Buy a label: Shippo's rates, then the label (only with ?label; otherwise no label app is connected). */
  if (path.startsWith("/api/physical/orders/") && path.endsWith("/label")) {
    if (method === "GET") return labelOptions()
    if (body.action === "rates") return { provider: "shippo", shipmentId: "shp_1", rates: LABEL_RATES, addressOk: true, warnings: [], parcel: { lengthCm: 15, widthCm: 15, heightCm: 15, grams: 1520 } }
    /* Bought: the order as shipped with the label's number, and the label (the dialog shows Print label). */
    if (body.action === "buy") return { order: { ...order("shipped"), shipments: [{ ...order("shipped").shipments[0], trackingNumber: "9400100000000000000000" }] }, label: { ...demoLabel("f1"), testMode: false } }
    return {}
  }
  if (path === "/api/store/tracking-app") return { tracking: { platform: { on: true, providerName: "AfterShip", webhooks: true }, ready: true, own: null, following: 7, lastCheckedAt: hoursAgo(0.2) } }
  if (path === "/api/store/integrations/marketing") return { marketing: marketing() }
  if (path === "/api/store/cases") return { cases: [caseSummary] }
  if (path.startsWith("/api/store/cases/")) return { case: { ...caseSummary, unread: false }, messages: caseThread }
  if (path === "/api/physical/integrations/gelato/shipment-methods") return { methods: [{ uid: "normal", name: "Standard", hasTracking: true }, { uid: "ups_ground", name: "UPS Ground", hasTracking: true }] }
  if (/^\/api\/physical\/integrations\/(gelato|cj_dropshipping)\/links/.test(path)) return { rows: partnerRows(path.includes("gelato") ? "gelato" : "cj_dropshipping"), locationId: "loc-c", synced: 1 }
  if (path === "/api/checkout/site") return body.action === "quote" ? siteQuote(body as never) : {}
  if (path.startsWith("/api/physical/checkout/quote")) return quote(body as never)
  if (path === "/api/physical/checkout") return { url: "#", free: false }
  if (path.startsWith("/api/physical/storefront/product")) return buyBoxProduct
  if (path.startsWith("/api/physical/settings")) return physicalSettings()
  if (path.startsWith("/api/physical/shipping/profiles")) return { profiles: physicalSettings().profiles }
  if (path.startsWith("/api/physical/catalog-context")) return { locations: params.has("pod") ? [location1, location2, location3] : [location1, location2], profiles: [{ id: "p1", name: "General", isDefault: true, zoneCount: 2 }], settings: physicalSettings().settings }
  if (path.startsWith("/api/physical/products/")) return { product: physicalProduct }
  /* Size charts (components/physical/size-chart-card.tsx): ?sizes gives the demo store its apron chart, chosen for the product. */
  if (path === "/api/size-charts") return { ready: true, charts: params.has("sizes") ? sizeCharts : [] }
  if (path === "/api/size-charts/product") return { ready: true, chartId: params.has("sizes") ? sizeCharts[0].id : null }
  if (path.startsWith("/api/physical/inventory/movements")) return { movements: [] }
  if (path.startsWith("/api/physical/inventory")) return inventory
  if (path.startsWith("/api/physical/transfers")) return { transfers: [] }
  if (path.startsWith("/api/physical/orders/")) {
    const o = order(params.get("order") === "shipped" || params.get("order") === "tracked" ? "shipped" : params.get("order") === "pickup" ? "pickup" : "new")
    /* ?order=tracked: the parcel followed by courier tracking, with the carrier's scans. */
    if (params.get("order") === "tracked") Object.assign(o, { shipments: [trackedShipment], events: [{ id: 3, kind: "fulfillment.out_for_delivery", message: "Shipment out for delivery", actor: "webhook", createdAt: hoursAgo(5) }, ...o.events] })
    return { order: o, locations: [{ id: LOC, name: "Studio" }] }
  }
  if (path === "/api/store/integrations/catalog") return { overrides: [] }
  if (path.startsWith("/api/store/integrations")) return { tracking: { ga4: "G-1A2B3C4D5E" }, ready: true }
  /* Printful connected to the demo store (?printful): the location it made, drafts to approve, tracking by webhook. */
  if (path.startsWith("/api/physical/integrations") && params.has("partners")) return { integrations: partnerStates() }
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

/* A bought label opens its PDF in a new tab: nothing opens in a picture. */
window.open = () => null
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
  const out = route((init?.method || "GET").toUpperCase(), u.pathname, body, u.searchParams)
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

/* A website's product page, as a buyer sees it: Storelib's own variant picker with Size guide beside the size (components/website-builder/sections/renderers/product/product-blocks.tsx). */
function SizeGuidePage() {
  const [chosen, setChosen] = React.useState<(string | null)[]>(["Sand", "L/XL", null])
  const chart = sizeCharts[0]
  const product = {
    id: PRODUCT, title: "Linen apron", slug: "linen-apron", type: "physical", description: "", price_cents: 4800, compare_at_cents: null, thumbnail_url: "", gallery_urls: [],
    options: [{ name: "Color", values: ["Sand", "Moss"] }, { name: "Size", values: ["S/M", "L/XL", "Long"] }],
    variants: ["Sand", "Moss"].flatMap((c) => ["S/M", "L/XL", "Long"].map((z) => ({ id: `${c}-${z}`, name: `${c} / ${z}`, options: [c, z, null], price_cents: 4800, compare_at_cents: null, image_url: null, available: true, left: null, max_quantity: 9 }))),
    size_chart: { name: chart.name, unit: chart.unit, columns: chart.columns, rows: chart.rows, notes: chart.notes, imageUrl: null },
  }
  const palette = { heading: "#1c1917", text: "#292524", paragraph: "#44403c", text_muted: "#78716c", border: "#e7e5e4", bg: "#ffffff", background: "#ffffff" }
  const ctx = {
    product, sample: false, variant: null, chosen, choose: (i: number, v: string) => setChosen((c) => c.map((x, j) => (j === i ? v : x))), facts: { payWhatYouWant: false }, canBuy: true, quantity: 1, setQuantity: () => {}, maxQuantity: 9,
    pwywInput: "", setPwywInput: () => {}, pwywError: null, palette, inEditor: false, inert: false,
    buy: { add: () => {}, now: () => {}, added: false, unavailable: null }, wishlist: { saved: false, toggle: () => {} }, radius: "6px", buttonRadius: { borderRadius: 6 }, money: (c: number) => `$${(c / 100).toFixed(2)}`,
  }
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <div id="shot" style={{ maxWidth: 460, margin: "0 auto", padding: "32px 20px" }}>
        <p style={{ fontSize: 26, fontWeight: 600, color: palette.heading, margin: "0 0 6px" }}>Linen apron</p>
        <p style={{ fontSize: 18, color: palette.text, margin: "0 0 24px" }}>$48.00</p>
        <ProductBlock block={{ id: "vp", type: "variant_picker", settings: {} } as never} ctx={ctx as never} />
        <button type="button" style={{ width: "100%", height: 50, borderRadius: 6, background: palette.heading, color: "#fff", fontSize: 15, fontWeight: 500 }}>Add to cart</button>
      </div>
    </div>
  )
}

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

/* The website's own selectors under its footer (the builder theme's), as a visitor shown euros sees them; the editor's canvas draws the same ones. */
function SiteSelectors() {
  const choice = languageChoiceOf({
    defaultLanguage: "en",
    others: ["fr", "de"],
    locale: "en",
    markets: markets.localization.markets.filter((m) => !m.primary && m.currency).map((m) => ({ id: m.id, name: m.name, currency: m.currency!, countries: m.countries })),
    fresh: true,
    pricing: null,
    base: "USD",
    charge: "USD",
  })
  const currency = choice.currency ? { ...choice.currency, current: "eu" } : undefined
  return (
    <Page width={560} bg="#ffffff">
      <div style={{ background: "#f4efe8", color: "#2f2a24", borderRadius: 16 }}>
        <div className="px-6 pb-1 pt-6 text-center text-[13px] opacity-70">© 2026 Fern &amp; Clay</div>
        <LanguageSwitch choice={{ ...choice, currency }} preview={{ language: () => {}, currency: () => {} }} />
      </div>
    </Page>
  )
}

function App() {
  switch (view) {
    case "languages":
      return <Page width={760}><MarketsPanel /></Page>
    case "translate-sheet":
      return <TranslateSheet locale="fr" defaultLanguage="en" published onPublish={() => {}} onClose={() => {}} />
    case "site-selectors":
      return <SiteSelectors />
    case "site-checkout":
      return <SiteCheckoutView />
    case "kinds":
      return (
        <Page width={460} bg="#ffffff">
          <div className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="px-3 pb-2 pt-1 text-[17px] font-semibold text-[#1a1a2e]">What are you selling?</p>
            <KindList onChoose={() => {}} />
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
    case "size-guide":
      return <SizeGuidePage />
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
            shop={{ name: "Fern & Clay", avatar: null, email: "hello@fernandclay.example", ...(params.has("help") ? { phone: "+1 503 555 0142", websiteUrl: "https://fernandclay.example" } : {}) }}
            {...(params.has("help") ? { help: { openCase: null } } : {})}
            canReturn={!params.get("cancel")}
            cancel={(params.get("cancel") as never) ?? undefined}
            order={{
              id: PRODUCT, status: "paid", fulfillmentStatus: params.get("cancel") ? "unfulfilled" : "fulfilled", cancelled: false, createdAt: "2026-10-07T10:00:00Z", email: "sam@example.com", name: "Sam Rivera",
              address: { name: "Sam Rivera", line1: "48 Maple Avenue", city: "Denver", region: "CO", postalCode: "80203", country: "US" },
              delivery: { name: "Standard", priceCents: 600, minDays: 3, maxDays: 5 }, pickup: null, processing: !params.get("cancel"),
              totals: { subtotal: 10800, discount: 0, shipping: 600, tax: 0, taxIncluded: false, total: 11400, refunded: 0 },
              lines: [
                { orderId: "11111111-1111-4111-8111-111111111111", title: "Speckled mug", variantName: "12 oz / Sand", imageUrl: MUG_SAND, quantity: 2, cents: 6400, type: "physical", receiptToken: null, returnable: 2 },
                { orderId: "22222222-2222-4222-8222-222222222222", title: "Serving bowl", variantName: null, imageUrl: BOWL, quantity: 1, cents: 4400, type: "physical", receiptToken: null, returnable: 1 },
              ],
              shipments: params.get("cancel")
                ? []
                : params.has("tracked")
                  ? /* Followed by courier tracking: the carrier's scans and the estimated delivery. */
                    [{ id: "s1", status: "out_for_delivery", carrier: "USPS", trackingNumber: trackedShipment.trackingNumber, trackingUrl: trackedShipment.trackingUrl, shippedAt: trackedShipment.shippedAt, deliveredAt: null, items: trackedShipment.items, updates: [...trackedShipment.events].reverse().map((e) => ({ status: e.status, at: e.occurredAt })), checkpoints: CHECKPOINTS, tracking: { status: "out_for_delivery", estimatedDelivery: ETA, auto: true } }]
                  : [{ id: "s1", status: params.has("problem") ? "failed" : "in_transit", carrier: "USPS", trackingNumber: "9400 1000 0000 0000 0000 00", trackingUrl: "https://tools.usps.com/go/TrackConfirmAction", shippedAt: "2026-10-08T15:00:00Z", deliveredAt: null, items: [{ orderId: "11111111-1111-4111-8111-111111111111", quantity: 2 }] }],
              returns: [],
            } as never}
          />
        </div>
      )
    case "messages":
      return <Page width={760}><OrderMessagesCard checkoutId={PRODUCT} /></Page>
    case "case":
      return (
        <div id="shot">
          <CaseView
            id={CASE_ID}
            k="demo"
            initial={{ case: caseSummary as never, messages: caseThread as never, escalation: { can: true, from: hoursAgo(26) } }}
            store={{ name: "Fern & Clay", logoUrl: null, email: "hello@fernandclay.example", phone: "+1 503 555 0142", websiteUrl: "https://fernandclay.example" }}
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
      return <div id="shot" style={{ height: "100vh" }}><OffersClient initialOffers={offers.offers} products={offers.products} collections={[]} currency="USD" ready={offers.ready} settingsReady breaksReady sold={{ o1: 14, o2: 9, o3: 23 }} physical /></div>
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
