"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Download,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  MoreHorizontal,
  ExternalLink,
  Mail,
  Package,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from "recharts"
import { createClient } from "@/lib/supabase/client"

interface Product {
  id: string
  title: string
  type?: string
  price_cents?: number
}

interface SalesClientProps {
  creatorId: string
  products: Product[]
  initialSummary: {
    totalSales: number
    totalOrders: number
    avgOrderValue: number
    refundCount: number
    refundAmount: number
  }
  currency: string
  stripeConnected: boolean
}

interface Order {
  id: string
  product_id: string
  amount_cents: number
  fee_cents: number
  status: string
  payment_method?: string
  created_at: string
  buyer?: {
    email: string
    display_name: string
  }
  product?: {
    id: string
    title: string
    type: string
    cover_image?: string
  }
}

interface SalesByProduct {
  productId: string
  title: string
  type: string
  orders: number
  revenue: number
  avgPrice: number
  coverImage?: string
}

interface SalesTrend {
  date: string
  sales: number
  orders: number
  revenue: number
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

export function SalesClient({ creatorId, products, initialSummary, currency, stripeConnected }: SalesClientProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [timeframe, setTimeframe] = useState("last_30_days")
  const [selectedProduct, setSelectedProduct] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [orderDetailOpen, setOrderDetailOpen] = useState(false)

  const [summary, setSummary] = useState(initialSummary)
  const [orders, setOrders] = useState<Order[]>([])
  const [salesByProduct, setSalesByProduct] = useState<SalesByProduct[]>([])
  const [salesTrend, setSalesTrend] = useState<SalesTrend[]>([])
  const [paymentMethodData, setPaymentMethodData] = useState<{ method: string; count: number; amount: number }[]>([])
  const [totalCount, setTotalCount] = useState(0)

  const ITEMS_PER_PAGE = 10

  const supabase = createClient()

  // Get date range based on timeframe
  const getDateRange = () => {
    const end = new Date()
    const start = new Date()

    switch (timeframe) {
      case "today":
        start.setHours(0, 0, 0, 0)
        break
      case "yesterday":
        start.setDate(start.getDate() - 1)
        start.setHours(0, 0, 0, 0)
        end.setDate(end.getDate() - 1)
        end.setHours(23, 59, 59, 999)
        break
      case "last_7_days":
        start.setDate(start.getDate() - 7)
        break
      case "last_30_days":
        start.setDate(start.getDate() - 30)
        break
      case "this_month":
        start.setDate(1)
        start.setHours(0, 0, 0, 0)
        break
      case "last_month":
        start.setMonth(start.getMonth() - 1)
        start.setDate(1)
        start.setHours(0, 0, 0, 0)
        end.setDate(0)
        end.setHours(23, 59, 59, 999)
        break
      case "this_year":
        start.setMonth(0)
        start.setDate(1)
        start.setHours(0, 0, 0, 0)
        break
      case "all_time":
        start.setFullYear(2020)
        break
      case "custom":
        if (customStart && customEnd) {
          return {
            start: new Date(customStart),
            end: new Date(customEnd),
          }
        }
        break
    }

    return { start, end }
  }

  const fetchSalesData = async () => {
    setIsLoading(true)
    try {
      const { start, end } = getDateRange()
      const productIds = products.map((p) => p.id)

      if (productIds.length === 0) {
        setIsLoading(false)
        return
      }

      // Build query for orders
      let ordersQuery = supabase
        .from("orders")
        .select(`
          *,
          product:products!orders_product_id_fkey(id, title, type, cover_image),
          buyer:profiles!orders_buyer_id_fkey(email, display_name)
        `)
        .in("product_id", productIds)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false })

      if (selectedProduct !== "all") {
        ordersQuery = ordersQuery.eq("product_id", selectedProduct)
      }

      if (statusFilter !== "all") {
        ordersQuery = ordersQuery.eq("status", statusFilter)
      }

      const { data: allOrders, error } = await ordersQuery

      if (error) throw error

      // Filter by search query
      let filteredOrders = allOrders || []
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        filteredOrders = filteredOrders.filter(
          (o) =>
            o.id.toLowerCase().includes(query) ||
            o.buyer?.email?.toLowerCase().includes(query) ||
            o.buyer?.display_name?.toLowerCase().includes(query) ||
            o.product?.title?.toLowerCase().includes(query)
        )
      }

      setTotalCount(filteredOrders.length)

      // Paginate
      const paginatedOrders = filteredOrders.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
      )
      setOrders(paginatedOrders)

      // Calculate summary from all filtered orders (completed only)
      const completedOrders = filteredOrders.filter((o) => o.status === "completed")
      const refundedOrders = filteredOrders.filter((o) => o.status === "refunded")

      const totalSales = completedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
      const totalOrders = completedOrders.length
      const avgOrderValue = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0

      setSummary({
        totalSales,
        totalOrders,
        avgOrderValue,
        refundCount: refundedOrders.length,
        refundAmount: refundedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0),
      })

      // Calculate sales by product
      const productSales: Record<string, SalesByProduct> = {}
      completedOrders.forEach((order) => {
        const productId = order.product_id
        if (!productSales[productId]) {
          productSales[productId] = {
            productId,
            title: order.product?.title || "Unknown Product",
            type: order.product?.type || "download",
            orders: 0,
            revenue: 0,
            avgPrice: 0,
            coverImage: order.product?.cover_image,
          }
        }
        productSales[productId].orders++
        productSales[productId].revenue += order.amount_cents || 0
      })

      const salesByProductArray = Object.values(productSales)
        .map((p) => ({
          ...p,
          avgPrice: p.orders > 0 ? Math.round(p.revenue / p.orders) : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)

      setSalesByProduct(salesByProductArray)

      // Calculate sales trend (group by day)
      const trendMap: Record<string, SalesTrend> = {}
      completedOrders.forEach((order) => {
        const date = new Date(order.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
        if (!trendMap[date]) {
          trendMap[date] = { date, sales: 0, orders: 0, revenue: 0 }
        }
        trendMap[date].orders++
        trendMap[date].revenue += order.amount_cents || 0
        trendMap[date].sales++
      })

      const sortedTrend = Object.values(trendMap).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      setSalesTrend(sortedTrend)

      // Calculate payment method breakdown
      const paymentMethods: Record<string, { count: number; amount: number }> = {}
      completedOrders.forEach((order) => {
        const method = order.payment_method || "card"
        if (!paymentMethods[method]) {
          paymentMethods[method] = { count: 0, amount: 0 }
        }
        paymentMethods[method].count++
        paymentMethods[method].amount += order.amount_cents || 0
      })

      setPaymentMethodData(
        Object.entries(paymentMethods).map(([method, data]) => ({
          method,
          count: data.count,
          amount: data.amount,
        }))
      )
    } catch (error) {
      console.error("Error fetching sales data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSalesData()
  }, [timeframe, selectedProduct, statusFilter, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [timeframe, selectedProduct, statusFilter, searchQuery])

  const handleSearch = () => {
    setCurrentPage(1)
    fetchSalesData()
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(cents / 100)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        )
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        )
      case "refunded":
        return (
          <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100">
            <RotateCcw className="mr-1 h-3 w-3" />
            Refunded
          </Badge>
        )
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPaymentMethodName = (method: string) => {
    const names: Record<string, string> = {
      card: "Credit Card",
      paypal: "PayPal",
      apple_pay: "Apple Pay",
      google_pay: "Google Pay",
      bank_transfer: "Bank Transfer",
      crypto: "Cryptocurrency",
    }
    return names[method] || method
  }

  const handleExport = (format: "csv" | "json") => {
    const exportData = orders.map((order) => ({
      order_id: order.id,
      date: formatDateTime(order.created_at),
      customer_email: order.buyer?.email || "",
      customer_name: order.buyer?.display_name || "",
      product: order.product?.title || "",
      amount: formatPrice(order.amount_cents),
      fee: formatPrice(order.fee_cents || 0),
      net: formatPrice((order.amount_cents || 0) - (order.fee_cents || 0)),
      status: order.status,
    }))

    if (format === "csv") {
      const headers = Object.keys(exportData[0] || {}).join(",")
      const rows = exportData.map((row) => Object.values(row).join(",")).join("\n")
      const csv = `${headers}\n${rows}`
      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `sales-export-${new Date().toISOString().split("T")[0]}.csv`
      a.click()
    } else {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `sales-export-${new Date().toISOString().split("T")[0]}.json`
      a.click()
    }
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  return (
    <div className="space-y-6">
      {/* Stripe Connection Warning */}
      {!stripeConnected && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-4 p-4">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-800">Connect Stripe to accept payments</p>
              <p className="text-sm text-amber-700">You need to connect your Stripe account to start receiving payments.</p>
            </div>
            <Button asChild size="sm">
              <a href="/app/settings/payments">Connect Stripe</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end flex-1">
          <div className="flex-1 max-w-[200px] space-y-2">
            <Label>Time Period</Label>
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last_7_days">Last 7 days</SelectItem>
                <SelectItem value="last_30_days">Last 30 days</SelectItem>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="this_year">This year</SelectItem>
                <SelectItem value="all_time">All time</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 max-w-[200px] space-y-2">
            <Label>Product</Label>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger>
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 max-w-[150px] space-y-2">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport("csv")}>
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("json")}>
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Custom date range */}
      {timeframe === "custom" && (
        <div className="flex gap-4 flex-col sm:flex-row sm:items-end">
          <div className="flex-1 max-w-[200px] space-y-2">
            <Label>Start Date</Label>
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </div>
          <div className="flex-1 max-w-[200px] space-y-2">
            <Label>End Date</Label>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
          <Button onClick={fetchSalesData} disabled={!customStart || !customEnd}>
            Apply
          </Button>
        </div>
      )}

      {/* Summary Cards - Dashboard Style */}
      <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 ${isLoading ? "opacity-60" : ""}`}>
        {/* Total Sales */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-[#6b7280]">Total Sales</span>
            <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-[#9ca3af]" />
            </div>
          </div>
          <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
            {formatPrice(summary.totalSales)}
          </div>
          <p className="text-[12px] text-[#9ca3af] mt-1">Gross revenue</p>
        </div>

        {/* Orders */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-[#6b7280]">Orders</span>
            <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
              <ShoppingCart className="h-4 w-4 text-[#9ca3af]" />
            </div>
          </div>
          <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
            {summary.totalOrders.toLocaleString()}
          </div>
          <p className="text-[12px] text-[#9ca3af] mt-1">Completed orders</p>
        </div>

        {/* Avg Order Value */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-[#6b7280]">Avg Order Value</span>
            <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
            </div>
          </div>
          <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
            {formatPrice(summary.avgOrderValue)}
          </div>
          <p className="text-[12px] text-[#9ca3af] mt-1">Per transaction</p>
        </div>

        {/* Refunds */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-[#6b7280]">Refunds</span>
            <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-[#9ca3af]" />
            </div>
          </div>
          <div className="text-[28px] font-semibold text-rose-500 tracking-tight">
            {summary.refundCount}
          </div>
          <p className="text-[12px] text-[#9ca3af] mt-1">{formatPrice(summary.refundAmount)} refunded</p>
        </div>
      </div>

      {/* Sales Trend Chart */}
      {!isLoading && salesTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sales Trend</CardTitle>
            <CardDescription>Revenue and orders over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrend}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(value) => formatPrice(value)}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatPrice(value), "Revenue"]}
                    labelStyle={{ fontWeight: "bold" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--chart-1))"
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                    name="Revenue"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales Tabs - By Product, By Payment Method */}
      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">By Product</TabsTrigger>
          <TabsTrigger value="payment">By Payment Method</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>Sales by Product</CardTitle>
              <CardDescription>Revenue breakdown by product</CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              {isLoading ? (
                <div className="space-y-4 p-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : salesByProduct.length > 0 ? (
                <>
                  {/* Mobile view */}
                  <div className="divide-y divide-border sm:hidden">
                    {salesByProduct.map((product) => (
                      <div key={product.productId} className="p-4 space-y-2">
                        <div className="flex items-center gap-3">
                          {product.coverImage ? (
                            <img
                              src={product.coverImage}
                              alt={product.title}
                              className="h-10 w-10 rounded object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                              <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{product.title}</p>
                            <p className="text-xs text-muted-foreground capitalize">{product.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <span className="text-muted-foreground">Orders: </span>
                            <span className="font-medium">{product.orders}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold text-green-600">{formatPrice(product.revenue)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop view */}
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Avg Price</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {salesByProduct.map((product) => (
                          <TableRow key={product.productId}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {product.coverImage ? (
                                  <img
                                    src={product.coverImage}
                                    alt={product.title}
                                    className="h-10 w-10 rounded object-cover"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium">{product.title}</p>
                                  <p className="text-xs text-muted-foreground capitalize">{product.type}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{product.orders}</TableCell>
                            <TableCell className="text-right">{formatPrice(product.avgPrice)}</TableCell>
                            <TableCell className="text-right font-semibold text-green-600">
                              {formatPrice(product.revenue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No sales data for this period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment">
          <Card>
            <CardHeader>
              <CardTitle>Sales by Payment Method</CardTitle>
              <CardDescription>How customers are paying</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : paymentMethodData.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentMethodData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="amount"
                          nameKey="method"
                        >
                          {paymentMethodData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => formatPrice(value)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {paymentMethodData.map((method, index) => (
                      <div key={method.method} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="text-sm">{getPaymentMethodName(method.method)}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium">{formatPrice(method.amount)}</span>
                          <span className="text-xs text-muted-foreground ml-2">({method.count} orders)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CreditCard className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No payment data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>All transactions for the selected period</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-[250px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="space-y-4 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : orders.length > 0 ? (
            <>
              {/* Mobile view */}
              <div className="divide-y divide-border sm:hidden">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="p-4 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setSelectedOrder(order)
                      setOrderDetailOpen(true)
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{order.product?.title || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{order.buyer?.email || "Unknown customer"}</p>
                      </div>
                      {getStatusBadge(order.status)}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{formatDate(order.created_at)}</span>
                      <span className="font-semibold">{formatPrice(order.amount_cents)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop view */}
              <div className="hidden sm:block table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-xs">
                          {order.id.slice(0, 8)}...
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(order.created_at)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.buyer?.display_name || "Customer"}</p>
                            <p className="text-xs text-muted-foreground">{order.buyer?.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {order.product?.cover_image ? (
                              <img
                                src={order.product.cover_image}
                                alt=""
                                className="h-8 w-8 rounded object-cover"
                              />
                            ) : null}
                            <span className="truncate max-w-[200px]">{order.product?.title}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatPrice(order.amount_cents)}
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedOrder(order)
                                  setOrderDetailOpen(true)
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Mail className="mr-2 h-4 w-4" />
                                Email Customer
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View in Stripe
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                    {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} orders
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No orders found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Orders will appear here when customers purchase your products.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Dialog */}
      <Dialog open={orderDetailOpen} onOpenChange={setOrderDetailOpen}>
        <DialogContent className="w-[calc(100%-32px)] max-w-lg">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Order #{selectedOrder?.id.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                {getStatusBadge(selectedOrder.status)}
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Customer</p>
                  <p className="font-medium">{selectedOrder.buyer?.display_name || "Customer"}</p>
                  <p className="text-sm text-muted-foreground">{selectedOrder.buyer?.email}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Product</p>
                  <div className="flex items-center gap-3">
                    {selectedOrder.product?.cover_image ? (
                      <img
                        src={selectedOrder.product.cover_image}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{selectedOrder.product?.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{selectedOrder.product?.type}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Date</p>
                  <p>{formatDateTime(selectedOrder.created_at)}</p>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatPrice(selectedOrder.amount_cents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform Fee</span>
                    <span className="text-red-600">-{formatPrice(selectedOrder.fee_cents || 0)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                    <span>Net Revenue</span>
                    <span className="text-green-600">
                      {formatPrice((selectedOrder.amount_cents || 0) - (selectedOrder.fee_cents || 0))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" asChild>
                  <a href={`mailto:${selectedOrder.buyer?.email}`}>
                    <Mail className="mr-2 h-4 w-4" />
                    Email Customer
                  </a>
                </Button>
                <Button variant="outline" className="flex-1">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View in Stripe
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
