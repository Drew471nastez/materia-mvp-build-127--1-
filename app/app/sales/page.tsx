import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { CreditCard } from "lucide-react"

export default async function SalesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user!.id).single()

  // Get product IDs for this creator
  const { data: products } = await supabase.from("products").select("id, title").eq("creator_id", creator!.id)

  const productIds = products?.map((p) => p.id) || []
  const productMap = new Map(products?.map((p) => [p.id, p.title]) || [])

  // Fetch orders for creator's products
  const { data: orders } = await supabase
    .from("orders")
    .select("*, buyer:profiles!orders_buyer_id_fkey(display_name, email)")
    .in("product_id", productIds.length > 0 ? productIds : [""])
    .order("created_at", { ascending: false })

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateString))
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
        <p className="text-muted-foreground">View your orders and revenue</p>
      </div>

      {orders && orders.length > 0 ? (
        <div className="rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Order</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-sm">{order.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-sm">{order.buyer?.display_name || order.buyer?.email || "Unknown"}</td>
                  <td className="px-4 py-3 text-sm">{productMap.get(order.product_id) || "Unknown"}</td>
                  <td className="px-4 py-3 text-sm">{formatPrice(order.amount_cents)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        order.status === "completed"
                          ? "default"
                          : order.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                      className="capitalize"
                    >
                      {order.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(order.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <CreditCard className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No sales yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            When customers purchase your products, they&apos;ll appear here.
          </p>
        </div>
      )}
    </div>
  )
}
