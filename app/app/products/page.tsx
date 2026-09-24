import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { creatorForRequest, currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { ProductsClient } from "./products-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Products",
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
  const { user } = await currentUserForRequest()
  /* Signed out, or signed in without a creator yet: sent where that is sorted
     out, like the Website page, rather than a crash on a missing row. */
  if (!user) redirect("/login")

  const [creator, profile] = await Promise.all([creatorForRequest(user.id), profileForRequest(user.id)])

  if (!creator) redirect("/app")
  const creatorUsername = profile?.username || creator.slug || ""

  const supabase = await createClient()
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false })

  return (
    <ProductsClient
      products={products || []}
      creatorUsername={creatorUsername}
    />
  )
}
