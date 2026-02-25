import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, ArrowRight, Package, Calendar, Lock, AlertCircle } from "lucide-react"
import { DownloadButton } from "@/components/download-button"
import { cookies } from "next/headers"

interface DownloadsPageProps {
  searchParams: Promise<{ orderId?: string; token?: string }>
}

async function DownloadsContent({ searchParams }: DownloadsPageProps) {
  const { orderId, token } = await searchParams

  if (!orderId) {
    redirect("/library")
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const cookieStore = await cookies()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(`
      id, product_id, buyer_id, access_token, session_fingerprint, status, created_at,
      product:products(id, title, thumbnail_url, type)
    `)
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    notFound()
  }

  // Verify access
  let hasAccess = false
  let sessionMismatch = false

  if (user) {
    if (order.buyer_id === user.id) {
      hasAccess = true
    } else {
      const { data: entitlement } = await supabase
        .from("entitlements")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("product_id", order.product_id)
        .single()

      if (entitlement) {
        hasAccess = true
      }
    }
  } else if (token && order.access_token === token) {
    const sessionCookie = cookieStore.get("materia_session")

    if (!order.session_fingerprint) {
      hasAccess = true
    } else if (sessionCookie?.value === order.session_fingerprint) {
      hasAccess = true
    } else {
      sessionMismatch = true
    }
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-destructive/10">
              <Lock className="h-7 w-7 sm:h-8 sm:w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl sm:text-2xl">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center px-4 sm:px-6">
            <p className="text-sm sm:text-base text-muted-foreground mb-6">
              {sessionMismatch
                ? "This download link must be accessed from the original device where you made the purchase. Please check your email on that device, or sign in to your account to access downloads from any device."
                : "You don't have access to this download. Please check your email for the correct link."}
            </p>
            <Button asChild className="min-h-[44px]">
              <Link href="/login">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { data: assets } = await admin.from("digital_assets").select("id, file_name, file_size, file_type, storage_path").eq("product_id", order.product_id)

  const product = order.product

  const purchaseDate = new Date(order.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Success Header */}
        <div className="mb-6 sm:mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">Thank you for your purchase!</h1>
          <p className="mt-2 text-base sm:text-lg text-muted-foreground">Your download is ready</p>
        </div>

        {/* Product Card */}
        <Card className="mb-4 sm:mb-6">
          <CardContent className="p-4 sm:p-6">
            <div className="flex gap-3 sm:gap-4">
              {product?.thumbnail_url ? (
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                  <Image
                    src={product.thumbnail_url || "/placeholder.svg"}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Package className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/50" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-semibold line-clamp-2">{product?.title}</h2>
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span className="truncate">Purchased {purchaseDate}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Download Section */}
        <Card className="mb-4 sm:mb-6">
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">Your Downloads</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!assets || assets.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/20 p-4 sm:p-6 text-center">
                <AlertCircle className="mx-auto mb-3 h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground font-medium mb-2 text-sm sm:text-base">No downloadable files yet</p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  The creator hasn&apos;t uploaded any files for this product yet. You&apos;ll receive an email when
                  files become available.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {assets.map((asset, index) => (
                  <DownloadButton
                    key={asset.id}
                    assetId={asset.id}
                    orderId={orderId}
                    token={token}
                    fileName={asset.file_name}
                    size={index === 0 ? "lg" : "default"}
                    variant={index === 0 ? "default" : "outline"}
                    className={`w-full min-h-[44px] ${index === 0 ? "" : "bg-transparent"}`}
                  >
                    {index === 0 ? "Download File" : asset.file_name}
                  </DownloadButton>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Go to Library Button */}
        {user && (
          <Button variant="outline" className="w-full bg-transparent min-h-[44px]" size="lg" asChild>
            <Link href="/library/my-downloads">
              Go to My Downloads
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}

        {/* Sign Up CTA for Guests */}
        {!user && (
          <div className="mt-6 sm:mt-8 rounded-lg border border-border bg-muted/30 p-4 sm:p-6 text-center">
            <h3 className="font-semibold text-base sm:text-lg">Keep your purchases organized</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a free account to access your library anytime, track your downloads, and never lose access to your
              purchases.
            </p>
            <Button asChild className="mt-4 min-h-[44px]">
              <Link href="/signup">
                Create Free Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DownloadsPage(props: DownloadsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="animate-pulse text-muted-foreground">Loading your download...</div>
        </div>
      }
    >
      <DownloadsContent {...props} />
    </Suspense>
  )
}
