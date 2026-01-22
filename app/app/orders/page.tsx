import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ShoppingCart } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Orders | Storelib",
}

export default async function OrdersPage() {
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

  // Fetch orders for creator's products
  const { data: orders } = await supabase
    .from("orders")
    .select(`
      *,
      product:products!orders_product_id_fkey(id, title, type),
      buyer:profiles!orders_buyer_id_fkey(email, display_name)
    `)
    .in("product_id", supabase.from("products").select("id").eq("creator_id", creator.id))
    .eq("status", "completed")
    .order("created_at", { ascending: false })

  // Calculate totals
  const totalRevenue = orders?.reduce((sum, order) => sum + order.amount_cents, 0) || 0
  const totalFees = orders?.reduce((sum, order) => sum + (order.fee_cents || 0), 0) || 0
  const netRevenue = totalRevenue - totalFees
  const totalOrders = orders?.length || 0

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="text-muted-foreground">View all orders for your products</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-semibold truncate">{formatPrice(totalRevenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-semibold text-green-600 truncate">{formatPrice(netRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">After platform fees</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-semibold">{totalOrders}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {orders && orders.length > 0 ? (
            <>
              <div className="divide-y divide-border sm:hidden">
                {orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/app/orders/${order.id}`}
                    className="block p-4 space-y-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{order.product?.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{order.product?.type}</p>
                      </div>
                      <Badge
                        variant={order.status === "completed" ? "default" : "secondary"}
                        className="shrink-0 text-xs"
                      >
                        {order.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="truncate">{order.buyer?.display_name || "Customer"}</p>
                        <p className="text-xs text-muted-foreground truncate">{order.buyer?.email}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium">{formatPrice(order.amount_cents)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="hidden sm:block table-scroll">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Product</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Customer</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Amount</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{order.product?.title}</div>
                          <div className="text-xs text-muted-foreground capitalize">{order.product?.type}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{order.buyer?.display_name || "Customer"}</div>
                          <div className="text-xs text-muted-foreground">{order.buyer?.email}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatPrice(order.amount_cents)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={order.status === "completed" ? "default" : "secondary"}>{order.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/app/orders/${order.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="py-12 text-center px-4">
              <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">No orders yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Orders will appear here when customers purchase your products.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
