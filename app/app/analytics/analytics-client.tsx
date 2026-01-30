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
  Zap, Clock, ChevronDown, ChevronUp, X, Wallet
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

interface AnalyticsClientProps {
  creatorId: string
  products: Product[]
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

type KPIType = "views" | "orders" | "revenue" | "conversion" | null

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
  primary: "#2563eb",
  secondary: "#10b981",
  tertiary: "#f59e0b",
  quaternary: "#ef4444",
  muted: "#6b7280",
}

const PIE_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]

export function AnalyticsClient({ creatorId, products }: AnalyticsClientProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [timeframe, setTimeframe] = useState("last_7_days")
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState("all")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    traffic: true,
    country: true,
    device: true,
    products: true,
  })

  // KPI Modal state
  const [openKPIModal, setOpenKPIModal] = useState<KPIType>(null)
  const [kpiChartData, setKpiChartData] = useState<{ label: string; value: number }[]>([])
  const [isKpiChartLoading, setIsKpiChartLoading] = useState(false)

  // Announcement bar state
  const [announcementType, setAnnouncementType] = useState<"analytics" | "upgrade">("analytics")
  const [announcementVisible, setAnnouncementVisible] = useState(true)
  const [progressWidth, setProgressWidth] = useState(0)

  const [summary, setSummary] = useState<Summary>({
    totalViews: 0,
    totalOrders: 0,
    totalRevenue: 0,
    conversionRate: 0,
    avgOrderValue: 0,
    uniqueVisitors: 0,
  })

  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([])
  const [countryData, setCountryData] = useState<CountryData[]>([])
  const [deviceData, setDeviceData] = useState<DeviceData[]>([])
  const [topProducts, setTopProducts] = useState<TopProductData[]>([])

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

      if (summaryRes.ok) {
        const data = await summaryRes.json()
        setSummary({
          totalViews: data.totalViews || 0,
          totalOrders: data.totalOrders || 0,
          totalRevenue: data.totalRevenue || 0,
          conversionRate: data.conversionRate || 0,
          avgOrderValue: data.totalOrders > 0 ? (data.totalRevenue / data.totalOrders) : 0,
          uniqueVisitors: data.uniqueVisitors || data.totalViews || 0,
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
  }, [timeframe, selectedProduct, customStart, customEnd])

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

  // Generate KPI chart data based on trend data
  const generateKpiChartData = useCallback((kpiType: KPIType) => {
    if (!kpiType || trendData.length === 0) {
      setKpiChartData([])
      return
    }

    setIsKpiChartLoading(true)

    // Simulate a brief loading state for better UX
    setTimeout(() => {
      const data = trendData.map(item => {
        let value = 0
        if (kpiType === "views") {
          value = item.views
        } else if (kpiType === "orders") {
          value = item.sales
        } else if (kpiType === "revenue") {
          value = item.revenue / 100
        } else if (kpiType === "conversion") {
          value = item.views > 0 ? (item.sales / item.views) * 100 : 0
        }
        return { label: item.date, value }
      })

      setKpiChartData(data)
      setIsKpiChartLoading(false)
    }, 200)
  }, [trendData])

  // Fetch chart data when KPI modal opens
  useEffect(() => {
    if (openKPIModal) {
      generateKpiChartData(openKPIModal)
    }
  }, [openKPIModal, generateKpiChartData])

  // Close timeframe dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(".timeframe-dropdown")) {
        setIsTimeframeOpen(false)
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
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3.5">
            <h1 className="text-[20px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">Analytics</h1>

            {/* Timeframe Dropdown */}
            <div className="relative timeframe-dropdown">
              <button
                onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
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
                      className={`w-full text-left px-4 py-2 text-[13px] transition-colors ${
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
          </div>

          {/* Product Filter */}
          <div className="relative">
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="appearance-none px-3 py-2 pr-8 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
            >
              <option value="all">All products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af] pointer-events-none" />
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

        {/* KPI Cards with Click-to-Chart */}
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

        {/* Trend Chart */}
        <Card className="border-[#e5e7eb]/60 bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-[#1a1a2e]">Views, Orders & Revenue Trend</CardTitle>
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
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    dx={10}
                    tickFormatter={(value) => `$${value}`}
                  />
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
                    name="Orders"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="revenue"
                    stroke={CHART_COLORS.tertiary}
                    strokeWidth={2}
                    dot={false}
                    name="Revenue"
                  />
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
              <CardDescription className="text-[#6b7280]">How visitors access your store</CardDescription>
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
                    <div key={device.device} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getDeviceIcon(device.device)}
                          <span className="text-sm font-medium">{formatDeviceName(device.device)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">{device.views.toLocaleString()} views</span>
                          <Badge variant="secondary" className="font-normal">
                            {percentage.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: PIE_COLORS[idx % PIE_COLORS.length]
                          }}
                        />
                      </div>
                    </div>
                  )
                })}

                {/* Conversion by device */}
                <div className="mt-6 pt-4 border-t">
                  <p className="text-xs text-muted-foreground mb-3">Conversion by Device</p>
                  <div className="grid grid-cols-3 gap-2">
                    {deviceData.slice(0, 3).map((device) => (
                      <div key={device.device} className="text-center p-2 bg-muted/30 rounded-lg">
                        <p className="text-lg font-semibold">{device.conversionRate.toFixed(1)}%</p>
                        <p className="text-xs text-muted-foreground">{formatDeviceName(device.device)}</p>
                      </div>
                    ))}
                  </div>
                </div>
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
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Conversion</TableHead>
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
                {/* Interactive World Map Visualization */}
                <div className="relative bg-gradient-to-b from-[#f8fafc] to-[#f1f5f9] rounded-xl p-6 overflow-hidden">
                  {/* Map Grid Background */}
                  <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: `radial-gradient(circle, #000 1px, transparent 1px)`,
                    backgroundSize: '20px 20px'
                  }} />

                  {/* World Map SVG - Simplified */}
                  <div className="relative h-[200px] sm:h-[280px]">
                    <svg viewBox="0 0 1000 500" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                      {/* World map outline - simplified continents */}
                      <g fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="0.5">
                        {/* North America */}
                        <path d="M150,120 Q200,80 250,100 L280,130 Q320,160 280,200 L250,220 Q180,250 150,200 Q120,160 150,120Z" />
                        {/* South America */}
                        <path d="M250,260 Q290,240 300,280 L310,340 Q300,400 270,420 L240,400 Q210,350 220,300 Q230,270 250,260Z" />
                        {/* Europe */}
                        <path d="M450,100 Q500,80 530,100 L550,130 Q560,160 530,180 L490,190 Q450,180 440,150 Q430,120 450,100Z" />
                        {/* Africa */}
                        <path d="M470,200 Q520,190 550,220 L560,300 Q540,380 500,400 L460,380 Q430,320 440,260 Q450,220 470,200Z" />
                        {/* Asia */}
                        <path d="M580,80 Q680,60 780,100 L820,160 Q840,220 800,260 L720,280 Q640,260 600,200 L580,140 Q560,100 580,80Z" />
                        {/* Australia */}
                        <path d="M780,340 Q830,320 860,350 L870,390 Q860,420 820,430 L780,420 Q750,400 760,370 Q770,350 780,340Z" />
                      </g>

                      {/* Country markers with data */}
                      {countryData.slice(0, 10).map((country, idx) => {
                        // Approximate country positions
                        const positions: Record<string, { x: number; y: number }> = {
                          US: { x: 200, y: 160 },
                          CA: { x: 180, y: 120 },
                          MX: { x: 190, y: 200 },
                          BR: { x: 280, y: 340 },
                          AR: { x: 260, y: 400 },
                          GB: { x: 470, y: 120 },
                          DE: { x: 510, y: 130 },
                          FR: { x: 480, y: 145 },
                          ES: { x: 460, y: 160 },
                          IT: { x: 510, y: 155 },
                          NL: { x: 495, y: 125 },
                          BE: { x: 490, y: 130 },
                          CH: { x: 505, y: 145 },
                          AT: { x: 520, y: 140 },
                          PL: { x: 530, y: 125 },
                          RU: { x: 650, y: 100 },
                          CN: { x: 750, y: 180 },
                          JP: { x: 830, y: 170 },
                          KR: { x: 800, y: 175 },
                          IN: { x: 680, y: 230 },
                          AU: { x: 820, y: 380 },
                          NZ: { x: 890, y: 420 },
                          ZA: { x: 520, y: 380 },
                          NG: { x: 490, y: 280 },
                          EG: { x: 540, y: 220 },
                          AE: { x: 600, y: 230 },
                          SA: { x: 580, y: 240 },
                          SG: { x: 740, y: 280 },
                          HK: { x: 770, y: 220 },
                          TW: { x: 790, y: 210 },
                        }
                        const pos = positions[country.code] || { x: 500, y: 250 }
                        const maxViews = Math.max(...countryData.map(c => c.views))
                        const size = Math.max(8, Math.min(24, (country.views / maxViews) * 24))
                        const opacity = 0.6 + (country.views / maxViews) * 0.4

                        return (
                          <g key={country.code} className="cursor-pointer group">
                            {/* Pulse animation ring */}
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r={size + 4}
                              fill="none"
                              stroke="#8b5cf6"
                              strokeWidth="2"
                              opacity={0.3}
                              className="animate-ping"
                              style={{ animationDuration: '2s', animationDelay: `${idx * 0.2}s` }}
                            />
                            {/* Main marker */}
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r={size}
                              fill="#8b5cf6"
                              opacity={opacity}
                              className="transition-all duration-300 group-hover:opacity-100"
                            />
                            {/* Inner highlight */}
                            <circle
                              cx={pos.x - size * 0.3}
                              cy={pos.y - size * 0.3}
                              r={size * 0.25}
                              fill="white"
                              opacity={0.4}
                            />
                            {/* Tooltip on hover */}
                            <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <rect
                                x={pos.x - 40}
                                y={pos.y - 50}
                                width="80"
                                height="38"
                                rx="6"
                                fill="#1a1a2e"
                              />
                              <text x={pos.x} y={pos.y - 34} textAnchor="middle" fill="white" fontSize="10" fontWeight="600">
                                {getCountryFlag(country.code)} {country.name}
                              </text>
                              <text x={pos.x} y={pos.y - 20} textAnchor="middle" fill="#a5b4fc" fontSize="9">
                                {country.views.toLocaleString()} views
                              </text>
                            </g>
                          </g>
                        )
                      })}
                    </svg>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-[#6b7280]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#8b5cf6] opacity-60" />
                      <span>Fewer visits</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-[#8b5cf6]" />
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
                          <div className="h-1.5 bg-[#e5e7eb] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: PIE_COLORS[idx % PIE_COLORS.length]
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Show more link if there's more data */}
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

      {/* Top Products */}
      <Card className="border-[#e5e7eb]/60 bg-white">
        <CardHeader className="pb-2">
          <button
            onClick={() => toggleSection("products")}
            className="flex items-center justify-between w-full text-left"
          >
            <div>
              <CardTitle className="text-base font-semibold text-[#1a1a2e]">Top Products</CardTitle>
              <CardDescription className="text-[#6b7280]">Your best performing products</CardDescription>
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
            ) : topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map((product, idx) => {
                  const maxRevenue = Math.max(...topProducts.map(p => p.revenue))
                  const percentage = (product.revenue / maxRevenue) * 100
                  return (
                    <div key={product.id} className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-xl hover:bg-[#f3f4f6] transition-colors">
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
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[13px] font-medium text-[#1a1a2e] truncate">{product.title}</span>
                          <span className="text-[12px] font-semibold text-[#1a1a2e] ml-2 shrink-0">{formatPrice(product.revenue)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[#6b7280]">
                          <span>{product.views.toLocaleString()} views</span>
                          <span>•</span>
                          <span>{product.orders.toLocaleString()} orders</span>
                          <span>•</span>
                          <span>{product.conversionRate.toFixed(1)}% conv.</span>
                        </div>
                        <div className="h-1.5 bg-[#e5e7eb] rounded-full overflow-hidden mt-2">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: PIE_COLORS[idx % PIE_COLORS.length]
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-[#6b7280]">No product data for this timeframe</p>
              </div>
            )}
          </CardContent>
        )}
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
