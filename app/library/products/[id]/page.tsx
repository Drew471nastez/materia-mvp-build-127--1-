import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fillOwnedProduct } from "@/lib/library/owned-products"
import { getStoreUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"
import { ArrowLeft, CheckCircle, Calendar, Package } from "lucide-react"
import { DownloadButton } from "@/components/download-button"
import { ReturnLink } from "@/components/navigation/return-link"
import { pageUser } from "@/lib/auth/page-user"
import { LibraryReview } from "@/components/reviews/library-review"

interface ProductAccessPageProps {
  params: Promise<{ id: string }>
}

export default async function ProductAccessPage({ params }: ProductAccessPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

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

  /* Archived or unpublished since it was bought: still theirs (lib/library/owned-products). */
  const owned = await fillOwnedProduct(admin, entitlement)
  let product: any = owned?.product || null
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

  /* Their own name and photo, for the review card. */
  const { data: me } = await admin.from("profiles").select("display_name, username, avatar_url").eq("id", user.id).maybeSingle()

  const purchaseDate = purchasedAt
    ? new Date(purchasedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null

  // Build seller page URL (uses internal path in Capacitor to preserve auth)
  const sellerUrl = creatorSlug ? getStoreUrl(creatorSlug) : null

  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Page header card — same visual language as all library subpages */}
      <section className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        {/* Dark gradient banner */}
        <div className="h-16 sm:h-20 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900" />

        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          {/* Icon tile overlapping the banner + Library back button */}
          <div className="flex items-end justify-between -mt-6 sm:-mt-7 mb-3">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl border-4 border-white bg-neutral-100 flex items-center justify-center shadow-sm shrink-0">
              <Package className="h-5 w-5 sm:h-6 sm:w-6 text-neutral-600" />
            </div>
            <ReturnLink
              href="/library"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors shadow-sm mt-8 sm:mt-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Library
            </ReturnLink>
          </div>

          {/* Page title = product name */}
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 leading-tight">
            {product?.title || "Product"}
          </h1>
          {/* Subtitle = creator byline */}
          <p className="text-sm text-neutral-500 mt-0.5">
            by{" "}
            {sellerUrl ? (
              <SmartLink
                href={sellerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                {creatorDisplayName}
              </SmartLink>
            ) : (
              <span className="font-medium text-neutral-600">{creatorDisplayName}</span>
            )}
          </p>
        </div>
      </section>

      {/* Product detail card — thumbnail + download section */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Left: Cover image — 4:3 ratio, object-cover */}
          <div className="relative w-full md:w-1/2 aspect-[4/3] md:aspect-auto md:min-h-[280px] bg-neutral-100 shrink-0">
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

          {/* Right: Purchase info + downloads */}
          <div className="flex-1 p-5 sm:p-6 md:p-8 flex flex-col min-w-0">
            {/* Ownership badge */}
            <div className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 mb-3 w-fit">
              <CheckCircle className="h-3 w-3 text-green-600" />
              <span className="text-[11px] font-medium text-green-700">Purchased</span>
            </div>

            {/* Purchase date */}
            {purchaseDate && (
              <div className="flex items-center gap-1.5 text-sm text-neutral-500 mb-4">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>Purchased {purchaseDate}</span>
              </div>
            )}

            {/* Download section */}
            <div className="mt-auto pt-4 border-t border-neutral-100">
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

      {/* Review it, any time after buying; their review with Edit and Delete once written. */}
      <LibraryReview
        productId={id}
        productTitle={product?.title || "this product"}
        reviewerName={(me?.display_name || me?.username || "").toString().trim() || null}
        reviewerAvatarUrl={me?.avatar_url || null}
        sellerName={creatorDisplayName !== "Unknown" ? creatorDisplayName : null}
      />
    </div>
  )
}
