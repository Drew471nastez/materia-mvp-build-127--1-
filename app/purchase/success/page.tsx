import { Suspense } from "react"
import { redirect } from "next/navigation"
import { CheckCircle, Package, ArrowRight, Mail, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { getProductUrl } from "@/lib/url-helpers"

interface PurchaseSuccessPageProps {
  searchParams: Promise<{ session_id?: string }>
}

async function PurchaseSuccessContent({ searchParams }: PurchaseSuccessPageProps) {
  const { session_id } = await searchParams

  let productTitle = "your product"
  let productSlug: string | null = null
  let creatorUsername: string | null = null
  let isLoggedIn = false
  let customerEmail: string | null = null
  let orderId: string | null = null
  let accessToken: string | null = null

  if (session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id)
      const productId = session.metadata?.product_id
      productSlug = session.metadata?.product_slug || null
      accessToken = session.metadata?.access_token || null
      customerEmail = session.customer_details?.email || session.customer_email || null

      if (productId) {
        const supabase = await createClient()
        const { data: product } = await supabase
          .from("products")
          .select("title, slug, creator_id")
          .eq("id", productId)
          .single()

        if (product) {
          productTitle = product.title
          productSlug = productSlug || product.slug

          // Fetch creator's username for subdomain URL
          const { data: creator } = await supabase
            .from("creators")
            .select("slug, user_id")
            .eq("id", product.creator_id)
            .single()

          if (creator) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("username")
              .eq("id", creator.user_id)
              .single()

            creatorUsername = profile?.username || creator.slug || null
          }
        }

        const {
          data: { user },
        } = await supabase.auth.getUser()
        isLoggedIn = !!user

        if (!user && accessToken) {
          const { data: order } = await supabase
            .from("orders")
            .select("id")
            .eq("stripe_session_id", session_id)
            .single()

          if (order) {
            orderId = order.id
          }
        }

        if (user && productSlug && creatorUsername) {
          redirect(getProductUrl(creatorUsername, productSlug))
        }
      }
    } catch (error) {
      console.error("[v0] Error retrieving session:", error)
    }
  }

  const productUrl = productSlug && creatorUsername ? getProductUrl(creatorUsername, productSlug) : null

  if (!isLoggedIn && orderId && accessToken) {
    redirect(`/access/${orderId}?token=${accessToken}`)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl">Purchase Successful!</CardTitle>
          <CardDescription>Thank you for your purchase of {productTitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoggedIn ? (
            <>
              <div className="rounded-lg bg-muted/50 p-4 text-center">
                <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Your purchase is ready! Access it from your library.</p>
              </div>
              {productUrl ? (
                <Button asChild className="w-full">
                  <a href={productUrl}>
                    <Download className="mr-2 h-4 w-4" />
                    Go to Product
                  </a>
                </Button>
              ) : (
                <Button asChild className="w-full">
                  <Link href="/library">
                    Go to Library
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <>
              <div className="rounded-lg bg-muted/50 p-4 text-center">
                <Mail className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  We&apos;ve sent an access link to {customerEmail ? <strong>{customerEmail}</strong> : "your email"}.
                  Check your inbox to download your purchase.
                </p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm text-center text-muted-foreground">
                  Create an account to access your purchases anytime and keep them organized in your library.
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href="/signup">
                  Create Free Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full bg-transparent">
                <Link href="/explore">Continue Browsing</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function PurchaseSuccessPage(props: PurchaseSuccessPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <PurchaseSuccessContent {...props} />
    </Suspense>
  )
}
