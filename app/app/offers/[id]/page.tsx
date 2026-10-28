import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { OfferEditor } from "../offer-editor"
import { loadOfferArea } from "../load-offers"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Edit offer") }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * An offer's own page, read on the server with the offer in it, so a link or
 * a reload lands on the whole editor. Only this creator's offers are read,
 * so an id from another store goes back to the list.
 */
export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) redirect("/app/offers")
  const load = await loadOfferArea()
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") return noStorePage("/app/offers")
  const a = load.area
  const offer = a.offers.find((o) => o.id === id)
  if (!offer) redirect("/app/offers")
  return (
    <OfferEditor
      key={id}
      offer={offer}
      kind={offer.kind}
      products={a.products}
      collections={a.collections}
      others={a.offers}
      currency={a.currency}
      physical={a.physical}
      ready={a.ready}
      settingsReady={a.settings}
      breaksReady={a.breaks}
      sold={a.sold[id] ?? 0}
    />
  )
}
