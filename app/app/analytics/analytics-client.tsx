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
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, ComposedChart, Line
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

// Chart colors
const CHART_COLORS = {
  primary: "#8b5cf6",
  secondary: "#10b981",
  tertiary: "#f59e0b",
  quaternary: "#ef4444",
  muted: "#6b7280",
}

const PIE_COLORS = ["#8b5cf6", "#10b981", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6"]

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

  // Announcement bar state
  const [announcementType, setAnnouncementType] = useState<"analytics" | "upgrade">("analytics")
  const [announcementVisible, setAnnouncementVisible] = useState(true)
  const [progressWidth, setProgressWidth] = useState(0)

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
        setSummary({
          totalViews: data.totalViews || 0,
          // Use local orders count for accurate data
          totalOrders: totalOrdersFromLocal,
          totalRevenue: totalRevenueFromLocal,
          conversionRate: data.totalViews > 0 ? (totalOrdersFromLocal / data.totalViews) * 100 : 0,
          avgOrderValue: totalOrdersFromLocal > 0 ? (totalRevenueFromLocal / totalOrdersFromLocal) : 0,
          uniqueVisitors: data.uniqueVisitors || data.totalViews || 0,
        })

        // Set OnePage metrics (sample data - would come from actual analytics in production)
        setOnePageMetrics({
          clicks: Math.round((data.totalViews || 0) * 0.35),
          subscribers: Math.round((data.totalViews || 0) * 0.08),
          ctr: data.totalViews > 0 ? ((data.totalViews * 0.35) / data.totalViews) * 100 : 0,
          buyButtonClicks: Math.round((data.totalViews || 0) * 0.12),
        })
      }

      if (trendRes.ok) {
        const data = await trendRes.json()
        setTrendData(data.trendData || [])
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
  }, [timeframe, selectedProduct, customStart, customEnd, getFilteredOrders])

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
        // Get timeframe dates
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

        // Filter orders by timeframe and status (same as Sales page)
        const completedOrders = initialOrders.filter(o => {
          const orderDate = new Date(o.created_at)
          const matchesProduct = selectedProduct === "all" || o.product_id === selectedProduct
          return o.status === "completed" && orderDate >= startDate && orderDate <= now && matchesProduct
        })

        // Group orders by time period
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

        // Convert to array and sort
        const data = Object.entries(groupedData)
          .map(([label, values]) => ({
            label,
            value: kpiType === "orders" ? values.orders : values.revenue / 100
          }))
          .slice(-10)

        setKpiChartData(data.length > 0 ? data : [{ label: "No data", value: 0 }])
      } else if (trendData.length > 0) {
        // Use trend data for views and conversion
        const data = trendData.map(item => {
          let value = 0
          if (kpiType === "views") {
            value = item.views
          } else if (kpiType === "conversion" || kpiType === "ctr") {
            value = item.views > 0 ? (item.sales / item.views) * 100 : 0
          } else if (kpiType === "clicks") {
            value = Math.round(item.views * 0.35)
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

  // Fetch chart data when KPI modal opens
  useEffect(() => {
    if (openKPIModal) {
      generateKpiChartData(openKPIModal)
    }
  }, [openKPIModal, generateKpiChartData])

  // Close dropdowns when clicking outside
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

  // Rotate announcements every 15 seconds with progress bar
  useEffect(() => {
    const DURATION = 15000
    const PROGRESS_INTERVAL = 50

    setProgressWidth(0)

    const progressTimer = setInterval(() => {
      setProgressWidth((prev) => {
        const newWidth = prev + (100 / (DURATION / PROGRESS_INTERVAL))
        return newWidth >= 100 ? 100 : newWidth
      })
    }, PROGRESS_INTERVAL)

    const rotateTimer = setTimeout(() => {
      setAnnouncementVisible(false)
      setTimeout(() => {
        setAnnouncementType((prev) => prev === "analytics" ? "upgrade" : "analytics")
        setProgressWidth(0)
        setAnnouncementVisible(true)
      }, 300)
    }, DURATION)

    return () => {
      clearInterval(progressTimer)
      clearTimeout(rotateTimer)
    }
  }, [announcementType])

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

  // Prepare pie chart data for devices
  const devicePieData = deviceData.map(d => ({
    name: formatDeviceName(d.device),
    value: d.views,
  }))

  // Prepare pie chart data for traffic sources (top 6)
  const trafficPieData = trafficSources
    .slice(0, 6)
    .map(s => ({
      name: formatSourceName(s.source),
      value: s.views,
    }))

  // Calculate total views for percentage
  const totalTrafficViews = trafficSources.reduce((sum, s) => sum + s.views, 0)
  const totalDeviceViews = deviceData.reduce((sum, d) => sum + d.views, 0)

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fa]">
      {/* Rotating Announcement Bar */}
      <div className="bg-[#8b5cf6] text-white">
        <div className="py-2 px-4 md:py-2.5">
          <div
            className={`max-w-[1200px] mx-auto flex items-center justify-center gap-2 md:gap-3 text-center transition-opacity duration-300 ${
              announcementVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            {announcementType === "analytics" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">Track your growth</span>
                  <span className="hidden md:inline"> — Monitor views, orders, and revenue in real-time.</span>
                </span>
                <Link
                  href="/app/products"
                  className="inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-white/90 to-gray-100/90 text-gray-800 text-[11px] md:text-[13px] font-medium rounded-full transition-all hover:from-white hover:to-gray-50 shrink-0"
                >
                  Add Product
                </Link>
              </>
            )}
            {announcementType === "upgrade" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">Try Pro free</span>
                  <span className="hidden md:inline"> — Advanced analytics and insights for your business.</span>
                </span>
                <Link
                  href="/upgrade"
                  className="inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-white/90 to-gray-100/90 text-gray-800 text-[11px] md:text-[13px] font-medium rounded-full transition-all hover:from-white hover:to-gray-50 shrink-0"
                >
                  Upgrade
                </Link>
              </>
            )}
          </div>
        </div>
        {/* Subtle progress bar */}
        <div className="h-[2px] bg-white/10">
          <div
            className="h-full bg-white/30 transition-all duration-50 ease-linear"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Page Title */}
        <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">Analytics</h1>

        {/* Header with Timeframe, Mode Switcher, and Products */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Timeframe Dropdown */}
            <div className="relative timeframe-dropdown">
              <button
                onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
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

            {/* Analytics Mode Switcher */}
            <div className="flex items-center bg-white border border-[#e5e7eb] rounded-xl p-1 shadow-sm">
              <button
                onClick={() => setAnalyticsMode("store")}
                className={`px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all ${
                  analyticsMode === "store"
                    ? "bg-[#8b5cf6] text-white shadow-sm"
                    : "text-[#6b7280] hover:text-[#374151]"
                }`}
              >
                Store Analytics
              </button>
              <button
                onClick={() => setAnalyticsMode("onepage")}
                className={`px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all ${
                  analyticsMode === "onepage"
                    ? "bg-[#8b5cf6] text-white shadow-sm"
                    : "text-[#6b7280] hover:text-[#374151]"
                }`}
              >
                OnePage Analytics
              </button>
            </div>
          </div>

          {/* Products Dropdown (styled like timeframe selector) */}
          <div className="relative products-dropdown">
            <button
              onClick={() => setIsProductsOpen(!isProductsOpen)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
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

        {/* KPI Cards - Store Analytics Mode */}
        {analyticsMode === "store" && (
          <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 ${isLoading ? "opacity-60" : ""}`}>
            {/* Total Views */}
            <div
              className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
                openKPIModal === "views" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "views" ? null : "views")}
            >
              {openKPIModal === "views" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-violet-600">Total Views</span>
                      <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedTimeframeOption?.label}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {[35, 50, 25, 60, 40, 55, 30].map((h, i) => (
                        <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                          <div className="w-full rounded-sm bg-violet-200/60 animate-pulse" style={{ height: `${h}px` }} />
                        </div>
                      ))}
                    </div>
                  ) : !hasKpiChartData ? (
                    <div className="h-[80px] flex items-center justify-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
                      <span className="text-[12px] text-[#9ca3af]">No data</span>
                    </div>
                  ) : (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {(() => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        return kpiChartData.map((point, index) => {
                          const barHeight = Math.max((point.value / maxValue) * 65, 3)
                          return (
                            <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                {point.label}: {point.value.toLocaleString()}
                              </div>
                              <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors" style={{ height: `${barHeight}px` }} />
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Total Views</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Eye className="h-4 w-4 text-blue-600" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-8 w-20" /> : summary.totalViews.toLocaleString()}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">Unique page views</p>
                </>
              )}
            </div>

            {/* Total Orders */}
            <div
              className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
                openKPIModal === "orders" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "orders" ? null : "orders")}
            >
              {openKPIModal === "orders" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-violet-600">Orders</span>
                      <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedTimeframeOption?.label}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {[30, 45, 55, 35, 50, 40, 60].map((h, i) => (
                        <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                          <div className="w-full rounded-sm bg-violet-200/60 animate-pulse" style={{ height: `${h}px` }} />
                        </div>
                      ))}
                    </div>
                  ) : !hasKpiChartData ? (
                    <div className="h-[80px] flex items-center justify-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
                      <span className="text-[12px] text-[#9ca3af]">No data</span>
                    </div>
                  ) : (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {(() => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        return kpiChartData.map((point, index) => {
                          const barHeight = Math.max((point.value / maxValue) * 65, 3)
                          return (
                            <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                {point.label}: {point.value.toLocaleString()}
                              </div>
                              <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors" style={{ height: `${barHeight}px` }} />
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Orders</span>
                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                      <ShoppingCart className="h-4 w-4 text-green-600" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-8 w-16" /> : summary.totalOrders.toLocaleString()}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">Completed orders</p>
                </>
              )}
            </div>

            {/* Total Revenue */}
            <div
              className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
                openKPIModal === "revenue" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "revenue" ? null : "revenue")}
            >
              {openKPIModal === "revenue" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-violet-600">Revenue</span>
                      <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedTimeframeOption?.label}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {[40, 55, 30, 50, 45, 35, 55].map((h, i) => (
                        <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                          <div className="w-full rounded-sm bg-violet-200/60 animate-pulse" style={{ height: `${h}px` }} />
                        </div>
                      ))}
                    </div>
                  ) : !hasKpiChartData ? (
                    <div className="h-[80px] flex items-center justify-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
                      <span className="text-[12px] text-[#9ca3af]">No data</span>
                    </div>
                  ) : (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {(() => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        return kpiChartData.map((point, index) => {
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
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Revenue</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-amber-600" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-8 w-24" /> : formatPrice(summary.totalRevenue)}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">Gross revenue</p>
                </>
              )}
            </div>

            {/* Conversion Rate */}
            <div
              className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
                openKPIModal === "conversion" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "conversion" ? null : "conversion")}
            >
              {openKPIModal === "conversion" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-violet-600">Conversion</span>
                      <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedTimeframeOption?.label}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {[25, 40, 50, 30, 55, 45, 35].map((h, i) => (
                        <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                          <div className="w-full rounded-sm bg-violet-200/60 animate-pulse" style={{ height: `${h}px` }} />
                        </div>
                      ))}
                    </div>
                  ) : !hasKpiChartData ? (
                    <div className="h-[80px] flex items-center justify-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
                      <span className="text-[12px] text-[#9ca3af]">No data</span>
                    </div>
                  ) : (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {(() => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        return kpiChartData.map((point, index) => {
                          const barHeight = Math.max((point.value / maxValue) * 65, 3)
                          return (
                            <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                {point.label}: {point.value.toFixed(2)}%
                              </div>
                              <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors" style={{ height: `${barHeight}px` }} />
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Conversion</span>
                    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                      <Target className="h-4 w-4 text-purple-600" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-8 w-16" /> : `${summary.conversionRate.toFixed(2)}%`}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">Views to orders</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* KPI Cards - OnePage Analytics Mode */}
        {analyticsMode === "onepage" && (
          <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 ${isLoading ? "opacity-60" : ""}`}>
            {/* Total Views */}
            <div
              className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
                openKPIModal === "views" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "views" ? null : "views")}
            >
              {openKPIModal === "views" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-violet-600">Page Views</span>
                      <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedTimeframeOption?.label}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {[35, 50, 25, 60, 40, 55, 30].map((h, i) => (
                        <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                          <div className="w-full rounded-sm bg-violet-200/60 animate-pulse" style={{ height: `${h}px` }} />
                        </div>
                      ))}
                    </div>
                  ) : !hasKpiChartData ? (
                    <div className="h-[80px] flex items-center justify-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
                      <span className="text-[12px] text-[#9ca3af]">No data</span>
                    </div>
                  ) : (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {(() => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        return kpiChartData.map((point, index) => {
                          const barHeight = Math.max((point.value / maxValue) * 65, 3)
                          return (
                            <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                {point.label}: {point.value.toLocaleString()}
                              </div>
                              <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors" style={{ height: `${barHeight}px` }} />
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Page Views</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Eye className="h-4 w-4 text-blue-600" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-8 w-20" /> : summary.totalViews.toLocaleString()}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">Unique visitors</p>
                </>
              )}
            </div>

            {/* Clicks */}
            <div
              className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
                openKPIModal === "clicks" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "clicks" ? null : "clicks")}
            >
              {openKPIModal === "clicks" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-violet-600">Clicks</span>
                      <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedTimeframeOption?.label}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {[30, 45, 55, 35, 50, 40, 60].map((h, i) => (
                        <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                          <div className="w-full rounded-sm bg-violet-200/60 animate-pulse" style={{ height: `${h}px` }} />
                        </div>
                      ))}
                    </div>
                  ) : !hasKpiChartData ? (
                    <div className="h-[80px] flex items-center justify-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
                      <span className="text-[12px] text-[#9ca3af]">No data</span>
                    </div>
                  ) : (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {(() => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        return kpiChartData.map((point, index) => {
                          const barHeight = Math.max((point.value / maxValue) * 65, 3)
                          return (
                            <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                {point.label}: {point.value.toLocaleString()}
                              </div>
                              <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors" style={{ height: `${barHeight}px` }} />
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Clicks</span>
                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                      <MousePointerClick className="h-4 w-4 text-green-600" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-8 w-16" /> : onePageMetrics.clicks.toLocaleString()}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">Total link clicks</p>
                </>
              )}
            </div>

            {/* Subscribers */}
            <div
              className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
                openKPIModal === "subscribers" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "subscribers" ? null : "subscribers")}
            >
              {openKPIModal === "subscribers" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-violet-600">Subscribers</span>
                      <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedTimeframeOption?.label}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {[40, 55, 30, 50, 45, 35, 55].map((h, i) => (
                        <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                          <div className="w-full rounded-sm bg-violet-200/60 animate-pulse" style={{ height: `${h}px` }} />
                        </div>
                      ))}
                    </div>
                  ) : !hasKpiChartData ? (
                    <div className="h-[80px] flex items-center justify-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
                      <span className="text-[12px] text-[#9ca3af]">No data</span>
                    </div>
                  ) : (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {(() => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        return kpiChartData.map((point, index) => {
                          const barHeight = Math.max((point.value / maxValue) * 65, 3)
                          return (
                            <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                {point.label}: {point.value.toLocaleString()}
                              </div>
                              <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors" style={{ height: `${barHeight}px` }} />
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Subscribers</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                      <UserPlus className="h-4 w-4 text-amber-600" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-8 w-24" /> : onePageMetrics.subscribers.toLocaleString()}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">New subscribers</p>
                </>
              )}
            </div>

            {/* CTR */}
            <div
              className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
                openKPIModal === "ctr" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "ctr" ? null : "ctr")}
            >
              {openKPIModal === "ctr" ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-violet-600">CTR</span>
                      <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedTimeframeOption?.label}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isKpiChartLoading ? (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {[25, 40, 50, 30, 55, 45, 35].map((h, i) => (
                        <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                          <div className="w-full rounded-sm bg-violet-200/60 animate-pulse" style={{ height: `${h}px` }} />
                        </div>
                      ))}
                    </div>
                  ) : !hasKpiChartData ? (
                    <div className="h-[80px] flex items-center justify-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
                      <span className="text-[12px] text-[#9ca3af]">No data</span>
                    </div>
                  ) : (
                    <div className="h-[80px] flex items-end gap-[2px]">
                      {(() => {
                        const maxValue = Math.max(...kpiChartData.map((d) => d.value), 1)
                        return kpiChartData.map((point, index) => {
                          const barHeight = Math.max((point.value / maxValue) * 65, 3)
                          return (
                            <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                {point.label}: {point.value.toFixed(2)}%
                              </div>
                              <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors" style={{ height: `${barHeight}px` }} />
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">CTR</span>
                    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                      <Percent className="h-4 w-4 text-purple-600" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-8 w-16" /> : `${onePageMetrics.ctr.toFixed(1)}%`}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">Click-through rate</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Trend Chart */}
        <Card className="border-[#e5e7eb]/60 bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-[#1a1a2e]">
                  {analyticsMode === "store" ? "Views, Orders & Revenue Trend" : "Views & Clicks Trend"}
                </CardTitle>
                <CardDescription className="text-[#6b7280]">Track your performance over time</CardDescription>
              </div>
              <Badge variant="outline" className="font-normal border-[#e5e7eb] text-[#6b7280]">
                <Clock className="h-3 w-3 mr-1" />
                {timeframe.replace(/_/g, " ")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : trendData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.secondary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.secondary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    dx={-10}
                  />
                  {analyticsMode === "store" && (
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#6b7280", fontSize: 12 }}
                      dx={10}
                      tickFormatter={(value) => `$${value}`}
                    />
                  )}
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === "Revenue") return [`$${(value / 100).toFixed(2)}`, name]
                      return [value.toLocaleString(), name]
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="views"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorViews)"
                    name="Views"
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="sales"
                    stroke={CHART_COLORS.secondary}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorOrders)"
                    name={analyticsMode === "store" ? "Orders" : "Clicks"}
                  />
                  {analyticsMode === "store" && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="revenue"
                      stroke={CHART_COLORS.tertiary}
                      strokeWidth={2}
                      dot={false}
                      name="Revenue"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-[#d1d5db] mb-3" />
                <p className="text-[#6b7280]">No data for this timeframe</p>
                <p className="text-sm text-[#9ca3af] mt-1">Try selecting a different date range</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts Row: Traffic & Device Distribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Traffic Sources Pie Chart */}
        <Card className="border-[#e5e7eb]/60 bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-[#1a1a2e] flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-[#6b7280]" />
                  Traffic Distribution
                </CardTitle>
                <CardDescription className="text-[#6b7280]">Where your visitors come from</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : trafficPieData.length > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={trafficPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
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
                        borderRadius: "8px"
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span className="text-xs text-[#6b7280]">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center">
                <p className="text-[#6b7280] text-sm">No traffic data</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Device Distribution */}
        <Card className="border-[#e5e7eb]/60 bg-white">
          <CardHeader className="pb-2">
            <div>
              <CardTitle className="text-base font-semibold text-[#1a1a2e] flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-[#6b7280]" />
                Device Breakdown
              </CardTitle>
              <CardDescription className="text-[#6b7280]">How visitors access your {analyticsMode === "store" ? "store" : "page"}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : deviceData.length > 0 ? (
              <div className="space-y-4">
                {deviceData.map((device, idx) => {
                  const percentage = totalDeviceViews > 0 ? (device.views / totalDeviceViews) * 100 : 0
                  return (
                    <div key={device.device} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-xl">
                      <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
                        {getDeviceIcon(device.device)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[13px] font-medium text-[#1a1a2e]">{formatDeviceName(device.device)}</span>
                          <span className="text-[13px] font-semibold text-[#1a1a2e]">{percentage.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#6b7280]">
                          <span>{device.views.toLocaleString()} views</span>
                          {analyticsMode === "store" && (
                            <>
                              <span>•</span>
                              <span>{device.conversionRate.toFixed(1)}% conv.</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center">
                <p className="text-muted-foreground text-sm">No device data</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Traffic Sources Table */}
      <Card className="border-[#e5e7eb]/60 bg-white">
        <CardHeader className="pb-2">
          <button
            onClick={() => toggleSection("traffic")}
            className="flex items-center justify-between w-full text-left"
          >
            <div>
              <CardTitle className="text-base font-semibold text-[#1a1a2e]">Traffic Sources</CardTitle>
              <CardDescription className="text-[#6b7280]">Detailed breakdown of where your visitors come from</CardDescription>
            </div>
            {expandedSections.traffic ? (
              <ChevronUp className="h-5 w-5 text-[#6b7280]" />
            ) : (
              <ChevronDown className="h-5 w-5 text-[#6b7280]" />
            )}
          </button>
        </CardHeader>
        {expandedSections.traffic && (
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : trafficSources.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">{analyticsMode === "store" ? "Orders" : "Clicks"}</TableHead>
                      <TableHead className="text-right">{analyticsMode === "store" ? "Conversion" : "CTR"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trafficSources.map((source) => (
                      <TableRow key={source.source}>
                        <TableCell className="font-medium">{formatSourceName(source.source)}</TableCell>
                        <TableCell className="text-right">{source.views.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{source.orders.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={source.conversionRate > 5 ? "default" : "secondary"} className="font-normal">
                            {source.conversionRate.toFixed(2)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">No traffic data for this timeframe</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Analytics by Country - Interactive Map */}
      <Card className="border-[#e5e7eb]/60 bg-white">
        <CardHeader className="pb-2">
          <button
            onClick={() => toggleSection("country")}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-[#6b7280]" />
              <div>
                <CardTitle className="text-base font-semibold text-[#1a1a2e]">Visitors by Country</CardTitle>
                <CardDescription className="text-[#6b7280]">Geographic distribution of your audience</CardDescription>
              </div>
            </div>
            {expandedSections.country ? (
              <ChevronUp className="h-5 w-5 text-[#6b7280]" />
            ) : (
              <ChevronDown className="h-5 w-5 text-[#6b7280]" />
            )}
          </button>
        </CardHeader>
        {expandedSections.country && (
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : countryData.length > 0 ? (
              <div className="space-y-6">
                {/* World Map SVG */}
                <div className="relative bg-gradient-to-b from-[#f8fafc] to-[#f1f5f9] rounded-xl p-4 sm:p-6 overflow-hidden">
                  <div className="relative h-[200px] sm:h-[280px]">
                    <svg viewBox="0 0 1000 500" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                      <defs>
                        <linearGradient id="oceanGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#f1f5f9" />
                          <stop offset="100%" stopColor="#e2e8f0" />
                        </linearGradient>
                      </defs>

                      {/* Ocean background */}
                      <rect x="0" y="0" width="1000" height="500" fill="url(#oceanGradient)" />

                      {/* Simplified accurate world map paths */}
                      <g>
                        {/* North America */}
                        <path d="M150,80 L220,70 L280,90 L300,130 L280,170 L240,190 L200,180 L160,160 L130,130 L140,100 Z"
                          fill={getCountryColor("CA", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("CA")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M130,180 L200,180 L260,200 L280,240 L260,280 L220,290 L170,270 L130,240 L110,210 Z"
                          fill={getCountryColor("US", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("US")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M140,290 L190,280 L210,310 L190,350 L150,360 L130,330 Z"
                          fill={getCountryColor("MX", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("MX")} onMouseLeave={() => setHoveredCountry(null)} />

                        {/* South America */}
                        <path d="M220,350 L280,340 L310,380 L300,440 L260,470 L220,450 L200,400 Z"
                          fill={getCountryColor("BR", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("BR")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M200,450 L240,470 L230,500 L190,490 L180,460 Z"
                          fill={getCountryColor("AR", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("AR")} onMouseLeave={() => setHoveredCountry(null)} />

                        {/* Europe */}
                        <path d="M450,120 L470,110 L490,125 L485,145 L460,145 Z"
                          fill={getCountryColor("GB", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("GB")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M460,155 L500,145 L510,170 L490,190 L455,180 Z"
                          fill={getCountryColor("FR", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("FR")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M445,190 L475,185 L485,210 L460,220 L440,205 Z"
                          fill={getCountryColor("ES", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("ES")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M500,130 L540,120 L560,145 L545,170 L505,165 Z"
                          fill={getCountryColor("DE", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("DE")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M510,175 L540,170 L545,210 L520,230 L495,210 Z"
                          fill={getCountryColor("IT", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("IT")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M560,120 L600,110 L620,140 L600,165 L560,155 Z"
                          fill={getCountryColor("PL", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("PL")} onMouseLeave={() => setHoveredCountry(null)} />

                        {/* Russia */}
                        <path d="M600,80 L820,60 L880,120 L860,180 L740,200 L640,170 L600,130 Z"
                          fill={getCountryColor("RU", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("RU")} onMouseLeave={() => setHoveredCountry(null)} />

                        {/* Africa */}
                        <path d="M480,240 L540,230 L560,280 L520,320 L470,300 Z"
                          fill={getCountryColor("EG", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("EG")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M470,320 L530,310 L550,370 L510,400 L460,380 Z"
                          fill={getCountryColor("NG", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("NG")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M520,420 L570,410 L580,460 L540,480 L500,460 Z"
                          fill={getCountryColor("ZA", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("ZA")} onMouseLeave={() => setHoveredCountry(null)} />

                        {/* Middle East */}
                        <path d="M560,230 L620,220 L650,270 L610,310 L550,290 Z"
                          fill={getCountryColor("SA", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("SA")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M550,190 L600,180 L620,210 L590,230 L545,220 Z"
                          fill={getCountryColor("TR", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("TR")} onMouseLeave={() => setHoveredCountry(null)} />

                        {/* Asia */}
                        <path d="M660,240 L720,220 L760,280 L740,340 L680,360 L640,310 Z"
                          fill={getCountryColor("IN", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("IN")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M740,160 L860,140 L900,200 L880,280 L780,300 L740,240 Z"
                          fill={getCountryColor("CN", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("CN")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M900,180 L930,165 L945,210 L925,240 L895,220 Z"
                          fill={getCountryColor("JP", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("JP")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M880,200 L905,190 L915,225 L895,245 L870,230 Z"
                          fill={getCountryColor("KR", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("KR")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M780,320 L820,310 L840,360 L810,390 L770,370 Z"
                          fill={getCountryColor("TH", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("TH")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M800,380 L870,370 L900,420 L860,460 L790,440 Z"
                          fill={getCountryColor("ID", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("ID")} onMouseLeave={() => setHoveredCountry(null)} />

                        {/* Australia */}
                        <path d="M840,400 L920,380 L960,440 L930,490 L860,500 L820,460 Z"
                          fill={getCountryColor("AU", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("AU")} onMouseLeave={() => setHoveredCountry(null)} />
                        <path d="M960,460 L985,450 L995,485 L975,500 L955,490 Z"
                          fill={getCountryColor("NZ", countryData)} stroke="#cbd5e1" strokeWidth="0.5"
                          className="cursor-pointer hover:brightness-95 transition-all"
                          onMouseEnter={() => setHoveredCountry("NZ")} onMouseLeave={() => setHoveredCountry(null)} />
                      </g>

                      {/* Hover tooltip */}
                      {hoveredCountry && countryData.find(c => c.code === hoveredCountry) && (() => {
                        const country = countryData.find(c => c.code === hoveredCountry)!
                        const pos = getCountryCenter(hoveredCountry)
                        return (
                          <g className="pointer-events-none">
                            <rect x={pos.x - 50} y={pos.y - 45} width="100" height="35" rx="6" fill="#1a1a2e" fillOpacity="0.95" />
                            <text x={pos.x} y={pos.y - 25} textAnchor="middle" fill="white" fontSize="10" fontWeight="600">
                              {getCountryFlag(country.code)} {country.name}
                            </text>
                            <text x={pos.x} y={pos.y - 12} textAnchor="middle" fill="#a5b4fc" fontSize="9">
                              {country.views.toLocaleString()} views
                            </text>
                          </g>
                        )
                      })()}
                    </svg>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center justify-center gap-6 mt-4 text-[11px] text-[#6b7280]">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-[#ddd6fe]" />
                      <span>Fewer visits</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-[#8b5cf6]" />
                      <span>More visits</span>
                    </div>
                  </div>
                </div>

                {/* Country List */}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {countryData.slice(0, 6).map((country, idx) => {
                    const maxViews = Math.max(...countryData.map(c => c.views))
                    const percentage = (country.views / maxViews) * 100
                    return (
                      <div key={country.code} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-xl hover:bg-[#f3f4f6] transition-colors">
                        <div className="flex items-center justify-center w-8 h-8 text-lg">
                          {getCountryFlag(country.code)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[13px] font-medium text-[#1a1a2e] truncate">{country.name}</span>
                            <span className="text-[12px] text-[#6b7280] ml-2 shrink-0">{country.views.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {countryData.length > 6 && (
                  <button className="w-full text-center py-2 text-[13px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors">
                    View all {countryData.length} countries
                  </button>
                )}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">No country data for this timeframe</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Top Products (Store Analytics) or Most Clicked Blocks (OnePage Analytics) */}
      <Card className="border-[#e5e7eb]/60 bg-white">
        <CardHeader className="pb-2">
          <button
            onClick={() => toggleSection("products")}
            className="flex items-center justify-between w-full text-left"
          >
            <div>
              <CardTitle className="text-base font-semibold text-[#1a1a2e]">
                {analyticsMode === "store" ? "Top Products" : "Most Clicked Blocks"}
              </CardTitle>
              <CardDescription className="text-[#6b7280]">
                {analyticsMode === "store" ? "Your best performing products" : "Your most engaging content blocks"}
              </CardDescription>
            </div>
            {expandedSections.products ? (
              <ChevronUp className="h-5 w-5 text-[#6b7280]" />
            ) : (
              <ChevronDown className="h-5 w-5 text-[#6b7280]" />
            )}
          </button>
        </CardHeader>
        {expandedSections.products && (
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : analyticsMode === "store" ? (
              // Store Analytics - Top Products (improved design without color bars)
              topProducts.length > 0 ? (
                <div className="space-y-2">
                  {topProducts.map((product, idx) => (
                    <div key={product.id} className="flex items-center gap-4 p-4 bg-[#f9fafb] rounded-xl hover:bg-[#f3f4f6] transition-colors">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100 text-violet-600 font-semibold text-sm">
                        #{idx + 1}
                      </div>
                      {product.cover_image ? (
                        <img
                          src={product.cover_image}
                          alt={product.title}
                          className="w-12 h-12 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-[#e5e7eb] flex items-center justify-center shrink-0">
                          <span className="text-xl">📦</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-medium text-[#1a1a2e] truncate block">{product.title}</span>
                        <div className="flex items-center gap-4 text-[12px] text-[#6b7280] mt-1">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {product.views.toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <ShoppingCart className="h-3 w-3" />
                            {product.orders.toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {product.conversionRate.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[15px] font-semibold text-[#1a1a2e]">{formatPrice(product.revenue)}</span>
                        <p className="text-[11px] text-[#9ca3af]">revenue</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-[#6b7280]">No product data for this timeframe</p>
                </div>
              )
            ) : (
              // OnePage Analytics - Most Clicked Blocks
              <div className="space-y-2">
                {[
                  { name: "Buy Button - Main Product", clicks: onePageMetrics.buyButtonClicks, icon: ShoppingCart, type: "button" },
                  { name: "Social Links Block", clicks: Math.round(onePageMetrics.clicks * 0.25), icon: Link2, type: "social" },
                  { name: "YouTube Video Embed", clicks: Math.round(onePageMetrics.clicks * 0.18), icon: Eye, type: "video" },
                  { name: "Newsletter Signup", clicks: onePageMetrics.subscribers, icon: UserPlus, type: "form" },
                  { name: "About Me Section", clicks: Math.round(onePageMetrics.clicks * 0.12), icon: Users, type: "text" },
                ].map((block, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 bg-[#f9fafb] rounded-xl hover:bg-[#f3f4f6] transition-colors">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100 text-violet-600 font-semibold text-sm">
                      #{idx + 1}
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
                      <block.icon className="h-5 w-5 text-[#6b7280]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] font-medium text-[#1a1a2e] truncate block">{block.name}</span>
                      <span className="text-[12px] text-[#6b7280] capitalize">{block.type} block</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[15px] font-semibold text-[#1a1a2e]">{block.clicks.toLocaleString()}</span>
                      <p className="text-[11px] text-[#9ca3af]">clicks</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* OnePage Analytics - Cart Section */}
      {analyticsMode === "onepage" && (
        <Card className="border-[#e5e7eb]/60 bg-white">
          <CardHeader className="pb-2">
            <div>
              <CardTitle className="text-base font-semibold text-[#1a1a2e] flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-[#6b7280]" />
                Cart Activity
              </CardTitle>
              <CardDescription className="text-[#6b7280]">Track shopping cart engagement on your page</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-[#f9fafb] rounded-xl">
                <p className="text-[12px] text-[#6b7280] mb-1">Buy Button Clicks</p>
                <p className="text-[20px] font-semibold text-[#1a1a2e]">{onePageMetrics.buyButtonClicks.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-[#f9fafb] rounded-xl">
                <p className="text-[12px] text-[#6b7280] mb-1">Add to Cart</p>
                <p className="text-[20px] font-semibold text-[#1a1a2e]">{Math.round(onePageMetrics.buyButtonClicks * 0.7).toLocaleString()}</p>
              </div>
              <div className="p-4 bg-[#f9fafb] rounded-xl">
                <p className="text-[12px] text-[#6b7280] mb-1">Checkout Started</p>
                <p className="text-[20px] font-semibold text-[#1a1a2e]">{Math.round(onePageMetrics.buyButtonClicks * 0.4).toLocaleString()}</p>
              </div>
              <div className="p-4 bg-[#f9fafb] rounded-xl">
                <p className="text-[12px] text-[#6b7280] mb-1">Cart Conversion</p>
                <p className="text-[20px] font-semibold text-[#1a1a2e]">{(summary.totalOrders / Math.max(onePageMetrics.buyButtonClicks, 1) * 100).toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
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

// Get color intensity based on view count
function getCountryColor(code: string, countryData: CountryData[]): string {
  const country = countryData.find(c => c.code === code)
  if (!country) return "#e2e8f0"

  const maxViews = Math.max(...countryData.map(c => c.views))
  if (maxViews === 0) return "#e2e8f0"

  const intensity = country.views / maxViews

  // Gradient from light violet to dark violet
  if (intensity > 0.8) return "#7c3aed"
  if (intensity > 0.6) return "#8b5cf6"
  if (intensity > 0.4) return "#a78bfa"
  if (intensity > 0.2) return "#c4b5fd"
  return "#ddd6fe"
}

// Get country center coordinates for tooltip positioning
function getCountryCenter(code: string): { x: number; y: number } {
  const centers: Record<string, { x: number; y: number }> = {
    CA: { x: 200, y: 130 },
    US: { x: 195, y: 230 },
    MX: { x: 170, y: 320 },
    BR: { x: 260, y: 400 },
    AR: { x: 215, y: 475 },
    GB: { x: 470, y: 130 },
    FR: { x: 480, y: 170 },
    ES: { x: 460, y: 200 },
    DE: { x: 525, y: 145 },
    IT: { x: 520, y: 200 },
    PL: { x: 580, y: 140 },
    RU: { x: 730, y: 130 },
    EG: { x: 510, y: 270 },
    NG: { x: 500, y: 350 },
    ZA: { x: 545, y: 450 },
    SA: { x: 590, y: 260 },
    TR: { x: 575, y: 205 },
    IN: { x: 700, y: 300 },
    CN: { x: 810, y: 210 },
    JP: { x: 915, y: 200 },
    KR: { x: 890, y: 215 },
    TH: { x: 800, y: 350 },
    ID: { x: 845, y: 410 },
    AU: { x: 890, y: 440 },
    NZ: { x: 975, y: 475 },
  }
  return centers[code] || { x: 500, y: 250 }
}
