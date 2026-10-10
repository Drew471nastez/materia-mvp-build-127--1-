import { personName } from "@/lib/profile/display-name"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fillOwnedProducts } from "@/lib/library/owned-products"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, GraduationCap, Users, ArrowRight, CheckCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CREATOR_WITH_PROFILE, PROFILE_CARD, attachCreatorProfiles } from "@/lib/security/public-columns"

interface DashboardOverviewProps {
  searchParams: Promise<{ purchase?: string; already_owned?: string }>
}

export default async function DashboardOverview({ searchParams }: DashboardOverviewProps) {
  const { purchase, already_owned } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch entitlements with product and creator info
  const { data: entitlements } = await supabase
    .from("entitlements")
    .select(
      `
      *,
      product:products(*),
      creator:creators(${CREATOR_WITH_PROFILE})
    `,
    )
    .eq("buyer_id", user!.id)
    .order("created_at", { ascending: false })

  /* Archived or unpublished since it was bought: still theirs (lib/library/owned-products). */
  /* The sellers' faces are their own read (lib/security/public-columns attachCreatorProfiles). */
  await attachCreatorProfiles(createAdminClient(), (entitlements ?? []).map((e: any) => e.creator))
  const owned = await fillOwnedProducts(createAdminClient(), entitlements)
  const products = owned.filter((e) => e.product?.type === "digital") || []
  const courses = owned.filter((e) => e.product?.type === "course") || []
  const communities = entitlements?.filter((e) => e.community_access) || []

  return (
    <div className="p-8">
      {purchase === "success" && (
        <Alert className="mb-6 border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Purchase successful!</AlertTitle>
          <AlertDescription>Your purchase is complete. You now have access to your new content below.</AlertDescription>
        </Alert>
      )}


      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">My Library</h1>
        <p className="text-muted-foreground">Access all your purchased content</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{products.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Courses</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{courses.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Communities</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{communities.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Purchases */}
      {entitlements && entitlements.length > 0 ? (
        <div className="space-y-8">
          {/* Products Section */}
          {products.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Products</h2>
                <Link
                  href="/dashboard/products"
                  className="flex items-center text-sm text-muted-foreground hover:text-foreground"
                >
                  View all <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.slice(0, 3).map((e) => (
                  <Link
                    key={e.id}
                    href={`/dashboard/products/${e.product_id}`}
                    className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-border/80"
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
                          <Package className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium group-hover:text-primary">{e.product?.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        by {personName({ name: e.creator?.profile?.display_name, slug: e.creator?.slug })}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Courses Section */}
          {courses.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Courses</h2>
                <Link
                  href="/dashboard/courses"
                  className="flex items-center text-sm text-muted-foreground hover:text-foreground"
                >
                  View all <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.slice(0, 3).map((e) => (
                  <Link
                    key={e.id}
                    href={`/dashboard/courses/${e.product_id}`}
                    className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-border/80"
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
                        by {personName({ name: e.creator?.profile?.display_name, slug: e.creator?.slug })}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Communities Section */}
          {communities.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Communities</h2>
                <Link
                  href="/dashboard/communities"
                  className="flex items-center text-sm text-muted-foreground hover:text-foreground"
                >
                  View all <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {communities.slice(0, 3).map((e) => (
                  <Link
                    key={e.id}
                    href={`/dashboard/communities/${e.creator_id}`}
                    className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <Users className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-medium group-hover:text-primary">
                          {personName({ name: e.creator?.profile?.display_name, slug: e.creator?.slug })}&apos;s Community
                        </h3>
                        <p className="text-sm text-muted-foreground">Active community</p>
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
          <Link href="/explore" className="mt-4 inline-flex items-center text-sm font-medium hover:underline">
            Explore products <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
