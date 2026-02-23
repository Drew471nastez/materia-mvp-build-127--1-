import { Suspense } from "react"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import ReceiptContent from "@/components/receipt/receipt-content"

interface ReceiptPageProps {
  params: Promise<{ token: string }>
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50/50 to-background">
      <div className="mx-auto max-w-xl px-4 py-10 sm:py-14 space-y-5">
        {/* Header skeleton */}
        <div className="text-center pb-2">
          <div className="mx-auto mb-5 h-20 w-20 rounded-full bg-gray-100 animate-pulse" />
          <div className="h-8 w-48 mx-auto bg-gray-100 rounded-lg animate-pulse" />
          <div className="mt-2 h-4 w-24 mx-auto bg-gray-100 rounded animate-pulse" />
        </div>

        {/* Product card skeleton */}
        <div className="rounded-2xl bg-white shadow-lg shadow-gray-200/50 p-5 sm:p-6">
          <div className="flex gap-4">
            <div className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-xl bg-gray-100 animate-pulse" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-3/4 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-1/3 bg-gray-100 rounded animate-pulse" />
              <div className="h-3 w-1/4 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Download section skeleton */}
        <div className="rounded-2xl bg-white shadow-lg shadow-gray-200/50 p-5 sm:p-6">
          <div className="h-5 w-32 bg-gray-100 rounded animate-pulse mb-4" />
          <div className="h-12 w-full bg-gray-100 rounded-xl animate-pulse" />
        </div>

        {/* Bottom card skeleton */}
        <div className="rounded-2xl bg-gray-50/50 shadow-md shadow-gray-100/50 p-5 sm:p-6">
          <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}

async function ReceiptPageContent({ params }: ReceiptPageProps) {
  const { token } = await params
  const admin = createAdminClient()
  const supabase = await createClient()

  // IMPORTANT:
  // We fetch order normally. "*" already includes email status fields if they exist in the table:
  // buyer_notified_at, seller_notified_at, buyer_email_last_error, seller_email_last_error
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("*, product:products(*, creator:creators(id, slug, user_id))")
    .eq("receipt_token", token)
    .single()

  if (orderError || !order) {
    notFound()
  }

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
          // ✅ display_name takes priority (you asked for display name, not username)
          display_name: creatorProfile?.display_name || "Creator",
          avatar_url: creatorProfile?.avatar_url,
          username: creatorProfile?.username,
        }
      : null,
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The receipt token in the URL is the sole access credential — a random,
  // unguessable token issued at purchase time. Possessing it is sufficient
  // proof of purchase (consistent with the download API and /checkout/receipt).
  // Device-fingerprint gating was removed: it blocked users opening their
  // receipt email link on any device other than the one used to purchase.
  const hasAccess = true
  const requiresVerification = false
  const isOwner = !!(user && order.buyer_id === user.id)

  // Fetch assets - if variant was purchased, only get files assigned to that variant
  let assets: any[] = []
  if (order.variant_id) {
    // Variant purchase - get only files assigned to this variant via product_variant_files
    const { data: variantFiles } = await admin
      .from("product_variant_files")
      .select(`
        digital_asset_id,
        digital_assets (
          id,
          product_id,
          file_name,
          file_path,
          file_size,
          mime_type,
          created_at
        )
      `)
      .eq("variant_id", order.variant_id)

    // Extract the digital_assets from the join
    assets = variantFiles?.map((vf: any) => vf.digital_assets).filter(Boolean) || []
    console.log("[receipt] Fetched variant-specific files:", assets.length, "for variant:", order.variant_id)
  } else {
    // No variant - get all product files
    const { data: allAssets } = await admin.from("digital_assets").select("*").eq("product_id", order.product_id)
    assets = allAssets || []
    console.log("[receipt] Fetched all product files:", assets.length)
  }

  /**
   * ✅ KEY CHANGE:
   * Compute a single, universal email status for BOTH free + paid.
   * Then pass it down so the UI can show the same top popup regardless of amount.
   */
  const buyerEmailSent = !!order.buyer_notified_at
  const sellerEmailSent = !!order.seller_notified_at

  const buyerEmailError = (order.buyer_email_last_error || "").toString().trim()
  const sellerEmailError = (order.seller_email_last_error || "").toString().trim()

  const emailsAllSent = buyerEmailSent && sellerEmailSent
  const emailsAnyFailed = !!buyerEmailError || !!sellerEmailError

  // Attach a non-DB helper object onto order (safe, receipt-content can read it)
  const orderWithEmailStatus = {
    ...order,
    __email_status: {
      buyerEmailSent,
      sellerEmailSent,
      buyerEmailError,
      sellerEmailError,
      emailsAllSent,
      emailsAnyFailed,
    },
  }

  return (
    <ReceiptContent
      order={orderWithEmailStatus}
      product={enrichedProduct}
      assets={assets || []}
      hasAccess={hasAccess}
      requiresVerification={requiresVerification}
      isOwner={isOwner}
      receiptToken={token}
    />
  )
}

export default function ReceiptPage(props: ReceiptPageProps) {
  return (
    <Suspense fallback={<LoadingState />}>
      <ReceiptPageContent {...props} />
    </Suspense>
  )
}
