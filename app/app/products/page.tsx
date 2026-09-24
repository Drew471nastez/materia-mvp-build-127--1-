import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ProductsClient } from "./products-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Products",
}

export default async function ProductsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  /* Signed out, or signed in without a creator yet: sent where that is sorted
     out, like the Website page, rather than a crash on a missing row. */
  if (!user) redirect("/login")

  const [{ data: creator }, { data: profile }] = await Promise.all([
    supabase.from("creators").select("id, slug").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
  ])
  if (!creator) redirect("/app")

  const creatorUsername = profile?.username || creator.slug || ""

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
