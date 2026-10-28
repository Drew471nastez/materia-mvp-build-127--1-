import { requirePhysicalPage } from "@/lib/physical/gate"
import { currentCreatorId } from "@/lib/creators/current"
import { InventoryClient } from "./inventory-client"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Inventory") }
}

/** Stock for every physical product, per location. Only while physical commerce is on in /admin: off, this is a 404. */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requirePhysicalPage()
  const creatorId = await currentCreatorId()
  if (!creatorId) return noStorePage("/app/inventory")
  /* The low stock email links to ?filter=low: read here, so the server and the browser draw the same view on the first frame. */
  const { filter } = await searchParams
  return <InventoryClient initialView={filter === "low" || filter === "out" || filter === "incoming" ? filter : "all"} />
}
