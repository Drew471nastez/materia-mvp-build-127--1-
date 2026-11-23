import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerTt } from "@/lib/i18n/server"
import { OffersScreen } from "../offers-screen"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Edit offer") }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Round 58: an offer's address is the list with that offer open in the
 * modal. Only this creator's offers are read, so an id from another store
 * opens nothing and the address goes back to /app/offers.
 */
export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) redirect("/app/offers")
  return OffersScreen({ from: "/app/offers", opening: { id } })
}
