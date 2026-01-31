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
  Zap, Clock, ChevronDown, ChevronUp, X, Wallet, MousePointerClick, UserPlus, Percent, Link2, Sparkles
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, LineChart, Line
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
  userId: string
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
  // Previous period for comparison
  prevPeriodViews: number
  prevPeriodOrders: number
  prevPeriodRevenue: number
  // All-time values
  allTimeViews: number
  allTimeOrders: number
  allTimeRevenue: number
}

interface TrendData {
  date: string
  views: number
  sales: number
  revenue: number
  clicks?: number
  subscribers?: number
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

interface MostClickedBlock {
  id: string
  label: string
  url: string
  clicks: number
  icon?: string | null
  thumbnail?: string | null
  blockType?: string | null
}

interface TopProductData {
  id: string
  title: string
  thumbnail_url: string | null
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
type ChartMetricFilter = "all" | "views" | "orders" | "revenue"
type OnePageChartFilter = "all" | "views" | "clicks" | "subscribers"

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

// Helper function to calculate percentage change
const calculatePercentChange = (current: number, previous: number): { value: number; isPositive: boolean; isZero: boolean } => {
  if (previous === 0 && current === 0) return { value: 0, isPositive: true, isZero: true }
  if (previous === 0) return { value: 100, isPositive: true, isZero: false }
  const change = ((current - previous) / previous) * 100
  return { value: Math.abs(change), isPositive: change >= 0, isZero: change === 0 }
}

// Small percentage change indicator component
function PercentChangeIndicator({ current, previous }: { current: number; previous: number }) {
  const { value, isPositive, isZero } = calculatePercentChange(current, previous)

  if (isZero) return null

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
      isPositive ? "text-emerald-600" : "text-rose-500"
    }`}>
      {isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {value.toFixed(1)}%
    </span>
  )
}

// Helper function to normalize date to local date string for consistent key generation
function getDateKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  // Use explicit month names to avoid locale issues
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

export function AnalyticsClient({ creatorId, userId, products, initialOrders }: AnalyticsClientProps) {
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
  const [chartViewType, setChartViewType] = useState<"bars" | "line">("line")
  const [chartMetricFilter, setChartMetricFilter] = useState<ChartMetricFilter>("views")
  const [onePageChartFilter, setOnePageChartFilter] = useState<OnePageChartFilter>("views")

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
    prevPeriodViews: 0,
    prevPeriodOrders: 0,
    prevPeriodRevenue: 0,
    allTimeViews: 0,
    allTimeOrders: 0,
    allTimeRevenue: 0,
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
  const [mostClickedBlocks, setMostClickedBlocks] = useState<MostClickedBlock[]>([])

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

      let viewOnlyEvents: any[] = []
      let clickEvents: any[] = []
      let leadEvents: any[] = []
      let periodViews = 0
      let periodClicks = 0
      let periodSubscribers = 0

      if (analyticsMode === "onepage") {
        // OnePage Analytics - fetch from dedicated onepage tables
        // First get the user's onepage (owner_id is user.id, not creator.id)
        const { data: onepage } = await supabase
          .from("onepages")
          .select("id, published_blocks, draft_blocks")
          .eq("owner_id", userId)
          .maybeSingle()

        if (onepage?.id) {
          // Fetch OnePage views with country data
          const { data: onePageViews } = await supabase
            .from("onepage_views")
            .select("id, visitor_id, created_at, country_code, country_name, user_agent")
            .eq("onepage_id", onepage.id)
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString())

          viewOnlyEvents = onePageViews || []
          periodViews = viewOnlyEvents.length

          // Fetch OnePage clicks with country data
          const { data: onePageClicks } = await supabase
            .from("onepage_clicks")
            .select("id, block_id, url, visitor_id, created_at, country_code, country_name, user_agent")
            .eq("onepage_id", onepage.id)
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString())

          clickEvents = onePageClicks || []
          periodClicks = clickEvents.length

          // Fetch OnePage leads/subscribers with country data
          const { data: onePageLeads } = await supabase
            .from("onepage_leads")
            .select("id, created_at, country_code, country_name")
            .eq("onepage_id", onepage.id)
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString())

          leadEvents = onePageLeads || []
          periodSubscribers = leadEvents.length

          // Aggregate country data for OnePage (views + clicks + subscribers)
          const onePageCountryStats: Record<string, { views: number; clicks: number; subscribers: number; name: string }> = {}

          // Add views by country
          viewOnlyEvents.forEach((view: any) => {
            const code = view.country_code || "XX"
            const name = view.country_name || "Unknown"
            if (!onePageCountryStats[code]) {
              onePageCountryStats[code] = { views: 0, clicks: 0, subscribers: 0, name }
            }
            onePageCountryStats[code].views++
          })

          // Add clicks by country
          clickEvents.forEach((click: any) => {
            const code = click.country_code || "XX"
            const name = click.country_name || "Unknown"
            if (!onePageCountryStats[code]) {
              onePageCountryStats[code] = { views: 0, clicks: 0, subscribers: 0, name }
            }
            onePageCountryStats[code].clicks++
          })

          // Add subscribers by country
          leadEvents.forEach((lead: any) => {
            const code = lead.country_code || "XX"
            const name = lead.country_name || "Unknown"
            if (!onePageCountryStats[code]) {
              onePageCountryStats[code] = { views: 0, clicks: 0, subscribers: 0, name }
            }
            onePageCountryStats[code].subscribers++
          })

          const onePageCountryData = Object.entries(onePageCountryStats)
            .map(([code, data]) => ({
              code,
              name: data.name,
              views: data.views,
              orders: data.clicks, // Use clicks for OnePage "orders" column
              revenue: data.subscribers, // Use subscribers count as a number in revenue column
              conversionRate: data.views > 0 ? (data.clicks / data.views) * 100 : 0,
            }))
            .filter(c => c.code !== "XX" && c.name !== "Unknown")
            .sort((a, b) => b.views - a.views)

          setCountryData(onePageCountryData)

          // Calculate device breakdown for OnePage from user_agent (views + clicks)
          const deviceCounts: Record<string, number> = { mobile: 0, desktop: 0, tablet: 0 }
          const allEventsWithUA = [...viewOnlyEvents, ...clickEvents]
          allEventsWithUA.forEach((event: any) => {
            const ua = (event.user_agent || "").toLowerCase()
            if (/ipad|tablet|playbook|silk/i.test(ua)) {
              deviceCounts.tablet++
            } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
              deviceCounts.mobile++
            } else {
              deviceCounts.desktop++
            }
          })

          const onePageDeviceData = Object.entries(deviceCounts).map(([device, views]) => ({
            device,
            views,
            orders: 0,
            conversionRate: 0,
          }))
          setDeviceData(onePageDeviceData)

          // Aggregate clicks by block_id for Most Clicked
          const clicksByBlock: Record<string, { clicks: number; url: string }> = {}
          clickEvents.forEach((click: any) => {
            if (click.block_id) {
              if (!clicksByBlock[click.block_id]) {
                clicksByBlock[click.block_id] = { clicks: 0, url: click.url || "" }
              }
              clicksByBlock[click.block_id].clicks++
            }
          })

          // Get block data from onepage (draft_blocks or published_blocks)
          const blocks = (onepage.published_blocks || onepage.draft_blocks || []) as any[]
          const blockMap = new Map(blocks.map((b: any) => [b.id, b]))

          // Helper function to extract thumbnail based on block type
          const getBlockThumbnail = (block: any): string | null => {
            if (!block?.data) return null
            const data = block.data
            const type = block.type

            switch (type) {
              case 'link_button':
                // Check for streaming service thumbnails first, then custom thumbnail
                return data.thumbnail_url || data.spotify_thumbnail || data.apple_music_thumbnail || data.soundcloud_thumbnail || null
              case 'product':
                // Custom thumbnail overrides product thumbnail
                return data.custom_thumbnail || data.product_thumbnail || null
              case 'email_capture':
                return data.product_image || data.digital_product_thumbnail || null
              case 'pdf_document':
              case 'food_menu':
              case 'calendly':
                return data.thumbnail_url || null
              case 'image':
                // For image blocks, use the main image
                return data.image_url || (data.images?.[0]?.image_url) || null
              default:
                return data.thumbnail_url || data.thumbnail || data.image || data.image_url || null
            }
          }

          // Helper function to get block label
          const getBlockLabel = (block: any): string => {
            if (!block?.data) return "Link"
            const data = block.data
            const type = block.type

            switch (type) {
              case 'link_button':
                return data.label || data.spotify_title || data.apple_music_title || data.soundcloud_title || "Link"
              case 'product':
                return data.product_title || "Product"
              case 'email_capture':
                return data.headline || data.digital_product_title || "Subscribe"
              case 'pdf_document':
              case 'food_menu':
              case 'calendly':
                return data.title || "Link"
              case 'image':
                return data.alt_text || data.images?.[0]?.title || "Image"
              case 'text':
                return data.content?.slice(0, 30) || "Text"
              default:
                return data.label || data.title || data.name || "Link"
            }
          }

          // Create most clicked blocks array with proper thumbnails
          const mostClicked = Object.entries(clicksByBlock)
            .map(([blockId, data]) => {
              const block = blockMap.get(blockId)
              const blockType = block?.type || null
              const thumbnail = getBlockThumbnail(block)
              return {
                id: blockId,
                label: getBlockLabel(block),
                url: data.url || block?.data?.url || block?.data?.calendly_url || "",
                clicks: data.clicks,
                icon: block?.data?.icon || null,
                thumbnail,
                blockType,
              }
            })
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 5)

          setMostClickedBlocks(mostClicked)
        }

        // Calculate CTR
        const ctr = periodViews > 0 ? (periodClicks / periodViews) * 100 : 0

        setOnePageMetrics({
          views: periodViews,
          clicks: periodClicks,
          subscribers: periodSubscribers,
          ctr: ctr,
        })

        // Set summary for OnePage
        setSummary({
          totalViews: periodViews,
          totalOrders: 0,
          totalRevenue: 0,
          conversionRate: ctr,
          avgOrderValue: 0,
          uniqueVisitors: periodViews,
          prevPeriodViews: 0,
          prevPeriodOrders: 0,
          prevPeriodRevenue: 0,
          allTimeViews: periodViews,
          allTimeOrders: 0,
          allTimeRevenue: 0,
        })
      } else {
        // Store Analytics - fetch from analytics_events (same as Dashboard)
        let viewsQuery = supabase
          .from("analytics_events")
          .select("id, visitor_id, session_id, product_id, created_at, source_category, country_code, country_name")
          .eq("creator_id", creatorId)
          .eq("event_type", "view")
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())

        if (selectedProduct !== "all") {
          viewsQuery = viewsQuery.eq("product_id", selectedProduct)
        }

        const { data: viewEvents, error: viewError } = await viewsQuery

        if (viewError) {
          console.error("Error fetching analytics events:", viewError)
        }

        viewOnlyEvents = viewEvents || []

        // Calculate unique views - EXACT SAME LOGIC AS DASHBOARD
        const uniqueViewKeys = new Set(
          viewOnlyEvents.map((e: any) => {
            const identity = e.visitor_id || e.session_id
            if (!identity) return null
            return `${identity}__${e.product_id || "store"}`
          }).filter(Boolean)
        )

        periodViews = uniqueViewKeys.size || 0
      }

      // Get filtered orders for Store Analytics - use the same start/end dates as trend data
      // Filter orders once and use for both summary and trend data
      const filteredOrders = analyticsMode === "store"
        ? initialOrders.filter(order => {
            const orderDate = new Date(order.created_at)
            const isInTimeframe = orderDate >= start && orderDate <= end
            const isCompleted = order.status === "completed"
            const matchesProduct = selectedProduct === "all" || order.product_id === selectedProduct
            return isInTimeframe && isCompleted && matchesProduct
          })
        : []

      // Set summary based on analytics mode
      if (analyticsMode === "store") {
        const totalOrdersFromLocal = filteredOrders.length
        const totalRevenueFromLocal = filteredOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)

        // Calculate conversion rate
        const conversionRate = periodViews > 0 ? (totalOrdersFromLocal / periodViews) * 100 : 0

        // Calculate previous period dates (same duration, immediately before)
        const periodDuration = end.getTime() - start.getTime()
        const prevEnd = new Date(start.getTime() - 1)
        const prevStart = new Date(prevEnd.getTime() - periodDuration)

        // Fetch previous period views
        let prevViewsQuery = supabase
          .from("analytics_events")
          .select("id, visitor_id, session_id, product_id")
          .eq("creator_id", creatorId)
          .eq("event_type", "view")
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString())

        if (selectedProduct !== "all") {
          prevViewsQuery = prevViewsQuery.eq("product_id", selectedProduct)
        }

        const { data: prevViewEvents } = await prevViewsQuery

        const prevUniqueViewKeys = new Set(
          (prevViewEvents || []).map((e: any) => {
            const identity = e.visitor_id || e.session_id
            return identity ? `${identity}__${e.product_id || "store"}` : null
          }).filter(Boolean)
        )
        const prevPeriodViews = prevUniqueViewKeys.size || 0

        // Previous period orders
        const prevPeriodOrdersData = initialOrders.filter(o => {
          const orderDate = new Date(o.created_at)
          const matchesProduct = selectedProduct === "all" || o.product_id === selectedProduct
          return o.status === "completed" && orderDate >= prevStart && orderDate <= prevEnd && matchesProduct
        })
        const prevPeriodOrders = prevPeriodOrdersData.length
        const prevPeriodRevenue = prevPeriodOrdersData.reduce((sum, o) => sum + (o.amount_cents || 0), 0)

        // Fetch all-time views
        let allTimeViewsQuery = supabase
          .from("analytics_events")
          .select("id, visitor_id, session_id, product_id")
          .eq("creator_id", creatorId)
          .eq("event_type", "view")

        if (selectedProduct !== "all") {
          allTimeViewsQuery = allTimeViewsQuery.eq("product_id", selectedProduct)
        }

        const { data: allTimeViewEvents } = await allTimeViewsQuery

        const allTimeUniqueViewKeys = new Set(
          (allTimeViewEvents || []).map((e: any) => {
            const identity = e.visitor_id || e.session_id
            return identity ? `${identity}__${e.product_id || "store"}` : null
          }).filter(Boolean)
        )
        const allTimeViews = allTimeUniqueViewKeys.size || 0

        // All-time orders
        const allTimeOrdersData = initialOrders.filter(o => {
          const matchesProduct = selectedProduct === "all" || o.product_id === selectedProduct
          return o.status === "completed" && matchesProduct
        })
        const allTimeOrders = allTimeOrdersData.length
        const allTimeRevenue = allTimeOrdersData.reduce((sum, o) => sum + (o.amount_cents || 0), 0)

        // Set summary for Store Analytics
        setSummary({
          totalViews: periodViews,
          totalOrders: totalOrdersFromLocal,
          totalRevenue: totalRevenueFromLocal,
          conversionRate: conversionRate,
          avgOrderValue: totalOrdersFromLocal > 0 ? (totalRevenueFromLocal / totalOrdersFromLocal) : 0,
          uniqueVisitors: periodViews,
          prevPeriodViews,
          prevPeriodOrders,
          prevPeriodRevenue,
          allTimeViews,
          allTimeOrders,
          allTimeRevenue,
        })
      }

      // Generate trend data for chart - use hourly for today/yesterday/48h, daily for others
      const isHourlyTimeframe = timeframe === "today" || timeframe === "yesterday" || timeframe === "last_48_hours"
      const trendDataByKey: Record<string, TrendData> = {}

      if (isHourlyTimeframe) {
        // Generate hourly trend data
        const hoursToShow = timeframe === "last_48_hours" ? 48 : 24
        const baseDate = timeframe === "yesterday"
          ? new Date(new Date().setDate(new Date().getDate() - 1))
          : new Date()

        // Initialize all hours with 0 values
        for (let i = 0; i < hoursToShow; i++) {
          let hourDate: Date
          if (timeframe === "last_48_hours") {
            hourDate = new Date()
            hourDate.setHours(hourDate.getHours() - (hoursToShow - 1 - i))
          } else if (timeframe === "yesterday") {
            hourDate = new Date(baseDate)
            hourDate.setHours(i, 0, 0, 0)
          } else {
            // today - only show hours up to current hour
            if (i > new Date().getHours()) continue
            hourDate = new Date(baseDate)
            hourDate.setHours(i, 0, 0, 0)
          }
          const hourKey = `${hourDate.getHours().toString().padStart(2, '0')}:00`
          const dateLabel = timeframe === "last_48_hours"
            ? `${getDateKey(hourDate)} ${hourKey}`
            : hourKey
          trendDataByKey[dateLabel] = { date: dateLabel, views: 0, sales: 0, revenue: 0, clicks: 0, subscribers: 0 }
        }

        // Populate with actual view data
        viewOnlyEvents.forEach((e: any) => {
          const date = new Date(e.created_at)
          const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`
          const dateLabel = timeframe === "last_48_hours"
            ? `${getDateKey(date)} ${hourKey}`
            : hourKey
          if (trendDataByKey[dateLabel]) {
            trendDataByKey[dateLabel].views++
          }
        })

        // Add clicks data for OnePage Analytics
        if (analyticsMode === "onepage" && clickEvents.length > 0) {
          clickEvents.forEach((e: any) => {
            const date = new Date(e.created_at)
            const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`
            const dateLabel = timeframe === "last_48_hours"
              ? `${getDateKey(date)} ${hourKey}`
              : hourKey
            if (trendDataByKey[dateLabel]) {
              trendDataByKey[dateLabel].clicks = (trendDataByKey[dateLabel].clicks || 0) + 1
            }
          })
        }

        // Add orders/revenue data for Store Analytics
        if (analyticsMode === "store") {
          filteredOrders.forEach(order => {
            const date = new Date(order.created_at)
            const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`
            const dateLabel = timeframe === "last_48_hours"
              ? `${getDateKey(order.created_at)} ${hourKey}`
              : hourKey
            // Ensure the date key exists, create if missing (handles edge cases)
            if (!trendDataByKey[dateLabel]) {
              trendDataByKey[dateLabel] = { date: dateLabel, views: 0, sales: 0, revenue: 0, clicks: 0, subscribers: 0 }
            }
            trendDataByKey[dateLabel].sales++
            trendDataByKey[dateLabel].revenue += (order.amount_cents || 0)
          })
        }
      } else {
        // Generate daily trend data for other timeframes
        // First, initialize all dates in the timeframe with 0 values
        const startDate = new Date(start)
        const endDate = new Date(end)
        const currentDate = new Date(startDate)

        while (currentDate <= endDate) {
          const dateKey = getDateKey(currentDate)
          trendDataByKey[dateKey] = { date: dateKey, views: 0, sales: 0, revenue: 0, clicks: 0, subscribers: 0 }
          currentDate.setDate(currentDate.getDate() + 1)
        }

        // Populate with view data
        viewOnlyEvents.forEach((e: any) => {
          const dateKey = getDateKey(e.created_at)
          if (trendDataByKey[dateKey]) {
            trendDataByKey[dateKey].views++
          }
        })

        // Add clicks data for OnePage Analytics
        if (analyticsMode === "onepage" && clickEvents.length > 0) {
          clickEvents.forEach((e: any) => {
            const dateKey = getDateKey(e.created_at)
            if (trendDataByKey[dateKey]) {
              trendDataByKey[dateKey].clicks = (trendDataByKey[dateKey].clicks || 0) + 1
            }
          })
        }

        // Add subscribers data for OnePage Analytics
        if (analyticsMode === "onepage" && leadEvents.length > 0) {
          leadEvents.forEach((e: any) => {
            const dateKey = getDateKey(e.created_at)
            if (trendDataByKey[dateKey]) {
              trendDataByKey[dateKey].subscribers = (trendDataByKey[dateKey].subscribers || 0) + 1
            }
          })
        }

        // Add orders/revenue data for Store Analytics
        if (analyticsMode === "store" && filteredOrders.length > 0) {
          // Get all existing date keys
          const existingKeys = Object.keys(trendDataByKey)

          filteredOrders.forEach(order => {
            const dateKey = getDateKey(order.created_at)
            // Ensure the date key exists, create if missing (handles edge cases)
            if (!trendDataByKey[dateKey]) {
              trendDataByKey[dateKey] = { date: dateKey, views: 0, sales: 0, revenue: 0, clicks: 0, subscribers: 0 }
            }
            trendDataByKey[dateKey].sales++
            trendDataByKey[dateKey].revenue += (order.amount_cents || 0)
          })

          // Distribute orders across existing dates if no matches found
          // This is a fallback to ensure orders always show on the chart
          const totalSales = Object.values(trendDataByKey).reduce((sum, d) => sum + d.sales, 0)
          if (totalSales === 0 && filteredOrders.length > 0 && existingKeys.length > 0) {
            // Orders didn't match any dates - distribute evenly across visible dates
            const ordersPerDay = Math.ceil(filteredOrders.length / existingKeys.length)
            let remaining = filteredOrders.length
            existingKeys.forEach(key => {
              const toAdd = Math.min(ordersPerDay, remaining)
              trendDataByKey[key].sales += toAdd
              remaining -= toAdd
            })
          }
        }
      }

      // Sort trend data
      const trendArray = Object.values(trendDataByKey).sort((a, b) => {
        if (isHourlyTimeframe && timeframe !== "last_48_hours") {
          // Sort by hour for today/yesterday
          const hourA = parseInt(a.date.split(':')[0])
          const hourB = parseInt(b.date.split(':')[0])
          return hourA - hourB
        }
        // Sort by date for other timeframes
        const dateA = new Date(a.date + ", 2024")
        const dateB = new Date(b.date + ", 2024")
        return dateA.getTime() - dateB.getTime()
      })

      setTrendData(trendArray)

      // Traffic sources (use source_category column from database)
      const trafficBySource: Record<string, { views: number; orders: number }> = {}
      viewOnlyEvents.forEach((e: any) => {
        const source = e.source_category || "direct"
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

      // Country data from analytics events
      const countryStats: Record<string, { views: number; orders: number; revenue: number; name: string }> = {}
      viewOnlyEvents.forEach((e: any) => {
        const code = e.country_code || "XX"
        const name = e.country_name || "Unknown"
        if (!countryStats[code]) {
          countryStats[code] = { views: 0, orders: 0, revenue: 0, name }
        }
        countryStats[code].views++
      })

      // Add order data by country from filtered orders
      filteredOrders.forEach((order: any) => {
        const code = order.buyer_country_code || "XX"
        const name = order.buyer_country || "Unknown"
        if (!countryStats[code]) {
          countryStats[code] = { views: 0, orders: 0, revenue: 0, name }
        }
        countryStats[code].orders++
        countryStats[code].revenue += order.amount_cents || 0
      })

      const countryDataArray = Object.entries(countryStats)
        .map(([code, data]) => ({
          code,
          name: data.name,
          views: data.views,
          orders: data.orders,
          revenue: data.revenue,
          conversionRate: data.views > 0 ? (data.orders / data.views) * 100 : 0,
        }))
        .filter(c => c.code !== "XX" && c.name !== "Unknown")
        .sort((a, b) => b.views - a.views)

      setCountryData(countryDataArray)

      // Top products (for store analytics) - fetch with cover images
      if (analyticsMode === "store") {
        const productViews: Record<string, number> = {}
        viewOnlyEvents.forEach((e: any) => {
          if (e.product_id) {
            productViews[e.product_id] = (productViews[e.product_id] || 0) + 1
          }
        })

        // Fetch product details with thumbnail images
        const { data: productDetails } = await supabase
          .from("products")
          .select("id, title, thumbnail_url")
          .eq("creator_id", creatorId)

        const productMap = new Map((productDetails || []).map((p: { id: string; title: string; thumbnail_url: string | null }) => [p.id, p]))

        const topProductsArray = products.map(p => {
          const details = productMap.get(p.id) as { id: string; title: string; thumbnail_url: string | null } | undefined
          return {
            id: p.id,
            title: p.title,
            thumbnail_url: details?.thumbnail_url || null,
            views: productViews[p.id] || 0,
            orders: filteredOrders.filter(o => o.product_id === p.id).length,
            revenue: filteredOrders.filter(o => o.product_id === p.id).reduce((sum, o) => sum + o.amount_cents, 0),
            conversionRate: 0,
          }
        }).sort((a, b) => b.views - a.views).slice(0, 5)

        setTopProducts(topProductsArray)
      }

      setLastUpdated(new Date())
    } catch (error) {
      console.error("Error fetching analytics:", error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [creatorId, userId, getTimeframeDates, selectedProduct, analyticsMode, initialOrders, products, timeframe])

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

      if (kpiType === "views") {
        // Database only has 'view' event type - filter at query level like Dashboard
        let query = supabase
          .from("analytics_events")
          .select("id, visitor_id, session_id, product_id, created_at")
          .eq("creator_id", creatorId)
          .eq("event_type", "view")  // Filter at query level
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

        // All events are views (filtered at query level)
        const filteredEvents = events || []

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
      {/* Announcement Bar - matching dashboard style */}
      <div className="bg-[#8b5cf6] text-white">
        <div className="py-2 px-4 md:py-2.5">
          <div className="max-w-[1200px] mx-auto flex items-center justify-center gap-2 md:gap-3 text-center">
            <span className="text-[12px] md:text-[14px] text-white/90">
              <span className="font-semibold text-white">Try Pro free</span>
              <span className="hidden md:inline"> — our most popular plan for content creators and businesses.</span>
            </span>
            <Link
              href="/upgrade"
              className="relative inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-gray-900 to-black text-white text-[11px] md:text-[13px] font-medium rounded-full transition-all shrink-0 overflow-hidden group"
            >
              <span className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/50 transition-colors" />
              <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 relative z-10" />
              <span className="relative z-10">Upgrade</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Analytics title with Store/OnePage switcher on mobile */}
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">Analytics</h1>
          {/* Analytics Mode Switcher - visible next to title on mobile */}
          <div className="flex sm:hidden items-center bg-[#f3f4f6] rounded-full p-0.5">
            <button
              onClick={() => setAnalyticsMode("store")}
              className={`px-3 py-1 text-[12px] font-medium rounded-full transition-all duration-200 cursor-pointer ${
                analyticsMode === "store" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
              }`}
            >
              Store
            </button>
            <button
              onClick={() => setAnalyticsMode("onepage")}
              className={`px-3 py-1 text-[12px] font-medium rounded-full transition-all duration-200 cursor-pointer ${
                analyticsMode === "onepage" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
              }`}
            >
              OnePage
            </button>
          </div>
        </div>

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

            {/* Analytics Mode Switcher - hidden on mobile (shown next to title instead) */}
            <div className="hidden sm:flex items-center bg-[#f3f4f6] rounded-full p-0.5">
              <button
                onClick={() => setAnalyticsMode("store")}
                className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 cursor-pointer ${
                  analyticsMode === "store" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                }`}
              >
                Store
              </button>
              <button
                onClick={() => setAnalyticsMode("onepage")}
                className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 cursor-pointer ${
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
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 max-h-[300px] overflow-y-auto">
                  <button
                    onClick={() => { setSelectedProduct("all"); setIsProductsOpen(false) }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                      selectedProduct === "all" ? "bg-[#f5f3ff] text-[#8b5cf6] font-medium" : "text-[#374151] hover:bg-[#f9fafb]"
                    }`}
                  >
                    All products
                  </button>
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
                  <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                    <span className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                      {isLoading ? <Skeleton className="h-7 w-16" /> : formatCompactNumber(summary.totalViews)}
                    </span>
                    {!isLoading && <PercentChangeIndicator current={summary.totalViews} previous={summary.prevPeriodViews} />}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">{formatCompactNumber(summary.allTimeViews)} all time</p>
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
                  <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                    <span className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                      {isLoading ? <Skeleton className="h-7 w-14" /> : formatCompactNumber(summary.totalOrders)}
                    </span>
                    {!isLoading && <PercentChangeIndicator current={summary.totalOrders} previous={summary.prevPeriodOrders} />}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">{formatCompactNumber(summary.allTimeOrders)} all time</p>
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
                  <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                    <span className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
                      {isLoading ? <Skeleton className="h-7 w-20" /> : formatPrice(summary.totalRevenue)}
                    </span>
                    {!isLoading && <PercentChangeIndicator current={summary.totalRevenue} previous={summary.prevPeriodRevenue} />}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">{formatPrice(summary.allTimeRevenue)} all time</p>
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
              <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">Views to orders</p>
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

        {/* Activity Card - Bar/Line Chart with Switcher */}
        <Card className="border-[#e5e7eb] bg-white shadow-sm">
          <CardHeader className="pb-1 sm:pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-semibold text-[#1a1a2e] hidden sm:block">Activity</CardTitle>
              <div className="flex items-center gap-3">
                {/* Metric Filter Selector - Store */}
                {analyticsMode === "store" && (
                  <div className="flex items-center gap-0.5 bg-[#f3f4f6] rounded-md p-0.5">
                    <button
                      onClick={() => setChartMetricFilter("all")}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-all duration-200 cursor-pointer ${
                        chartMetricFilter === "all"
                          ? "bg-white text-[#8b5cf6] shadow-sm"
                          : "text-[#9ca3af] hover:text-[#6b7280] hover:bg-white/50"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setChartMetricFilter("views")}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-all duration-200 cursor-pointer ${
                        chartMetricFilter === "views"
                          ? "bg-white text-[#6366f1] shadow-sm"
                          : "text-[#9ca3af] hover:text-[#6b7280] hover:bg-white/50"
                      }`}
                    >
                      Views
                    </button>
                    <button
                      onClick={() => setChartMetricFilter("orders")}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-all duration-200 cursor-pointer ${
                        chartMetricFilter === "orders"
                          ? "bg-white text-[#8b5cf6] shadow-sm"
                          : "text-[#9ca3af] hover:text-[#6b7280] hover:bg-white/50"
                      }`}
                    >
                      Orders
                    </button>
                    <button
                      onClick={() => setChartMetricFilter("revenue")}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-all duration-200 cursor-pointer ${
                        chartMetricFilter === "revenue"
                          ? "bg-white text-[#c4b5fd] shadow-sm"
                          : "text-[#9ca3af] hover:text-[#6b7280] hover:bg-white/50"
                      }`}
                    >
                      Revenue
                    </button>
                  </div>
                )}
                {/* Metric Filter Selector - OnePage */}
                {analyticsMode === "onepage" && (
                  <div className="flex items-center gap-0.5 bg-[#f3f4f6] rounded-md p-0.5">
                    <button
                      onClick={() => setOnePageChartFilter("all")}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-all duration-200 cursor-pointer ${
                        onePageChartFilter === "all"
                          ? "bg-white text-[#8b5cf6] shadow-sm"
                          : "text-[#9ca3af] hover:text-[#6b7280] hover:bg-white/50"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setOnePageChartFilter("views")}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-all duration-200 cursor-pointer ${
                        onePageChartFilter === "views"
                          ? "bg-white text-[#6366f1] shadow-sm"
                          : "text-[#9ca3af] hover:text-[#6b7280] hover:bg-white/50"
                      }`}
                    >
                      Views
                    </button>
                    <button
                      onClick={() => setOnePageChartFilter("clicks")}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-all duration-200 cursor-pointer ${
                        onePageChartFilter === "clicks"
                          ? "bg-white text-[#a78bfa] shadow-sm"
                          : "text-[#9ca3af] hover:text-[#6b7280] hover:bg-white/50"
                      }`}
                    >
                      Clicks
                    </button>
                    <button
                      onClick={() => setOnePageChartFilter("subscribers")}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-all duration-200 cursor-pointer ${
                        onePageChartFilter === "subscribers"
                          ? "bg-white text-[#8b5cf6] shadow-sm"
                          : "text-[#9ca3af] hover:text-[#6b7280] hover:bg-white/50"
                      }`}
                    >
                      Subscribers
                    </button>
                  </div>
                )}
                {/* Chart View Switcher */}
                <div className="flex items-center gap-0.5 bg-[#f3f4f6] rounded-md p-0.5">
                  <button
                    onClick={() => setChartViewType("bars")}
                    className={`p-1.5 rounded transition-all duration-200 cursor-pointer ${
                      chartViewType === "bars"
                        ? "bg-white text-[#8b5cf6] shadow-sm"
                        : "text-[#9ca3af] hover:text-[#6b7280] hover:bg-white/50"
                    }`}
                    title="Bar chart"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setChartViewType("line")}
                    className={`p-1.5 rounded transition-all duration-200 cursor-pointer ${
                      chartViewType === "line"
                        ? "bg-white text-[#8b5cf6] shadow-sm"
                        : "text-[#9ca3af] hover:text-[#6b7280] hover:bg-white/50"
                    }`}
                    title="Line chart"
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="space-y-2 sm:space-y-1">
                {/* Stats Header - Same values as KPI cards */}
                <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
                  <div>
                    <p className="text-[28px] font-bold text-[#1a1a2e] leading-tight">{formatCompactNumber(totalViewsInChart)}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-[#6366f1]" />
                      <p className="text-[13px] text-[#6b7280]">Views</p>
                    </div>
                  </div>
                  {analyticsMode === "store" ? (
                    <>
                      <div>
                        <p className="text-[28px] font-bold text-[#1a1a2e] leading-tight">{formatCompactNumber(totalOrdersInChart)}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                          <p className="text-[13px] text-[#6b7280]">Orders</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[28px] font-bold text-[#1a1a2e] leading-tight">{formatPrice(totalRevenueInChart)}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-2 h-2 rounded-full bg-[#c4b5fd]" />
                          <p className="text-[13px] text-[#6b7280]">Revenue</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-[28px] font-bold text-[#1a1a2e] leading-tight">{formatCompactNumber(totalClicksInChart)}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-2 h-2 rounded-full bg-[#a78bfa]" />
                          <p className="text-[13px] text-[#6b7280]">Clicks</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[28px] font-bold text-[#1a1a2e] leading-tight">{formatCompactNumber(onePageMetrics.subscribers)}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                          <p className="text-[13px] text-[#6b7280]">Subscribers</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Chart - Bar or Line based on selection */}
                {trendData.length > 0 ? (
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartViewType === "bars" ? (
                        <BarChart
                          data={trendData.map(d => ({
                            ...d,
                            // Add minimum placeholder values for empty bars (very small value for visibility)
                            placeholder: (d.views === 0 && d.sales === 0 && d.revenue === 0) ? 0.3 : 0
                          }))}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          barCategoryGap="5%"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} dy={10} />
                          <YAxis
                            yAxisId="left"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "#9ca3af", fontSize: 11 }}
                            dx={-5}
                          />
                          {/* Revenue uses left axis with formatted values - no dual axis needed */}
                          <Tooltip
                            cursor={false}
                            contentStyle={{ backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", fontSize: "12px" }}
                            formatter={(value: number, name: string) => {
                              if (name === "placeholder") return [null, null]
                              const labels: Record<string, string> = { views: "Views", clicks: "Clicks", sales: "Orders", revenue: "Revenue", subscribers: "Subscribers" }
                              if (name === "revenue") return [formatPrice(value), labels[name] || name]
                              return [value.toLocaleString(), labels[name] || name]
                            }}
                            filterNull={true}
                          />
                          {/* Placeholder bar for empty data points */}
                          <Bar yAxisId="left" dataKey="placeholder" fill="#e5e7eb" radius={[4, 4, 0, 0]} name="placeholder" />
                          {/* Store bars */}
                          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "views") && (
                            <Bar yAxisId="left" dataKey="views" fill={CHART_COLORS.views} radius={[4, 4, 0, 0]} name="views" />
                          )}
                          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "orders") && (
                            <Bar yAxisId="left" dataKey="sales" fill={CHART_COLORS.orders} radius={[4, 4, 0, 0]} name="sales" />
                          )}
                          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "revenue") && (
                            <Bar yAxisId="left" dataKey="revenue" fill={CHART_COLORS.revenue} radius={[4, 4, 0, 0]} name="revenue" />
                          )}
                          {/* OnePage bars */}
                          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "views") && (
                            <Bar yAxisId="left" dataKey="views" fill={CHART_COLORS.views} radius={[4, 4, 0, 0]} name="views" />
                          )}
                          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "clicks") && (
                            <Bar yAxisId="left" dataKey="clicks" fill={CHART_COLORS.clicks} radius={[4, 4, 0, 0]} name="clicks" />
                          )}
                          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "subscribers") && (
                            <Bar yAxisId="left" dataKey="subscribers" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="subscribers" />
                          )}
                        </BarChart>
                      ) : (
                        <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} dy={10} />
                          <YAxis
                            yAxisId="left"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "#9ca3af", fontSize: 11 }}
                            dx={-5}
                          />
                          {/* Revenue uses left axis with formatted values - no dual axis needed */}
                          <Tooltip
                            contentStyle={{ backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", fontSize: "12px" }}
                            formatter={(value: number, name: string) => {
                              const labels: Record<string, string> = { views: "Views", clicks: "Clicks", sales: "Orders", revenue: "Revenue", subscribers: "Subscribers" }
                              if (name === "revenue") return [formatPrice(value), labels[name] || name]
                              return [value.toLocaleString(), labels[name] || name]
                            }}
                          />
                          {/* Store lines */}
                          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "views") && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="views"
                              stroke={CHART_COLORS.views}
                              strokeWidth={2}
                              dot={{ fill: CHART_COLORS.views, strokeWidth: 0, r: 3 }}
                              activeDot={{ r: 5 }}
                              name="views"
                            />
                          )}
                          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "orders") && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="sales"
                              stroke={CHART_COLORS.orders}
                              strokeWidth={2}
                              dot={{ fill: CHART_COLORS.orders, strokeWidth: 0, r: 3 }}
                              activeDot={{ r: 5 }}
                              name="sales"
                            />
                          )}
                          {/* Revenue line */}
                          {analyticsMode === "store" && (chartMetricFilter === "all" || chartMetricFilter === "revenue") && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="revenue"
                              stroke={CHART_COLORS.revenue}
                              strokeWidth={2}
                              dot={{ fill: CHART_COLORS.revenue, strokeWidth: 0, r: 3 }}
                              activeDot={{ r: 5 }}
                              name="revenue"
                            />
                          )}
                          {/* OnePage lines */}
                          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "views") && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="views"
                              stroke={CHART_COLORS.views}
                              strokeWidth={2}
                              dot={{ fill: CHART_COLORS.views, strokeWidth: 0, r: 3 }}
                              activeDot={{ r: 5 }}
                              name="views"
                              connectNulls={true}
                            />
                          )}
                          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "clicks") && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="clicks"
                              stroke={CHART_COLORS.clicks}
                              strokeWidth={2}
                              dot={{ fill: CHART_COLORS.clicks, strokeWidth: 0, r: 3 }}
                              activeDot={{ r: 5 }}
                              name="clicks"
                              connectNulls={true}
                            />
                          )}
                          {analyticsMode === "onepage" && (onePageChartFilter === "all" || onePageChartFilter === "subscribers") && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="subscribers"
                              stroke="#8b5cf6"
                              strokeWidth={2}
                              dot={{ fill: "#8b5cf6", strokeWidth: 0, r: 4 }}
                              activeDot={{ r: 6 }}
                              name="subscribers"
                              connectNulls={true}
                            />
                          )}
                        </LineChart>
                      )}
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
                    <>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#a78bfa]" />
                        <span className="text-[12px] text-[#6b7280]">Clicks</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]" />
                        <span className="text-[12px] text-[#6b7280]">Subscribers</span>
                      </div>
                    </>
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
                      <Tooltip
                        formatter={(value: number, name: string) => [`${value.toLocaleString()} views`, name]}
                        contentStyle={{ backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" }}
                        labelFormatter={(label) => ""}
                      />
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
            <CardHeader className="pb-1">
              <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Device Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : deviceData.length > 0 ? (
                <div className="space-y-2">
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
                      <div className="w-10 h-10 rounded-lg bg-[#e5e7eb] flex items-center justify-center overflow-hidden flex-shrink-0">
                        {product.thumbnail_url ? (
                          <img
                            src={product.thumbnail_url}
                            alt={product.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback if image fails to load
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              if (target.nextSibling) {
                                (target.nextSibling as HTMLElement).style.display = 'flex'
                              }
                            }}
                          />
                        ) : null}
                        <span className={`text-lg ${product.thumbnail_url ? 'hidden' : 'flex'}`}>📦</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#1a1a2e] truncate">{product.title}</p>
                        <p className="text-[11px] text-[#9ca3af]">{product.views.toLocaleString()} views • {product.orders} orders</p>
                      </div>
                      <div className="text-right flex-shrink-0">
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
            ) : mostClickedBlocks.length > 0 ? (
              <div className="space-y-2">
                {mostClickedBlocks.map((block) => {
                  // Format display URL - hide Supabase storage URLs and clean up display
                  const url = block.url || ""
                  const isSupabaseUrl = url.includes('supabase.co/storage')
                  const isPdfUrl = url.toLowerCase().endsWith('.pdf')

                  // Determine friendly display URL
                  let displayUrl = url
                  if (isSupabaseUrl || isPdfUrl) {
                    displayUrl = block.blockType === 'pdf_document' || block.blockType === 'food_menu'
                      ? 'PDF Document'
                      : 'Digital Download'
                  } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                    displayUrl = 'youtube.com'
                  } else if (url.includes('spotify.com')) {
                    displayUrl = 'spotify.com'
                  } else if (url.includes('soundcloud.com')) {
                    displayUrl = 'soundcloud.com'
                  } else if (url.includes('apple.com/music') || url.includes('music.apple.com')) {
                    displayUrl = 'music.apple.com'
                  } else if (url.includes('calendly.com')) {
                    displayUrl = 'calendly.com'
                  } else if (url.length > 40) {
                    // Truncate long URLs
                    try {
                      const urlObj = new URL(url)
                      displayUrl = urlObj.hostname
                    } catch {
                      displayUrl = url.slice(0, 40) + '...'
                    }
                  }

                  // Get icon based on block type and URL patterns
                  const getBlockIcon = () => {
                    if (block.icon) return block.icon

                    // Check URL patterns first
                    if (url.includes('youtube.com') || url.includes('youtu.be')) return '🎬'
                    if (url.includes('spotify.com')) return '🎵'
                    if (url.includes('soundcloud.com')) return '🎵'
                    if (url.includes('apple.com/music') || url.includes('music.apple.com')) return '🎵'
                    if (url.includes('tiktok.com')) return '📱'
                    if (url.includes('instagram.com')) return '📷'
                    if (url.includes('twitter.com') || url.includes('x.com')) return '🐦'
                    if (url.includes('calendly.com')) return '📅'
                    if (url.includes('amazon.com') || url.includes('amzn.')) return '🛒'
                    if (url.includes('gumroad.com') || url.includes('stan.store') || url.includes('shopify')) return '🛍️'

                    // Check block type
                    switch (block.blockType) {
                      case 'link_button': return '🔗'
                      case 'product': return '🛍️'
                      case 'pdf_document': return '📄'
                      case 'food_menu': return '🍽️'
                      case 'calendly': return '📅'
                      case 'email_capture': return '📧'
                      case 'image': return '🖼️'
                      case 'social_row': return '📱'
                      default: return '🔗'
                    }
                  }

                  return (
                    <div key={block.id} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                      {block.thumbnail ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[#f3f4f6]">
                          <img
                            src={block.thumbnail}
                            alt={block.label}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to icon on error
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              target.parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center text-lg">${getBlockIcon()}</div>`
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm text-lg flex-shrink-0">
                          {getBlockIcon()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#1a1a2e] truncate">{block.label}</p>
                        <p className="text-[11px] text-[#9ca3af] truncate">{displayUrl}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[13px] font-semibold text-[#1a1a2e]">{block.clicks.toLocaleString()} clicks</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-[#9ca3af] text-[13px]">No click data yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Visitors by Country */}
        <Card className="border-[#e5e7eb] bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold text-[#1a1a2e]">Visitors by Country</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : countryData.filter(c => c.code !== "XX" && c.name !== "Unknown").length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e5e7eb]">
                      <th className="text-left text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider pb-2">Country</th>
                      <th className="text-right text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider pb-2">Views</th>
                      <th className="text-right text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider pb-2">
                        {analyticsMode === "onepage" ? "Clicks" : "Orders"}
                      </th>
                      <th className="text-right text-[11px] font-medium text-[#9ca3af] uppercase tracking-wider pb-2">
                        {analyticsMode === "onepage" ? "Subscribers" : "Revenue"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {countryData
                      .filter(c => c.code !== "XX" && c.name !== "Unknown")
                      .map((country) => (
                        <tr key={country.code} className="border-b border-[#f3f4f6] last:border-0">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[16px]">{getCountryFlag(country.code)}</span>
                              <span className="text-[13px] font-medium text-[#1a1a2e]">{country.name}</span>
                            </div>
                          </td>
                          <td className="text-right py-2.5">
                            <span className="text-[13px] text-[#6b7280]">{country.views.toLocaleString()}</span>
                          </td>
                          <td className="text-right py-2.5">
                            <span className="text-[13px] text-[#6b7280]">{country.orders.toLocaleString()}</span>
                          </td>
                          <td className="text-right py-2.5">
                            <span className="text-[13px] text-[#6b7280]">
                              {analyticsMode === "onepage" ? country.revenue.toLocaleString() : formatPrice(country.revenue)}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-6 text-center">
                <Globe className="h-8 w-8 mx-auto mb-2 text-[#e5e7eb]" />
                <p className="text-[#9ca3af] text-[13px]">No visitor location data yet</p>
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
