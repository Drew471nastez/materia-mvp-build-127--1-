import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ArrowLeft, Download, ExternalLink, CheckCircle, Calendar, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
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

  if (!entitlement) {
    const { data: order } = await admin
      .from("orders")
      .select("id, created_at, product:products(*)")
      .eq("buyer_id", user.id)
      .eq("product_id", id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!order?.product) notFound()

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
  }

  const { data: assets } = await supabase.from("digital_assets").select("*").eq("product_id", id)

  const creatorProfile = entitlement.creator?.profile as { username?: string; display_name?: string; avatar_url?: string } | undefined
  const creatorUsername = creatorProfile?.username || entitlement.creator?.slug
  const creatorDisplayName = creatorProfile?.display_name || entitlement.creator?.display_name || entitlement.creator?.slug || "Creator"
  const creatorAvatarUrl = creatorProfile?.avatar_url || entitlement.creator?.avatar_url || null

  const purchaseDate = new Date(entitlement.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-0">
      {/* Back nav */}
      <Link
        href="/library/my-downloads"
        className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to downloads
      </Link>

      {/* Product hero */}
      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-neutral-100">
          {entitlement.product?.thumbnail_url ? (
            <Image
              src={entitlement.product.thumbnail_url}
              alt={entitlement.product.title}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Package className="h-12 w-12 text-neutral-300" />
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="p-5 sm:p-6">
          {/* Ownership badge */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 mb-3">
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700">You own this product</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 leading-tight">
            {entitlement.product?.title}
          </h1>

          {/* Creator info */}
          <div className="mt-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-neutral-200 overflow-hidden shrink-0">
              {creatorAvatarUrl ? (
                <img src={creatorAvatarUrl} alt={creatorDisplayName} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-neutral-900 text-white text-xs font-semibold">
                  {creatorDisplayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <a
                href={getStoreUrl(creatorUsername)}
                className="text-sm font-medium text-neutral-900 hover:text-neutral-600 transition-colors flex items-center gap-1"
              >
                <span className="truncate">{creatorDisplayName}</span>
                <ExternalLink className="h-3 w-3 shrink-0 text-neutral-400" />
              </a>
            </div>
          </div>

          {/* Purchase date */}
          <div className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
            <Calendar className="h-3.5 w-3.5" />
            <span>Purchased on {purchaseDate}</span>
          </div>
        </div>
      </div>

      {/* Download section */}
      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-neutral-900 mb-4 flex items-center gap-2">
          <Download className="h-4 w-4 text-neutral-500" />
          Your Downloads
        </h2>

        {assets && assets.length > 0 ? (
          <div className="space-y-2">
            {assets.map((asset: any) => (
              <DownloadButton
                key={asset.id}
                assetId={asset.id}
                variant="default"
                className="w-full h-12 rounded-xl cursor-pointer bg-neutral-900 text-white hover:bg-black text-sm font-medium"
              >
                <span className="truncate">{asset.file_name || "Download File"}</span>
              </DownloadButton>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center">
            <p className="text-sm text-neutral-500">No files available yet. Check back soon.</p>
          </div>
        )}
      </div>

      {/* Back to library */}
      <div className="mt-4">
        <Button variant="outline" className="w-full h-11 rounded-xl bg-white border-neutral-200 text-sm font-medium" asChild>
          <Link href="/library">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Library
          </Link>
        </Button>
      </div>
    </div>
  )
}
