import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ArrowLeft, CheckCircle, Calendar, Package } from "lucide-react"
import { DownloadButton } from "@/components/download-button"

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

  // Fetch the product via entitlement first, then fallback to order
  const { data: entitlement } = await supabase
    .from("entitlements")
    .select(`
      id,
      product_id,
      creator_id,
      created_at,
      product:products(*)
    `)
    .eq("buyer_id", user.id)
    .eq("product_id", id)
    .maybeSingle()

  let product: any = entitlement?.product || null
  let creatorId: string | null = entitlement?.creator_id || null
  let purchasedAt: string = entitlement?.created_at || ""
  let receiptToken: string | null = null

  if (!product) {
    // Fallback: look up via completed order
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

    product = order.product
    receiptToken = order.receipt_token || null
    purchasedAt = order.created_at
    creatorId = (product as any)?.creator_id || null
  } else {
    // Also grab receipt token for download access
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

  // Fetch creator display name + slug (direct lookup, not FK join)
  let creatorDisplayName = "Unknown"
  let creatorSlug: string | null = null

  if (creatorId) {
    try {
      const { data: creator } = await admin
        .from("creators")
        .select("id, user_id, slug, display_name")
        .eq("id", creatorId)
        .maybeSingle()

      if (creator) {
        creatorSlug = creator.slug || null

        if (creator.user_id) {
          const { data: profile } = await admin
            .from("profiles")
            .select("display_name")
            .eq("id", creator.user_id)
            .maybeSingle()

          if (profile?.display_name) {
            creatorDisplayName = profile.display_name
          } else if (creator.display_name) {
            creatorDisplayName = creator.display_name
          } else if (creator.slug) {
            creatorDisplayName = creator.slug
          }
        } else if (creator.display_name || creator.slug) {
          creatorDisplayName = creator.display_name || creator.slug
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Fetch digital assets
  const { data: assets } = await admin
    .from("digital_assets")
    .select("id, file_name, created_at")
    .eq("product_id", id)
    .order("created_at", { ascending: true })

  const purchaseDate = purchasedAt
    ? new Date(purchasedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null

  // Build seller page URL (subdomain format: slug.storelib.com)
  const sellerUrl = creatorSlug ? `https://${creatorSlug}.storelib.com` : null

  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Back nav */}
      <Link
        href="/library/my-downloads"
        className="mb-5 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to downloads
      </Link>

      {/* Product card — side-by-side on desktop, stacked on mobile */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Left: Cover image — 480x360 (4:3) ratio, object-cover */}
          <div className="relative w-full md:w-1/2 aspect-[4/3] md:aspect-auto md:min-h-[340px] bg-neutral-100 shrink-0">
            {product?.thumbnail_url ? (
              <Image
                src={product.thumbnail_url}
                alt={product.title || "Product"}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center min-h-[200px]">
                <Package className="h-16 w-16 text-neutral-300" />
              </div>
            )}
          </div>

          {/* Right: Content */}
          <div className="flex-1 p-5 sm:p-6 md:p-8 flex flex-col min-w-0">
            {/* Ownership badge */}
            <div className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 mb-3 w-fit">
              <CheckCircle className="h-3 w-3 text-green-600" />
              <span className="text-[11px] font-medium text-green-700">Purchased</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 leading-tight">
              {product?.title || "Untitled Product"}
            </h1>

            {/* Creator + date */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
              <span>
                by{" "}
                {sellerUrl ? (
                  <a
                    href={sellerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-neutral-700 hover:text-neutral-900 underline-offset-2 hover:underline transition-colors"
                  >
                    {creatorDisplayName}
                  </a>
                ) : (
                  <span className="font-medium text-neutral-700">{creatorDisplayName}</span>
                )}
              </span>
              {purchaseDate && (
                <>
                  <span className="text-neutral-300">·</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {purchaseDate}
                  </span>
                </>
              )}
            </div>

            {/* Download section */}
            <div className="mt-5 pt-4 border-t border-neutral-100">
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">
                Files{assets && assets.length > 0 ? ` (${assets.length})` : ""}
              </h3>
              <div className="space-y-2">
                {assets && assets.length > 0 ? (
                  assets.map((asset: any) => (
                    <DownloadButton
                      key={asset.id}
                      assetId={asset.id}
                      receiptToken={receiptToken}
                      variant="default"
                      className="w-full h-11 rounded-xl cursor-pointer bg-neutral-900 text-white hover:bg-black text-sm font-medium overflow-hidden"
                    >
                      <span className="truncate">{asset.file_name || "Download File"}</span>
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
    </div>
  )
}
