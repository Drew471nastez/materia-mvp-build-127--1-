import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import CheckoutPageClient from "./checkout-client"
import { getProductUrl } from "@/lib/url-helpers"

interface CheckoutPageProps {
  searchParams: Promise<{ productId?: string }>
}

async function CheckoutContent({ searchParams }: CheckoutPageProps) {
  const { productId } = await searchParams

  if (!productId) {
    redirect("/explore")
  }

  const supabase = await createClient()

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("status", "published")
    .single()

  if (error || !product) {
    notFound()
  }

  const { data: creator } = await supabase.from("creators").select("*").eq("id", product.creator_id).single()

  let creatorProfile = null
  if (creator) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, username")
      .eq("id", creator.user_id)
      .single()

    creatorProfile = profile
  }

  const creatorUsername = creatorProfile?.username || creator?.slug || ""

  // Check if user is logged in and already owns the product
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: existingEntitlement } = await supabase
      .from("entitlements")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("product_id", productId)
      .maybeSingle()

    if (existingEntitlement) {
      redirect(getProductUrl(creatorUsername, product.slug))
    }
  }

  return (
    <CheckoutPageClient
      product={{
        id: product.id,
        title: product.title,
        slug: product.slug,
        description: product.description,
        price_cents: product.price_cents,
        thumbnail_url: product.thumbnail_url,
        type: product.type,
      }}
      creator={{
        id: creator?.id || "",
        name: creatorProfile?.display_name || "Creator",
        avatar_url: creatorProfile?.avatar_url || null,
        username: creatorUsername,
      }}
      userEmail={user?.email || null}
      isLoggedIn={!!user}
    />
  )
}

export default function CheckoutPage(props: CheckoutPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="animate-pulse text-muted-foreground">Loading checkout...</div>
        </div>
      }
    >
      <CheckoutContent {...props} />
    </Suspense>
  )
}
