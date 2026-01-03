import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { Package, Download, ArrowLeft, Calendar, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function MyDownloadsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">Please sign in</h3>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to access your downloads.</p>
          <Button asChild className="mt-4">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    )
  }

  const { data: entitlements, error: entitlementsError } = await supabase
    .from("entitlements")
    .select(`
      *,
      product:products(*),
      creator:creators(*, profile:profiles!creators_user_id_fkey(*))
    `)
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })

  if (entitlementsError) {
    console.error("[v0] Error fetching entitlements:", entitlementsError)
  }

  // Filter to only digital products
  const products = entitlements?.filter((e) => e.product?.type === "digital") || []

  // Get asset IDs for each product
  const productIds = products.map((e) => e.product_id)
  const assetsMap: Record<string, string> = {}

  if (productIds.length > 0) {
    const { data: assets } = await supabase.from("digital_assets").select("id, product_id").in("product_id", productIds)

    if (assets) {
      assets.forEach((asset) => {
        if (!assetsMap[asset.product_id]) {
          assetsMap[asset.product_id] = asset.id
        }
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
    <div className="p-8">
      <div className="mb-8">
        <Link
          href="/library"
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((e) => (
            <div key={e.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <Link href={`/library/products/${e.product_id}`} className="block group">
                <div className="relative aspect-video bg-muted">
                  {e.product?.thumbnail_url ? (
                    <Image
                      src={e.product.thumbnail_url || "/placeholder.svg"}
                      alt={e.product.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  )}
                  <Badge variant="secondary" className="absolute top-2 right-2">
                    Digital
                  </Badge>
                </div>
                <div className="p-4">
                  <h3 className="font-medium group-hover:text-primary">{e.product?.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    by {(e.creator?.profile as { display_name?: string })?.display_name || "Creator"}
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Purchased {formatDate(e.created_at)}</span>
                  </div>
                </div>
              </Link>
              <div className="border-t border-border p-3">
                {assetsMap[e.product_id] ? (
                  <Button size="sm" className="w-full" asChild>
                    <a href={`/api/download/${assetsMap[e.product_id]}`}>
                      <Download className="mr-2 h-4 w-4" />
                      Download File
                    </a>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="w-full bg-transparent" asChild>
                    <Link href={`/library/products/${e.product_id}`}>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      View Details
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Download className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No downloads yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Digital products you purchase will appear here for download.
          </p>
          <Button asChild className="mt-4">
            <Link href="/explore">
              Explore products <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
