"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Eye, ShoppingCart, DollarSign, Globe, TrendingUp, TrendingDown,
  Smartphone, Monitor, Tablet, RefreshCw, Download, ArrowUpRight,
  ArrowDownRight, Users, Target, MousePointer, BarChart3, PieChart as PieChartIcon,
  Zap, Clock, ChevronDown, ChevronUp
} from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, BarChart, Bar
} from "recharts"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

  const handleRefresh = () => {
    fetchAnalytics(true)
  }

  const handleCustomRangeApply = () => {
    if (customStart && customEnd) {
      fetchAnalytics()
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

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

  const exportToCSV = () => {
    // Create CSV content
    let csv = "Analytics Report\n"
    csv += `Generated: ${new Date().toLocaleString()}\n`
    csv += `Timeframe: ${timeframe}\n\n`

    // Summary
    csv += "Summary\n"
    csv += "Metric,Value\n"
    csv += `Total Views,${summary.totalViews}\n`
    csv += `Total Orders,${summary.totalOrders}\n`
    csv += `Total Revenue,${formatPrice(summary.totalRevenue)}\n`
    csv += `Conversion Rate,${summary.conversionRate.toFixed(2)}%\n`
    csv += `Average Order Value,${formatPrice(summary.avgOrderValue)}\n\n`

    // Traffic Sources
    if (trafficSources.length > 0) {
      csv += "Traffic Sources\n"
      csv += "Source,Views,Orders,Conversion Rate\n"
      trafficSources.forEach(s => {
        csv += `${formatSourceName(s.source)},${s.views},${s.orders},${s.conversionRate.toFixed(2)}%\n`
      })
      csv += "\n"
    }

    // Countries
    if (countryData.length > 0) {
      csv += "Countries\n"
      csv += "Country,Views,Orders,Revenue,Conversion Rate\n"
      countryData.forEach(c => {
        csv += `${c.name},${c.views},${c.orders},${formatPrice(c.revenue)},${c.conversionRate.toFixed(2)}%\n`
      })
      csv += "\n"
    }

    // Download
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `analytics-${timeframe}-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
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
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex gap-3 flex-col sm:flex-row sm:items-end flex-1">
          <div className="flex-1 max-w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Timeframe</Label>
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_30_minutes">Last 30 minutes</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last_7_days">Last 7 days</SelectItem>
                <SelectItem value="last_30_days">Last 30 days</SelectItem>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="last_6_months">Last 6 months</SelectItem>
                <SelectItem value="last_year">Last year</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 max-w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Product</Label>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Products" />
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
        </div>

        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-9"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            className="h-9"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Custom date range inputs */}
      {timeframe === "custom" && (
        <div className="flex gap-4 flex-col sm:flex-row sm:items-end p-4 bg-muted/30 rounded-lg">
          <div className="flex-1 max-w-[180px] space-y-1.5">
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9" />
          </div>
          <div className="flex-1 max-w-[180px] space-y-1.5">
            <Label className="text-xs">End Date</Label>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9" />
          </div>
          <Button onClick={handleCustomRangeApply} disabled={!customStart || !customEnd} size="sm" className="h-9">
            Apply Range
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 ${isLoading ? "opacity-60" : ""}`}>
        {/* Total Views */}
        <div className="bg-white rounded-2xl border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-muted-foreground">Total Views</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Eye className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <div className="text-[28px] font-bold text-foreground tracking-tight">
            {isLoading ? <Skeleton className="h-8 w-20" /> : summary.totalViews.toLocaleString()}
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">Unique page views</p>
        </div>

        {/* Total Orders */}
        <div className="bg-white rounded-2xl border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-muted-foreground">Total Orders</span>
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
              <ShoppingCart className="h-4 w-4 text-green-600" />
            </div>
          </div>
          <div className="text-[28px] font-bold text-foreground tracking-tight">
            {isLoading ? <Skeleton className="h-8 w-16" /> : summary.totalOrders.toLocaleString()}
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">Completed orders</p>
        </div>

        {/* Total Revenue */}
        <div className="bg-white rounded-2xl border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-muted-foreground">Total Revenue</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-amber-600" />
            </div>
          </div>
          <div className="text-[28px] font-bold text-foreground tracking-tight">
            {isLoading ? <Skeleton className="h-8 w-24" /> : formatPrice(summary.totalRevenue)}
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">Gross revenue</p>
        </div>

        {/* Conversion Rate */}
        <div className="bg-white rounded-2xl border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-muted-foreground">Conversion Rate</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
              <Target className="h-4 w-4 text-purple-600" />
            </div>
          </div>
          <div className="text-[28px] font-bold text-foreground tracking-tight">
            {isLoading ? <Skeleton className="h-8 w-16" /> : `${summary.conversionRate.toFixed(2)}%`}
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">Views to orders</p>
        </div>
      </div>

      {/* Secondary Stats Row */}
      <div className={`grid gap-4 grid-cols-2 ${isLoading ? "opacity-60" : ""}`}>
        {/* Average Order Value */}
        <div className="bg-white rounded-xl border border-border/60 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Avg. Order Value</p>
              <p className="text-xl font-semibold truncate">
                {isLoading ? <Skeleton className="h-6 w-16" /> : formatPrice(summary.avgOrderValue)}
              </p>
            </div>
          </div>
        </div>

        {/* Unique Visitors */}
        <div className="bg-white rounded-xl border border-border/60 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Unique Visitors</p>
              <p className="text-xl font-semibold truncate">
                {isLoading ? <Skeleton className="h-6 w-16" /> : summary.uniqueVisitors.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Views & Sales Trend</CardTitle>
              <CardDescription>Track your performance over time</CardDescription>
            </div>
            <Badge variant="outline" className="font-normal">
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
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
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
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    dx={-10}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorViews)"
                    name="Views"
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke={CHART_COLORS.secondary}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorSales)"
                    name="Sales"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No data for this timeframe</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Try selecting a different date range</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts Row: Traffic & Device Distribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Traffic Sources Pie Chart */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4" />
                  Traffic Distribution
                </CardTitle>
                <CardDescription>Where your visitors come from</CardDescription>
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
                      formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center">
                <p className="text-muted-foreground text-sm">No traffic data</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Device Distribution */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Device Breakdown
              </CardTitle>
              <CardDescription>How visitors access your store</CardDescription>
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
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <button
            onClick={() => toggleSection("traffic")}
            className="flex items-center justify-between w-full text-left"
          >
            <div>
              <CardTitle className="text-base font-semibold">Traffic Sources</CardTitle>
              <CardDescription>Detailed breakdown of where your visitors come from</CardDescription>
            </div>
            {expandedSections.traffic ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
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

      {/* Analytics by Country */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <button
            onClick={() => toggleSection("country")}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base font-semibold">Analytics by Country</CardTitle>
                <CardDescription>Geographic distribution of your audience</CardDescription>
              </div>
            </div>
            {expandedSections.country ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Conversion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {countryData.map((country) => (
                      <TableRow key={country.code}>
                        <TableCell className="font-medium">
                          <span className="mr-2">{getCountryFlag(country.code)}</span>
                          {country.name}
                        </TableCell>
                        <TableCell className="text-right">{country.views.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{country.orders.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatPrice(country.revenue)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={country.conversionRate > 5 ? "default" : "secondary"} className="font-normal">
                            {country.conversionRate.toFixed(2)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <button
            onClick={() => toggleSection("products")}
            className="flex items-center justify-between w-full text-left"
          >
            <div>
              <CardTitle className="text-base font-semibold">Top Products</CardTitle>
              <CardDescription>Your best performing products</CardDescription>
            </div>
            {expandedSections.products ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Conversion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {product.cover_image ? (
                              <img
                                src={product.cover_image}
                                alt={product.title}
                                className="w-10 h-10 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                <span className="text-lg">📦</span>
                              </div>
                            )}
                            <span className="font-medium truncate max-w-[200px]">{product.title}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{product.views.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{product.orders.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatPrice(product.revenue)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={product.conversionRate > 5 ? "default" : "secondary"} className="font-normal">
                            {product.conversionRate.toFixed(2)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">No product data for this timeframe</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Quick Tips */}
      <Card className="border-border/60 bg-gradient-to-r from-blue-50/50 to-purple-50/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Analytics Tips</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Track your best performing traffic sources and double down on them</li>
                <li>• Monitor conversion rates across devices to optimize your mobile experience</li>
                <li>• Check analytics regularly to identify trends and growth opportunities</li>
                <li>• Use the export feature to create reports and track progress over time</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
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
