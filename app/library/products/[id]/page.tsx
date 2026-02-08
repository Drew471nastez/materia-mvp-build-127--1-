import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Download, ExternalLink, CheckCircle, Calendar } from "lucide-react"
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

  const creatorUsername = (entitlement.creator?.profile as { username?: string })?.username || entitlement.creator?.slug

  const purchaseDate = new Date(entitlement.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link href="/library/my-downloads" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to downloads
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
            {entitlement.product?.thumbnail_url ? (
              <Image src={entitlement.product.thumbnail_url || "/placeholder.svg"} alt={entitlement.product.title} fill className="object-cover" />
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
            <a href={getStoreUrl(creatorUsername)} className="mt-1 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              by {(entitlement.creator?.profile as { display_name?: string })?.display_name || "Creator"}
              <ExternalLink className="ml-1 h-3 w-3" />
            </a>
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Purchased on {purchaseDate}</span>
            </div>
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
                  {assets.map((asset: any, index: number) => (
                    <DownloadButton key={asset.id} assetId={asset.id} variant="default" className="w-full h-12 cursor-pointer bg-neutral-900 text-white hover:bg-black">
                      {index === 0 ? "Download File" : asset.file_name || `File ${index + 1}`}
                    </DownloadButton>
                  ))}
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
