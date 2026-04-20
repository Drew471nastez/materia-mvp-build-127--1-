import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CreateCouponClient } from "./create-coupon-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Create Coupon",
}

interface PageProps {
  searchParams: Promise<{ edit?: string }>
}

export default async function NewCouponPage({ searchParams }: PageProps) {
  const { edit } = await searchParams
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

  const { data: products } = await admin
    .from("products")
    .select("id, title, price_cents, thumbnail_url, status")
    .eq("creator_id", creator.id)
    .eq("status", "published")
    .order("title")

  let initialCoupon = null
  if (edit) {
    const { data: coupon } = await admin
      .from("coupons")
      .select("*")
      .eq("id", edit)
      .eq("creator_id", creator.id)
      .maybeSingle()
    if (!coupon) redirect("/app/coupons")
    initialCoupon = coupon
  }

  return (
    <CreateCouponClient
      creatorId={creator.id}
      products={products || []}
      editId={edit ?? null}
      initialCoupon={initialCoupon}
    />
  )
}
