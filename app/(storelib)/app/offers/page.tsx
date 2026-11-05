import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { offersArea } from "@/lib/offers/offers-server"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { OffersClient } from "./offers-client"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage, teamPageStore } from "@/lib/team/server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"

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
  /* The store, for its owner or a team member given Marketing (lib/team); the user and the creator row through the per-request cache. */
  const access = await teamPageStore("marketing")
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser. */
  if (access.kind === "signed_out") return null
  if (access.kind === "denied") return <TeamAreaClosed area="marketing" store={access.acting.name} permissions={access.acting.permissions} />
  if (access.kind === "none") return noStorePage("/app/offers")
  const creator = { id: access.creatorId }
  const [area, physical] = await Promise.all([offersArea(createAdminClient(), creator.id as string), isPhysicalCommerceEnabled().catch(() => false)])
  return (
    <OffersClient
      initialOffers={area.offers}
      products={area.products}
      collections={area.collections}
      currency={area.currency}
      ready={area.ready}
      settingsReady={area.settings}
      breaksReady={area.breaks}
      sold={area.sold}
      physical={physical}
    />
  )
}
