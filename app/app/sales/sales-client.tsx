"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  RotateCcw,
  Download,
  Search,
  Filter,
  ChevronDown,
  X,
  Calendar,
  Package,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Eye,
  BarChart3,
  Users,
} from "lucide-react"
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
  storeName: string
  sellerName: string
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

interface ChartDataPoint {
  label: string
  value: number
}

interface MonthlyReport {
  month: string
  year: number
  monthYear: string
  orders: number
  revenue: number
  orderDetails: Order[]
}

type KPIType = "sales" | "orders" | "avgValue" | "refunds" | null

type TimeframeOption = {
  value: string
  label: string
  shortLabel: string
  getDates: () => { start: Date; end: Date }
}

const timeframeOptions: TimeframeOption[] = [
  {
    value: "today",
    label: "Today",
    shortLabel: "Today",
    getDates: () => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      return { start, end }
    },
  },
  {
    value: "last_7_days",
    label: "Last 7 days",
    shortLabel: "7 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 7)
      return { start, end }
    },
  },
  {
    value: "last_30_days",
    label: "Last 30 days",
    shortLabel: "30 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      return { start, end }
    },
  },
  {
    value: "this_month",
    label: "This month",
    shortLabel: "This month",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      return { start, end }
    },
  },
  {
    value: "last_90_days",
    label: "Last 90 days",
    shortLabel: "90 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 90)
      return { start, end }
    },
  },
  {
    value: "this_year",
    label: "This year",
    shortLabel: "This year",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(0)
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      return { start, end }
    },
  },
  {
    value: "all_time",
    label: "All time",
    shortLabel: "All time",
    getDates: () => {
      const end = new Date()
      const start = new Date(2020, 0, 1)
      return { start, end }
    },
  },
]

export function SalesClient({ creatorId, products, initialSummary, currency, stripeConnected, storeName, sellerName }: SalesClientProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [timeframe, setTimeframe] = useState("last_30_days")
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"orders" | "reports">("orders")

  // Filter states
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterDateRange, setFilterDateRange] = useState<"today" | "7days" | "30days" | "custom">("30days")
  const [filterFromDate, setFilterFromDate] = useState("")
  const [filterToDate, setFilterToDate] = useState("")
  const [filterProduct, setFilterProduct] = useState("all")
  const [filterMinValue, setFilterMinValue] = useState("")
  const [filterMaxValue, setFilterMaxValue] = useState("")
  const [filterCustomer, setFilterCustomer] = useState("")
  const [appliedFilters, setAppliedFilters] = useState<any>(null)

  // KPI Modal states
  const [openKPIModal, setOpenKPIModal] = useState<KPIType>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [isChartLoading, setIsChartLoading] = useState(false)

  const [summary, setSummary] = useState(initialSummary)
  const [orders, setOrders] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReport[]>([])

  const supabase = createClient()

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </span>
        )
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        )
      case "refunded":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-700">
            <RotateCcw className="h-3 w-3" />
            Refunded
          </span>
        )
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
            {status}
          </span>
        )
    }
  }

  const fetchSalesData = async () => {
    setIsLoading(true)
    try {
      const option = timeframeOptions.find((o) => o.value === timeframe)
      if (!option) return

      const { start, end } = option.getDates()
      const productIds = products.map((p) => p.id)

      if (productIds.length === 0) {
        setIsLoading(false)
        setOrders([])
        setAllOrders([])
        setMonthlyReports([])
        return
      }

      // Fetch orders for the selected timeframe (for display and KPIs)
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

      const { data: fetchedOrders, error } = await ordersQuery

      if (error) throw error

      let filteredOrders = fetchedOrders || []

      // Apply search filter
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

      // Apply additional filters if any
      if (appliedFilters) {
        if (appliedFilters.product && appliedFilters.product !== "all") {
          filteredOrders = filteredOrders.filter(o => o.product_id === appliedFilters.product)
        }
        if (appliedFilters.minValue) {
          filteredOrders = filteredOrders.filter(o => o.amount_cents >= parseFloat(appliedFilters.minValue) * 100)
        }
        if (appliedFilters.maxValue) {
          filteredOrders = filteredOrders.filter(o => o.amount_cents <= parseFloat(appliedFilters.maxValue) * 100)
        }
        if (appliedFilters.customer) {
          const customerQuery = appliedFilters.customer.toLowerCase()
          filteredOrders = filteredOrders.filter(o =>
            o.buyer?.email?.toLowerCase().includes(customerQuery) ||
            o.buyer?.display_name?.toLowerCase().includes(customerQuery)
          )
        }
      }

      setTotalCount(filteredOrders.length)
      setOrders(filteredOrders)

      // Calculate summary from filtered orders
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

      // Fetch ALL orders (all time) for monthly reports
      const { data: allTimeOrders, error: allTimeError } = await supabase
        .from("orders")
        .select(`
          *,
          product:products!orders_product_id_fkey(id, title, type, cover_image),
          buyer:profiles!orders_buyer_id_fkey(email, display_name)
        `)
        .in("product_id", productIds)
        .order("created_at", { ascending: false })

      if (!allTimeError) {
        setAllOrders(allTimeOrders || [])
        // Generate monthly reports from ALL orders (all time)
        generateMonthlyReports(allTimeOrders || [])
      }
    } catch (error) {
      console.error("Error fetching sales data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Generate monthly reports - includes all orders (paid and free)
  const generateMonthlyReports = (ordersData: Order[]) => {
    // Include all orders except failed ones (completed, pending, refunded, free)
    const validOrders = ordersData.filter(o => o.status !== "failed")
    const reportMap: Record<string, MonthlyReport> = {}

    validOrders.forEach((order) => {
      const date = new Date(order.created_at)
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      const month = monthNames[date.getMonth()]
      const year = date.getFullYear()
      const key = `${year}-${date.getMonth()}`

      if (!reportMap[key]) {
        reportMap[key] = {
          month,
          year,
          monthYear: `${month} ${year}`,
          orders: 0,
          revenue: 0,
          orderDetails: [],
        }
      }

      reportMap[key].orders++
      // Only count revenue from completed orders
      if (order.status === "completed") {
        reportMap[key].revenue += order.amount_cents || 0
      }
      reportMap[key].orderDetails.push(order)
    })

    // Sort by date descending (newest first)
    const sortedReports = Object.values(reportMap).sort((a, b) => {
      const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      const aIndex = a.year * 12 + monthOrder.indexOf(a.month)
      const bIndex = b.year * 12 + monthOrder.indexOf(b.month)
      return bIndex - aIndex
    })

    setMonthlyReports(sortedReports)
  }

  // Fetch chart data for KPI
  const fetchChartData = async (kpiType: KPIType) => {
    if (!kpiType) return

    setIsChartLoading(true)
    try {
      const option = timeframeOptions.find((o) => o.value === timeframe)
      if (!option) return

      const { start, end } = option.getDates()
      const productIds = products.map((p) => p.id)
      const points: ChartDataPoint[] = []

      if (productIds.length === 0) {
        setChartData([])
        setIsChartLoading(false)
        return
      }

      // Determine grouping based on timeframe
      const isToday = timeframe === "today"
      const isYear = timeframe === "this_year" || timeframe === "all_time"

      if (isToday) {
        // Group by hour
        for (let hour = 0; hour <= new Date().getHours(); hour++) {
          const hourStart = new Date(start)
          hourStart.setHours(hour, 0, 0, 0)
          const hourEnd = new Date(start)
          hourEnd.setHours(hour, 59, 59, 999)

          const { data } = await supabase
            .from("orders")
            .select("amount_cents, status")
            .in("product_id", productIds)
            .eq("status", "completed")
            .gte("created_at", hourStart.toISOString())
            .lte("created_at", hourEnd.toISOString())

          let value = 0
          if (kpiType === "sales") {
            value = (data || []).reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          } else if (kpiType === "orders") {
            value = data?.length || 0
          } else if (kpiType === "avgValue") {
            const total = (data || []).reduce((sum, o) => sum + (o.amount_cents || 0), 0)
            value = data && data.length > 0 ? (total / data.length) / 100 : 0
          }

          points.push({
            label: `${hour.toString().padStart(2, '0')}:00`,
            value,
          })
        }
      } else if (isYear) {
        // Group by month
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        for (let month = 0; month < 12; month++) {
          const monthStart = new Date(start.getFullYear(), month, 1)
          const monthEnd = new Date(start.getFullYear(), month + 1, 0, 23, 59, 59, 999)

          if (monthEnd > end) break

          const { data } = await supabase
            .from("orders")
            .select("amount_cents, status")
            .in("product_id", productIds)
            .eq("status", "completed")
            .gte("created_at", monthStart.toISOString())
            .lte("created_at", monthEnd.toISOString())

          let value = 0
          if (kpiType === "sales") {
            value = (data || []).reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          } else if (kpiType === "orders") {
            value = data?.length || 0
          } else if (kpiType === "avgValue") {
            const total = (data || []).reduce((sum, o) => sum + (o.amount_cents || 0), 0)
            value = data && data.length > 0 ? (total / data.length) / 100 : 0
          }

          points.push({
            label: monthNames[month],
            value,
          })
        }
      } else {
        // Group by day
        const dayCount = timeframe === "last_90_days" ? 12 : timeframe === "last_30_days" ? 10 : 7
        const dayStep = timeframe === "last_90_days" ? 7 : timeframe === "last_30_days" ? 3 : 1

        for (let i = dayCount - 1; i >= 0; i--) {
          const dayStart = new Date(end)
          dayStart.setDate(dayStart.getDate() - (i * dayStep))
          dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(dayStart)
          dayEnd.setDate(dayEnd.getDate() + dayStep - 1)
          dayEnd.setHours(23, 59, 59, 999)

          const { data } = await supabase
            .from("orders")
            .select("amount_cents, status")
            .in("product_id", productIds)
            .eq("status", "completed")
            .gte("created_at", dayStart.toISOString())
            .lte("created_at", dayEnd.toISOString())

          let value = 0
          if (kpiType === "sales") {
            value = (data || []).reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          } else if (kpiType === "orders") {
            value = data?.length || 0
          } else if (kpiType === "avgValue") {
            const total = (data || []).reduce((sum, o) => sum + (o.amount_cents || 0), 0)
            value = data && data.length > 0 ? (total / data.length) / 100 : 0
          }

          points.push({
            label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value,
          })
        }
      }

      setChartData(points)
    } catch (error) {
      console.error("Error fetching chart data:", error)
    } finally {
      setIsChartLoading(false)
    }
  }

  // Generate PDF report
  const generatePDFReport = (report: MonthlyReport) => {
    // Calculate avg from completed orders only
    const completedOrders = report.orderDetails.filter(o => o.status === "completed")
    const avgOrderValue = completedOrders.length > 0 ? report.revenue / completedOrders.length : 0

    // Create PDF content as HTML for printing
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Report - ${report.monthYear}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1a1a2e; }
          .header { margin-bottom: 30px; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; }
          .header h1 { font-size: 24px; margin: 0 0 8px 0; }
          .header p { color: #6b7280; margin: 4px 0; font-size: 14px; }
          .summary { display: flex; gap: 40px; margin: 30px 0; padding: 20px; background: #f9fafb; border-radius: 12px; }
          .summary-item { }
          .summary-item .label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
          .summary-item .value { font-size: 24px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-top: 30px; }
          th { text-align: left; padding: 12px; background: #f3f4f6; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; }
          td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
          .amount { text-align: right; font-weight: 500; }
          .status { text-transform: capitalize; }
          .status-completed { color: #059669; }
          .status-pending { color: #d97706; }
          .status-refunded { color: #dc2626; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${storeName} - Sales Report</h1>
          <p><strong>Seller:</strong> ${sellerName}</p>
          <p><strong>Period:</strong> ${report.monthYear}</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div class="summary">
          <div class="summary-item">
            <div class="label">Total Revenue</div>
            <div class="value">${formatPrice(report.revenue)}</div>
          </div>
          <div class="summary-item">
            <div class="label">Total Orders</div>
            <div class="value">${report.orders}</div>
          </div>
          <div class="summary-item">
            <div class="label">Average Order Value</div>
            <div class="value">${formatPrice(avgOrderValue)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Product</th>
              <th>Status</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${report.orderDetails.map(order => `
              <tr>
                <td>${formatDate(order.created_at)}</td>
                <td>#${order.id.slice(0, 8)}</td>
                <td>${order.buyer?.email || 'Unknown'}</td>
                <td>${order.product?.title || 'Unknown'}</td>
                <td class="status status-${order.status}">${order.status}</td>
                <td class="amount">${order.amount_cents > 0 ? formatPrice(order.amount_cents) : 'Free'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `

    // Open print window
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
      printWindow.print()
    }
  }

  // Fetch chart data when KPI modal opens
  useEffect(() => {
    if (openKPIModal && openKPIModal !== "refunds") {
      fetchChartData(openKPIModal)
    }
  }, [openKPIModal, timeframe])

  useEffect(() => {
    fetchSalesData()
  }, [timeframe, searchQuery, appliedFilters])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(".timeframe-dropdown")) {
        setIsTimeframeOpen(false)
      }
      if (!target.closest(".filter-dropdown") && !target.closest(".filter-button")) {
        setIsFilterOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const selectedOption = timeframeOptions.find((o) => o.value === timeframe)

  const handleApplyFilters = () => {
    setAppliedFilters({
      dateRange: filterDateRange,
      fromDate: filterFromDate,
      toDate: filterToDate,
      product: filterProduct,
      minValue: filterMinValue,
      maxValue: filterMaxValue,
      customer: filterCustomer,
    })
    setIsFilterOpen(false)
  }

  const handleClearFilters = () => {
    setFilterDateRange("30days")
    setFilterFromDate("")
    setFilterToDate("")
    setFilterProduct("all")
    setFilterMinValue("")
    setFilterMaxValue("")
    setFilterCustomer("")
    setAppliedFilters(null)
  }

  const handleExportCSV = () => {
    if (orders.length === 0) return

    const headers = ["Order ID", "Date", "Customer Name", "Customer Email", "Product", "Amount", "Status"]
    const rows = orders.map((order) => [
      order.id,
      formatDate(order.created_at),
      order.buyer?.display_name || "Unknown",
      order.buyer?.email || "",
      order.product?.title || "Unknown",
      formatPrice(order.amount_cents),
      order.status,
    ])

    const csv = [headers.join(","), ...rows.map((row) => row.map(cell => `"${cell}"`).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sales-export-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Check if there are any orders in selected timeframe or any orders all time
  const hasOrders = orders.length > 0 || allOrders.length > 0 || summary.totalOrders > 0
  const hasChartData = chartData.some(d => d.value > 0)

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fa] sales-scroll-container">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center" style={{ gap: '14px' }}>
            <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">Sales</h1>

            {/* Timeframe Dropdown */}
            <div className="relative timeframe-dropdown">
              <button
                onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#e5e7eb] rounded-full text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
              >
                <Calendar className="h-3.5 w-3.5 text-[#9ca3af]" />
                {selectedOption?.shortLabel || "30 days"}
                <ChevronDown className={`h-3.5 w-3.5 text-[#9ca3af] transition-transform duration-200 ${isTimeframeOpen ? "rotate-180" : ""}`} />
              </button>
              {isTimeframeOpen && (
                <div className="absolute left-0 top-full mt-1 w-40 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                  {timeframeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setTimeframe(option.value)
                        setIsTimeframeOpen(false)
                      }}
                      className={`w-full text-left px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
                        timeframe === option.value
                          ? "bg-[#f5f3ff] text-[#8b5cf6]"
                          : "text-[#374151] hover:bg-[#f9fafb]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* All Orders Tab */}
            <button
              onClick={() => setActiveTab("orders")}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
                activeTab === "orders"
                  ? "bg-[#e5e7eb] text-[#374151]"
                  : "text-[#6b7280] hover:bg-[#f3f4f6]"
              }`}
            >
              All Orders
            </button>

            {/* Sales Reports Tab */}
            <button
              onClick={() => setActiveTab("reports")}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
                activeTab === "reports"
                  ? "bg-[#e5e7eb] text-[#374151]"
                  : "text-[#6b7280] hover:bg-[#f3f4f6]"
              }`}
            >
              Sales Reports
            </button>
          </div>

          {/* Right side buttons */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              {isSearchOpen ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search orders..."
                    className="w-48 px-3 py-1.5 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setIsSearchOpen(false)
                      setSearchQuery("")
                    }}
                    className="p-1.5 text-[#9ca3af] hover:text-[#6b7280]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="p-2 bg-white border border-[#e5e7eb] rounded-lg text-[#6b7280] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter */}
            <div className="relative">
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`filter-button p-2 bg-white border rounded-lg transition-colors shadow-sm cursor-pointer ${
                  appliedFilters ? "border-[#8b5cf6] text-[#8b5cf6]" : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"
                }`}
              >
                <Filter className="h-4 w-4" />
              </button>

              {/* Filter Dropdown */}
              {isFilterOpen && (
                <div className="filter-dropdown absolute right-0 top-full mt-2 w-[320px] bg-white border border-[#e5e7eb] rounded-xl shadow-xl z-50 p-4 animate-in fade-in-0 zoom-in-95 duration-100">
                  <div className="space-y-4">
                    {/* Date Range */}
                    <div>
                      <label className="block text-[12px] font-medium text-[#6b7280] mb-2">Date range</label>
                      <div className="flex gap-1">
                        {[
                          { value: "today", label: "Today" },
                          { value: "7days", label: "7 days" },
                          { value: "30days", label: "30 days" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setFilterDateRange(opt.value as any)}
                            className={`flex-1 px-2 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                              filterDateRange === opt.value
                                ? "bg-[#8b5cf6] text-white border-[#8b5cf6]"
                                : "bg-white text-[#374151] border-[#e5e7eb] hover:bg-[#f9fafb]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* From / To */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">From</label>
                        <input
                          type="date"
                          value={filterFromDate}
                          onChange={(e) => setFilterFromDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">To</label>
                        <input
                          type="date"
                          value={filterToDate}
                          onChange={(e) => setFilterToDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                        />
                      </div>
                    </div>

                    {/* Product */}
                    <div>
                      <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">Product</label>
                      <select
                        value={filterProduct}
                        onChange={(e) => setFilterProduct(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] bg-white"
                      >
                        <option value="all">Select products</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                      </select>
                    </div>

                    {/* Order Value */}
                    <div>
                      <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">Order value (optional)</label>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="number"
                          value={filterMinValue}
                          onChange={(e) => setFilterMinValue(e.target.value)}
                          placeholder="Min"
                          className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                        />
                        <input
                          type="number"
                          value={filterMaxValue}
                          onChange={(e) => setFilterMaxValue(e.target.value)}
                          placeholder="Max"
                          className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                        />
                      </div>
                    </div>

                    {/* Customer */}
                    <div>
                      <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">Customer</label>
                      <input
                        type="text"
                        value={filterCustomer}
                        onChange={(e) => setFilterCustomer(e.target.value)}
                        placeholder="Email or name"
                        className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                      />
                    </div>

                    {/* Divider */}
                    <div className="border-t border-[#e5e7eb]" />

                    {/* Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleClearFilters}
                        className="flex-1 px-3 py-2 text-[13px] font-medium text-[#6b7280] bg-white border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors"
                      >
                        Clear all
                      </button>
                      <button
                        onClick={handleApplyFilters}
                        className="flex-1 px-3 py-2 text-[13px] font-medium text-white bg-[#8b5cf6] rounded-lg hover:bg-[#7c3aed] transition-colors"
                      >
                        Apply filters
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Download */}
            <button
              onClick={handleExportCSV}
              className="p-2 bg-white border border-[#e5e7eb] rounded-lg text-[#6b7280] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
              title="Export CSV"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8 ${isLoading ? "opacity-60" : ""}`}>
          {/* Total Sales */}
          <div
            className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
              openKPIModal === "sales" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
            }`}
            onClick={() => setOpenKPIModal(openKPIModal === "sales" ? null : "sales")}
          >
            {openKPIModal === "sales" ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-violet-600">Total Sales</span>
                    <span className="text-[10px] text-[#9ca3af]">• {selectedOption?.label}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isChartLoading ? (
                  <div className="h-[80px] flex items-end gap-[2px]">
                    {[35, 50, 25, 60, 40, 55, 30].map((h, i) => (
                      <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                        <div className="w-full rounded-sm bg-violet-200/60 skeleton-bar" style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }} />
                      </div>
                    ))}
                  </div>
                ) : !hasChartData ? (
                  <div className="h-[80px] flex items-center justify-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
                    <span className="text-[12px] text-[#9ca3af]">No data</span>
                  </div>
                ) : (
                  <div className="h-[80px] flex items-end gap-[2px]">
                    {(() => {
                      const maxValue = Math.max(...chartData.map((d) => d.value), 1)
                      return chartData.map((point, index) => {
                        const barHeight = Math.max((point.value / maxValue) * 65, 3)
                        return (
                          <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                              {point.label}: ${point.value.toFixed(2)}
                            </div>
                            <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors" style={{ height: `${barHeight}px` }} />
                          </div>
                        )
                      })
                    })()}
                  </div>
                )}
              </>
            ) : (
              <>
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
              </>
            )}
          </div>

          {/* Orders */}
          <div
            className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
              openKPIModal === "orders" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
            }`}
            onClick={() => setOpenKPIModal(openKPIModal === "orders" ? null : "orders")}
          >
            {openKPIModal === "orders" ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-violet-600">Orders</span>
                    <span className="text-[10px] text-[#9ca3af]">• {selectedOption?.label}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isChartLoading ? (
                  <div className="h-[80px] flex items-end gap-[2px]">
                    {[30, 45, 55, 35, 50, 40, 60].map((h, i) => (
                      <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                        <div className="w-full rounded-sm bg-violet-200/60 skeleton-bar" style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }} />
                      </div>
                    ))}
                  </div>
                ) : !hasChartData ? (
                  <div className="h-[80px] flex items-center justify-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
                    <span className="text-[12px] text-[#9ca3af]">No data</span>
                  </div>
                ) : (
                  <div className="h-[80px] flex items-end gap-[2px]">
                    {(() => {
                      const maxValue = Math.max(...chartData.map((d) => d.value), 1)
                      return chartData.map((point, index) => {
                        const barHeight = Math.max((point.value / maxValue) * 65, 3)
                        return (
                          <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                              {point.label}: {point.value}
                            </div>
                            <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors" style={{ height: `${barHeight}px` }} />
                          </div>
                        )
                      })
                    })()}
                  </div>
                )}
              </>
            ) : (
              <>
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
              </>
            )}
          </div>

          {/* Avg Order Value */}
          <div
            className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
              openKPIModal === "avgValue" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
            }`}
            onClick={() => setOpenKPIModal(openKPIModal === "avgValue" ? null : "avgValue")}
          >
            {openKPIModal === "avgValue" ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-violet-600">Avg Order Value</span>
                    <span className="text-[10px] text-[#9ca3af]">• {selectedOption?.label}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isChartLoading ? (
                  <div className="h-[80px] flex items-end gap-[2px]">
                    {[40, 55, 30, 50, 45, 35, 55].map((h, i) => (
                      <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                        <div className="w-full rounded-sm bg-violet-200/60 skeleton-bar" style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }} />
                      </div>
                    ))}
                  </div>
                ) : !hasChartData ? (
                  <div className="h-[80px] flex items-center justify-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
                    <span className="text-[12px] text-[#9ca3af]">No data</span>
                  </div>
                ) : (
                  <div className="h-[80px] flex items-end gap-[2px]">
                    {(() => {
                      const maxValue = Math.max(...chartData.map((d) => d.value), 1)
                      return chartData.map((point, index) => {
                        const barHeight = Math.max((point.value / maxValue) * 65, 3)
                        return (
                          <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                              {point.label}: ${point.value.toFixed(2)}
                            </div>
                            <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors" style={{ height: `${barHeight}px` }} />
                          </div>
                        )
                      })
                    })()}
                  </div>
                )}
              </>
            ) : (
              <>
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
              </>
            )}
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

        {/* Content Area - Sales or Reports */}
        {activeTab === "reports" ? (
          /* Sales Reports Tab */
          monthlyReports.length > 0 ? (
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e5e7eb]">
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider w-12">#</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Month & Year</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Orders</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Revenue</th>
                      <th className="text-right px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e7eb]">
                    {monthlyReports.map((report, index) => (
                      <tr key={`${report.year}-${report.month}`} className="hover:bg-[#f9fafb] transition-colors">
                        <td className="px-5 py-4 text-[14px] text-[#6b7280]">{index + 1}</td>
                        <td className="px-5 py-4">
                          <span className="text-[14px] font-medium text-[#1a1a2e]">{report.monthYear}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[14px] text-[#1a1a2e]">{report.orders}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[14px] font-medium text-[#1a1a2e]">{formatPrice(report.revenue)}</span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => generatePDFReport(report)}
                              className="text-[13px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors"
                            >
                              View
                            </button>
                            <span className="text-[#d1d5db]">·</span>
                            <button
                              onClick={() => generatePDFReport(report)}
                              className="text-[13px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors"
                            >
                              Download
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* No Reports Empty State */
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-12">
              <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-[#f3f4f6] flex items-center justify-center mb-5">
                  <FileText className="h-8 w-8 text-[#9ca3af]" />
                </div>
                <h2 className="text-[18px] font-semibold text-[#1a1a2e] mb-2">
                  No reports available
                </h2>
                <p className="text-[14px] text-[#6b7280] mb-6">
                  Reports will be available once you start making your first orders.
                </p>
                <Link
                  href="/app/products/new"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#8b5cf6] text-white text-[14px] font-medium rounded-full hover:bg-[#7c3aed] transition-colors"
                >
                  Start selling
                </Link>
              </div>
            </div>
          )
        ) : (
          /* All Orders Tab - Orders List or Empty State */
          !hasOrders ? (
            /* Empty State - Promotional Banner */
            <div className="space-y-6">
              {/* Promotional Banner - Like Storelib Editions */}
              <div
                className="relative overflow-hidden rounded-2xl"
                style={{
                  backgroundImage: `url('https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/9965079.jpg')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />
                <div className="relative z-10 px-5 py-5 sm:px-8 sm:py-6">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] sm:text-[15px] font-semibold text-white">Start Selling</span>
                    <span className="text-white/60 hidden sm:inline">|</span>
                    <span className="text-[13px] sm:text-[15px] text-white/90 hidden sm:inline">Your journey begins</span>
                  </div>
                  <p className="text-[16px] sm:text-[20px] font-medium text-white mb-3 sm:mb-4">You're one step away from making your first sale.</p>
                  <p className="text-[13px] sm:text-[14px] text-white/80 mb-4 max-w-lg">Every time a new customer purchases a product from your Storelib, their details appear here.</p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Link
                      href="/app/products/new"
                      className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg text-[12px] sm:text-[13px] font-semibold text-[#1a1a2e] hover:bg-white/90 transition-colors"
                    >
                      Start selling
                    </Link>
                    <Link
                      href="/app/onepage"
                      className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-[12px] sm:text-[13px] font-medium text-white hover:bg-white/20 transition-colors"
                    >
                      Edit OnePage
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Orders Table */
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e5e7eb]">
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Customer</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Product</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Date</th>
                      <th className="text-right px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Amount</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Status</th>
                      <th className="text-right px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e7eb]">
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-[#f9fafb] transition-colors">
                        <td className="px-5 py-4">
                          <div>
                            <p className="text-[14px] font-medium text-[#1a1a2e]">
                              {order.buyer?.display_name || "Customer"}
                            </p>
                            <p className="text-[12px] text-[#6b7280]">{order.buyer?.email}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {order.product?.cover_image ? (
                              <img
                                src={order.product.cover_image}
                                alt=""
                                className="w-10 h-10 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                                <Package className="h-4 w-4 text-[#9ca3af]" />
                              </div>
                            )}
                            <span className="text-[14px] text-[#1a1a2e] truncate max-w-[200px]">
                              {order.product?.title || "Unknown Product"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[14px] text-[#6b7280]">{formatDate(order.created_at)}</span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-[14px] font-medium text-[#1a1a2e]">{formatPrice(order.amount_cents)}</span>
                        </td>
                        <td className="px-5 py-4">
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {order.status === "completed" && (
                              <button className="px-3 py-1.5 text-[12px] font-medium text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors">
                                Refund
                              </button>
                            )}
                            <button className="p-1.5 text-[#9ca3af] hover:text-[#6b7280] transition-colors">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination info */}
              {totalCount > 0 && (
                <div className="px-5 py-3 border-t border-[#e5e7eb] text-[13px] text-[#6b7280]">
                  Showing {orders.length} of {totalCount} orders
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Styles */}
      <style jsx>{`
        @keyframes skeleton-shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        .skeleton-bar {
          background: linear-gradient(90deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.4) 50%, rgba(139, 92, 246, 0.2) 100%);
          background-size: 200% 100%;
          animation: skeleton-shimmer 2s ease-in-out infinite, skeleton-pulse 2.5s ease-in-out infinite;
        }
        .sales-scroll-container {
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
        }
        .sales-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .sales-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .sales-scroll-container::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 3px;
        }
        .sales-scroll-container::-webkit-scrollbar-thumb:hover {
          background-color: rgba(156, 163, 175, 0.7);
        }
        @media (max-width: 768px) {
          .sales-scroll-container::-webkit-scrollbar {
            display: none;
          }
          .sales-scroll-container {
            scrollbar-width: none;
          }
        }
      `}</style>
    </div>
  )
}
