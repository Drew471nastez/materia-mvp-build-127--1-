/**
 * Help Center screenshots for the offers guide (lib/help/offer-articles.ts):
 * the real components with made up demo data, the same ceramics studio
 * called Fern & Clay as scripts/render-help-shots.tsx. `?view=` picks a
 * screen; every /api request is answered here, and every number an answer
 * holds is worked out by lib/offers itself (applyOffers, tryCart,
 * tierTotals, bundlePrice), the arithmetic the checkout charges by, so a
 * picture never shows a price the store would not charge.
 *
 *   list       Products › Upsells and bundles, with four offers
 *   empty      the same page before the first offer
 *   new        a new offer on its own page (/app/offers/new), `&kind=` as
 *              the address takes it
 *   offer      a saved offer on its own page (/app/offers/<id>), `&id=`
 *   product    a website product page: the Price, Quantity, Buy buttons and
 *              Bundles and upsells blocks of Storelib's product section
 *   featured   Storelib's Featured products section (the real .storelib
 *              template), each card with its product's offers drawn in by
 *              components/website-builder/sections/offer-islands.tsx
 *   cart       the website's cart page, with a quantity break saving, an
 *              upsell to add and a bundle to finish
 *   checkout   the website's checkout, with the offers' savings and Add to
 *              your order
 *
 * Taken by scripts/help-offer-shots.mjs.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { OffersClient } from "@/app/(storelib)/app/offers/offers-client"
import { OfferEditor } from "@/app/(storelib)/app/offers/offer-editor"
import { ProductBlock } from "@/components/website-builder/sections/renderers/product/product-blocks"
import { productBlockDefaults } from "@/lib/website-builder/product-page"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { CartPageBody } from "@/components/website-builder/cart-page-body"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import { SiteCheckout } from "@/app/(storelib)/checkout/site/site-checkout"
import { checkoutConfig } from "@/lib/store/checkout-config"
import { cartStorageKey, serializeCart, type CartLine } from "@/lib/website-builder/cart"
import { applyOffers, bundleCompletions, bundlePrice, bundlesWith, discountLabel, offerUnitPrice, suggestionsFor, upsellsFor, type Offer } from "@/lib/offers/offers"
import { tierTotals } from "@/lib/offers/pricing"
import { tryCart, DRAFT_ID } from "@/lib/offers/try-cart"
import { OfferIslands } from "@/components/website-builder/sections/offer-islands"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "list"

/* ── Demo data ─────────────────────────────────────────────────────────── */

const SHOP = "0f3a9c2e-1111-4222-8333-444455556666"
const MUG = "0f3a9c2e-2222-4222-8333-444455556666"
const BOWL = "0f3a9c2e-3333-4222-8333-444455556666"
const APRON = "0f3a9c2e-4444-4222-8333-444455556666"
const TOTE = "0f3a9c2e-5555-4222-8333-444455556666"
const MUG_V = "00000000-0000-4000-8000-000000000001"

/** A plain product picture on a warm background, as the other help shots draw them. */
function pic(kind: "mug" | "bowl" | "apron" | "tote", bg: string, ink: string) {
  const shape =
    kind === "mug"
      ? `<rect x="230" y="200" width="260" height="300" rx="34" fill="${ink}"/><path d="M490 270 h40 a60 60 0 0 1 0 120 h-40" fill="none" stroke="${ink}" stroke-width="34"/><ellipse cx="360" cy="205" rx="130" ry="22" fill="#00000022"/>`
      : kind === "bowl"
        ? `<path d="M170 300 h380 a190 170 0 0 1 -380 0z" fill="${ink}"/><ellipse cx="360" cy="300" rx="190" ry="34" fill="#00000026"/>`
        : kind === "apron"
          ? `<path d="M280 160 h160 l30 120 l40 300 h-300 l40 -300z" fill="${ink}"/><rect x="300" y="330" width="120" height="80" rx="10" fill="#ffffff33"/>`
          : `<rect x="200" y="260" width="320" height="300" rx="14" fill="${ink}"/><path d="M270 260 v-60 a90 90 0 0 1 180 0 v60" fill="none" stroke="${ink}" stroke-width="26"/>`
  return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720"><rect width="720" height="720" fill="${bg}"/>${shape}</svg>`)
}
const IMG = {
  mug: pic("mug", "#efe6da", "#c9b49a"),
  bowl: pic("bowl", "#e9e5df", "#9d8f7f"),
  apron: pic("apron", "#e6e8ea", "#3d4a5c"),
  tote: pic("tote", "#e8ede4", "#7f9372"),
}

type Item = { id: string; title: string; slug: string; image: string; priceCents: number }
const ITEMS: Item[] = [
  { id: MUG, title: "Speckled mug", slug: "speckled-mug", image: IMG.mug, priceCents: 3200 },
  { id: BOWL, title: "Serving bowl", slug: "serving-bowl", image: IMG.bowl, priceCents: 4400 },
  { id: APRON, title: "Linen apron", slug: "linen-apron", image: IMG.apron, priceCents: 3800 },
  { id: TOTE, title: "Market tote", slug: "market-tote", image: IMG.tote, priceCents: 2600 },
]
const item = (id: string) => ITEMS.find((i) => i.id === id)!
/** A product as the offer answers carry it (lib/offers/contract.ts OfferItem). */
const card = (id: string) => {
  const i = item(id)
  return { id: i.id, title: i.title, slug: i.slug, imageUrl: i.image, type: "physical", priceCents: i.priceCents, variants: [{ id: `${i.id.slice(0, 30)}v1`, name: "Default", priceCents: i.priceCents }] }
}

const O1 = "a1000000-0000-4000-8000-000000000001"
const O2 = "a1000000-0000-4000-8000-000000000002"
const O3 = "a1000000-0000-4000-8000-000000000003"
const O4 = "a1000000-0000-4000-8000-000000000004"

const OFFERS: Offer[] = [
  { id: O1, kind: "bundle", title: "Breakfast set", productIds: [MUG, BOWL], triggerIds: [], triggerCollectionIds: [], discountType: "percent", discountValue: 10, active: true, placements: ["product", "cart"], combinesWithCodes: true, maxPerOrder: null },
  { id: O2, kind: "checkout", title: "Add an apron", productIds: [APRON], triggerIds: [MUG, BOWL], triggerCollectionIds: [], discountType: "fixed", discountValue: 500, active: true, placements: ["product", "cart", "checkout"], combinesWithCodes: true, maxPerOrder: 1, minSubtotalCents: 3000 },
  {
    id: O3, kind: "quantity_break", title: "Buy more mugs, save more", productIds: [MUG], triggerIds: [], triggerCollectionIds: [], discountType: "none", discountValue: 0, active: true, placements: ["product", "cart"], combinesWithCodes: true,
    tiers: [
      { quantity: 1, freeQuantity: 0, discountType: "none", discountValue: 0, label: "Buy 1", badge: "" },
      { quantity: 2, freeQuantity: 1, discountType: "none", discountValue: 0, label: "Buy 2 get 1 free", badge: "Most popular" },
      { quantity: 4, freeQuantity: 0, discountType: "percent", discountValue: 30, label: "Buy 4, save 30%", badge: "" },
    ],
  },
  /* A holiday offer that starts later: Scheduled in the list. */
  { id: O4, kind: "checkout", title: "Tote for the road", productIds: [TOTE], triggerIds: [], triggerCollectionIds: [], discountType: "percent", discountValue: 20, active: true, placements: ["checkout"], startsAt: "2026-11-27T08:00:00Z", endsAt: "2026-12-01T08:00:00Z", combinesWithCodes: false, maxPerOrder: 1 },
]

const P = (i: Item) => ({ id: i.id, title: i.title, type: "physical", published: true, priceCents: i.priceCents, imageUrl: i.image, payWhatYouWant: false })
const area = { ready: true, products: ITEMS.map(P), offers: params.get("view") === "empty" ? [] : OFFERS }

/* ── The offers' answers, from lib/offers ─────────────────────────────── */

const lineOf = (id: string, quantity: number) => ({ productId: id, unitCents: item(id).priceCents, quantity, collectionIds: [] as string[] })

/** GET /api/offers?product=: what a product page offers with the product (lib/offers/offers-public.ts productOffers). */
function productOffers(productId: string) {
  const bundles = bundlesWith(productId, OFFERS).map((b) => {
    const items = [...b.productIds].sort((a, c) => (a === productId ? -1 : c === productId ? 1 : 0)).map(card)
    const { fullCents, priceCents } = bundlePrice(b, items.map((i) => i.priceCents))
    return { offerId: b.id, title: b.title, label: discountLabel(b), discountType: b.discountType, discountValue: b.discountValue, items, fullCents, priceCents }
  })
  const checkoutOffers = upsellsFor(productId, [], OFFERS).map((u) => ({ offerId: u.id, title: u.title, label: discountLabel(u), discountType: u.discountType, discountValue: u.discountValue, product: card(u.productIds[0]), offerPriceCents: offerUnitPrice(u, item(u.productIds[0]).priceCents) }))
  const price = item(productId).priceCents
  const quantityBreaks = OFFERS.filter((o) => o.kind === "quantity_break" && o.productIds[0] === productId).map((o) => ({
    offerId: o.id, productId, title: o.title,
    tiers: (o.tiers ?? []).map((t) => ({ ...t, ...tierTotals(price, t, null) })),
    /* What the tiers are priced at, as lib/offers/offers-public.ts says it: the product's default option. */
    priceCents: price, compareAtCents: null, variantId: productId === MUG ? MUG_V : null, variantName: null,
  }))
  return { bundles, checkoutOffers, quantityBreaks }
}

/** POST /api/offers/cart: what a cart gets and could add (app/api/offers/cart/route.ts). */
function cartOffers(items: { productId: string; quantity: number }[]) {
  const lines = items.map((i) => lineOf(i.productId, i.quantity))
  const got = applyOffers(lines, OFFERS)
  const subtotalCents = lines.reduce((n, l) => n + l.unitCents * l.quantity, 0)
  const offerCents = got.discounts.reduce((n, d) => n + d, 0)
  return {
    currency: "USD", subtotalCents, offerCents, totalCents: subtotalCents - offerCents, freeShipping: got.freeShipping,
    offers: got.applied.map((a) => ({ offerId: a.offerId, title: a.title, savedCents: a.savedCents, freeShipping: !!a.freeShipping })),
    lines: items.map((i, n) => ({ productId: i.productId, variantId: null, discountCents: got.discounts[n] })),
    suggestions: suggestionsFor(lines, OFFERS, { placement: "cart" }).map((s) => ({ offerId: s.id, title: s.title, label: discountLabel(s), product: card(s.productIds[0]), offerPriceCents: offerUnitPrice(s, item(s.productIds[0]).priceCents) })),
    completions: bundleCompletions(lines, OFFERS).map(({ offer, missing }) => {
      const { fullCents, priceCents } = bundlePrice(offer, offer.productIds.map((id) => item(id).priceCents))
      return { offerId: offer.id, title: offer.title, label: discountLabel(offer), missing: missing.map(card), savingCents: fullCents - priceCents }
    }),
  }
}

/** The website checkout's quote (app/api/checkout/site, lib/checkout/site-quote-server), its offers worked out by applyOffers. */
function siteQuote(items: { productId: string; variantId?: string | null; quantity: number }[]) {
  const offerLines = items.map((i) => lineOf(i.productId, i.quantity))
  const got = applyOffers(offerLines, OFFERS)
  const lines = items.map((i, n) => ({
    productId: i.productId, variantId: i.variantId ?? null, title: item(i.productId).title, variantName: i.productId === MUG ? "12 oz / Sand" : null, imageUrl: item(i.productId).image, type: "physical",
    quantity: i.quantity, unitCents: item(i.productId).priceCents, discountCents: got.discounts[n], requiresShipping: true, maxQuantity: 9, offers: got.lineOffers[n],
  }))
  const sub = lines.reduce((t, l) => t + l.unitCents * l.quantity, 0)
  const off = got.discounts.reduce((n, d) => n + d, 0)
  const ship = 600
  return {
    kind: "ships", creatorId: SHOP, lines, dropped: [], stockIssues: [], requiresShipping: true, coupon: null, couponError: null, physical: true,
    delivery: { ok: true, options: [{ id: "r1", name: "Standard", priceCents: ship, estimate: "3 to 5 business days" }], selectedId: "r1", needsCountry: false },
    pickups: [],
    totals: { itemsSubtotalCents: sub, discountCents: off, shippingCents: ship, shippingDiscountCents: 0, taxCents: 0, taxIncluded: false, totalCents: sub - off + ship },
    offers: got.applied.map((a) => ({ title: a.title, savedCents: a.savedCents })),
    suggestions: suggestionsFor(offerLines, OFFERS, { placement: "checkout" }).map((s) => ({ offerId: s.id, title: s.title, label: discountLabel(s), product: card(s.productIds[0]), offerPriceCents: offerUnitPrice(s, item(s.productIds[0]).priceCents) })),
  }
}

const CHECKOUT_ITEMS = [{ productId: MUG, variantId: MUG_V, quantity: 3 }, { productId: BOWL, variantId: null, quantity: 1 }]

function route(method: string, path: string, body: Record<string, unknown>, q: URLSearchParams): unknown {
  if (path === "/api/store/offers/try") {
    const draft = { ...(body.offer as Offer), id: typeof body.id === "string" ? body.id : DRAFT_ID }
    const lines = ((body.items ?? []) as { productId: string; quantity: number }[]).map((i) => ({ ...lineOf(i.productId, i.quantity), title: item(i.productId).title }))
    return tryCart(lines, OFFERS, draft)
  }
  if (path.startsWith("/api/store/offers")) return area
  if (path === "/api/offers") return productOffers(q.get("product") ?? MUG)
  if (path === "/api/offers/cart") return cartOffers((body.items ?? []) as { productId: string; quantity: number }[])
  if (path === "/api/checkout/site") return siteQuote(((body.items as typeof CHECKOUT_ITEMS | undefined)?.length ? body.items : CHECKOUT_ITEMS) as typeof CHECKOUT_ITEMS)
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
  const out = route((init?.method || "GET").toUpperCase(), u.pathname, body, u.searchParams)
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } })
}

/* ── Screens ───────────────────────────────────────────────────────────── */

const money = (c: number) => `$${(c / 100).toFixed(2)}`

/** A product page on the website: Storelib's product section's own blocks, the picture beside them. */
function ProductPage() {
  const [quantity, setQuantity] = React.useState(Number(params.get("qty")) || 3)
  const mug = item(MUG)
  const product = {
    id: MUG, title: mug.title, slug: mug.slug, type: "physical", description: "", price_cents: mug.priceCents, compare_at_cents: null, thumbnail_url: mug.image, gallery_urls: [],
    options: [], variants: [{ id: MUG_V, name: "Default", options: [null, null, null], price_cents: mug.priceCents, compare_at_cents: null, image_url: null, available: true, left: null, max_quantity: 20 }],
  }
  const palette = { heading: "#1c1917", text: "#292524", paragraph: "#57534e", text_muted: "#78716c", border: "#e7e5e4", bg: "#ffffff", background: "#ffffff", background_secondary: "#f5f5f4", primary_button_background: "#1c1917", primary_button_text: "#ffffff" }
  const ctx = {
    product, sample: false, variant: product.variants[0], chosen: [], choose: () => {}, facts: { priceCents: mug.priceCents, compareAtCents: null, payWhatYouWant: false, minCents: 0 }, canBuy: true, quantity, setQuantity, maxQuantity: 20,
    pwywInput: "", setPwywInput: () => {}, pwywError: null, palette, inEditor: false, inert: false,
    buy: { add: () => {}, now: () => {}, added: false, unavailable: null }, wishlist: { saved: false, toggle: () => {} }, radius: "8px", buttonRadius: { borderRadius: 8 }, money,
    offers: { chosen: { variantId: MUG_V, variantName: null, priceCents: mug.priceCents, imageUrl: mug.image }, addLines: () => true },
  }
  const block = (type: string) => <ProductBlock block={{ id: type, type, settings: productBlockDefaults(type) } as never} ctx={ctx as never} />
  const phone = innerWidth < 600
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <div id="shot" style={{ maxWidth: 1040, margin: "0 auto", padding: phone ? "20px 16px" : "40px 32px", display: "grid", gridTemplateColumns: phone ? "1fr" : "1fr 440px", gap: phone ? 20 : 48, alignItems: "start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mug.image} alt="" style={{ width: "100%", aspectRatio: phone ? "4 / 3" : "1 / 1", objectFit: "cover", borderRadius: 8 }} />
        <div>
          {block("title")}
          {block("price")}
          {block("quantity")}
          {block("buy_buttons")}
          {block("offers")}
        </div>
      </div>
    </div>
  )
}

/** The website's cart page with three mugs in it, as a browser keeps a cart. */
function CartView() {
  const mug = item(MUG)
  const line: CartLine = { productId: MUG, variantId: MUG_V, title: mug.title, variantName: "12 oz / Sand", priceCents: mug.priceCents, thumbnailUrl: mug.image, slug: mug.slug, digital: false, physical: true, quantity: 3, currency: "USD" } as CartLine
  try {
    localStorage.setItem(cartStorageKey(SHOP), serializeCart([line]))
  } catch {
    /* no storage: an empty cart */
  }
  const palette = { bg: "#ffffff", text: "#292524", heading: "#1c1917", border: "#e7e5e4", buttonBg: "#1c1917", buttonText: "#ffffff" }
  return (
    <StorefrontProvider value={{ currency: "USD" }}>
      <SiteCartProvider shopId={SHOP} currency="USD" cartType="page">
        <div id="shot" style={{ background: palette.bg, color: palette.text, minHeight: "100vh" }}>
          <CartPageBody palette={palette} radius={8} />
        </div>
      </SiteCartProvider>
    </StorefrontProvider>
  )
}

/**
 * Storelib's Featured products section on a home page: its own template, drawn
 * by the theme engine in Node (scripts/help-offer-shots.mjs featuredSection,
 * handed in as window.__featured: the engine is not bundled for a browser
 * here), and its cards' offers drawn into the marks it leaves.
 */
function FeaturedView() {
  const out = (window as unknown as { __featured?: { html: string; css: string } }).__featured ?? { html: "", css: "" }
  const [root, setRoot] = React.useState<HTMLDivElement | null>(null)
  const [html] = React.useState(() => ({ __html: out.html }))
  return (
    <StorefrontProvider value={{ currency: "USD", creatorId: SHOP } as never}>
      <SiteCartProvider shopId={SHOP} currency="USD" cartType="drawer">
        <div id="shot" style={{ background: "#fff", minHeight: "100vh" }}>
          <style>{out.css}</style>
          <div ref={setRoot} dangerouslySetInnerHTML={html} />
          <OfferIslands root={root} html={out.html} inert={false} />
        </div>
      </SiteCartProvider>
    </StorefrontProvider>
  )
}

const SITE_LOGO = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><text x="0" y="56" font-size="44" font-family="Georgia" font-weight="700" fill="#1c1917">Fern &amp; Clay</text></svg>')

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

function CheckoutView() {
  fakeStripe()
  return (
    <div id="shot">
      <SiteCheckout
        shopId={SHOP}
        brand={{ name: "Fern & Clay", imageUrl: SITE_LOGO, kind: "logo" } as never}
        shopUrl={`${location.origin}/`}
        backTo={`${location.origin}/cart`}
        items={CHECKOUT_ITEMS as never}
        wholeCart={false}
        couponCode={null}
        initialQuote={siteQuote(CHECKOUT_ITEMS) as never}
        initialError={null}
        config={checkoutConfig({ marketingOptIn: false })}
        buyer={null}
        lockedEmail={null}
        needsSignIn={false}
      />
    </div>
  )
}

const SOLD: Record<string, number> = { [O1]: 14, [O2]: 9, [O3]: 23 }

function App() {
  switch (view) {
    case "list":
    case "empty":
      return <div id="shot" style={{ height: "100vh" }}><OffersClient initialOffers={area.offers} products={area.products} collections={[]} currency="USD" ready settingsReady breaksReady sold={SOLD} physical /></div>
    case "new":
    case "offer": {
      /* The page the editor's routes draw (app/(storelib)/app/offers/new/page.tsx, [id]/page.tsx), with the props they read from the server. */
      const offer = view === "offer" ? (OFFERS.find((o) => o.id === params.get("id")) ?? OFFERS[0]) : null
      const kind = offer?.kind ?? ((["bundle", "checkout", "quantity_break"] as const).find((k) => k === params.get("kind")) ?? "bundle")
      return (
        <div id="shot">
          <OfferEditor key={offer?.id ?? kind} offer={offer} kind={kind} products={area.products} collections={[]} others={OFFERS} currency="USD" physical ready settingsReady breaksReady sold={offer ? (SOLD[offer.id] ?? 0) : 0} />
        </div>
      )
    }
    case "product":
      return <ProductPage />
    case "featured":
      return <FeaturedView />
    case "cart":
      return <CartView />
    case "checkout":
      return <CheckoutView />
    default:
      return <p>Unknown view</p>
  }
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce>
    <App />
  </PlatformSettingsProvider>,
)
