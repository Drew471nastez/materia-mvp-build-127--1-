import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { collectionsArea } from "@/lib/physical/collections-server"
import { CollectionsClient } from "./collections-client"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage, teamPageStore } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Collections") }
}

/**
 * Products › Collections, read on the server like the products list
 * (../page.tsx), so the page lands with its rows and covers on the first
 * frame: no fetch after it opens and no skeleton in its place. The user and
 * the creator row come through the per-request cache the /app layout reads
 * them with; then the collections and the products, for every kind of
 * product, as GET /api/collections answers them.
 */
export default async function CollectionsPage() {
  /* Whose store (round 41): the owner's own, or the store a team member with Products works in. Supabase did not answer in time: the layout's gate recovers the session in the browser. */
  const access = await teamPageStore("products")
  if (access.kind === "signed_out" || access.kind === "denied") return null
  if (access.kind === "none") return noStorePage("/app/products/collections")
  /* The same reader the API uses (lib/physical/auth shopCaller("products")): the store is checked above, every query is filtered by its id. */
  const { collections, products } = await collectionsArea(createAdminClient(), access.creatorId)
  return <CollectionsClient initialCollections={collections} products={products} />
}
