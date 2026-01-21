import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Download, ExternalLink, CheckCircle, Calendar } from "lucide-react"
import { getStoreUrl } from "@/lib/url-helpers"

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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: entitlement } = await supabase
    .from("entitlements")
    .select(`
      *,
      product:products(*),
      creator:creators(*, profile:profiles!creators_user_id_fkey(*))
    `)
    .eq("buyer_id", user.id)
    .eq("product_id", id)
    .single()

  if (!entitlement) notFound()

  const { data: assets } = await supabase.from("digital_assets").select("*").eq("product_id", id)

  const creatorUsername = (entitlement.creator?.profile as { username?: string })?.username || entitlement.creator?.slug

  const purchaseDate = new Date(entitlement.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link
          href="/library/products"
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to products
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
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
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">You own this product</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{entitlement.product?.title}</h1>
            <Link
              href={`${getStoreUrl(creatorUsername)}?src=platform`}
              className="mt-1 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              by {(entitlement.creator?.profile as { display_name?: string })?.display_name || "Creator"}
              <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Purchased on {purchaseDate}</span>
            </div>
            {entitlement.product?.description && (
              <p className="mt-4 whitespace-pre-wrap text-muted-foreground">
                {entitlement.product.description.replace(/\*\*/g, "").replace(/\n\n\*\*What you'll get:\*\*\n/g, "")}
              </p>
            )}
          </div>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Your Downloads
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assets && assets.length > 0 ? (
                <div className="space-y-3">
                  <Button className="w-full" asChild>
                    <a href={`/api/download/${assets[0].id}`}>
                      <Download className="mr-2 h-4 w-4" />
                      Download File
                    </a>
                  </Button>
                  {assets.length > 1 && (
                    <p className="text-center text-xs text-muted-foreground">
                      +{assets.length - 1} more file{assets.length > 2 ? "s" : ""} included
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No files available yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="pt-6">
              <Button variant="outline" className="w-full bg-transparent" asChild>
                <Link href="/library">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Library
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
