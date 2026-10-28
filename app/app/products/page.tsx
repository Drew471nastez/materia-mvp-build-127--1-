import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { creatorForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { ProductsClient } from "./products-client"
import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { getServerTt } from "@/lib/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { teamPageStore } from "@/lib/team/server"
import { storeHandle } from "@/lib/team/store-handle"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Products"),
  }
}

/**
 * THREE TRIPS, WHERE THERE WERE FOUR. The user, then the creator row and the
 * profile together (they need only the user, and they used to be asked one
 * after the other), then the products, which need the creator's id. The user
 * and both rows come through the per-request cache the /app layout reads
 * them with (lib/auth/request-scope.ts), so on a full load they are the
 * layout's answers and not a second trip. All on the caller's own client.
 */
export default async function ProductsPage() {
  /* Round 41: a team member with Products works in the store's catalogue. Read with the service role, filtered by the store's id; the owner's path below is the one it was. */
  const team = await teamPageStore("products")
  if (team.kind === "denied") return null
  if (team.kind === "store" && !team.isOwner) {
    const admin = createAdminClient()
    const [{ data: rows }, handle] = await Promise.all([
      admin.from("products").select("*").eq("creator_id", team.creatorId).order("created_at", { ascending: false }),
      storeHandle(admin, team.creatorId, team.ownerUserId),
    ])
    const listed = (rows || []).filter((p: { community_id?: string | null }) => !p.community_id)
    return <ProductsClient products={listed} creatorUsername={handle ?? ""} creatorId={team.creatorId} />
  }

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  const [creator, profile] = await Promise.all([creatorForRequest(user.id), profileForRequest(user.id)])

  if (!creator) redirect("/app")
  const creatorUsername = profile?.username || creator.slug || ""

  const supabase = await createClient()
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false })

  /* A product that sells a community's access is managed in Community settings
     (its price, its members), so it is not listed here as a second copy. */
  const listed = (products || []).filter((p: { community_id?: string | null }) => !p.community_id)

  return (
    <ProductsClient
      products={listed}
      creatorUsername={creatorUsername}
      creatorId={creator.id}
    />
  )
}
