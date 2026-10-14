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
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { CheckoutCurrency } from "../parts/ui"
import { readStoreCurrency } from "@/lib/store/selling-currency-server"
import { platformSellingCurrency } from "@/lib/store/selling-currency"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } }

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
  const sp = await searchParams
  const { shop, return: asked } = sp
  let brand: CheckoutBrand = { name: "Checkout", imageUrl: null, kind: null }
  let config = DEFAULT_CHECKOUT
  let backTo: string | null = null
  /* The store's own currency (Settings › Country & Currency): what its prices are in and its card payment is charged in. */
  let currency: string = platformSellingCurrency()
  if (shop && /^[0-9a-f-]{36}$/i.test(shop)) {
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
  }
  /* Who is buying, for a store that asks for an account first (Settings › Checkout). */
  let buyer = { signedIn: false, confirmed: false }
  if (config.requireAccount) {
    const {
      data: { user },
    } = await currentUserForRequest().then((c) => ({ data: { user: c.user } }))
    buyer = { signedIn: !!user, confirmed: !!user?.email_confirmed_at }
  }
  const shopUrl = backTo ? `${new URL(backTo).origin}/` : null
  return (
    <CheckoutCurrency currency={currency}>
      <PhysicalCheckout shopId={shop && /^[0-9a-f-]{36}$/i.test(shop) ? shop : null} shopName={brand.name} brand={brand} shopUrl={shopUrl} config={config} buyer={buyer} backTo={backTo} />
    </CheckoutCurrency>
  )
}
