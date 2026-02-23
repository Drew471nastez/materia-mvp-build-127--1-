import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import CheckoutReceiptClient from "./checkout-receipt-client"

interface CheckoutReceiptPageProps {
  searchParams: Promise<{ token?: string }>
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-gray-50 animate-in fade-in-0 duration-300">
      {/* Header skeleton */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6 sm:px-10 lg:px-16">
          <div className="h-4 w-32 bg-gray-200/60 rounded animate-pulse" />
          <div className="h-9 w-36 bg-gray-200/60 rounded-lg animate-pulse" />
        </div>
      </header>

      {/* Mobile skeleton */}
      <div className="lg:hidden">
        <div className="mx-auto max-w-[640px] px-6 sm:px-10 py-8 space-y-6">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-gray-200/60 animate-pulse mb-4" />
            <div className="h-7 w-48 mx-auto bg-gray-200/60 rounded-lg animate-pulse" />
            <div className="mt-2 h-4 w-32 mx-auto bg-gray-200/60 rounded animate-pulse" />
          </div>
          <div className="rounded-2xl bg-white border border-gray-200 p-5">
            <div className="flex gap-4">
              <div className="h-16 w-16 rounded-xl bg-gray-200/60 animate-pulse" />
              <div className="flex-1 space-y-2.5">
                <div className="h-5 w-3/4 bg-gray-200/60 rounded animate-pulse" />
                <div className="h-3.5 w-1/3 bg-gray-200/60 rounded animate-pulse" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-gray-200 p-5 space-y-3">
            <div className="h-4 w-28 bg-gray-200/60 rounded animate-pulse" />
            <div className="h-12 w-full bg-gray-200/60 rounded-xl animate-pulse" />
            <div className="h-12 w-full bg-gray-100 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>

      {/* Desktop skeleton */}
      <div className="hidden lg:flex min-h-[calc(100vh-57px)]">
        <div className="w-1/2 bg-white">
          <div className="max-w-[600px] ml-auto py-10 px-10 xl:px-16 space-y-6">
            <div>
              <div className="w-14 h-14 rounded-full bg-gray-200/60 animate-pulse mb-4" />
              <div className="h-8 w-52 bg-gray-200/60 rounded-lg animate-pulse" />
              <div className="mt-2 h-4 w-72 bg-gray-200/60 rounded animate-pulse" />
            </div>
            <div className="rounded-2xl bg-white border border-gray-200 p-5">
              <div className="flex gap-4">
                <div className="h-16 w-16 rounded-xl bg-gray-200/60 animate-pulse" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-5 w-3/4 bg-gray-200/60 rounded animate-pulse" />
                  <div className="h-3.5 w-1/3 bg-gray-200/60 rounded animate-pulse" />
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white border border-gray-200 p-5 space-y-3">
              <div className="h-4 w-28 bg-gray-200/60 rounded animate-pulse" />
              <div className="h-12 w-full bg-gray-200/60 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
        <div className="w-px bg-gray-200 shrink-0" />
        <div className="w-1/2 bg-[#f7f7f8]">
          <div className="max-w-[560px] mr-auto py-10 px-10 xl:px-16 space-y-5">
            <div className="rounded-2xl bg-white border border-gray-200 p-5 space-y-4">
              <div className="h-6 w-32 mx-auto bg-gray-200/60 rounded animate-pulse" />
              <div className="h-4 w-48 mx-auto bg-gray-200/60 rounded animate-pulse" />
              <div className="flex justify-center gap-1">
                {[1,2,3,4,5].map(i => <div key={i} className="w-8 h-8 rounded bg-gray-200/60 animate-pulse" />)}
              </div>
              <div className="h-24 w-full bg-gray-200/60 rounded-xl animate-pulse" />
            </div>
          </div>
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

  // The receipt token in the URL is the sole access credential — a random,
  // unguessable token issued at purchase time. Possessing it is sufficient
  // proof of purchase, consistent with the download API behavior.
  // Device-fingerprint gating was removed: it randomly blocked legitimate buyers
  // right after checkout because (a) the materia_session cookie isn't reliably
  // delivered to the browser via a fetch() response before the page renders,
  // and (b) orders created via the minimal fallback strategy have no
  // session_fingerprint, so the check always failed for those orders.
  const hasAccess = true
  const requiresVerification = false
  const isOwner = !!(user && order.buyer_id === user.id)

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
              avatar_url: enrichedProduct.creator.avatar_url || null,
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
