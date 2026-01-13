"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Eye, ShoppingCart, DollarSign, Globe, TrendingUp } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
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

export function AnalyticsClient({ creatorId, products }: AnalyticsClientProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [timeframe, setTimeframe] = useState("last_7_days")
  const [selectedProduct, setSelectedProduct] = useState("all")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

  const [summary, setSummary] = useState<Summary>({
    totalViews: 0,
    totalOrders: 0,
    totalRevenue: 0,
    conversionRate: 0,
  })

  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([])
  const [countryData, setCountryData] = useState<CountryData[]>([])
  const [deviceData, setDeviceData] = useState<DeviceData[]>([])
  const [topProducts, setTopProducts] = useState<TopProductData[]>([])

  const fetchAnalytics = async () => {
    setIsLoading(true)
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
    } catch (error) {
      console.error("Error fetching analytics:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [timeframe, selectedProduct, customStart, customEnd])

  const handleCustomRangeApply = () => {
    if (customStart && customEnd) {
      fetchAnalytics()
    }
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

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex gap-4 flex-col sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label>Timeframe</Label>
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger>
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

        <div className="flex-1 space-y-2">
          <Label>Product</Label>
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger>
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

      {/* Custom date range inputs */}
      {timeframe === "custom" && (
        <div className="flex gap-4 flex-col sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label>Start Date</Label>
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </div>
          <div className="flex-1 space-y-2">
            <Label>End Date</Label>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
          <Button onClick={handleCustomRangeApply} disabled={!customStart || !customEnd}>
            Apply
          </Button>
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-semibold">{summary.totalViews.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-semibold">{summary.totalOrders.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-semibold">{formatPrice(summary.totalRevenue)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-semibold">{summary.conversionRate.toFixed(2)}%</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      {!isLoading && trendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Views & Sales Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke="hsl(var(--chart-1))"
                    fillOpacity={1}
                    fill="url(#colorViews)"
                    name="Views"
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="hsl(var(--chart-2))"
                    fillOpacity={1}
                    fill="url(#colorSales)"
                    name="Sales"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state for trend */}
      {!isLoading && trendData.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center h-[200px]">
            <p className="text-muted-foreground">No data for this timeframe</p>
          </CardContent>
        </Card>
      )}

      {/* Traffic Sources */}
      {!isLoading && trafficSources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Traffic Sources</CardTitle>
          </CardHeader>
          <CardContent>
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
                    <TableCell className="text-right">{source.conversionRate.toFixed(2)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty state for traffic */}
      {!isLoading && trafficSources.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center h-[200px]">
            <p className="text-muted-foreground">No traffic data for this timeframe</p>
          </CardContent>
        </Card>
      )}

      {/* Analytics by Country */}
      {!isLoading && countryData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Analytics by Country
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="table">
              <TabsList className="mb-4">
                <TabsTrigger value="table">Table View</TabsTrigger>
              </TabsList>

              <TabsContent value="table">
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
                        <TableCell className="text-right">{country.conversionRate.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Empty state for country data */}
      {!isLoading && countryData.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center h-[200px]">
            <p className="text-muted-foreground">No country data for this timeframe</p>
          </CardContent>
        </Card>
      )}

      {/* Traffic by Device */}
      {!isLoading && deviceData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Traffic by Device</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deviceData.map((device) => (
                  <TableRow key={device.device}>
                    <TableCell className="font-medium">{formatDeviceName(device.device)}</TableCell>
                    <TableCell className="text-right">{device.views.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{device.orders.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{device.conversionRate.toFixed(2)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty state for device data */}
      {!isLoading && deviceData.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center h-[200px]">
            <p className="text-muted-foreground">No device data for this timeframe</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && topProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent>
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
                            src={product.cover_image || "/placeholder.svg"}
                            alt={product.title}
                            className="w-10 h-10 rounded object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">No image</span>
                          </div>
                        )}
                        <span className="font-medium">{product.title}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{product.views.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{product.orders.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatPrice(product.revenue)}</TableCell>
                    <TableCell className="text-right">{product.conversionRate.toFixed(2)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isLoading && topProducts.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center h-[200px]">
            <p className="text-muted-foreground">No product data for this timeframe</p>
          </CardContent>
        </Card>
      )}
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
