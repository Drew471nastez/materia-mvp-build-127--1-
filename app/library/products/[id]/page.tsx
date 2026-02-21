import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ArrowLeft, ExternalLink, CheckCircle, Calendar, Package } from "lucide-react"
import { DownloadButton } from "@/components/download-button"
import { getStoreUrl } from "@/lib/url-helpers"

interface ProductAccessPageProps {
  params: Promise<{ id: string }>
}

export default async function ProductAccessPage({ params }: ProductAccessPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Fetch entitlement with creator + profile info
  let { data: entitlement } = await supabase
    .from("entitlements")
    .select(`
      *,
      product:products(*),
      creator:creators(*, profile:profiles!creators_user_id_fkey(*))
    `)
    .eq("buyer_id", user.id)
    .eq("product_id", id)
    .maybeSingle()

  // Fallback: look up the order if no entitlement exists
  let receiptToken: string | null = null

  if (!entitlement) {
    const { data: order } = await admin
      .from("orders")
      .select("id, created_at, receipt_token, product:products(*)")
      .eq("buyer_id", user.id)
      .eq("product_id", id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!order?.product) notFound()

    receiptToken = order.receipt_token || null

    let creator = null
    if ((order.product as any)?.creator_id) {
      const { data: creatorRow } = await admin
        .from("creators")
        .select("*, profile:profiles!creators_user_id_fkey(*)")
        .eq("id", (order.product as any).creator_id)
        .maybeSingle()
      creator = creatorRow
    }

    entitlement = {
      id: order.id,
      created_at: order.created_at,
      product: order.product,
      creator,
    } as any
  } else {
    // If entitlement exists, also grab receipt token from order for download access
    const { data: order } = await admin
      .from("orders")
      .select("receipt_token")
      .eq("buyer_id", user.id)
      .eq("product_id", id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    receiptToken = order?.receipt_token || null
  }

  const { data: assets } = await supabase.from("digital_assets").select("*").eq("product_id", id)

  // Resolve creator display info
  const creatorProfile = entitlement.creator?.profile as { username?: string; display_name?: string; avatar_url?: string } | undefined
  const creatorUsername = creatorProfile?.username || entitlement.creator?.slug
  const creatorDisplayName = creatorProfile?.display_name || entitlement.creator?.display_name || entitlement.creator?.slug || "Unknown Seller"
  const creatorAvatarUrl = creatorProfile?.avatar_url || entitlement.creator?.avatar_url || null

  const purchaseDate = new Date(entitlement.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="max-w-3xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Back nav */}
      <Link
        href="/library/my-downloads"
        className="mb-5 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to downloads
      </Link>

      {/* Product card */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        {/* Cover image — full width, proper aspect ratio */}
        <div className="relative w-full aspect-video bg-neutral-100">
          {entitlement.product?.thumbnail_url ? (
            <Image
              src={entitlement.product.thumbnail_url}
              alt={entitlement.product.title}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Package className="h-16 w-16 text-neutral-300" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6">
          {/* Ownership badge */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 mb-3">
            <CheckCircle className="h-3 w-3 text-green-600" />
            <span className="text-[11px] font-medium text-green-700">Purchased</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 leading-tight">
            {entitlement.product?.title}
          </h1>

          {entitlement.product?.description && (
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed line-clamp-3">
              {entitlement.product.description}
            </p>
          )}

          {/* Creator + date row */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Creator */}
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-neutral-200 overflow-hidden shrink-0">
                {creatorAvatarUrl ? (
                  <img src={creatorAvatarUrl} alt={creatorDisplayName} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-neutral-900 text-white text-[10px] font-semibold">
                    {creatorDisplayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <a
                href={getStoreUrl(creatorUsername)}
                className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors flex items-center gap-1 min-w-0"
              >
                <span className="truncate">{creatorDisplayName}</span>
                <ExternalLink className="h-3 w-3 shrink-0 text-neutral-400" />
              </a>
            </div>

            <span className="text-neutral-300 hidden sm:inline">|</span>

            {/* Date */}
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              <Calendar className="h-3 w-3" />
              <span>{purchaseDate}</span>
            </div>
          </div>

          {/* Download section */}
          <div className="mt-6 pt-5 border-t border-neutral-100">
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">Files</h3>
            <div className="space-y-2">
              {assets && assets.length > 0 ? (
                assets.map((asset: any) => (
                  <DownloadButton
                    key={asset.id}
                    assetId={asset.id}
                    receiptToken={receiptToken}
                    variant="default"
                    className="w-full h-11 rounded-xl cursor-pointer bg-neutral-900 text-white hover:bg-black text-sm font-medium"
                  >
                    {asset.file_name || "Download File"}
                  </DownloadButton>
                ))
              ) : (
                <p className="text-sm text-neutral-500 py-2">No files available yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
