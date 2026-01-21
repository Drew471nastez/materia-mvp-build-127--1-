import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ProductEditForm } from "@/components/app/product-edit-form"

interface ProductEditPageProps {
  params: Promise<{ id: string }>
}

export default async function ProductEditPage({ params }: ProductEditPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

  if (!creator) redirect("/onboarding")

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .single()

  if (!product) notFound()

  // Fetch digital assets
  const { data: assets } = await supabase.from("digital_assets").select("*").eq("product_id", product.id)

  return <ProductEditForm product={product} assets={assets || []} creatorId={creator.id} />
}
