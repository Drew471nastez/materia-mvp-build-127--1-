import type { Metadata } from "next"
import { requirePhysicalPage } from "@/lib/physical/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { PhysicalCheckout } from "./physical-checkout"
import { loadCheckoutConfig } from "@/lib/store/settings-server"
import { DEFAULT_CHECKOUT } from "@/lib/store/checkout-config"
import { checkoutReturns } from "@/lib/checkout/site-hosts"
import { checkoutBrand, type CheckoutBrand } from "@/lib/checkout/brand-server"

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
export default async function PhysicalCheckoutPage({ searchParams }: { searchParams: Promise<{ shop?: string; items?: string; return?: string }> }) {
  await requirePhysicalPage()
  const { shop, return: asked } = await searchParams
  let brand: CheckoutBrand = { name: "Checkout", imageUrl: null, kind: null }
  let config = DEFAULT_CHECKOUT
  let backTo: string | null = null
  if (shop && /^[0-9a-f-]{36}$/i.test(shop)) {
    const db = createAdminClient()
    /* The shop across the top, as the basket checkout draws it: its website's logo, its store name before the person's (lib/checkout/brand-server), and how its checkout behaves (Settings › Checkout). */
    const [shopBrand, checkout, returns] = await Promise.all([
      checkoutBrand(db, shop),
      loadCheckoutConfig(db, shop),
      /* Back goes to the store's own website only: any other address in ?return= is dropped (lib/checkout/site-hosts.ts). */
      asked ? checkoutReturns({ creatorId: shop, cancel: asked }) : Promise.resolve({ cancel: null }),
    ])
    brand = shopBrand
    config = checkout
    backTo = returns.cancel
  }
  /* Who is buying, for a store that asks for an account first (Settings › Checkout). */
  let buyer = { signedIn: false, confirmed: false }
  if (config.requireAccount) {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser()
    buyer = { signedIn: !!user, confirmed: !!user?.email_confirmed_at }
  }
  const shopUrl = backTo ? `${new URL(backTo).origin}/` : null
  return <PhysicalCheckout shopId={shop && /^[0-9a-f-]{36}$/i.test(shop) ? shop : null} shopName={brand.name} brand={brand} shopUrl={shopUrl} config={config} buyer={buyer} backTo={backTo} />
}
