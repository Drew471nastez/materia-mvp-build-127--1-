import { redirect } from "next/navigation"
import { requirePhysicalPage } from "@/lib/physical/gate"
import { currentCreatorId } from "@/lib/creators/current"
import { InventoryClient } from "./inventory-client"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Inventory") }
}

/** Stock for every physical product, per location. Only while physical commerce is on in /admin: off, this is a 404. */
export default async function InventoryPage() {
  await requirePhysicalPage()
  const creatorId = await currentCreatorId()
  if (!creatorId) redirect("/sell")
  return <InventoryClient />
}
