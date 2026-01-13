import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, GraduationCap, ArrowRight, CheckCircle, Download, Calendar } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface LibraryPageProps {
  searchParams: Promise<{ purchase?: string; already_owned?: string; highlight?: string }>
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const { purchase, already_owned, highlight } = await searchParams
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
          <p className="mt-1 text-sm text-muted-foreground">Sign in to access your library.</p>
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

  const productIds = entitlements?.filter((e) => e.product?.type === "digital").map((e) => e.product_id) || []

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

  const products = entitlements?.filter((e) => e.product?.type === "digital") || []
  const courses = entitlements?.filter((e) => e.product?.type === "course") || []

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <div className="p-8">
      {purchase === "success" && (
        <Alert className="mb-6 border-green-500/50 bg-green-50 text-green-800">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Purchase successful!</AlertTitle>
          <AlertDescription>Your purchase is complete. You now have access to your new content below.</AlertDescription>
        </Alert>
      )}

      {already_owned === "true" && (
        <Alert className="mb-6 border-blue-500/50 bg-blue-50 text-blue-800">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Already owned</AlertTitle>
          <AlertDescription>You already own this product. Access it from your library below.</AlertDescription>
        </Alert>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">My Library</h1>
        <p className="text-muted-foreground">Access all your purchased content</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Link href="/library/my-downloads">
          <Card className="cursor-pointer transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">My Downloads</CardTitle>
              <Download className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{products.length}</div>
              <p className="text-xs text-muted-foreground">Digital products purchased</p>
            </CardContent>
          </Card>
        </Link>
        {courses.length > 0 && (
          <Link href="/library/courses">
            <Card className="cursor-pointer transition-colors hover:border-primary/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Courses</CardTitle>
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{courses.length}</div>
                <p className="text-xs text-muted-foreground">Courses enrolled</p>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {entitlements && entitlements.length > 0 ? (
        <div className="space-y-8">
          {products.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">My Downloads</h2>
                <Link
                  href="/library/my-downloads"
                  className="flex items-center text-sm text-muted-foreground hover:text-foreground"
                >
                  View all <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.slice(0, 6).map((e) => (
                  <div
                    key={e.id}
                    className={`overflow-hidden rounded-lg border bg-card ${
                      highlight === e.product_id ? "border-primary ring-2 ring-primary/20" : "border-border"
                    }`}
                  >
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
            </div>
          )}

          {courses.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">My Courses</h2>
                <Link
                  href="/library/courses"
                  className="flex items-center text-sm text-muted-foreground hover:text-foreground"
                >
                  View all <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.slice(0, 6).map((e) => (
                  <Link
                    key={e.id}
                    href={`/library/courses/${e.product_id}`}
                    className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50"
                  >
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
                          <GraduationCap className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium group-hover:text-primary">{e.product?.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        by {(e.creator?.profile as { display_name?: string })?.display_name || "Creator"}
                      </p>
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>Enrolled {formatDate(e.created_at)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No purchases yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Explore creators and find something to learn.</p>
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
