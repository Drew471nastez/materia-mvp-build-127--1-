import type { Metadata } from "next"
import { requirePhysicalPage } from "@/lib/physical/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { PhysicalCheckout } from "./physical-checkout"
import { loadCheckoutConfig } from "@/lib/store/settings-server"
import { DEFAULT_CHECKOUT } from "@/lib/store/checkout-config"
import { checkoutReturns } from "@/lib/checkout/site-hosts"
import { checkoutBrand, type CheckoutBrand } from "@/lib/checkout/brand-server"
import { redirect } from "next/navigation"
import { getMainDomain } from "@/lib/url-helpers"
import { legacyBasketTarget } from "@/lib/checkout/site-checkout"
import { servingSiteOrigin } from "@/lib/checkout/site-checkout-server"
import { websiteCheckoutFor } from "@/lib/checkout/shipped-checkout-server"
import { fullUserForRequest } from "@/lib/auth/request-scope"
import { CheckoutCurrency } from "../parts/ui"
import { readStoreCurrency } from "@/lib/store/selling-currency-server"
import { platformSellingCurrency } from "@/lib/store/selling-currency"
import { cookies, headers } from "next/headers"
import { countryCode } from "@/lib/checkout/countries"
import { CHECKOUT_COUNTRY_COOKIE } from "@/lib/checkout/checkout-country"
import { decodeItems, type LinkItem } from "@/lib/physical/cart-link"
import { firstQuoteBody } from "@/lib/physical/first-quote"
import { stripeEarly } from "../parts/stripe-early"
import { ShopBar } from "../parts/shop-bar"
import { Suspense, use } from "react"
import type * as React from "react"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } }

/** A read started before it is needed: awaited later as it is, and never an unheard rejection when the page ends first. */
function early<T>(read: Promise<T>): Promise<T> {
  read.catch(() => {})
  return read
}

/**
 * THE CART PRICED BEFORE THE FIRST FRAME. The page used to arrive with no
 * order at all: the browser ran its scripts, then asked the quote route,
 * and only then wrote a line or a price (most of a second after the page
 * itself on a phone). The same route is asked here, on the server, with
 * exactly what the page's own first ask sends (no code, no address yet,
 * the country the page opens on), so the answer is the one the page would
 * have fetched, through the same checks and limits. Anything other than an
 * answer leaves the page to ask as it always did.
 */
async function firstQuote(h: Headers, shopId: string, items: LinkItem[], country: string): Promise<Record<string, unknown> | null> {
  try {
    const { POST } = await import("@/app/api/physical/checkout/quote/route")
    const forward = new Headers({ "content-type": "application/json" })
    /* The buyer's address, for the route's rate limit, as their own request would carry it. */
    for (const k of ["x-forwarded-for", "x-real-ip"]) {
      const v = h.get(k)
      if (v) forward.set(k, v)
    }
    const res = await POST(
      new Request("https://checkout.invalid/api/physical/checkout/quote", {
        method: "POST",
        headers: forward,
        body: JSON.stringify(firstQuoteBody(shopId, items, country)),
      }),
    )
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * The checkout for a cart with something to ship: email, delivery address,
 * delivery option, then the payment: Stripe's form inside the page, under
 * the shop's own bar (Stripe's hosted page in the app's shell). Only while physical
 * commerce is on in /admin. ?shop= is the shop, ?items= the cart (ids and
 * quantities, lib/physical/cart-link.ts), else this browser's cart for the
 * shop; ?return= where Back goes.
 */
export default async function PhysicalCheckoutPage({ searchParams }: { searchParams: Promise<{ shop?: string; items?: string; return?: string; [key: string]: string | undefined }> }) {
  await requirePhysicalPage()
  /* The connections to Stripe, open before Pay is pressed; Stripe.js itself waits for an idle page (./physical-checkout.tsx). */
  stripeEarly({ script: false })
  const [sp, jar, h] = await Promise.all([searchParams, cookies(), headers()])
  const { shop, return: asked } = sp
  /* The delivery country before the first frame: the buyer's last pick at a checkout, else where their connection is (no guess, no jump). */
  const initialCountry = countryCode(jar.get(CHECKOUT_COUNTRY_COOKIE)?.value) ?? countryCode(h.get("x-vercel-ip-country") || h.get("cf-ipcountry"))
  const shopOk = !!shop && /^[0-9a-f-]{36}$/i.test(shop)
  /* The cart in the link, priced beside the shop's reads below (firstQuote). A cart kept only in this browser is priced by the page, as before. */
  const linkItems = shopOk ? decodeItems(sp.items) : []
  const quoteRead = shopOk && linkItems.length ? early(firstQuote(h, shop!, linkItems, initialCountry ?? "")) : Promise.resolve(null)
  let brand: CheckoutBrand = { name: "Checkout", imageUrl: null, kind: null }
  let config = DEFAULT_CHECKOUT
  let backTo: string | null = null
  /* The store's own currency (Settings › Country & Currency): what its prices are in and its card payment is charged in. */
  let currency: string = platformSellingCurrency()
  if (shopOk && shop) {
    const db = createAdminClient()
    /* The shop across the top, as the basket checkout draws it: its website's logo, its store name before the person's (lib/checkout/brand-server), and how its checkout behaves (Settings › Checkout). */
    const [shopBrand, checkout, returns, store] = await Promise.all([
      checkoutBrand(db, shop),
      loadCheckoutConfig(db, shop),
      /* Back goes to the store's own website only: any other address in ?return= is dropped (lib/checkout/site-hosts.ts). */
      asked ? checkoutReturns({ creatorId: shop, cancel: asked }) : Promise.resolve({ cancel: null }),
      readStoreCurrency(db, shop),
    ])
    brand = shopBrand
    config = checkout
    currency = store.currency
    backTo = returns.cancel
    /*
      FROM THE SHOP'S OWN WEBSITE: paid for on the website now, at its own
      address (app/checkout/site), never here. A link made before that (a
      cached cart script, a bookmark) is sent on with its cart.
    */
    if (backTo) {
      const site = new URL(backTo)
      /* Only a published website that serves its own checkout; a preview or an old address keeps this page. */
      if (site.hostname !== getMainDomain() && (await servingSiteOrigin(db, shop, site.origin))) {
        const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"))
        /* The cart, in any language of the website (/cart, /fr/cart). */
        if (/^\/(?:[a-z]{2,3}(?:-[a-z0-9]{2,4})?\/)?cart$/i.test(site.pathname) && !q.has("cart")) q.set("cart", "1")
        redirect(legacyBasketTarget(site.origin, q, site.host))
      }
    }
    /*
      ANY OTHER LINK WITH ITS CART IN IT (round 49): a OnePage's Check out
      made before it linked the website's checkout itself, an email, a saved
      link. The same cart on the store's website checkout, Back to the
      OnePage kept (lib/checkout/shipped-checkout-server). A cart kept only in
      this browser on storelib.com (no ?items=) can't travel to another host,
      and a shop with no published website has no other checkout: both keep
      this page.
    */
    const website = linkItems.length
      ? await websiteCheckoutFor(db, { shopId: shop, items: linkItems, back: asked ?? null, src: sp.src ?? null, code: sp.code ?? null, visit: { from: sp.ref, utm_source: sp.utm_source, utm_campaign: sp.utm_campaign, touches: sp.sl_at } })
      : null
    if (website) redirect(website)
  }
  /* Who is buying, for a store that asks for an account first (Settings › Checkout). */
  let buyer = { signedIn: false, confirmed: false }
  if (config.requireAccount) {
    const {
      data: { user },
    } = await fullUserForRequest().then((c) => ({ data: { user: c.user } }))
    buyer = { signedIn: !!user, confirmed: !!user?.email_confirmed_at }
  }
  const shopUrl = backTo ? `${new URL(backTo).origin}/` : null
  const props = { shopId: shopOk ? shop! : null, shopName: brand.name, brand, shopUrl, config, buyer, initialCountry }
  /*
    THE SHOP'S BAR AT ONCE, THE ORDER WHEN IT IS PRICED. Everything above
    (and a redirect to the website's own checkout) is decided before a byte
    is sent, as before; the cart's price streams in after the bar, so the
    first frame is not held for it. The bar is drawn exactly where, and as,
    the checkout draws it, so nothing moves when the order arrives.
  */
  return (
    <Suspense
      fallback={
        <main aria-busy="true" data-checkout-loading="" className="min-h-dvh bg-white lg:bg-[linear-gradient(90deg,#ffffff_55%,#f8f9fa_55%)]">
          {/* Back is set once mounted in the checkout too (its backUrl), so the bar is the same on both sides of the swap. */}
          <ShopBar brand={brand} backTo={null} shopUrl={shopUrl} />
          <span className="sr-only">Loading checkout</span>
        </main>
      }
    >
      <PricedCheckout currency={currency} quoteRead={quoteRead} items={linkItems} country={initialCountry ?? ""} backTo={backTo} {...props} />
    </Suspense>
  )
}

/** The checkout, once the cart in the link is priced (firstQuote); without one, the page prices it itself as before. */
function PricedCheckout({
  currency,
  quoteRead,
  items,
  country,
  ...props
}: Omit<React.ComponentProps<typeof PhysicalCheckout>, "initialQuote"> & { currency: string; quoteRead: Promise<Record<string, unknown> | null>; items: LinkItem[]; country: string }) {
  /* Suspends until the quote is in (React's use), so the Suspense above shows the bar meanwhile. */
  const quote = use(quoteRead)
  return (
    <CheckoutCurrency currency={currency}>
      <PhysicalCheckout {...props} initialQuote={quote ? { items, country, quote } : null} />
    </CheckoutCurrency>
  )
}
