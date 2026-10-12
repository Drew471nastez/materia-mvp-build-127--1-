import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { collectionsArea } from "@/lib/physical/collections-server"
import { CollectionsClient } from "./collections-client"
import { getServerTt } from "@/lib/i18n/server"

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
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser. */
  if (!user) return null
  const creator = await creatorForRequest(user.id)
  if (!creator) redirect("/sell")
  /* The same reader the API uses (lib/physical/auth shopCaller): the owner is checked above, every query is filtered by their creator id. */
  const { collections, products } = await collectionsArea(createAdminClient(), creator.id)
  return <CollectionsClient initialCollections={collections} products={products} />
}
