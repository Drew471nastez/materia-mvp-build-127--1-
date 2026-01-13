import { notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowRight, Download, CheckCircle, Lock, Calendar } from "lucide-react"

interface GuestAccessPageProps {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ token?: string }>
}

export default async function GuestAccessPage({ params, searchParams }: GuestAccessPageProps) {
  const { orderId } = await params
  const { token } = await searchParams
  const supabase = await createClient()

  // Check if user is logged in
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch order with access token verification
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      *,
      product:products(*)
    `)
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    notFound()
  }

  // Verify access token for guests
  if (!user && order.access_token !== token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <Lock className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Invalid Access Link</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-6">
              This access link is invalid or has expired. Please check your email for the correct link.
            </p>
            <Button asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // If logged in user owns this via entitlement, redirect to library
  if (user) {
    const { data: entitlement } = await supabase
      .from("entitlements")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("product_id", order.product_id)
      .single()

    if (entitlement) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl">You Own This Product</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">Access your purchase from your library for the best experience.</p>
              <Button asChild className="w-full">
                <Link href={`/library/products/${order.product_id}`}>
                  Go to Library
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }
  }

  // Fetch digital assets
  const { data: assets } = await supabase.from("digital_assets").select("*").eq("product_id", order.product_id)

  const product = order.product

  const purchaseDate = new Date(order.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold">Your Purchase</h1>
          <p className="mt-2 text-muted-foreground">Access your downloaded content below</p>
        </div>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex gap-4">
              {product?.thumbnail_url ? (
                <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
                  <Image
                    src={product.thumbnail_url || "/placeholder.svg"}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Download className="h-8 w-8 text-muted-foreground/50" />
                </div>
              )}
              <div>
                <h2 className="font-semibold text-lg">{product?.title}</h2>
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <Calendar className="h-3 w-3" />
                  <span>Purchased on {purchaseDate}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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
                  <a href={`/api/download/${assets[0].id}?order=${orderId}&token=${token}`}>
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
              <p className="text-muted-foreground">No files available.</p>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 rounded-lg border border-border bg-muted/30 p-6 text-center">
          <h3 className="font-medium">Want to keep all your purchases organized?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a free account to access your library anytime, track your courses, and more.
          </p>
          <Button asChild className="mt-4">
            <Link href="/signup">
              Create Free Account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
