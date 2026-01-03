import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Package, ArrowLeft, Calendar, ArrowRight, FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { DownloadButton } from "@/components/download-button"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function MyDownloadsPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?redirect=/library/my-downloads")
  }

  const { data: entitlements } = await supabase
    .from("entitlements")
    .select(`*, product:products(*)`)
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })

  // Also fetch orders for this user (in case entitlements weren't created)
  const { data: orders } = await admin
    .from("orders")
    .select(`*, product:products(*)`)
    .eq("buyer_id", user.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })

  // Combine and deduplicate by product_id
  const productMap = new Map<string, { product: any; created_at: string; source: string }>()

  entitlements?.forEach((e) => {
    if (e.product?.type === "digital") {
      productMap.set(e.product_id, { product: e.product, created_at: e.created_at, source: "entitlement" })
    }
  })

  orders?.forEach((o) => {
    if (o.product?.type === "digital" && !productMap.has(o.product_id)) {
      productMap.set(o.product_id, { product: o.product, created_at: o.created_at, source: "order" })
    }
  })

  const products = Array.from(productMap.entries()).map(([productId, data]) => ({
    product_id: productId,
    ...data,
  }))

  // Get creator info
  const creatorIds = [...new Set(products.map((p) => p.product?.creator_id).filter(Boolean))]
  const creatorsMap: Record<string, any> = {}
  const profilesMap: Record<string, any> = {}

  if (creatorIds.length > 0) {
    const { data: creators } = await supabase.from("creators").select("id, user_id").in("id", creatorIds)

    if (creators) {
      creators.forEach((c) => {
        creatorsMap[c.id] = c
      })

      const userIds = creators.map((c) => c.user_id).filter(Boolean)
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", userIds)
        profiles?.forEach((p) => {
          profilesMap[p.id] = p
        })
      }
    }
  }

  const productIds = products.map((p) => p.product_id)
  const assetsMap: Record<string, { id: string; file_name: string }[]> = {}

  if (productIds.length > 0) {
    const { data: assets } = await admin
      .from("digital_assets")
      .select("id, product_id, file_name")
      .in("product_id", productIds)

    if (assets) {
      assets.forEach((asset) => {
        if (!assetsMap[asset.product_id]) {
          assetsMap[asset.product_id] = []
        }
        assetsMap[asset.product_id].push({ id: asset.id, file_name: asset.file_name })
      })
    }
  }

  // Fetch download counts
  const entitlementIds = entitlements?.map((e) => e.id) || []
  const downloadCounts: Record<string, { count: number; lastDownload: string | null }> = {}

  if (entitlementIds.length > 0) {
    const { data: downloads } = await supabase
      .from("download_events")
      .select("entitlement_id, downloaded_at")
      .in("entitlement_id", entitlementIds)
      .order("downloaded_at", { ascending: false })

    if (downloads) {
      downloads.forEach((d) => {
        if (!downloadCounts[d.entitlement_id]) {
          downloadCounts[d.entitlement_id] = { count: 0, lastDownload: d.downloaded_at }
        }
        downloadCounts[d.entitlement_id].count++
      })
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/library"
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to library
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">My Downloads</h1>
        <p className="text-muted-foreground">
          {products.length} {products.length === 1 ? "product" : "products"} purchased
        </p>
      </div>

      {products.length > 0 ? (
        <div className="space-y-4">
          {products.map((item) => {
            const assets = assetsMap[item.product_id] || []
            const creator = item.product?.creator_id ? creatorsMap[item.product.creator_id] : null
            const profile = creator ? profilesMap[creator.user_id] : null

            return (
              <Card key={item.product_id}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Thumbnail */}
                    <div className="relative h-32 sm:h-24 sm:w-24 w-full sm:shrink-0 overflow-hidden rounded-lg bg-muted">
                      {item.product?.thumbnail_url ? (
                        <Image
                          src={item.product.thumbnail_url || "/placeholder.svg"}
                          alt={item.product.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Package className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-base sm:text-lg truncate">{item.product?.title}</h3>
                          <p className="text-sm text-muted-foreground truncate">
                            by {profile?.display_name || "Creator"}
                          </p>
                        </div>
                        <Badge variant="secondary" className="self-start shrink-0">
                          Digital
                        </Badge>
                      </div>

                      <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 shrink-0" />
                          <span className="truncate">Purchased {formatDate(item.created_at)}</span>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
                        {assets.length > 0 ? (
                          <>
                            <DownloadButton
                              assetId={assets[0].id}
                              fileName={assets[0].file_name}
                              className="w-full sm:w-auto min-h-[44px]"
                            >
                              Download File
                            </DownloadButton>
                            {assets.length > 1 && (
                              <span className="text-sm text-muted-foreground self-center">
                                +{assets.length - 1} more file{assets.length > 2 ? "s" : ""}
                              </span>
                            )}
                          </>
                        ) : (
                          <Button variant="outline" className="bg-transparent w-full sm:w-auto min-h-[44px]" asChild>
                            <Link href={`/library/products/${item.product_id}`}>
                              <ArrowRight className="mr-2 h-4 w-4" />
                              View Details
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 sm:p-12 text-center">
          <FileDown className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No downloads yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Digital products you purchase will appear here for download.
          </p>
          <Button asChild className="mt-4 min-h-[44px]">
            <Link href="/explore">
              Explore products <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
