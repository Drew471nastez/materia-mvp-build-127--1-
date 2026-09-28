import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fillOwnedProducts } from "@/lib/library/owned-products"
import { Package, Download } from "lucide-react"
import { CREATOR_WITH_PROFILE, PROFILE_CARD } from "@/lib/security/public-columns"

export default async function DashboardProductsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  /* Archived or unpublished since it was bought: still theirs (lib/library/owned-products). */
  const owned = await fillOwnedProducts(createAdminClient(), entitlements)
  const products = owned.filter((e) => e.product?.type === "digital") || []

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">My Products</h1>
        <p className="text-muted-foreground">Access your purchased digital products</p>
      </div>

      {products.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((e) => (
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
                <p className="mt-1 text-sm text-muted-foreground">by {e.creator?.profile?.display_name || "Creator"}</p>
                <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                  <Download className="h-4 w-4" />
                  <span>Download available</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No products yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Products you purchase will appear here for easy access.</p>
        </div>
      )}
    </div>
  )
}
