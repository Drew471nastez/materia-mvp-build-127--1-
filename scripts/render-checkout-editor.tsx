/**
 * Settings › Checkout › Checkout text, for scripts/check-checkout-editor.mjs:
 * the real editor (components/app/settings/checkout-text-editor.tsx) with
 * its two reads answered from a fixture store, the real preview frame
 * (app/checkout/preview/preview-document.tsx) at /checkout/preview, and at
 * /real the website's checkout and thank you page drawn on their own with
 * the same store, so the probe can hold the frame's markup against the
 * real thing.
 *
 *   ?business=1   the store offers company invoices (Settings › Checkout)
 *   /real?mode=shipped&view=thanks&lang=ro&pay=…   the checkout on its own, in those words
 */
import * as React from "react"
import { CheckoutTextEditor } from "@/components/app/settings/checkout-text-editor"
import { CheckoutPreviewDocument } from "@/app/checkout/preview/preview-document"
import { SiteCheckout } from "@/app/checkout/site/site-checkout"
import { ThanksView } from "@/app/checkout/site/thanks/[token]/thanks-view"
import { ShopBar } from "@/app/checkout/parts/shop-bar"
import { CheckoutWords } from "@/app/checkout/parts/words"
import { CheckoutCurrency } from "@/app/checkout/parts/ui"
import { checkoutConfig } from "@/lib/store/checkout-config"
import { checkoutWordsIn } from "@/lib/markets/checkout-words"
import { EDITABLE_TEXTS, PROTECTED_TEXTS, TEXT_GROUPS, placeholdersOf } from "@/lib/checkout-text/registry"
import { orderPageFor, thanksFor } from "@/lib/checkout-text/preview-cases"
import type { CheckoutPreviewData } from "@/lib/checkout-text/preview"
import type { SiteQuote } from "@/lib/checkout/site-quote-server"

const SHOP = "c0000000-0000-4000-8000-000000000001"
const COURSE = "a0000000-0000-4000-8000-0000000000a1"
const MUG = "a0000000-0000-4000-8000-0000000000b2"
const params = new URLSearchParams(location.search)
const business = params.get("business") === "1"
const config = checkoutConfig({ nameFields: "first_and_last", phone: "optional", marketingOptIn: true, businessInvoice: business })
const brand = { name: "Bread Studio", imageUrl: null, kind: null }
const currency = "RON"
const country = "RO"

const digitalQuote: SiteQuote = {
  kind: "digital",
  creatorId: SHOP,
  lines: [{ productId: COURSE, variantId: null, title: "Sourdough at home", variantName: null, imageUrl: null, type: "course", quantity: 1, unitCents: 14900, discountCents: 0, requiresShipping: false, maxQuantity: 1 }],
  dropped: [],
  stockIssues: [],
  requiresShipping: false,
  coupon: null,
  couponError: null,
  delivery: { ok: true, options: [], selectedId: null, needsCountry: false },
  pickups: [],
  totals: { itemsSubtotalCents: 14900, discountCents: 0, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: 14900 },
}
const shippedQuote: SiteQuote = {
  kind: "ships",
  creatorId: SHOP,
  lines: [{ productId: MUG, variantId: null, title: "Stoneware mug", variantName: null, imageUrl: null, type: "physical", quantity: 2, unitCents: 6000, discountCents: 0, requiresShipping: true, maxQuantity: 9 }],
  dropped: [],
  stockIssues: [],
  requiresShipping: true,
  coupon: null,
  couponError: null,
  delivery: { ok: true, options: [{ id: "r1", name: "Fan Courier", priceCents: 1999, estimate: "1 to 2 business days" }], selectedId: "r1", needsCountry: false },
  pickups: [],
  totals: { itemsSubtotalCents: 12000, discountCents: 0, shippingCents: 1999, shippingDiscountCents: 0, taxCents: 2235, taxIncluded: true, totalCents: 13999, taxLabel: "TVA 19%" },
  physical: true,
  shipsTo: ["RO"],
}

const shop = { name: brand.name, avatar: null, avatarKind: null, email: null, phone: "+40 721 234 567", websiteUrl: "https://bread.studio/", legal: null }
function data(lang: string): CheckoutPreviewData {
  return {
    lang,
    currency,
    brand,
    shopUrl: "https://bread.studio/",
    backTo: "https://bread.studio/cart",
    config,
    country,
    words: checkoutWordsIn(lang, null, null),
    digital: { items: [{ productId: COURSE, variantId: null, quantity: 1 }], quote: digitalQuote, thanks: thanksFor(digitalQuote, currency, country, false), orderPage: null, standIn: false },
    shipped: { items: [{ productId: MUG, variantId: null, quantity: 2 }], quote: shippedQuote, thanks: thanksFor(shippedQuote, currency, country, true), orderPage: orderPageFor(shippedQuote, currency, country, shop), standIn: false },
  }
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))

/** The editor's two reads, answered from the fixture store; Save is kept in memory. */
function stubEditorApi() {
  const kept: Record<string, Record<string, string>> = {}
  const realFetch = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input), location.href)
    const lang = url.searchParams.get("lang") || "en"
    if (url.pathname === "/api/store/checkout-text/preview") return json(data(lang))
    if (url.pathname === "/api/store/checkout-text") {
      if ((init?.method ?? "GET") === "PUT") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { lang: string; changes: { id: string; text: string }[] }
        for (const c of body.changes) (kept[body.lang] ??= {})[c.id] = c.text
        return json({ ok: true, saved: body.changes.length })
      }
      const words = checkoutWordsIn(lang, null, null)
      return json({
        ready: true,
        lang,
        languages: [
          { code: "en", name: "English", own: "English" },
          { code: "ro", name: "Romanian", own: "Română" },
        ],
        shopName: brand.name,
        currency,
        groups: TEXT_GROUPS,
        items: EDITABLE_TEXTS.map((e) => ({ id: e.id, group: e.group, source: e.source, note: e.note, max: e.max, placeholders: placeholdersOf(e.source), default: words[e.source] ?? e.source, value: kept[lang]?.[e.id] ?? "", defaultChanged: false })),
        locked: PROTECTED_TEXTS.map((p) => ({ ...p, text: words[p.source] ?? p.source })),
      })
    }
    if (url.origin === location.origin && url.pathname.startsWith("/api/")) return json({})
    return realFetch(input as RequestInfo, init)
  }) as typeof fetch
}

/** The website's checkout on its own, as app/checkout/site/page.tsx draws it, in the words asked for. */
function RealCheckout() {
  const lang = params.get("lang") || "en"
  const shipped = params.get("mode") === "shipped"
  const d = data(lang)
  const words = { ...d.words, ...(params.get("pay") ? { "Pay {amount}": params.get("pay")! } : {}) }
  const kase = shipped ? d.shipped! : d.digital
  if (params.get("view") === "thanks") {
    return (
      <CheckoutWords lang={lang} words={words}>
        <div data-page="checkout-thanks" className="min-h-dvh bg-[#f8f9fa]">
          <ShopBar brand={brand} backTo={null} shopUrl={d.shopUrl} />
          <ThanksView order={kase.thanks} shopUrl={d.shopUrl} lang={lang} words={words} map={null} />
        </div>
      </CheckoutWords>
    )
  }
  return (
    <CheckoutWords lang={lang} words={words}>
      <CheckoutCurrency currency={currency}>
        <SiteCheckout shopId={SHOP} brand={brand} shopUrl={d.shopUrl} backTo={d.backTo} items={kase.items} wholeCart={false} couponCode={null} initialQuote={kase.quote} initialError={null} config={config} buyer={null} lockedEmail={null} needsSignIn={false} initialCountry={country} lang={lang} />
      </CheckoutCurrency>
    </CheckoutWords>
  )
}

export function boot(render: (el: React.ReactElement) => void) {
  if (location.pathname === "/checkout/preview") return render(<CheckoutPreviewDocument />)
  if (location.pathname === "/real") {
    /* The same answers the frame gives: nothing leaves. */
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string }
      const shipped = params.get("mode") === "shipped"
      return body.action === "quote" ? json(shipped ? shippedQuote : digitalQuote) : json({})
    }) as typeof fetch
    return render(<RealCheckout />)
  }
  stubEditorApi()
  render(
    <div className="min-h-dvh bg-[#f8f9fa]">
      <CheckoutTextEditor onClose={() => undefined} />
    </div>,
  )
}
