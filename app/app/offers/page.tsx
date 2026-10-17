import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { offersArea } from "@/lib/offers/offers-server"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { OffersClient } from "./offers-client"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Upsells and bundles") }
}

/**
 * Products › Upsells and bundles (lib/offers), read on the server like the
 * products list and Collections, so the page lands with its rows on the
 * first frame; ./loading.tsx holds its shape only on a slow answer. The user
 * and the creator row come through the per-request cache the /app layout
 * reads them with; then the offers, the products and collections to choose
 * from, and the store's currency, as GET /api/store/offers answers them,
 * every read filtered by this creator's id. Offers are a store's whatever it
 * sells: free shipping is offered as a discount only while physical commerce
 * is on in /admin.
 */
export default async function OffersPage() {
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser. */
  if (!user) return null
  const creator = await creatorForRequest(user.id)
  if (!creator) redirect("/sell")
  const [area, physical] = await Promise.all([offersArea(createAdminClient(), creator.id as string), isPhysicalCommerceEnabled().catch(() => false)])
  return (
    <OffersClient
      initialOffers={area.offers}
      products={area.products}
      collections={area.collections}
      currency={area.currency}
      ready={area.ready}
      settingsReady={area.settings}
      physical={physical}
    />
  )
}
