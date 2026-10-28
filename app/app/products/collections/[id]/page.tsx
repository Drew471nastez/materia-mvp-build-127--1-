import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { CollectionEditor } from "../collection-editor"
import { loadCollectionsArea } from "../load-collections"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Edit collection") }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A collection's own page. Only this store's collections are read, so another store's id goes back to the list. */
export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) redirect("/app/products/collections")
  const load = await loadCollectionsArea()
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") return noStorePage("/app/products/collections")
  const collection = load.collections.find((c) => c.id === id)
  if (!collection) redirect("/app/products/collections")
  return <CollectionEditor key={id} collection={collection} products={load.products} />
}
