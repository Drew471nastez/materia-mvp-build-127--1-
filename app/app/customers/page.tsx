import { redirect } from "next/navigation"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Users } from "lucide-react"
import { pageUser } from "@/lib/auth/page-user"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { LOCALE_TAG } from "@/lib/i18n/text"
import { accountTimeZone } from "@/lib/account/time-zone"
import { orderCurrency } from "@/lib/orders/money"
import { minorUnits } from "@/lib/markets/money"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Customers"),
  }
}

export default async function CustomersPage() {
  const { tt, language } = await getServerTt()
  const locale = LOCALE_TAG[language] ?? "en-US"
  const admin = createAdminClient()

  /* The /app layout's own answers, through the per-request cache
     (lib/auth/request-scope.ts): the user, and the creator row on the
     caller's own client, as this page read it before. */
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  const creator = await creatorForRequest(user.id)

  if (!creator) {
    redirect("/onboarding")
  }

  /*
    FOUR TRIPS, WHERE THERE WERE FIVE. The customers and the orders both
    need only the creator's id, so the customers are read while the product
    ids for the orders are: they were asked one after the other. The same
    queries, on the service role as before, scoped by this creator.
  */
  const readOrders = async () => {
    const { data: products } = await admin.from("products").select("id").eq("creator_id", creator.id)
    return admin
      .from("orders")
      .select(`
      *,
      product:products(id, title, type)
    `)
      .in("product_id", products?.map((p) => p.id) || [])
      .order("created_at", { ascending: false })
  }
  const [{ data: customers }, { data: allOrders }] = await Promise.all([
    admin
      .from("customers")
      .select("*")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false }),
    readOrders(),
  ])

  /* In what the order was charged in, and a total in the platform's charge currency, every checkout's (lib/orders/money). */
  const formatPrice = (cents: number, currency?: unknown) => {
    const code = orderCurrency(currency)
    const decimals = minorUnits(code)
    return new Intl.NumberFormat(locale, { style: "currency", currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(cents / 10 ** decimals)
  }

  /* The day in the zone chosen in Settings, as the rest of /app shows it; the server's own clock is UTC. */
  const zone = accountTimeZone(null, user.user_metadata) ?? undefined
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: zone,
    })
  }

  const getCustomerOrders = (email: string) => {
    return allOrders?.filter((o) => o.buyer_email === email) || []
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{tt("Customers")}</h1>
        <p className="text-muted-foreground">{tt("Manage your customer relationships")}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <Input
              placeholder={tt("Search through customers and orders...")}
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tt("All Customers (")}{customers?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {customers && customers.length > 0 ? (
            <>
              {/* Mobile view */}
              <div className="divide-y divide-border sm:hidden">
                {customers.map((customer) => {
                  const orders = getCustomerOrders(customer.email)
                  const lastOrder = orders[0]
                  return (
                    <div key={customer.id} className="p-4 space-y-3">
                      <div>
                        <p className="font-medium">
                          {customer.first_name} {customer.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{customer.email}</p>
                        {customer.city && customer.country && (
                          <p className="text-xs text-muted-foreground">
                            {customer.city}, {customer.country}
                          </p>
                        )}
                      </div>
                      {lastOrder && (
                        <div className="text-sm">
                          <p className="font-medium truncate">{lastOrder.product?.title}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-muted-foreground">{formatDate(lastOrder.created_at)}</span>
                            <span className="font-medium">{formatPrice(lastOrder.amount_cents, (lastOrder as { currency?: unknown }).currency)}</span>
                          </div>
                          <Badge variant="secondary" className="mt-2 capitalize text-xs">
                            {lastOrder.provider}
                          </Badge>
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          {tt("{length, plural, one {# order} other {# orders}}", { length: orders.length })}
                        </span>
                        <span>{tt("Total: {amount}", { amount: formatPrice(customer.total_spent_cents) })}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop view */}
              <div className="hidden sm:block table-scroll">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{tt("Customer")}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{tt("Location")}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{tt("Last Order")}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{tt("Orders")}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{tt("Total Spent")}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{tt("Joined")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => {
                      const orders = getCustomerOrders(customer.email)
                      const lastOrder = orders[0]
                      return (
                        <tr key={customer.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            <div className="font-medium">
                              {customer.first_name} {customer.last_name}
                            </div>
                            <div className="text-sm text-muted-foreground">{customer.email}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {customer.city && customer.country ? `${customer.city}, ${customer.country}` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {lastOrder ? (
                              <div>
                                <div className="text-sm font-medium">{lastOrder.product?.title}</div>
                                <div className="text-xs text-muted-foreground">{formatDate(lastOrder.created_at)}</div>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">{orders.length}</td>
                          <td className="px-4 py-3 text-sm font-medium">{formatPrice(customer.total_spent_cents)}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(customer.created_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="py-12 text-center px-4">
              <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">{tt("No customers yet")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tt("Customers will appear here when they purchase your products.")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
