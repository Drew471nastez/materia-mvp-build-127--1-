import "server-only"

import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { offersArea } from "@/lib/offers/offers-server"
import type { OfferKind } from "@/lib/offers/offers"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { noStorePage, teamPageStore } from "@/lib/team/server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { OffersClient } from "./offers-client"
import { OfferEditor } from "./offer-editor"

/** What an address opens besides the list: a new offer (of a kind, when the link names one) or a saved one. */
export type OffersOpening = { new: true; kind: OfferKind | null } | { id: string } | null

/**
 * Products › Upsells and bundles, read on the server for ./page.tsx and for
 * an offer's own page (./new/page.tsx, ./[id]/page.tsx), so each lands whole
 * on the first frame: the store, for its owner or a team member given
 * Marketing (lib/team), then the offers, the products and collections to
 * choose from and the store's currency, every read filtered by this
 * creator's id (an id from another store finds nothing and goes back to the
 * list). Free shipping is offered as a discount only while physical
 * commerce is on in /admin.
 *
 * Round 60: /app/offers/new?kind= and /app/offers/<id> are the offer's own
 * page (./offer-editor.tsx); /app/offers/new with no kind is the list with
 * New offer's kind chooser open (/app/offers?choose=1).
 */
export async function OffersScreen({ opening = null, from, choose = false }: { opening?: OffersOpening; from: string; choose?: boolean }) {
  const access = await teamPageStore("marketing")
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser. */
  if (access.kind === "signed_out") return null
  if (access.kind === "denied") return <TeamAreaClosed area="marketing" store={access.acting.name} permissions={access.acting.permissions} />
  if (access.kind === "none") return noStorePage(from)
  /* No kind named: the question is asked over the list, as New offer asks it. */
  if (opening && "new" in opening && !opening.kind) redirect("/app/offers?choose=1")
  const [area, physical] = await Promise.all([offersArea(createAdminClient(), access.creatorId as string), isPhysicalCommerceEnabled().catch(() => false)])
  if (opening) {
    const offer = "id" in opening ? area.offers.find((o) => o.id === opening.id) : null
    if ("id" in opening && !offer) redirect("/app/offers")
    const kind: OfferKind = offer ? offer.kind : (opening as { kind: OfferKind }).kind
    return (
      <OfferEditor
        key={offer?.id ?? kind}
        offer={offer ?? null}
        kind={kind}
        products={area.products}
        collections={area.collections}
        others={area.offers}
        currency={area.currency}
        physical={physical}
        ready={area.ready}
        settingsReady={area.settings}
        breaksReady={area.breaks}
        sold={offer ? (area.sold[offer.id] ?? 0) : 0}
      />
    )
  }
  return <OffersClient initialOffers={area.offers} products={area.products} collections={area.collections} currency={area.currency} ready={area.ready} sold={area.sold} choose={choose} />
}
