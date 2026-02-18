import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { cookies, headers } from "next/headers"
import CheckoutReceiptClient from "./checkout-receipt-client"

interface CheckoutReceiptPageProps {
  searchParams: Promise<{ token?: string }>
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6 sm:px-10 lg:px-16">
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
          <div className="h-9 w-36 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </header>
      <div className="mx-auto max-w-[640px] px-6 py-10 space-y-6">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gray-100 animate-pulse mb-4" />
          <div className="h-8 w-48 mx-auto bg-gray-100 rounded-lg animate-pulse" />
          <div className="mt-2 h-4 w-32 mx-auto bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="rounded-2xl bg-white border border-gray-200 p-5">
          <div className="flex gap-4">
            <div className="h-16 w-16 rounded-xl bg-gray-100 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-3/4 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-1/3 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-gray-200 p-5">
          <div className="h-5 w-32 bg-gray-100 rounded animate-pulse mb-4" />
          <div className="h-12 w-full bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  )
}

async function CheckoutReceiptContent({ searchParams }: CheckoutReceiptPageProps) {
  const { token } = await searchParams

  if (!token) {
    redirect("/explore")
  }

  const admin = createAdminClient()
  const supabase = await createClient()
  const cookieStore = await cookies()
  const headersList = await headers()

  // Fetch order with product + creator
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("*, product:products(*, creator:creators(id, slug, user_id))")
    .eq("receipt_token", token)
    .single()

  if (orderError || !order) {
    notFound()
  }

  // Fetch creator profile
  let creatorProfile = null
  if (order.product?.creator?.user_id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, avatar_url, username")
      .eq("id", order.product.creator.user_id)
      .single()
    creatorProfile = profile
  }

  const enrichedProduct = {
    ...order.product,
    creator: order.product?.creator
      ? {
          ...order.product.creator,
          display_name: creatorProfile?.display_name || "Creator",
          avatar_url: creatorProfile?.avatar_url,
          username: creatorProfile?.username,
        }
      : null,
  }

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let hasAccess = false
  let requiresVerification = false
  let isOwner = false

  // --- SECURITY MODEL (matches /receipt/[token]) ---
  if (user && order.buyer_id === user.id) {
    hasAccess = true
    isOwner = true
  } else {
    const sessionCookie = cookieStore.get("materia_session")
    const userAgent = headersList.get("user-agent") || "unknown"
    const forwardedFor = headersList.get("x-forwarded-for")
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown"

    const allowedFingerprints = order.allowed_fingerprints || []

    if (order.session_fingerprint && sessionCookie?.value === order.session_fingerprint) {
      hasAccess = true
    } else if (sessionCookie && allowedFingerprints.includes(sessionCookie.value)) {
      hasAccess = true
    } else {
      requiresVerification = true
    }

    if (requiresVerification) {
      await admin.from("security_events").insert({
        order_id: order.id,
        event_type: "fingerprint_mismatch",
        fingerprint: sessionCookie?.value || null,
        ip,
        user_agent: userAgent,
      })
    }
  }

  // Fetch assets
  let assets: any[] = []
  if (order.variant_id) {
    const { data: variantFiles } = await admin
      .from("product_variant_files")
      .select(`digital_asset_id, digital_assets (id, product_id, file_name, file_path, file_size, mime_type, created_at)`)
      .eq("variant_id", order.variant_id)
    assets = variantFiles?.map((vf: any) => vf.digital_assets).filter(Boolean) || []
  } else {
    const { data: allAssets } = await admin.from("digital_assets").select("*").eq("product_id", order.product_id)
    assets = allAssets || []
  }

  // Email status
  const buyerEmailSent = !!order.buyer_notified_at
  const sellerEmailSent = !!order.seller_notified_at
  const buyerEmailError = (order.buyer_email_last_error || "").toString().trim()
  const sellerEmailError = (order.seller_email_last_error || "").toString().trim()

  return (
    <CheckoutReceiptClient
      order={{
        id: order.id,
        product_id: order.product_id,
        variant_id: order.variant_id,
        variant_name: order.variant_name,
        buyer_email: order.buyer_email,
        total_cents: order.total_cents,
        created_at: order.created_at,
        buyer_id: order.buyer_id,
      }}
      product={{
        id: enrichedProduct.id,
        title: enrichedProduct.title,
        slug: enrichedProduct.slug,
        thumbnail_url: enrichedProduct.thumbnail_url,
        creator: enrichedProduct.creator
          ? {
              display_name: enrichedProduct.creator.display_name,
              username: enrichedProduct.creator.username,
              slug: enrichedProduct.creator.slug,
            }
          : null,
      }}
      assets={assets}
      hasAccess={hasAccess}
      requiresVerification={requiresVerification}
      isOwner={isOwner}
      isLoggedIn={!!user}
      receiptToken={token}
      emailStatus={{
        buyerEmailSent,
        sellerEmailSent,
        buyerEmailError,
        sellerEmailError,
      }}
    />
  )
}

export default function CheckoutReceiptPage(props: CheckoutReceiptPageProps) {
  return (
    <Suspense fallback={<LoadingState />}>
      <CheckoutReceiptContent {...props} />
    </Suspense>
  )
}
