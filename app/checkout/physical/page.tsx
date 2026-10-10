import type { Metadata } from "next"
import { requirePhysicalPage } from "@/lib/physical/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { PhysicalCheckout } from "./physical-checkout"
import { loadCheckoutConfig, loadStoreName } from "@/lib/store/settings-server"
import { DEFAULT_CHECKOUT } from "@/lib/store/checkout-config"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } }

/**
 * The checkout for a cart with something to ship: email, delivery address,
 * delivery option, then Stripe's page for the payment. Only while physical
 * commerce is on in /admin. ?shop= is the shop, ?items= the cart (ids and
 * quantities, lib/physical/cart-link.ts), else this browser's cart for the
 * shop; ?return= where Back goes.
 */
export default async function PhysicalCheckoutPage({ searchParams }: { searchParams: Promise<{ shop?: string; items?: string; return?: string }> }) {
  await requirePhysicalPage()
  const { shop } = await searchParams
  let shopName = "Checkout"
  let shopAvatar: string | null = null
  let config = DEFAULT_CHECKOUT
  if (shop && /^[0-9a-f-]{36}$/i.test(shop)) {
    const db = createAdminClient()
    /* The store's own name (Settings › Store details) before the person's, and how its checkout behaves (Settings › Checkout). */
    const [{ data }, storeName, checkout] = await Promise.all([
      db.from("creators").select("display_name, username, avatar_url").eq("id", shop).maybeSingle(),
      loadStoreName(db, shop),
      loadCheckoutConfig(db, shop),
    ])
    if (data) {
      shopName = storeName || (data.display_name as string) || (data.username as string) || shopName
      shopAvatar = (data.avatar_url as string) || null
    }
    config = checkout
  }
  /* Who is buying, for a store that asks for an account first (Settings › Checkout). */
  let buyer = { signedIn: false, confirmed: false }
  if (config.requireAccount) {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser()
    buyer = { signedIn: !!user, confirmed: !!user?.email_confirmed_at }
  }
  return <PhysicalCheckout shopId={shop && /^[0-9a-f-]{36}$/i.test(shop) ? shop : null} shopName={shopName} shopAvatar={shopAvatar} config={config} buyer={buyer} />
}
