import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft, Check, Download, Mail, CreditCard, Package } from "lucide-react"

export const metadata = {
  title: "Order Details | Materia",
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get creator
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

  if (!creator) {
    redirect("/onboarding")
  }

  // Fetch order with product details
  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      *,
      product:products!orders_product_id_fkey(id, title, type, thumbnail_url, creator_id)
    `)
    .eq("id", id)
    .single()

  if (error || !order) {
    redirect("/app/orders")
  }

  // Verify this order belongs to the creator's product
  if (order.product?.creator_id !== creator.id) {
    redirect("/app/orders")
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  const platformFee = order.fee_cents || 0
  const creatorRevenue = (order.amount_cents || 0) - platformFee

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/app/orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Orders
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Order Details</h1>
        <p className="text-sm text-muted-foreground font-mono">#{order.id.substring(0, 8)}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Customer Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">
                {order.buyer_first_name && order.buyer_last_name
                  ? `${order.buyer_first_name} ${order.buyer_last_name}`
                  : "Not provided"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{order.buyer_email || "Not provided"}</p>
            </div>
            {order.buyer_city && (
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-medium">
                  {order.buyer_city}
                  {order.buyer_country ? `, ${order.buyer_country}` : ""}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Agreement to Terms</p>
              <div className="flex items-center gap-2 mt-1">
                {order.agreed_to_terms ? (
                  <>
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-600">
                      Agreed {order.agreed_at ? `on ${formatDate(order.agreed_at)}` : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Not recorded</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              Product Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              {order.product?.thumbnail_url && (
                <img
                  src={order.product.thumbnail_url || "/placeholder.svg"}
                  alt={order.product.title}
                  className="w-16 h-16 rounded object-cover"
                />
              )}
              <div className="flex-1">
                <p className="font-medium">{order.product?.title}</p>
                <Badge variant="secondary" className="mt-1 capitalize">
                  {order.product?.type}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Product ID</p>
              <p className="text-sm font-mono">{order.product_id.substring(0, 16)}...</p>
            </div>
          </CardContent>
        </Card>

        {/* Payment Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              Payment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Order Date</p>
              <p className="font-medium">{formatDate(order.created_at)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Payment Provider</p>
              <Badge variant="outline" className="capitalize">
                {order.provider || "stripe"}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={order.status === "completed" ? "default" : "secondary"}>{order.status}</Badge>
            </div>
            {order.stripe_payment_intent_id && (
              <div>
                <p className="text-sm text-muted-foreground">Stripe Payment Intent</p>
                <p className="text-sm font-mono">{order.stripe_payment_intent_id.substring(0, 24)}...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financial Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Download className="h-5 w-5 text-muted-foreground" />
              Financial Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatPrice(order.amount_cents || 0)}</span>
            </div>
            {order.tip_cents > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tip</span>
                <span className="font-medium">{formatPrice(order.tip_cents)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Platform Fee (6% + $0.30)</span>
              <span className="text-muted-foreground">-{formatPrice(platformFee)}</span>
            </div>
            <div className="pt-3 border-t">
              <div className="flex justify-between">
                <span className="font-medium">Total Paid</span>
                <span className="font-semibold">{formatPrice((order.amount_cents || 0) + (order.tip_cents || 0))}</span>
              </div>
            </div>
            <div className="pt-2 bg-green-50 rounded-lg p-3">
              <div className="flex justify-between">
                <span className="font-medium text-green-900">Your Revenue</span>
                <span className="font-bold text-green-900">{formatPrice(creatorRevenue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
