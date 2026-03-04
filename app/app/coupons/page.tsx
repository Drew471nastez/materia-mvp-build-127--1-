import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CouponsClient } from "./coupons-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Coupons",
}

export default async function CouponsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = createAdminClient()

  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) redirect("/signup/success")

  // Fetch creator's products for the "applies to" selector
  const { data: products } = await admin
    .from("products")
    .select("id, title, price_cents, thumbnail_url, status")
    .eq("creator_id", creator.id)
    .eq("status", "published")
    .order("title")

  // Fetch existing coupons
  const { data: coupons } = await admin
    .from("coupons")
    .select("*")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false })

  return (
    <CouponsClient
      creatorId={creator.id}
      initialCoupons={coupons || []}
      products={products || []}
    />
  )
}
