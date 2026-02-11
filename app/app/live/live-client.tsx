"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, ChevronDown, Users, ShoppingCart, DollarSign, TrendingUp, ExternalLink, Monitor, Smartphone } from "lucide-react"
import { getStoreUrlWithCustomDomain } from "@/lib/url-helpers"

interface LiveClientProps {
  creatorId: string
  username: string
  todaySales: number
  todayRevenue: number
  todayOrders: any[]
  productMap: Record<string, string>
  connectedDomain: string | null
  storePublished: boolean
}

type DateRange = "today" | "7d" | "30d"

interface ActivityEvent {
  id: string
  type: "view" | "sale" | "visit"
  text: string
  timestamp: string
}

export function LiveClient({
  creatorId,
  username,
  todaySales: initialTodaySales,
  todayRevenue: initialTodayRevenue,
  todayOrders,
  productMap,
  connectedDomain,
  storePublished,
}: LiveClientProps) {
  const router = useRouter()
  const [liveVisitors, setLiveVisitors] = useState(0)
  const [todaySales, setTodaySales] = useState(initialTodaySales)
  const [todayRevenue, setTodayRevenue] = useState(initialTodayRevenue)
  const [todayViews, setTodayViews] = useState(0)
  const [conversionRate, setConversionRate] = useState(0)
  const [dateRange, setDateRange] = useState<DateRange>("7d")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop")

  const storeUrl = getStoreUrlWithCustomDomain(username, connectedDomain)

  const formatCurrency = (cents: number) => {
    const value = cents / 100
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value)
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diff < 60) return "just now"
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  // Fetch live visitors (active in last 5 minutes)
  const fetchLiveVisitors = useCallback(async () => {
    const supabase = createClient()
    try {
      const fiveMinutesAgo = new Date()
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5)

      const { data: recentViews } = await supabase
        .from("analytics_events")
        .select("visitor_id, session_id")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")
        .gte("created_at", fiveMinutesAgo.toISOString())

      const uniqueVisitors = new Set(
        (recentViews || [])
          .map((e: any) => e.visitor_id || e.session_id)
          .filter(Boolean)
      )

      setLiveVisitors(uniqueVisitors.size)
    } catch (error) {
      console.error("Error fetching live visitors:", error)
    }
  }, [creatorId])

  // Fetch today's analytics stats
  const fetchTodayStats = useCallback(async () => {
    const supabase = createClient()
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: views } = await supabase
        .from("analytics_events")
        .select("id")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")
        .gte("created_at", todayStart.toISOString())

      const viewCount = views?.length || 0
      setTodayViews(viewCount)

      // Conversion rate = sales / views * 100
      if (viewCount > 0 && todaySales > 0) {
        setConversionRate(Math.round((todaySales / viewCount) * 1000) / 10)
      } else {
        setConversionRate(0)
      }
    } catch (error) {
      console.error("Error fetching today stats:", error)
    }
  }, [creatorId, todaySales])

  // Fetch recent activity events
  const fetchActivity = useCallback(async () => {
    const supabase = createClient()
    try {
      const rangeStart = new Date()
      if (dateRange === "today") {
        rangeStart.setHours(0, 0, 0, 0)
      } else if (dateRange === "7d") {
        rangeStart.setDate(rangeStart.getDate() - 7)
      } else {
        rangeStart.setDate(rangeStart.getDate() - 30)
      }

      // Fetch recent views
      const { data: recentViews } = await supabase
        .from("analytics_events")
        .select("id, event_type, page_path, created_at, visitor_id")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")
        .gte("created_at", rangeStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(30)

      const events: ActivityEvent[] = []

      // Add view events
      for (const v of recentViews || []) {
        const page = v.page_path === "/links" ? "OnePage" : v.page_path?.includes("/product/") ? "product page" : "store"
        events.push({
          id: v.id,
          type: "view",
          text: `Visitor viewed your ${page}`,
          timestamp: v.created_at,
        })
      }

      // Add sale events from today's orders
      for (const order of todayOrders) {
        const productName = productMap[order.product_id] || "a product"
        events.push({
          id: order.id,
          type: "sale",
          text: `New sale: ${productName} (${formatCurrency(order.amount_cents)})`,
          timestamp: order.created_at,
        })
      }

      // Sort by timestamp descending
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      setActivity(events.slice(0, 50))
    } catch (error) {
      console.error("Error fetching activity:", error)
    }
  }, [creatorId, dateRange, todayOrders, productMap])

  // Poll live visitors every 3 seconds
  useEffect(() => {
    fetchLiveVisitors()
    const interval = setInterval(fetchLiveVisitors, 3000)
    return () => clearInterval(interval)
  }, [fetchLiveVisitors])

  // Fetch stats on mount
  useEffect(() => {
    fetchTodayStats()
  }, [fetchTodayStats])

  // Fetch activity on mount and when date range changes
  useEffect(() => {
    fetchActivity()
  }, [fetchActivity])

  const dateRangeOptions = [
    { value: "today" as DateRange, label: "Today" },
    { value: "7d" as DateRange, label: "Last 7 days" },
    { value: "30d" as DateRange, label: "Last 30 days" },
  ]

  const selectedLabel = dateRangeOptions.find(o => o.value === dateRange)?.label || "Last 7 days"

  return (
    <div className="min-h-full bg-[#f8f8fa]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/app")}
              className="w-9 h-9 rounded-xl bg-white border border-[#e5e7eb] flex items-center justify-center hover:bg-[#f9fafb] transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 text-[#6b7280]" />
            </button>
            <h1 className="text-[20px] sm:text-[24px] font-semibold text-[#111827]">Live</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Date Range Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors cursor-pointer"
              >
                {selectedLabel}
                <ChevronDown className="h-3.5 w-3.5 text-[#9ca3af]" />
              </button>
              {isDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                    {dateRangeOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setDateRange(option.value)
                          setIsDropdownOpen(false)
                        }}
                        className={`w-full text-left px-4 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
                          dateRange === option.value
                            ? "bg-[#f5f3ff] text-[#7c3aed]"
                            : "text-[#374151] hover:bg-[#f9fafb]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Live Status Pill */}
            <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#e5e7eb] rounded-xl">
              <div
                className={`w-2 h-2 rounded-full ${
                  liveVisitors > 0
                    ? "bg-[#6b7280] shadow-[0_0_6px_rgba(107,114,128,0.4)]"
                    : "bg-[#d1d5db]"
                }`}
                style={{
                  animation: liveVisitors > 0 ? "pulse-glow-neutral 2s ease-in-out infinite" : "none",
                }}
              />
              <span className="text-[13px] font-medium text-[#6b7280]">
                {liveVisitors} live
              </span>
            </div>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {[
            {
              label: "Visitors right now",
              value: liveVisitors.toString(),
              icon: Users,
            },
            {
              label: "Sales today",
              value: todaySales.toString(),
              icon: ShoppingCart,
            },
            {
              label: "Revenue today",
              value: formatCurrency(todayRevenue),
              icon: DollarSign,
            },
            {
              label: "Conversion rate",
              value: `${conversionRate}%`,
              icon: TrendingUp,
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="bg-white rounded-2xl p-4 sm:p-5 border border-[#e5e7eb]/80 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <metric.icon className="h-3.5 w-3.5 text-[#9ca3af]" />
                <p className="text-[11px] sm:text-[12px] font-medium text-[#9ca3af] uppercase tracking-wide">{metric.label}</p>
              </div>
              <p className="text-[24px] sm:text-[28px] font-bold text-[#111827] leading-none">{metric.value}</p>
            </div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Live Activity - Takes 2 columns */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e5e7eb]/80 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f3f4f6]">
              <h2 className="text-[15px] font-semibold text-[#111827]">Live Activity</h2>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {activity.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="w-10 h-10 rounded-full bg-[#f3f4f6] flex items-center justify-center mb-3">
                    <Users className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                  <p className="text-[14px] font-medium text-[#6b7280] mb-1">No activity yet</p>
                  <p className="text-[12px] text-[#9ca3af] text-center max-w-[240px]">
                    Activity will appear here when visitors view your store or make purchases.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#f3f4f6]">
                  {activity.map((event) => (
                    <div key={event.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafafa] transition-colors">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        event.type === "sale" ? "bg-[#7c3aed]" : "bg-[#d1d5db]"
                      }`} />
                      <p className="text-[13px] text-[#374151] flex-1 min-w-0 truncate">{event.text}</p>
                      <span className="text-[11px] text-[#9ca3af] shrink-0 font-medium">{formatTime(event.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Insight Card - Right column */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/80 shadow-sm p-5 flex flex-col">
            <h2 className="text-[15px] font-semibold text-[#111827] mb-3">Insight</h2>
            <div className="flex-1">
              {todaySales > 0 ? (
                <p className="text-[13px] text-[#6b7280] leading-relaxed">
                  You&apos;ve made <span className="font-semibold text-[#111827]">{todaySales} sale{todaySales !== 1 ? "s" : ""}</span> today
                  earning <span className="font-semibold text-[#111827]">{formatCurrency(todayRevenue)}</span>.
                  {conversionRate > 0 && ` Your conversion rate is ${conversionRate}%.`}
                  {" "}Keep sharing your store link to maintain momentum.
                </p>
              ) : liveVisitors > 0 ? (
                <p className="text-[13px] text-[#6b7280] leading-relaxed">
                  You have <span className="font-semibold text-[#111827]">{liveVisitors} visitor{liveVisitors !== 1 ? "s" : ""}</span> browsing
                  your store right now. Make sure your products and pricing are compelling to convert visitors into buyers.
                </p>
              ) : todayViews > 0 ? (
                <p className="text-[13px] text-[#6b7280] leading-relaxed">
                  You&apos;ve had <span className="font-semibold text-[#111827]">{todayViews} view{todayViews !== 1 ? "s" : ""}</span> today
                  but no sales yet. Consider sharing your store on social media or updating your product descriptions.
                </p>
              ) : (
                <p className="text-[13px] text-[#6b7280] leading-relaxed">
                  No activity yet today. Share your store link on social media, your bio, or with your audience to start getting visitors.
                </p>
              )}
            </div>
            <div className="mt-4">
              <button
                onClick={() => router.push("/app/analytics")}
                className="w-full px-4 py-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-[13px] font-semibold rounded-xl transition-colors cursor-pointer"
              >
                View Analytics
              </button>
            </div>
          </div>
        </div>

        {/* Store Preview */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/80 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f3f4f6] flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#111827]">Store Preview</h2>
            <div className="flex items-center gap-2">
              {/* Desktop / Mobile Toggle */}
              <div className="flex items-center bg-[#f3f4f6] rounded-lg p-0.5">
                <button
                  onClick={() => setPreviewMode("desktop")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
                    previewMode === "desktop"
                      ? "bg-white text-[#111827] shadow-sm"
                      : "text-[#6b7280] hover:text-[#374151]"
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Desktop
                </button>
                <button
                  onClick={() => setPreviewMode("mobile")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
                    previewMode === "mobile"
                      ? "bg-white text-[#111827] shadow-sm"
                      : "text-[#6b7280] hover:text-[#374151]"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile
                </button>
              </div>
              <button
                onClick={() => window.open(storeUrl, "_blank", "noopener,noreferrer")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#111827] hover:bg-[#1f2937] text-white text-[12px] font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Open Store
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="p-4 sm:p-6 flex justify-center bg-[#fafafa]">
            <div className={`bg-white rounded-xl border border-[#e5e7eb] overflow-hidden shadow-sm transition-all duration-200 ${
              previewMode === "desktop" ? "w-full max-w-[800px] h-[420px]" : "w-[375px] h-[600px]"
            }`}>
              <iframe
                src={storeUrl}
                title="Store Preview"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        </div>
      </div>

      {/* CSS for neutral pulse animation */}
      <style jsx>{`
        @keyframes pulse-glow-neutral {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
