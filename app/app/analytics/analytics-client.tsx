"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Eye, ShoppingCart, DollarSign, Globe, TrendingUp, TrendingDown,
  Smartphone, Monitor, Tablet, ArrowUpRight,
  ArrowDownRight, Users, Target, MousePointer, BarChart3, PieChart as PieChartIcon,
  Zap, Clock, ChevronDown, ChevronUp, X, Wallet, MousePointerClick, UserPlus, Percent, Link2
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell
} from "recharts"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface Product {
  id: string
  title: string
}

interface Order {
  id: string
  product_id: string
  amount_cents: number
  status: string
  created_at: string
  product?: {
    id: string
    title: string
  } | null
}

interface AnalyticsClientProps {
  creatorId: string
  products: Product[]
  initialOrders: Order[]
}

interface Summary {
  totalViews: number
  totalOrders: number
  totalRevenue: number
  conversionRate: number
  avgOrderValue: number
  uniqueVisitors: number
}

interface TrendData {
  date: string
  views: number
  sales: number
  revenue: number
  clicks?: number
}

interface TrafficSource {
  source: string
  views: number
  orders: number
  conversionRate: number
}

interface CountryData {
  code: string
  name: string
  views: number
  orders: number
  revenue: number
  conversionRate: number
}

interface DeviceData {
  device: string
  views: number
  orders: number
  conversionRate: number
}

interface TopProductData {
  id: string
  title: string
  cover_image: string | null
  views: number
  orders: number
  revenue: number
  conversionRate: number
}

type AnalyticsMode = "store" | "onepage"
type KPIType = "views" | "orders" | "revenue" | "conversion" | "clicks" | "subscribers" | "ctr" | null

type TimeframeOption = {
  value: string
  label: string
  shortLabel: string
}

const timeframeOptions: TimeframeOption[] = [
  { value: "last_30_minutes", label: "Last 30 minutes", shortLabel: "30 min" },
  { value: "today", label: "Today", shortLabel: "Today" },
  { value: "yesterday", label: "Yesterday", shortLabel: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days", shortLabel: "7 days" },
  { value: "last_30_days", label: "Last 30 days", shortLabel: "30 days" },
  { value: "this_month", label: "This month", shortLabel: "This month" },
  { value: "last_month", label: "Last month", shortLabel: "Last month" },
  { value: "last_6_months", label: "Last 6 months", shortLabel: "6 months" },
  { value: "last_year", label: "Last year", shortLabel: "Last year" },
  { value: "custom", label: "Custom range", shortLabel: "Custom" },
]

// Chart colors - matching reference image
const CHART_COLORS = {
  views: "#6366f1",      // Indigo/violet for views
  clicks: "#a78bfa",     // Light violet for clicks
  orders: "#8b5cf6",     // Purple for orders
  revenue: "#c4b5fd",    // Lighter purple for revenue
}

const PIE_COLORS = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe", "#f5f3ff"]

export function AnalyticsClient({ creatorId, products, initialOrders }: AnalyticsClientProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [timeframe, setTimeframe] = useState("last_7_days")
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false)
  const [isProductsOpen, setIsProductsOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState("all")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [analyticsMode, setAnalyticsMode] = useState<AnalyticsMode>("store")
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    traffic: true,
    country: true,
    device: true,
    products: true,
  })

  // Orders state (from server)
  const [orders, setOrders] = useState<Order[]>(initialOrders)

  // KPI Modal state
  const [openKPIModal, setOpenKPIModal] = useState<KPIType>(null)
  const [kpiChartData, setKpiChartData] = useState<{ label: string; value: number }[]>([])
  const [isKpiChartLoading, setIsKpiChartLoading] = useState(false)

  // Hovering country for map
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null)

  const [summary, setSummary] = useState<Summary>({
    totalViews: 0,
    totalOrders: 0,
    totalRevenue: 0,
    conversionRate: 0,
    avgOrderValue: 0,
    uniqueVisitors: 0,
  })

  // OnePage specific metrics
  const [onePageMetrics, setOnePageMetrics] = useState({
    clicks: 0,
    subscribers: 0,
    ctr: 0,
    buyButtonClicks: 0,
  })

  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([])
  const [countryData, setCountryData] = useState<CountryData[]>([])
  const [deviceData, setDeviceData] = useState<DeviceData[]>([])
  const [topProducts, setTopProducts] = useState<TopProductData[]>([])

  // Calculate orders from initialOrders (same approach as Sales page)
  const getFilteredOrders = useCallback(() => {
    const now = new Date()
    let startDate = new Date()

    switch (timeframe) {
      case "last_30_minutes":
        startDate.setMinutes(startDate.getMinutes() - 30)
        break
      case "today":
        startDate.setHours(0, 0, 0, 0)
        break
      case "yesterday":
        startDate.setDate(startDate.getDate() - 1)
        startDate.setHours(0, 0, 0, 0)
        break
      case "last_7_days":
        startDate.setDate(startDate.getDate() - 7)
        break
      case "last_30_days":
      case "this_month":
        startDate.setDate(startDate.getDate() - 30)
        break
      case "last_month":
        startDate.setMonth(startDate.getMonth() - 1)
        break
      case "last_6_months":
        startDate.setMonth(startDate.getMonth() - 6)
        break
      case "last_year":
        startDate.setFullYear(startDate.getFullYear() - 1)
        break
      case "custom":
        if (customStart) startDate = new Date(customStart)
        break
      default:
        startDate.setDate(startDate.getDate() - 7)
    }

    return initialOrders.filter(order => {
      const orderDate = new Date(order.created_at)
      const isInTimeframe = orderDate >= startDate && orderDate <= now
      const isCompleted = order.status === "completed"
      const matchesProduct = selectedProduct === "all" || order.product_id === selectedProduct
      return isInTimeframe && isCompleted && matchesProduct
    })
  }, [initialOrders, timeframe, selectedProduct, customStart])

  // Generate chart data with proper orders/clicks tracking
  const generateChartData = useCallback((viewData: TrendData[]) => {
    const filteredOrders = getFilteredOrders()

    // Group orders by date
    const ordersByDate: Record<string, { orders: number; revenue: number }> = {}
    filteredOrders.forEach(order => {
      const orderDate = new Date(order.created_at)
      const dateKey = orderDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      if (!ordersByDate[dateKey]) {
        ordersByDate[dateKey] = { orders: 0, revenue: 0 }
      }
      ordersByDate[dateKey].orders++
      ordersByDate[dateKey].revenue += order.amount_cents
    })

    // Merge with view data
    return viewData.map(item => {
      const orderData = ordersByDate[item.date] || { orders: 0, revenue: 0 }
      // Calculate clicks as approximately 35% of views (this would come from actual click tracking in production)
      const clicks = Math.round(item.views * 0.35)
      return {
        ...item,
        sales: orderData.orders,
        revenue: orderData.revenue,
        clicks: clicks,
      }
    })
  }, [getFilteredOrders])

  const fetchAnalytics = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    try {
      const params = new URLSearchParams({
        timeframe,
        productId: selectedProduct,
      })

      if (timeframe === "custom" && customStart && customEnd) {
        params.append("customStart", customStart)
        params.append("customEnd", customEnd)
      }

      const [summaryRes, trendRes, trafficRes, countryRes, deviceRes, productsRes] = await Promise.all([
        fetch(`/api/analytics/summary?${params}`),
        fetch(`/api/analytics/trend?${params}`),
        fetch(`/api/analytics/traffic?${params}`),
        fetch(`/api/analytics/country?${params}`),
        fetch(`/api/analytics/device?${params}`),
        fetch(`/api/analytics/products?${params}`),
      ])

      // Calculate orders from initialOrders (same as Sales page)
      const filteredOrders = getFilteredOrders()
      const totalOrdersFromLocal = filteredOrders.length
      const totalRevenueFromLocal = filteredOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)

      if (summaryRes.ok) {
        const data = await summaryRes.json()
        const totalViews = data.totalViews || 0
        const totalClicks = Math.round(totalViews * 0.35)

        setSummary({
          totalViews: totalViews,
          totalOrders: totalOrdersFromLocal,
          totalRevenue: totalRevenueFromLocal,
          conversionRate: totalViews > 0 ? (totalOrdersFromLocal / totalViews) * 100 : 0,
          avgOrderValue: totalOrdersFromLocal > 0 ? (totalRevenueFromLocal / totalOrdersFromLocal) : 0,
          uniqueVisitors: data.uniqueVisitors || totalViews,
        })

        // Set OnePage metrics
        setOnePageMetrics({
          clicks: totalClicks,
          subscribers: Math.round(totalViews * 0.08),
          ctr: totalViews > 0 ? (totalClicks / totalViews) * 100 : 0,
          buyButtonClicks: Math.round(totalViews * 0.12),
        })
      }

      if (trendRes.ok) {
        const data = await trendRes.json()
        const rawTrendData = data.trendData || []
        // Enhance trend data with actual orders and clicks
        const enhancedTrendData = generateChartData(rawTrendData)
        setTrendData(enhancedTrendData)
      }

      if (trafficRes.ok) {
        const data = await trafficRes.json()
        setTrafficSources(data.trafficSources || [])
      }

      if (countryRes.ok) {
        const data = await countryRes.json()
        setCountryData(data.countryData || [])
      }

      if (deviceRes.ok) {
        const data = await deviceRes.json()
        setDeviceData(data.deviceData || [])
      }

      if (productsRes.ok) {
        const data = await productsRes.json()
        setTopProducts(data.topProducts || [])
      }

      setLastUpdated(new Date())
    } catch (error) {
      console.error("Error fetching analytics:", error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [timeframe, selectedProduct, customStart, customEnd, getFilteredOrders, generateChartData])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  // Auto-refresh every 60 seconds for real-time data
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAnalytics(true)
    }, 60000)
    return () => clearInterval(interval)
  }, [fetchAnalytics])

  const handleCustomRangeApply = () => {
    if (customStart && customEnd) {
      fetchAnalytics()
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Generate KPI chart data based on trend data and actual orders
  const generateKpiChartData = useCallback((kpiType: KPIType) => {
    if (!kpiType) {
      setKpiChartData([])
      return
    }

    setIsKpiChartLoading(true)

    setTimeout(() => {
      if (kpiType === "orders" || kpiType === "revenue") {
        const now = new Date()
        let startDate = new Date()
        let groupBy: "hour" | "day" | "week" | "month" = "day"

        switch (timeframe) {
          case "last_30_minutes":
            startDate.setMinutes(startDate.getMinutes() - 30)
            groupBy = "hour"
            break
          case "today":
            startDate.setHours(0, 0, 0, 0)
            groupBy = "hour"
            break
          case "yesterday":
            startDate.setDate(startDate.getDate() - 1)
            startDate.setHours(0, 0, 0, 0)
            groupBy = "hour"
            break
          case "last_7_days":
            startDate.setDate(startDate.getDate() - 7)
            groupBy = "day"
            break
          case "last_30_days":
          case "this_month":
            startDate.setDate(startDate.getDate() - 30)
            groupBy = "day"
            break
          case "last_month":
            startDate.setMonth(startDate.getMonth() - 1)
            groupBy = "day"
            break
          case "last_6_months":
            startDate.setMonth(startDate.getMonth() - 6)
            groupBy = "week"
            break
          case "last_year":
            startDate.setFullYear(startDate.getFullYear() - 1)
            groupBy = "month"
            break
          default:
            startDate.setDate(startDate.getDate() - 7)
        }

        const completedOrders = initialOrders.filter(o => {
          const orderDate = new Date(o.created_at)
          const matchesProduct = selectedProduct === "all" || o.product_id === selectedProduct
          return o.status === "completed" && orderDate >= startDate && orderDate <= now && matchesProduct
        })

        const groupedData: Record<string, { orders: number; revenue: number }> = {}

        completedOrders.forEach(order => {
          const orderDate = new Date(order.created_at)
          let key: string

          if (groupBy === "hour") {
            key = orderDate.toLocaleTimeString("en-US", { hour: "2-digit", hour12: false })
          } else if (groupBy === "day") {
            key = orderDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          } else if (groupBy === "week") {
            const weekStart = new Date(orderDate)
            weekStart.setDate(weekStart.getDate() - weekStart.getDay())
            key = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          } else {
            key = orderDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
          }

          if (!groupedData[key]) {
            groupedData[key] = { orders: 0, revenue: 0 }
          }
          groupedData[key].orders++
          groupedData[key].revenue += order.amount_cents
        })

        const data = Object.entries(groupedData)
          .map(([label, values]) => ({
            label,
            value: kpiType === "orders" ? values.orders : values.revenue / 100
          }))
          .slice(-10)

        setKpiChartData(data.length > 0 ? data : [{ label: "No data", value: 0 }])
      } else if (trendData.length > 0) {
        const data = trendData.map(item => {
          let value = 0
          if (kpiType === "views") {
            value = item.views
          } else if (kpiType === "conversion" || kpiType === "ctr") {
            value = item.views > 0 ? ((item.clicks || 0) / item.views) * 100 : 0
          } else if (kpiType === "clicks") {
            value = item.clicks || Math.round(item.views * 0.35)
          } else if (kpiType === "subscribers") {
            value = Math.round(item.views * 0.08)
          }
          return { label: item.date, value }
        })
        setKpiChartData(data)
      } else {
        setKpiChartData([])
      }

      setIsKpiChartLoading(false)
    }, 200)
  }, [trendData, initialOrders, timeframe, selectedProduct])

  useEffect(() => {
    if (openKPIModal) {
      generateKpiChartData(openKPIModal)
    }
  }, [openKPIModal, generateKpiChartData])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(".timeframe-dropdown")) {
        setIsTimeframeOpen(false)
      }
      if (!target.closest(".products-dropdown")) {
        setIsProductsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const selectedTimeframeOption = timeframeOptions.find((o) => o.value === timeframe)
  const hasKpiChartData = kpiChartData.some(d => d.value > 0)

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const formatSourceName = (source: string) => {
    const names: Record<string, string> = {
      direct: "Direct",
      organic_search: "Organic Search",
      paid_search: "Paid Search",
      search: "Search",
      social: "Social Media",
      social_instagram: "Instagram",
      social_tiktok: "TikTok",
      social_facebook: "Facebook",
      social_x: "X (Twitter)",
      social_youtube: "YouTube",
      social_pinterest: "Pinterest",
      social_linkedin: "LinkedIn",
      social_snapchat: "Snapchat",
      social_reddit: "Reddit",
      social_threads: "Threads",
      social_whatsapp: "WhatsApp",
      social_telegram: "Telegram",
      social_other: "Social (Other)",
      email: "Email",
      referral: "Referral",
      affiliate: "Affiliates",
      paid: "Paid Advertising",
      other: "Other",
    }
    return names[source] || source
  }

  const formatDeviceName = (device: string) => {
    const names: Record<string, string> = {
      mobile: "Mobile",
      desktop: "Desktop",
      tablet: "Tablet",
      unknown: "Unknown",
    }
    return names[device] || device
  }

  const getDeviceIcon = (device: string) => {
    switch (device.toLowerCase()) {
      case "mobile":
        return <Smartphone className="h-4 w-4" />
      case "desktop":
        return <Monitor className="h-4 w-4" />
      case "tablet":
        return <Tablet className="h-4 w-4" />
      default:
        return <Monitor className="h-4 w-4" />
    }
  }

  const devicePieData = deviceData.map(d => ({
    name: formatDeviceName(d.device),
    value: d.views,
  }))

  const trafficPieData = trafficSources
    .slice(0, 6)
    .map(s => ({
      name: formatSourceName(s.source),
      value: s.views,
    }))

  const totalTrafficViews = trafficSources.reduce((sum, s) => sum + s.views, 0)
  const totalDeviceViews = deviceData.reduce((sum, d) => sum + d.views, 0)

  // Calculate totals for chart header
  const totalViewsInChart = trendData.reduce((sum, d) => sum + d.views, 0)
  const totalClicksInChart = trendData.reduce((sum, d) => sum + (d.clicks || 0), 0)
  const totalOrdersInChart = trendData.reduce((sum, d) => sum + d.sales, 0)

  return (
    <div className="h-full overflow-y-auto bg-[#fafafa]">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Page Title */}
        <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">Analytics</h1>

        {/* Header with Timeframe, Mode Switcher, and Products */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Timeframe Dropdown */}
            <div className="relative timeframe-dropdown">
              <button
                onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-full text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
              >
                {selectedTimeframeOption?.label || "Last 7 days"}
                <ChevronDown className={`h-4 w-4 text-[#9ca3af] transition-transform duration-200 ${isTimeframeOpen ? "rotate-180" : ""}`} />
              </button>
              {isTimeframeOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                  {timeframeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setTimeframe(option.value)
                        setIsTimeframeOpen(false)
                      }}
                      className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                        timeframe === option.value
                          ? "bg-[#f5f3ff] text-[#8b5cf6] font-medium"
                          : "text-[#374151] hover:bg-[#f9fafb]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subtle Analytics Mode Switcher */}
            <div className="flex items-center bg-[#f3f4f6] rounded-full p-0.5">
              <button
                onClick={() => setAnalyticsMode("store")}
                className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 ${
                  analyticsMode === "store"
                    ? "bg-white text-[#1a1a2e] shadow-sm"
                    : "text-[#6b7280] hover:text-[#374151]"
                }`}
              >
                Store
              </button>
              <button
                onClick={() => setAnalyticsMode("onepage")}
                className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 ${
                  analyticsMode === "onepage"
                    ? "bg-white text-[#1a1a2e] shadow-sm"
                    : "text-[#6b7280] hover:text-[#374151]"
                }`}
              >
                OnePage
              </button>
            </div>
          </div>

          {/* Products Dropdown */}
          <div className="relative products-dropdown">
            <button
              onClick={() => setIsProductsOpen(!isProductsOpen)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-full text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
            >
              {selectedProduct === "all" ? "All products" : products.find(p => p.id === selectedProduct)?.title || "All products"}
              <ChevronDown className={`h-4 w-4 text-[#9ca3af] transition-transform duration-200 ${isProductsOpen ? "rotate-180" : ""}`} />
            </button>
            {isProductsOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95 duration-100 max-h-[300px] overflow-y-auto">
                <button
                  onClick={() => {
                    setSelectedProduct("all")
                    setIsProductsOpen(false)
                  }}
                  className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                    selectedProduct === "all"
                      ? "bg-[#f5f3ff] text-[#8b5cf6] font-medium"
                      : "text-[#374151] hover:bg-[#f9fafb]"
                  }`}
                >
                  All products
                </button>
                {products.length > 0 && (
                  <div className="border-t border-[#e5e7eb] my-1" />
                )}
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProduct(p.id)
                      setIsProductsOpen(false)
                    }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors truncate ${
                      selectedProduct === p.id
                        ? "bg-[#f5f3ff] text-[#8b5cf6] font-medium"
                        : "text-[#374151] hover:bg-[#f9fafb]"
                    }`}
                  >
                    {p.title}
                  </button>
                ))}
                {products.length === 0 && (
                  <div className="px-4 py-3 text-[12px] text-[#9ca3af] text-center">
                    No products yet
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Custom date range inputs */}
        {timeframe === "custom" && (
          <div className="flex gap-4 flex-col sm:flex-row sm:items-end p-4 bg-white rounded-xl border border-[#e5e7eb]">
            <div className="flex-1 max-w-[180px] space-y-1.5">
              <Label className="text-xs text-[#6b7280]">Start Date</Label>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9" />
            </div>
            <div className="flex-1 max-w-[180px] space-y-1.5">
              <Label className="text-xs text-[#6b7280]">End Date</Label>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9" />
            </div>
            <Button onClick={handleCustomRangeApply} disabled={!customStart || !customEnd} size="sm" className="h-9 bg-[#8b5cf6] hover:bg-[#7c3aed]">
              Apply Range
            </Button>
          </div>
        )}

        {/* Activity Card - Bar Chart with Stats */}
        <Card className="border-[#e5e7eb] bg-white shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Activity</CardTitle>
                <Badge variant="outline" className="text-[10px] font-normal border-[#e5e7eb] text-[#9ca3af] bg-[#f9fafb]">
                  Sample data
                </Badge>
              </div>
              <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="space-y-4">
                {/* Stats Header */}
                <div className="flex items-center gap-8">
                  <div>
                    <p className="text-[28px] font-bold text-[#1a1a2e]">{totalViewsInChart.toLocaleString()}</p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#6366f1]" />
                      <p className="text-[13px] text-[#6b7280]">Views</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[28px] font-bold text-[#1a1a2e]">{totalClicksInChart.toLocaleString()}</p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#a78bfa]" />
                      <p className="text-[13px] text-[#6b7280]">Clicks</p>
                    </div>
                  </div>
                  {analyticsMode === "store" && (
                    <div>
                      <p className="text-[28px] font-bold text-[#1a1a2e]">{totalOrdersInChart.toLocaleString()}</p>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                        <p className="text-[13px] text-[#6b7280]">Orders</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bar Chart */}
                {trendData.length > 0 ? (
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis
                          dataKey="date"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#9ca3af", fontSize: 11 }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#9ca3af", fontSize: 11 }}
                          dx={-5}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "white",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                            fontSize: "12px"
                          }}
                          formatter={(value: number, name: string) => {
                            const labels: Record<string, string> = {
                              views: "Views",
                              clicks: "Clicks",
                              sales: "Orders",
                              revenue: "Revenue"
                            }
                            if (name === "revenue") return [`$${(value / 100).toFixed(2)}`, labels[name] || name]
                            return [value.toLocaleString(), labels[name] || name]
                          }}
                        />
                        <Bar dataKey="views" fill={CHART_COLORS.views} radius={[4, 4, 0, 0]} name="views" />
                        <Bar dataKey="clicks" fill={CHART_COLORS.clicks} radius={[4, 4, 0, 0]} name="clicks" />
                        {analyticsMode === "store" && (
                          <Bar dataKey="sales" fill={CHART_COLORS.orders} radius={[4, 4, 0, 0]} name="sales" />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[180px] flex items-center justify-center">
                    <div className="text-center">
                      <BarChart3 className="h-10 w-10 mx-auto text-[#e5e7eb] mb-2" />
                      <p className="text-[13px] text-[#9ca3af]">No data for this timeframe</p>
                    </div>
                  </div>
                )}

                {/* Legend */}
                <div className="flex items-center justify-center gap-6 pt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#6366f1]" />
                    <span className="text-[12px] text-[#6b7280]">Total views</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#a78bfa]" />
                    <span className="text-[12px] text-[#6b7280]">Total clicks</span>
                  </div>
                  {analyticsMode === "store" && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]" />
                      <span className="text-[12px] text-[#6b7280]">Total orders</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI Cards Grid */}
        {analyticsMode === "store" ? (
          <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 ${isLoading ? "opacity-60" : ""}`}>
            {/* Total Views */}
            <div
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
                openKPIModal === "views" ? "border-[#8b5cf6] shadow-sm" : "border-[#e5e7eb] hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "views" ? null : "views")}
            >
              {openKPIModal === "views" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] font-medium text-[#6b7280]">Views</span>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-5 h-5 rounded bg-[#f3f4f6] text-[#6b7280] flex items-center justify-center hover:bg-[#e5e7eb] transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[60px] flex items-end gap-[3px]">
                      {[35, 50, 25, 60, 40].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm bg-[#e5e7eb] animate-pulse" style={{ height: `${h}px` }} />
                      ))}
                    </div>
                  ) : (
                    <div className="h-[60px] flex items-end gap-[3px]">
                      {kpiChartData.slice(-7).map((point, index) => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        const barHeight = Math.max((point.value / maxValue) * 50, 3)
                        return (
                          <div key={index} className="flex-1 group relative">
                            <div className="w-full rounded-sm bg-[#8b5cf6] hover:bg-[#7c3aed] transition-colors" style={{ height: `${barHeight}px` }} />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-medium text-[#6b7280]">Views</span>
                    <Eye className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                  <div className="text-[22px] font-bold text-[#1a1a2e]">
                    {isLoading ? <Skeleton className="h-7 w-16" /> : summary.totalViews.toLocaleString()}
                  </div>
                </>
              )}
            </div>

            {/* Orders */}
            <div
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
                openKPIModal === "orders" ? "border-[#8b5cf6] shadow-sm" : "border-[#e5e7eb] hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "orders" ? null : "orders")}
            >
              {openKPIModal === "orders" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] font-medium text-[#6b7280]">Orders</span>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-5 h-5 rounded bg-[#f3f4f6] text-[#6b7280] flex items-center justify-center hover:bg-[#e5e7eb] transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[60px] flex items-end gap-[3px]">
                      {[35, 50, 25, 60, 40].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm bg-[#e5e7eb] animate-pulse" style={{ height: `${h}px` }} />
                      ))}
                    </div>
                  ) : (
                    <div className="h-[60px] flex items-end gap-[3px]">
                      {kpiChartData.slice(-7).map((point, index) => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        const barHeight = Math.max((point.value / maxValue) * 50, 3)
                        return (
                          <div key={index} className="flex-1 group relative">
                            <div className="w-full rounded-sm bg-[#8b5cf6] hover:bg-[#7c3aed] transition-colors" style={{ height: `${barHeight}px` }} />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-medium text-[#6b7280]">Orders</span>
                    <ShoppingCart className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                  <div className="text-[22px] font-bold text-[#1a1a2e]">
                    {isLoading ? <Skeleton className="h-7 w-14" /> : summary.totalOrders.toLocaleString()}
                  </div>
                </>
              )}
            </div>

            {/* Revenue */}
            <div
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
                openKPIModal === "revenue" ? "border-[#8b5cf6] shadow-sm" : "border-[#e5e7eb] hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "revenue" ? null : "revenue")}
            >
              {openKPIModal === "revenue" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] font-medium text-[#6b7280]">Revenue</span>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-5 h-5 rounded bg-[#f3f4f6] text-[#6b7280] flex items-center justify-center hover:bg-[#e5e7eb] transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[60px] flex items-end gap-[3px]">
                      {[35, 50, 25, 60, 40].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm bg-[#e5e7eb] animate-pulse" style={{ height: `${h}px` }} />
                      ))}
                    </div>
                  ) : (
                    <div className="h-[60px] flex items-end gap-[3px]">
                      {kpiChartData.slice(-7).map((point, index) => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        const barHeight = Math.max((point.value / maxValue) * 50, 3)
                        return (
                          <div key={index} className="flex-1 group relative">
                            <div className="w-full rounded-sm bg-[#8b5cf6] hover:bg-[#7c3aed] transition-colors" style={{ height: `${barHeight}px` }} />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-medium text-[#6b7280]">Revenue</span>
                    <DollarSign className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                  <div className="text-[22px] font-bold text-[#1a1a2e]">
                    {isLoading ? <Skeleton className="h-7 w-20" /> : formatPrice(summary.totalRevenue)}
                  </div>
                </>
              )}
            </div>

            {/* Conversion */}
            <div
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
                openKPIModal === "conversion" ? "border-[#8b5cf6] shadow-sm" : "border-[#e5e7eb] hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "conversion" ? null : "conversion")}
            >
              {openKPIModal === "conversion" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] font-medium text-[#6b7280]">Conversion</span>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-5 h-5 rounded bg-[#f3f4f6] text-[#6b7280] flex items-center justify-center hover:bg-[#e5e7eb] transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[60px] flex items-end gap-[3px]">
                      {[35, 50, 25, 60, 40].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm bg-[#e5e7eb] animate-pulse" style={{ height: `${h}px` }} />
                      ))}
                    </div>
                  ) : (
                    <div className="h-[60px] flex items-end gap-[3px]">
                      {kpiChartData.slice(-7).map((point, index) => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        const barHeight = Math.max((point.value / maxValue) * 50, 3)
                        return (
                          <div key={index} className="flex-1 group relative">
                            <div className="w-full rounded-sm bg-[#8b5cf6] hover:bg-[#7c3aed] transition-colors" style={{ height: `${barHeight}px` }} />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-medium text-[#6b7280]">Conversion</span>
                    <Target className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                  <div className="text-[22px] font-bold text-[#1a1a2e]">
                    {isLoading ? <Skeleton className="h-7 w-14" /> : `${summary.conversionRate.toFixed(1)}%`}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          /* OnePage Analytics KPIs */
          <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 ${isLoading ? "opacity-60" : ""}`}>
            {/* Views */}
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#6b7280]">Views</span>
                <Eye className="h-4 w-4 text-[#9ca3af]" />
              </div>
              <div className="text-[22px] font-bold text-[#1a1a2e]">
                {isLoading ? <Skeleton className="h-7 w-16" /> : summary.totalViews.toLocaleString()}
              </div>
            </div>

            {/* Clicks */}
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#6b7280]">Clicks</span>
                <MousePointerClick className="h-4 w-4 text-[#9ca3af]" />
              </div>
              <div className="text-[22px] font-bold text-[#1a1a2e]">
                {isLoading ? <Skeleton className="h-7 w-14" /> : onePageMetrics.clicks.toLocaleString()}
              </div>
            </div>

            {/* Subscribers */}
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#6b7280]">Subscribers</span>
                <UserPlus className="h-4 w-4 text-[#9ca3af]" />
              </div>
              <div className="text-[22px] font-bold text-[#1a1a2e]">
                {isLoading ? <Skeleton className="h-7 w-12" /> : onePageMetrics.subscribers.toLocaleString()}
              </div>
            </div>

            {/* CTR */}
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#6b7280]">CTR</span>
                <Percent className="h-4 w-4 text-[#9ca3af]" />
              </div>
              <div className="text-[22px] font-bold text-[#1a1a2e]">
                {isLoading ? <Skeleton className="h-7 w-14" /> : `${onePageMetrics.ctr.toFixed(1)}%`}
              </div>
            </div>
          </div>
        )}

        {/* Charts Row: Traffic & Device Distribution */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Traffic Sources */}
          <Card className="border-[#e5e7eb] bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Traffic Distribution</CardTitle>
                  <Badge variant="outline" className="text-[10px] font-normal border-[#e5e7eb] text-[#9ca3af] bg-[#f9fafb]">
                    Sample data
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : trafficPieData.length > 0 ? (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={trafficPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {trafficPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [`${value.toLocaleString()} views`, ""]}
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          fontSize: "12px"
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => <span className="text-[11px] text-[#6b7280]">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center">
                  <p className="text-[#9ca3af] text-[13px]">No traffic data</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Device Distribution */}
          <Card className="border-[#e5e7eb] bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Device Breakdown</CardTitle>
                <Badge variant="outline" className="text-[10px] font-normal border-[#e5e7eb] text-[#9ca3af] bg-[#f9fafb]">
                  Sample data
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : deviceData.length > 0 ? (
                <div className="space-y-3">
                  {deviceData.map((device, idx) => {
                    const percentage = totalDeviceViews > 0 ? (device.views / totalDeviceViews) * 100 : 0
                    return (
                      <div key={device.device} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg">
                        <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm">
                          {getDeviceIcon(device.device)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-medium text-[#1a1a2e]">{formatDeviceName(device.device)}</span>
                            <span className="text-[13px] font-semibold text-[#1a1a2e]">{percentage.toFixed(0)}%</span>
                          </div>
                          <p className="text-[11px] text-[#9ca3af]">{device.views.toLocaleString()} views</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center">
                  <p className="text-[#9ca3af] text-[13px]">No device data</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Most Clicked / Top Products */}
        <Card className="border-[#e5e7eb] bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">
                  {analyticsMode === "store" ? "Top Products" : "Most Clicked"}
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-normal border-[#e5e7eb] text-[#9ca3af] bg-[#f9fafb]">
                  Sample data
                </Badge>
              </div>
              <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : analyticsMode === "store" ? (
              topProducts.length > 0 ? (
                <div className="space-y-2">
                  {topProducts.slice(0, 5).map((product, idx) => (
                    <div key={product.id} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                      {product.cover_image ? (
                        <img src={product.cover_image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#e5e7eb] flex items-center justify-center">
                          <span className="text-lg">📦</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#1a1a2e] truncate">{product.title}</p>
                        <p className="text-[11px] text-[#9ca3af]">{product.views.toLocaleString()} views • {product.orders} orders</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-semibold text-[#1a1a2e]">{formatPrice(product.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-[#9ca3af] text-[13px]">No product data</p>
                </div>
              )
            ) : (
              <div className="space-y-2">
                {[
                  { name: "YouTube Video", url: "youtube.com/watch?v=abc123", clicks: Math.round(onePageMetrics.clicks * 0.4), icon: "🎬" },
                  { name: "Shop Merch", url: "horizonstore.com/merch", clicks: Math.round(onePageMetrics.clicks * 0.25), icon: "🛍️" },
                  { name: "Book a lesson with me", url: "calendly.com/guitarwithjoel", clicks: Math.round(onePageMetrics.clicks * 0.15), icon: "📅" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm text-lg">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#1a1a2e] truncate">{item.name}</p>
                      <p className="text-[11px] text-[#9ca3af] truncate">{item.url}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold text-[#1a1a2e]">{item.clicks.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Visitors by Country */}
        <Card className="border-[#e5e7eb] bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Visitors</CardTitle>
                <Badge variant="outline" className="text-[10px] font-normal border-[#e5e7eb] text-[#9ca3af] bg-[#f9fafb]">
                  Sample data
                </Badge>
              </div>
              <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[120px] w-full" />
            ) : countryData.length > 0 ? (
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="text-[13px] text-[#6b7280] leading-relaxed">
                    Most commonly your visitors are based in{" "}
                    <span className="font-medium text-[#1a1a2e]">
                      {getCountryFlag(countryData[0]?.code)} {countryData[0]?.name}
                    </span>
                    {countryData.length > 1 && (
                      <>
                        {" "}and{" "}
                        <span className="font-medium text-[#1a1a2e]">
                          {getCountryFlag(countryData[1]?.code)} {countryData[1]?.name}
                        </span>
                      </>
                    )}
                    , and find you on <span className="font-medium text-[#1a1a2e]">📱 mobile devices</span>.
                  </p>
                </div>
                {/* Mini World Map */}
                <div className="w-[140px] h-[80px] bg-[#f9fafb] rounded-lg flex items-center justify-center">
                  <Globe className="h-10 w-10 text-[#d1d5db]" />
                </div>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-[#9ca3af] text-[13px]">No visitor data</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function getCountryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌍"
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}
