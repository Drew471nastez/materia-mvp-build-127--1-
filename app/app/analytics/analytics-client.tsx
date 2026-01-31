"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
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
import { createClient } from "@/lib/supabase/client"

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

interface ChartDataPoint {
  label: string
  value: number
}

type AnalyticsMode = "store" | "onepage"
type KPIType = "views" | "orders" | "revenue" | "conversion" | "clicks" | "subscribers" | "ctr" | null

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
    value: "yesterday",
    label: "Yesterday",
    shortLabel: "Yesterday",
    getDates: () => {
      const start = new Date()
      start.setDate(start.getDate() - 1)
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setDate(end.getDate() - 1)
      end.setHours(23, 59, 59, 999)
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
    value: "last_year",
    label: "Last year",
    shortLabel: "Last year",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setFullYear(start.getFullYear() - 1)
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
  {
    value: "custom",
    label: "Custom range",
    shortLabel: "Custom",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 7)
      return { start, end }
    },
  },
]

// Chart colors - matching reference image
const CHART_COLORS = {
  views: "#6366f1",
  clicks: "#a78bfa",
  orders: "#8b5cf6",
  revenue: "#c4b5fd",
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

  // KPI Modal state
  const [openKPIModal, setOpenKPIModal] = useState<KPIType>(null)
  const [kpiChartData, setKpiChartData] = useState<ChartDataPoint[]>([])
  const [isKpiChartLoading, setIsKpiChartLoading] = useState(false)

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
    views: 0,
    clicks: 0,
    subscribers: 0,
    ctr: 0,
  })

  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([])
  const [countryData, setCountryData] = useState<CountryData[]>([])
  const [deviceData, setDeviceData] = useState<DeviceData[]>([])
  const [topProducts, setTopProducts] = useState<TopProductData[]>([])

  const selectedTimeframeOption = timeframeOptions.find((o) => o.value === timeframe)

  // Get timeframe dates
  const getTimeframeDates = useCallback(() => {
    const option = timeframeOptions.find((o) => o.value === timeframe)
    if (option && timeframe !== "custom") {
      return option.getDates()
    }
    if (customStart && customEnd) {
      return { start: new Date(customStart), end: new Date(customEnd) }
    }
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 7)
    return { start, end }
  }, [timeframe, customStart, customEnd])

  // Get filtered orders (same as Sales page)
  const getFilteredOrders = useCallback(() => {
    const { start, end } = getTimeframeDates()
    return initialOrders.filter(order => {
      const orderDate = new Date(order.created_at)
      const isInTimeframe = orderDate >= start && orderDate <= end
      const isCompleted = order.status === "completed"
      const matchesProduct = analyticsMode === "onepage" || selectedProduct === "all" || order.product_id === selectedProduct
      return isInTimeframe && isCompleted && matchesProduct
    })
  }, [initialOrders, getTimeframeDates, selectedProduct, analyticsMode])

  // Fetch analytics data from Supabase (same source as Dashboard)
  const fetchAnalytics = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    try {
      const supabase = createClient()
      const { start, end } = getTimeframeDates()

      // Build query for analytics events - SAME SOURCE AS DASHBOARD
      let viewsQuery = supabase
        .from("analytics_events")
        .select("id, visitor_id, session_id, product_id, created_at, event_type, referrer_source")
        .eq("creator_id", creatorId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())

      // For store analytics - match Dashboard behavior (get ALL views)
      if (analyticsMode === "store") {
        if (selectedProduct !== "all") {
          // Filter by specific product when selected
          viewsQuery = viewsQuery.eq("product_id", selectedProduct)
        }
        // When "All products" is selected, DON'T filter by product_id (same as Dashboard)
      }

      // For OnePage analytics - filter for onepage views (null product_id)
      if (analyticsMode === "onepage") {
        viewsQuery = viewsQuery.is("product_id", null)
      }

      const { data: viewEvents, error: viewError } = await viewsQuery

      if (viewError) {
        console.error("Error fetching analytics events:", viewError)
      }

      // Separate view and click events
      const viewOnlyEvents = (viewEvents || []).filter((e: any) => e.event_type === "view")
      const clickEvents = (viewEvents || []).filter((e: any) => e.event_type === "click")

      // Calculate views - count all view events (fallback to total count if no visitor_id/session_id)
      // First try unique views by visitor/session, then fallback to all views
      const uniqueViewKeys = new Set(
        viewOnlyEvents.map((e: any) => {
          const identity = e.visitor_id || e.session_id || e.id // Use event id as fallback
          return `${identity}__${e.product_id || "onepage"}`
        })
      )

      // Use unique count if we have visitor tracking, otherwise count all events
      const hasVisitorTracking = viewOnlyEvents.some((e: any) => e.visitor_id || e.session_id)
      const periodViews = hasVisitorTracking ? uniqueViewKeys.size : viewOnlyEvents.length
      const periodClicks = clickEvents.length || 0

      // Get orders from initialOrders (same source as Sales page)
      const filteredOrders = getFilteredOrders()
      const totalOrdersFromLocal = filteredOrders.length
      const totalRevenueFromLocal = filteredOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)

      // Calculate conversion rate
      const conversionRate = periodViews > 0 ? (totalOrdersFromLocal / periodViews) * 100 : 0

      // Set summary for Store Analytics
      setSummary({
        totalViews: periodViews,
        totalOrders: totalOrdersFromLocal,
        totalRevenue: totalRevenueFromLocal,
        conversionRate: conversionRate,
        avgOrderValue: totalOrdersFromLocal > 0 ? (totalRevenueFromLocal / totalOrdersFromLocal) : 0,
        uniqueVisitors: periodViews,
      })

      // Set OnePage specific metrics
      if (analyticsMode === "onepage") {
        const ctr = periodViews > 0 ? (periodClicks / periodViews) * 100 : 0
        setOnePageMetrics({
          views: periodViews,
          clicks: periodClicks,
          subscribers: Math.round(periodViews * 0.08),
          ctr: ctr,
        })
      }

      // Generate trend data for chart
      const trendDataByDate: Record<string, TrendData> = {}

      viewOnlyEvents.forEach((e: any) => {
        const date = new Date(e.created_at)
        const dateKey = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        if (!trendDataByDate[dateKey]) {
          trendDataByDate[dateKey] = { date: dateKey, views: 0, sales: 0, revenue: 0, clicks: 0 }
        }
        trendDataByDate[dateKey].views++
      })

      clickEvents.forEach((e: any) => {
        const date = new Date(e.created_at)
        const dateKey = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        if (!trendDataByDate[dateKey]) {
          trendDataByDate[dateKey] = { date: dateKey, views: 0, sales: 0, revenue: 0, clicks: 0 }
        }
        trendDataByDate[dateKey].clicks = (trendDataByDate[dateKey].clicks || 0) + 1
      })

      filteredOrders.forEach(order => {
        const date = new Date(order.created_at)
        const dateKey = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        if (!trendDataByDate[dateKey]) {
          trendDataByDate[dateKey] = { date: dateKey, views: 0, sales: 0, revenue: 0, clicks: 0 }
        }
        trendDataByDate[dateKey].sales++
        trendDataByDate[dateKey].revenue += order.amount_cents
      })

      const trendArray = Object.values(trendDataByDate).sort((a, b) => {
        const dateA = new Date(a.date + ", 2024")
        const dateB = new Date(b.date + ", 2024")
        return dateA.getTime() - dateB.getTime()
      })

      setTrendData(trendArray)

      // Traffic sources
      const trafficBySource: Record<string, { views: number; orders: number }> = {}
      viewOnlyEvents.forEach((e: any) => {
        const source = e.referrer_source || "direct"
        if (!trafficBySource[source]) {
          trafficBySource[source] = { views: 0, orders: 0 }
        }
        trafficBySource[source].views++
      })

      const trafficSourcesArray = Object.entries(trafficBySource).map(([source, data]) => ({
        source,
        views: data.views,
        orders: data.orders,
        conversionRate: data.views > 0 ? (data.orders / data.views) * 100 : 0,
      })).sort((a, b) => b.views - a.views)

      setTrafficSources(trafficSourcesArray)

      // Device data (simulated distribution)
      const totalViews = viewOnlyEvents.length
      const deviceCounts = {
        mobile: Math.round(totalViews * 0.55),
        desktop: Math.round(totalViews * 0.35),
        tablet: Math.round(totalViews * 0.10),
      }
      const deviceDataArray = Object.entries(deviceCounts).map(([device, views]) => ({
        device,
        views,
        orders: 0,
        conversionRate: 0,
      }))
      setDeviceData(deviceDataArray)

      // Top products (for store analytics)
      if (analyticsMode === "store") {
        const productViews: Record<string, number> = {}
        viewOnlyEvents.forEach((e: any) => {
          if (e.product_id) {
            productViews[e.product_id] = (productViews[e.product_id] || 0) + 1
          }
        })

        const topProductsArray = products.map(p => ({
          id: p.id,
          title: p.title,
          cover_image: null,
          views: productViews[p.id] || 0,
          orders: filteredOrders.filter(o => o.product_id === p.id).length,
          revenue: filteredOrders.filter(o => o.product_id === p.id).reduce((sum, o) => sum + o.amount_cents, 0),
          conversionRate: 0,
        })).sort((a, b) => b.views - a.views).slice(0, 5)

        setTopProducts(topProductsArray)
      }

      setLastUpdated(new Date())
    } catch (error) {
      console.error("Error fetching analytics:", error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [creatorId, getTimeframeDates, selectedProduct, analyticsMode, getFilteredOrders, products])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

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

  // Generate KPI chart data (same approach as Dashboard)
  const generateKpiChartData = useCallback(async (kpiType: KPIType) => {
    if (!kpiType) {
      setKpiChartData([])
      return
    }

    setIsKpiChartLoading(true)

    try {
      const supabase = createClient()
      const { start, end } = getTimeframeDates()
      const points: ChartDataPoint[] = []

      const isToday = timeframe === "today"
      const isYesterday = timeframe === "yesterday"
      const isAllTime = timeframe === "all_time"
      const isYear = timeframe === "last_year"
      const is90Days = timeframe === "last_90_days"

      if (kpiType === "views" || kpiType === "clicks") {
        let query = supabase
          .from("analytics_events")
          .select("id, visitor_id, session_id, product_id, created_at, event_type")
          .eq("creator_id", creatorId)
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())

        // For store analytics - match Dashboard behavior (get ALL views when "All products")
        if (analyticsMode === "store") {
          if (selectedProduct !== "all") {
            query = query.eq("product_id", selectedProduct)
          }
          // When "All products", DON'T filter - get ALL views like Dashboard
        }
        // For OnePage analytics - get events WITHOUT product_id
        if (analyticsMode === "onepage") {
          query = query.is("product_id", null)
        }

        const { data: events } = await query

        const eventType = kpiType === "views" ? "view" : "click"
        const filteredEvents = (events || []).filter((e: any) => e.event_type === eventType)

        if (isToday || isYesterday) {
          for (let hour = 0; hour <= (isToday ? new Date().getHours() : 23); hour++) {
            const hourEvents = filteredEvents.filter((e: any) => new Date(e.created_at).getHours() === hour)
            points.push({ label: `${hour.toString().padStart(2, '0')}:00`, value: hourEvents.length })
          }
        } else if (isAllTime) {
          const currentYear = new Date().getFullYear()
          for (let year = 2020; year <= currentYear; year++) {
            const yearEvents = filteredEvents.filter((e: any) => new Date(e.created_at).getFullYear() === year)
            points.push({ label: year.toString(), value: yearEvents.length })
          }
        } else if (isYear) {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          for (let month = 0; month < 12; month++) {
            const monthEvents = filteredEvents.filter((e: any) => new Date(e.created_at).getMonth() === month)
            points.push({ label: monthNames[month], value: monthEvents.length })
          }
        } else if (is90Days) {
          for (let week = 12; week >= 0; week--) {
            const weekStart = new Date(end)
            weekStart.setDate(weekStart.getDate() - (week * 7 + 6))
            const weekEnd = new Date(weekStart)
            weekEnd.setDate(weekEnd.getDate() + 6)
            const weekEvents = filteredEvents.filter((e: any) => {
              const d = new Date(e.created_at)
              return d >= weekStart && d <= weekEnd
            })
            points.push({ label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: weekEvents.length })
          }
        } else {
          const dayCount = timeframe === "last_30_days" || timeframe === "this_month" ? 10 : 7
          const dayStep = timeframe === "last_30_days" || timeframe === "this_month" ? 3 : 1
          for (let i = dayCount - 1; i >= 0; i--) {
            const dayStart = new Date(end)
            dayStart.setDate(dayStart.getDate() - (i * dayStep))
            dayStart.setHours(0, 0, 0, 0)
            const dayEnd = new Date(dayStart)
            dayEnd.setDate(dayEnd.getDate() + dayStep - 1)
            dayEnd.setHours(23, 59, 59, 999)
            const dayEvents = filteredEvents.filter((e: any) => {
              const d = new Date(e.created_at)
              return d >= dayStart && d <= dayEnd
            })
            points.push({ label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: dayEvents.length })
          }
        }
      } else if (kpiType === "orders" || kpiType === "revenue") {
        const completedOrders = initialOrders.filter(o => {
          const orderDate = new Date(o.created_at)
          const matchesProduct = analyticsMode === "onepage" || selectedProduct === "all" || o.product_id === selectedProduct
          return o.status === "completed" && orderDate >= start && orderDate <= end && matchesProduct
        })

        if (isToday || isYesterday) {
          for (let hour = 0; hour <= (isToday ? new Date().getHours() : 23); hour++) {
            const hourOrders = completedOrders.filter(o => new Date(o.created_at).getHours() === hour)
            points.push({
              label: `${hour.toString().padStart(2, '0')}:00`,
              value: kpiType === "orders" ? hourOrders.length : hourOrders.reduce((sum, o) => sum + o.amount_cents, 0) / 100
            })
          }
        } else if (isAllTime) {
          const currentYear = new Date().getFullYear()
          for (let year = 2020; year <= currentYear; year++) {
            const yearOrders = completedOrders.filter(o => new Date(o.created_at).getFullYear() === year)
            points.push({
              label: year.toString(),
              value: kpiType === "orders" ? yearOrders.length : yearOrders.reduce((sum, o) => sum + o.amount_cents, 0) / 100
            })
          }
        } else if (isYear) {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          for (let month = 0; month < 12; month++) {
            const monthOrders = completedOrders.filter(o => new Date(o.created_at).getMonth() === month)
            points.push({
              label: monthNames[month],
              value: kpiType === "orders" ? monthOrders.length : monthOrders.reduce((sum, o) => sum + o.amount_cents, 0) / 100
            })
          }
        } else if (is90Days) {
          for (let week = 12; week >= 0; week--) {
            const weekStart = new Date(end)
            weekStart.setDate(weekStart.getDate() - (week * 7 + 6))
            const weekEnd = new Date(weekStart)
            weekEnd.setDate(weekEnd.getDate() + 6)
            const weekOrders = completedOrders.filter(o => {
              const d = new Date(o.created_at)
              return d >= weekStart && d <= weekEnd
            })
            points.push({
              label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: kpiType === "orders" ? weekOrders.length : weekOrders.reduce((sum, o) => sum + o.amount_cents, 0) / 100
            })
          }
        } else {
          const dayCount = timeframe === "last_30_days" || timeframe === "this_month" ? 10 : 7
          const dayStep = timeframe === "last_30_days" || timeframe === "this_month" ? 3 : 1
          for (let i = dayCount - 1; i >= 0; i--) {
            const dayStart = new Date(end)
            dayStart.setDate(dayStart.getDate() - (i * dayStep))
            dayStart.setHours(0, 0, 0, 0)
            const dayEnd = new Date(dayStart)
            dayEnd.setDate(dayEnd.getDate() + dayStep - 1)
            dayEnd.setHours(23, 59, 59, 999)
            const dayOrders = completedOrders.filter(o => {
              const d = new Date(o.created_at)
              return d >= dayStart && d <= dayEnd
            })
            points.push({
              label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: kpiType === "orders" ? dayOrders.length : dayOrders.reduce((sum, o) => sum + o.amount_cents, 0) / 100
            })
          }
        }
      } else if (kpiType === "conversion" || kpiType === "ctr") {
        for (const item of trendData) {
          const rate = item.views > 0 ? ((item.clicks || 0) / item.views) * 100 : 0
          points.push({ label: item.date, value: rate })
        }
      } else if (kpiType === "subscribers") {
        for (const item of trendData) {
          points.push({ label: item.date, value: Math.round(item.views * 0.08) })
        }
      }

      setKpiChartData(points.length > 0 ? points : [{ label: "No data", value: 0 }])
    } catch (error) {
      console.error("Error fetching KPI chart data:", error)
      setKpiChartData([])
    } finally {
      setIsKpiChartLoading(false)
    }
  }, [creatorId, getTimeframeDates, timeframe, selectedProduct, analyticsMode, initialOrders, trendData])

  useEffect(() => {
    if (openKPIModal) {
      generateKpiChartData(openKPIModal)
    }
  }, [openKPIModal, generateKpiChartData])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(".timeframe-dropdown")) setIsTimeframeOpen(false)
      if (!target.closest(".products-dropdown")) setIsProductsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const hasKpiChartData = kpiChartData.some(d => d.value > 0)

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
  }

  const formatCompactNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`
    return num.toLocaleString()
  }

  const formatSourceName = (source: string) => {
    const names: Record<string, string> = {
      direct: "Direct", organic_search: "Organic Search", paid_search: "Paid Search",
      search: "Search", social: "Social Media", email: "Email", referral: "Referral", other: "Other"
    }
    return names[source] || source
  }

  const formatDeviceName = (device: string) => {
    const names: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet", unknown: "Unknown" }
    return names[device] || device
  }

  const getDeviceIcon = (device: string) => {
    switch (device.toLowerCase()) {
      case "mobile": return <Smartphone className="h-4 w-4" />
      case "desktop": return <Monitor className="h-4 w-4" />
      case "tablet": return <Tablet className="h-4 w-4" />
      default: return <Monitor className="h-4 w-4" />
    }
  }

  const devicePieData = deviceData.map(d => ({ name: formatDeviceName(d.device), value: d.views }))
  const trafficPieData = trafficSources.slice(0, 6).map(s => ({ name: formatSourceName(s.source), value: s.views }))
  const totalDeviceViews = deviceData.reduce((sum, d) => sum + d.views, 0)

  // Chart header values - use summary values for accuracy
  const totalViewsInChart = analyticsMode === "onepage" ? onePageMetrics.views : summary.totalViews
  const totalClicksInChart = analyticsMode === "onepage" ? onePageMetrics.clicks : trendData.reduce((sum, d) => sum + (d.clicks || 0), 0)
  const totalOrdersInChart = summary.totalOrders
  const totalRevenueInChart = summary.totalRevenue

  // KPI Modal Chart component (matching Dashboard UI exactly)
  const KPIModalChart = ({ kpiType, label }: { kpiType: KPIType; label: string }) => {
    if (openKPIModal !== kpiType) return null

    return (
      <div onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-violet-600">{label}</span>
            <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedTimeframeOption?.label}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }}
            className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0"
          >
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
              const displayData = kpiChartData.slice(-7)
              const maxValue = Math.max(...displayData.map((d) => d.value), 1)
              return displayData.map((point, index) => {
                const barHeight = Math.max((point.value / maxValue) * 65, 3)
                const displayValue = kpiType === "revenue" ? `$${point.value.toFixed(2)}` : point.value.toLocaleString()
                return (
                  <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      {point.label}: {displayValue}
                    </div>
                    <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors cursor-pointer" style={{ height: `${barHeight}px` }} />
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[#fafafa]">
      {/* Announcement Bar */}
      <div className="bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white py-2.5 px-4 text-center">
        <p className="text-[13px] font-medium">
          Try Pro free — our most popular plan for content creators and businesses.{" "}
          <Link href="/app/settings/billing" className="underline hover:no-underline font-semibold">Upgrade</Link>
        </p>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">Analytics</h1>

        {/* Header with Timeframe, Mode Switcher, and Products */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Timeframe Dropdown - rounded-xl to match Sales page */}
            <div className="relative timeframe-dropdown">
              <button
                onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
              >
                {selectedTimeframeOption?.label || "Last 7 days"}
                <ChevronDown className={`h-4 w-4 text-[#9ca3af] transition-transform duration-200 ${isTimeframeOpen ? "rotate-180" : ""}`} />
              </button>
              {isTimeframeOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1">
                  {timeframeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => { setTimeframe(option.value); setIsTimeframeOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                        timeframe === option.value ? "bg-[#f5f3ff] text-[#8b5cf6] font-medium" : "text-[#374151] hover:bg-[#f9fafb]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Analytics Mode Switcher */}
            <div className="flex items-center bg-[#f3f4f6] rounded-full p-0.5">
              <button
                onClick={() => setAnalyticsMode("store")}
                className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 ${
                  analyticsMode === "store" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                }`}
              >
                Store
              </button>
              <button
                onClick={() => setAnalyticsMode("onepage")}
                className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 ${
                  analyticsMode === "onepage" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                }`}
              >
                OnePage
              </button>
            </div>
          </div>

          {/* Products Dropdown - Only show for Store Analytics */}
          {analyticsMode === "store" && (
            <div className="relative products-dropdown">
              <button
                onClick={() => setIsProductsOpen(!isProductsOpen)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
              >
                {selectedProduct === "all" ? "All products" : products.find(p => p.id === selectedProduct)?.title || "All products"}
                <ChevronDown className={`h-4 w-4 text-[#9ca3af] transition-transform duration-200 ${isProductsOpen ? "rotate-180" : ""}`} />
              </button>
              {isProductsOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 max-h-[300px] overflow-y-auto">
                  <button
                    onClick={() => { setSelectedProduct("all"); setIsProductsOpen(false) }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                      selectedProduct === "all" ? "bg-[#f5f3ff] text-[#8b5cf6] font-medium" : "text-[#374151] hover:bg-[#f9fafb]"
                    }`}
                  >
                    All products
                  </button>
                  {products.length > 0 && <div className="border-t border-[#e5e7eb] my-1" />}
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedProduct(p.id); setIsProductsOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors truncate ${
                        selectedProduct === p.id ? "bg-[#f5f3ff] text-[#8b5cf6] font-medium" : "text-[#374151] hover:bg-[#f9fafb]"
                      }`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Custom date range */}
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

        {/* KPI Cards - Store Analytics */}
        {analyticsMode === "store" ? (
          <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 ${isLoading ? "opacity-60" : ""}`}>
            {/* Total Views */}
            <div
              className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
                openKPIModal === "views" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "views" ? null : "views")}
            >
              {openKPIModal === "views" ? (
                <KPIModalChart kpiType="views" label="Views" />
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Total Views</span>
                    <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                      <Eye className="h-4 w-4 text-[#9ca3af]" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-7 w-16" /> : formatCompactNumber(summary.totalViews)}
                  </div>
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
                <KPIModalChart kpiType="orders" label="Orders" />
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Total Orders</span>
                    <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                      <ShoppingCart className="h-4 w-4 text-[#9ca3af]" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-7 w-14" /> : formatCompactNumber(summary.totalOrders)}
                  </div>
                </>
              )}
            </div>

            {/* Revenue */}
            <div
              className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
                openKPIModal === "revenue" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "revenue" ? null : "revenue")}
            >
              {openKPIModal === "revenue" ? (
                <KPIModalChart kpiType="revenue" label="Revenue" />
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Total Revenue</span>
                    <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-[#9ca3af]" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-7 w-20" /> : formatPrice(summary.totalRevenue)}
                  </div>
                </>
              )}
            </div>

            {/* Conversion */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-medium text-[#6b7280]">Conversion Rate</span>
                <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                  <Target className="h-4 w-4 text-[#9ca3af]" />
                </div>
              </div>
              <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                {isLoading ? <Skeleton className="h-7 w-14" /> : `${summary.conversionRate.toFixed(1)}%`}
              </div>
            </div>
          </div>
        ) : (
          /* OnePage Analytics KPIs */
          <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 ${isLoading ? "opacity-60" : ""}`}>
            {/* OnePage Views */}
            <div
              className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
                openKPIModal === "views" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
              }`}
              onClick={() => setOpenKPIModal(openKPIModal === "views" ? null : "views")}
            >
              {openKPIModal === "views" ? (
                <KPIModalChart kpiType="views" label="OnePage Views" />
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Views</span>
                    <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                      <Eye className="h-4 w-4 text-[#9ca3af]" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-7 w-16" /> : formatCompactNumber(onePageMetrics.views)}
                  </div>
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
                <KPIModalChart kpiType="clicks" label="Clicks" />
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-[#6b7280]">Clicks</span>
                    <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                      <MousePointerClick className="h-4 w-4 text-[#9ca3af]" />
                    </div>
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                    {isLoading ? <Skeleton className="h-7 w-14" /> : formatCompactNumber(onePageMetrics.clicks)}
                  </div>
                </>
              )}
            </div>

            {/* Subscribers */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-medium text-[#6b7280]">Subscribers</span>
                <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                  <UserPlus className="h-4 w-4 text-[#9ca3af]" />
                </div>
              </div>
              <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                {isLoading ? <Skeleton className="h-7 w-12" /> : formatCompactNumber(onePageMetrics.subscribers)}
              </div>
            </div>

            {/* CTR */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-medium text-[#6b7280]">CTR</span>
                <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                  <Percent className="h-4 w-4 text-[#9ca3af]" />
                </div>
              </div>
              <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                {isLoading ? <Skeleton className="h-7 w-14" /> : `${onePageMetrics.ctr.toFixed(1)}%`}
              </div>
            </div>
          </div>
        )}

        {/* Activity Card - Bar Chart */}
        <Card className="border-[#e5e7eb] bg-white shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="space-y-4">
                {/* Stats Header - Same values as KPI cards */}
                <div className="flex items-center gap-8 flex-wrap">
                  <div>
                    <p className="text-[28px] font-bold text-[#1a1a2e]">{formatCompactNumber(totalViewsInChart)}</p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#6366f1]" />
                      <p className="text-[13px] text-[#6b7280]">Views</p>
                    </div>
                  </div>
                  {analyticsMode === "store" ? (
                    <>
                      <div>
                        <p className="text-[28px] font-bold text-[#1a1a2e]">{formatCompactNumber(totalOrdersInChart)}</p>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                          <p className="text-[13px] text-[#6b7280]">Orders</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[28px] font-bold text-[#1a1a2e]">{formatPrice(totalRevenueInChart)}</p>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-[#c4b5fd]" />
                          <p className="text-[13px] text-[#6b7280]">Revenue</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="text-[28px] font-bold text-[#1a1a2e]">{formatCompactNumber(totalClicksInChart)}</p>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-[#a78bfa]" />
                        <p className="text-[13px] text-[#6b7280]">Clicks</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bar Chart */}
                {trendData.length > 0 ? (
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} dx={-5} />
                        <Tooltip
                          cursor={false}
                          contentStyle={{ backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", fontSize: "12px" }}
                          formatter={(value: number, name: string) => {
                            const labels: Record<string, string> = { views: "Views", clicks: "Clicks", sales: "Orders", revenue: "Revenue" }
                            if (name === "revenue") return [formatPrice(value), labels[name] || name]
                            return [value.toLocaleString(), labels[name] || name]
                          }}
                        />
                        <Bar dataKey="views" fill={CHART_COLORS.views} radius={[4, 4, 0, 0]} name="views" />
                        {analyticsMode === "store" ? (
                          <>
                            <Bar dataKey="sales" fill={CHART_COLORS.orders} radius={[4, 4, 0, 0]} name="sales" />
                            <Bar dataKey="revenue" fill={CHART_COLORS.revenue} radius={[4, 4, 0, 0]} name="revenue" />
                          </>
                        ) : (
                          <Bar dataKey="clicks" fill={CHART_COLORS.clicks} radius={[4, 4, 0, 0]} name="clicks" />
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
                    <span className="text-[12px] text-[#6b7280]">Views</span>
                  </div>
                  {analyticsMode === "store" ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]" />
                        <span className="text-[12px] text-[#6b7280]">Orders</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#c4b5fd]" />
                        <span className="text-[12px] text-[#6b7280]">Revenue</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#a78bfa]" />
                      <span className="text-[12px] text-[#6b7280]">Clicks</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Traffic & Device Distribution */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-[#e5e7eb] bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Traffic Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : trafficPieData.length > 0 ? (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={trafficPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value">
                        {trafficPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`${value.toLocaleString()} views`, ""]} contentStyle={{ backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" }} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} formatter={(value) => <span className="text-[11px] text-[#6b7280]">{value}</span>} />
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

          <Card className="border-[#e5e7eb] bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Device Breakdown</CardTitle>
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

        {/* Top Products / Most Clicked */}
        <Card className="border-[#e5e7eb] bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">
              {analyticsMode === "store" ? "Top Products" : "Most Clicked"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : analyticsMode === "store" ? (
              topProducts.length > 0 ? (
                <div className="space-y-2">
                  {topProducts.slice(0, 5).map((product, idx) => (
                    <div key={product.id} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-[#e5e7eb] flex items-center justify-center">
                        <span className="text-lg">📦</span>
                      </div>
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
                  { name: "Shop Merch", url: "store.com/merch", clicks: Math.round(onePageMetrics.clicks * 0.25), icon: "🛍️" },
                  { name: "Book a Call", url: "calendly.com/user", clicks: Math.round(onePageMetrics.clicks * 0.15), icon: "📅" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm text-lg">{item.icon}</div>
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

        {/* Visitors */}
        <Card className="border-[#e5e7eb] bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Visitors</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[120px] w-full" />
            ) : countryData.length > 0 ? (
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="text-[13px] text-[#6b7280] leading-relaxed">
                    Most commonly your visitors are based in{" "}
                    <span className="font-medium text-[#1a1a2e]">{getCountryFlag(countryData[0]?.code)} {countryData[0]?.name}</span>
                    {countryData.length > 1 && (
                      <> and <span className="font-medium text-[#1a1a2e]">{getCountryFlag(countryData[1]?.code)} {countryData[1]?.name}</span></>
                    )}
                    , and find you on <span className="font-medium text-[#1a1a2e]">📱 mobile devices</span>.
                  </p>
                </div>
                <div className="w-[140px] h-[80px] bg-[#f9fafb] rounded-lg flex items-center justify-center">
                  <Globe className="h-10 w-10 text-[#d1d5db]" />
                </div>
              </div>
            ) : (
              <div className="py-6 text-center">
                <Globe className="h-8 w-8 mx-auto mb-2 text-[#e5e7eb]" />
                <p className="text-[#9ca3af] text-[13px]">No visitor data yet</p>
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
  const codePoints = code.toUpperCase().split("").map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}
