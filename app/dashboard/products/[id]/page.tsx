import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fillOwnedProduct } from "@/lib/library/owned-products"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Download, FileIcon, ExternalLink } from "lucide-react"
import { getStoreUrl } from "@/lib/url-helpers"
import { pageUser } from "@/lib/auth/page-user"
import { CREATOR_WITH_PROFILE, PROFILE_CARD } from "@/lib/security/public-columns"

interface ProductAccessPageProps {
  params: Promise<{ id: string }>
}

function formatFileSize(bytes: number) {
  if (!bytes || bytes === 0) return "Unknown size"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

export default async function ProductAccessPage({ params }: ProductAccessPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  // Check entitlement
  const { data: read } = await supabase
    .from("entitlements")
    .select(`
      *,
      product:products(*),
      creator:creators(${CREATOR_WITH_PROFILE})
    ` as const)
    .eq("buyer_id", user.id)
    .eq("product_id", id)
    .single()
  /* Archived or unpublished since it was bought: still theirs (lib/library/owned-products). */
  const entitlement = await fillOwnedProduct(createAdminClient(), read)

  if (!entitlement) notFound()

  // Fetch digital assets
  const { data: assets } = await supabase.from("digital_assets").select("*").eq("product_id", id)

  const creatorUsername = (entitlement.creator?.profile as { username?: string })?.username || entitlement.creator?.slug

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          href="/dashboard/products"
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to products
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Product Info */}
        <div className="lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
            {entitlement.product?.thumbnail_url ? (
              <Image
                src={entitlement.product.thumbnail_url || "/placeholder.svg"}
                alt={entitlement.product.title}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Download className="h-12 w-12 text-muted-foreground/50" />
              </div>
            )}
          </div>

          <div className="mt-6">
            <h1 className="text-2xl font-semibold">{entitlement.product?.title}</h1>
            <a
              href={getStoreUrl(creatorUsername)}
              className="mt-1 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              by {entitlement.creator?.profile?.display_name || "Creator"}
              <ExternalLink className="ml-1 h-3 w-3" />
            </a>
            {entitlement.product?.description && (
              <p className="mt-4 whitespace-pre-wrap text-muted-foreground">{entitlement.product.description}</p>
            )}
          </div>
        </div>

        {/* Downloads */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Downloads
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assets && assets.length > 0 ? (
                <div className="space-y-3">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{asset.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize((asset as typeof asset & { file_size?: number }).file_size || 0)}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/api/download/${asset.id}`}>
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No files available yet. Contact the creator for access.</p>
              )}
            </CardContent>
          </Card>

          {entitlement.community_access && (
            <Card className="mt-4">
              <CardContent className="pt-6">
                <Button className="w-full" asChild>
                  <Link href={`/dashboard/communities/${entitlement.creator_id}`}>Join Community</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
