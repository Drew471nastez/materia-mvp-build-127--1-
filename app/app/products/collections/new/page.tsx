import type { Metadata } from "next"
import { CollectionPage } from "../collection-editor"
import { loadCollectionArea } from "../load-collections"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("New collection") }
}

export default async function NewCollectionPage() {
  const load = await loadCollectionArea()
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") return noStorePage("/app/products/collections/new")
  return <CollectionPage collection={null} products={load.products} />
}
