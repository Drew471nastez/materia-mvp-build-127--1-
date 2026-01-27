import { createClient } from "@/lib/supabase/server"
import { ProductsPageClient } from "./products-page-client"
import { redirect } from "next/navigation"

export default async function ProductsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: creator } = await supabase.from("creators").select("id, slug").eq("user_id", user.id).single()

  if (!creator) {
    redirect("/onboarding")
  }

  // Fetch creator's profile for username
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single()

  const creatorUsername = profile?.username || creator?.slug || ""

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false })

  return (
    <ProductsPageClient
      products={products || []}
      creatorUsername={creatorUsername}
    />
  )
}
