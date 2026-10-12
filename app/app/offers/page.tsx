import { redirect } from "next/navigation"
import { requirePhysicalPage } from "@/lib/physical/gate"
import { currentCreatorId } from "@/lib/creators/current"
import { OffersClient } from "./offers-client"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Upsells and bundles") }
}

/** A store's bundles and checkout offers (lib/offers). Only while physical commerce is on in /admin: they apply in the cart checkout. */
export default async function OffersPage() {
  await requirePhysicalPage()
  const creatorId = await currentCreatorId()
  if (!creatorId) redirect("/sell")
  return <OffersClient />
}
