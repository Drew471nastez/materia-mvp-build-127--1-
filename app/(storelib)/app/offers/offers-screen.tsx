import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { offersArea } from "@/lib/offers/offers-server"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { noStorePage, teamPageStore } from "@/lib/team/server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { OffersClient, type OffersOpening } from "./offers-client"

/**
 * Products › Upsells and bundles, read on the server for ./page.tsx and for
 * the two addresses that open its modal (./new/page.tsx, ./[id]/page.tsx),
 * so all three land whole on the first frame: the store, for its owner or a
 * team member given Marketing (lib/team), then the offers, the products and
 * collections to choose from and the store's currency, every read filtered
 * by this creator's id (an id from another store finds nothing and the list
 * shows without a modal). Free shipping is offered as a discount only while
 * physical commerce is on in /admin.
 */
export async function OffersScreen({ opening = null, from }: { opening?: OffersOpening; from: string }) {
  const access = await teamPageStore("marketing")
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser. */
  if (access.kind === "signed_out") return null
  if (access.kind === "denied") return <TeamAreaClosed area="marketing" store={access.acting.name} permissions={access.acting.permissions} />
  if (access.kind === "none") return noStorePage(from)
  const [area, physical] = await Promise.all([offersArea(createAdminClient(), access.creatorId as string), isPhysicalCommerceEnabled().catch(() => false)])
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
      opening={opening}
    />
  )
}
