import type { Metadata } from "next"
import { OfferEditor } from "../offer-editor"
import { loadOfferArea } from "../load-offers"
import type { OfferKind } from "@/lib/offers/offers"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("New offer") }
}

const KINDS: readonly OfferKind[] = ["bundle", "checkout", "quantity_break"]

/** A new offer, `?kind=bundle`, `checkout` (an upsell) or `quantity_break`; any other kind starts as a bundle. */
export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams
  const load = await loadOfferArea()
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") return noStorePage("/app/offers/new")
  const a = load.area
  const start = KINDS.includes(kind as OfferKind) ? (kind as OfferKind) : "bundle"
  return (
    <OfferEditor
      key={start}
      offer={null}
      kind={start}
      products={a.products}
      collections={a.collections}
      others={a.offers}
      currency={a.currency}
      physical={a.physical}
      ready={a.ready}
      settingsReady={a.settings}
      breaksReady={a.breaks}
      sold={0}
    />
  )
}
