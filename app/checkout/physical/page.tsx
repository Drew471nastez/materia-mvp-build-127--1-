import type { Metadata } from "next"
import { requirePhysicalPage } from "@/lib/physical/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { PhysicalCheckout } from "./physical-checkout"

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
  if (shop && /^[0-9a-f-]{36}$/i.test(shop)) {
    const { data } = await createAdminClient().from("creators").select("display_name, username, avatar_url").eq("id", shop).maybeSingle()
    if (data) {
      shopName = (data.display_name as string) || (data.username as string) || shopName
      shopAvatar = (data.avatar_url as string) || null
    }
  }
  return <PhysicalCheckout shopId={shop && /^[0-9a-f-]{36}$/i.test(shop) ? shop : null} shopName={shopName} shopAvatar={shopAvatar} />
}
