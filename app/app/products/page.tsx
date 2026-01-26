import { createClient } from "@/lib/supabase/server"
import { ProductsClient } from "./products-client"

export default async function ProductsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: creator } = await supabase.from("creators").select("id, slug").eq("user_id", user!.id).single()

  // Fetch creator's profile for username
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user!.id)
    .single()

  const creatorUsername = profile?.username || creator?.slug || ""

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("creator_id", creator!.id)
    .order("created_at", { ascending: false })

  return (
    <ProductsClient
      products={products || []}
      creatorUsername={creatorUsername}
    />
  )
}
