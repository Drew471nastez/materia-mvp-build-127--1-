import type { Metadata } from "next"
import type { OfferKind } from "@/lib/offers/offers"
import { getServerTt } from "@/lib/i18n/server"
import { OffersScreen } from "../offers-screen"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("New offer") }
}

const KINDS: readonly OfferKind[] = ["bundle", "checkout", "quantity_break"]

/**
 * Round 58: /app/offers/new is the list with the New offer modal open over
 * it, so every link that points here still works. `?kind=bundle`,
 * `checkout` (an upsell) or `quantity_break` starts on that kind's form;
 * with no kind the modal asks which first.
 */
export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams
  const given = KINDS.includes(kind as OfferKind) ? (kind as OfferKind) : null
  return OffersScreen({ from: "/app/offers/new", opening: { new: true, kind: given } })
}
