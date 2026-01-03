import { Suspense } from "react"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { cookies, headers } from "next/headers"
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
  const cookieStore = await cookies()
  const headersList = await headers()

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

  let hasAccess = false
  let requiresVerification = false
  let isOwner = false

  if (user && order.buyer_id === user.id) {
    hasAccess = true
    isOwner = true
  } else {
    const sessionCookie = cookieStore.get("materia_session")
    const userAgent = headersList.get("user-agent") || "unknown"
    const forwardedFor = headersList.get("x-forwarded-for")
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown"

    const allowedFingerprints = order.allowed_fingerprints || []

    console.log("[v0] Receipt access check:", {
      orderId: order.id,
      sessionFingerprint: order.session_fingerprint,
      currentCookie: sessionCookie?.value,
      allowedFingerprints,
      hasMatch:
        sessionCookie &&
        (sessionCookie.value === order.session_fingerprint || allowedFingerprints.includes(sessionCookie.value)),
    })

    if (order.session_fingerprint && sessionCookie?.value === order.session_fingerprint) {
      hasAccess = true
      console.log("[v0] ✅ Access granted - matches original purchase device")
    } else if (sessionCookie && allowedFingerprints.includes(sessionCookie.value)) {
      hasAccess = true
      console.log("[v0] ✅ Access granted - device in allowed list")
    } else {
      requiresVerification = true
      console.log("[v0] ❌ Verification required - device not recognized")
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

  const { data: assets } = await admin.from("digital_assets").select("*").eq("product_id", order.product_id)

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
