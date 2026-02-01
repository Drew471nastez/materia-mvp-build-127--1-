"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Eye,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Check,
  ChevronRight,
  ArrowRight,
  ChevronDown,
  Sparkles,
  Image as ImageIcon,
  Package,
  Link2,
  Trophy,
  User,
  Palette,
  CreditCard,
  ExternalLink,
  X,
  Camera,
  FileText,
  Type,
  Wallet,
  Share2,
  Blocks,
  BarChart3,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface SetupStep {
  id: string
  title: string
  description: string
  tooltip: string
  completed: boolean
  href: string
}

interface ChartDataPoint {
  label: string
  value: number
  secondaryValue?: number
}

type KPIType = "views" | "orders" | "revenue" | null

// Icon mapping for setup steps
const stepIcons: Record<string, any> = {
  welcome: User,
  branding: Palette,
  product: Package,
  payouts: CreditCard,
  onepage: Link2,
  sale: Trophy,
}

// Substeps for each main step
const stepSubsteps: Record<string, { label: string; check: (data: any) => boolean; href: string }[]> = {
  welcome: [
    { label: "Account created", check: () => true, href: "/app/settings" },
  ],
  branding: [
    { label: "Add profile photo", check: (d) => !!d.hasAvatar, href: "/app/settings" },
    { label: "Set display name", check: (d) => !!d.hasName, href: "/app/settings" },
    { label: "Write your bio", check: (d) => !!d.hasBio, href: "/app/settings" },
  ],
  product: [
    { label: "Create a product", check: (d) => d.hasProducts, href: "/app/products/new" },
  ],
  payouts: [
    { label: "Connect Stripe", check: (d) => d.hasPayouts, href: "/app/payouts" },
  ],
  onepage: [
    { label: "Create OnePage", check: (d) => d.hasOnePage, href: "/app/onepage" },
    { label: "Add content blocks", check: (d) => d.hasOnePageBlock, href: "/app/onepage" },
  ],
  sale: [
    { label: "Share your link", check: () => false, href: "/app/onepage" },
    { label: "Get first sale", check: (d) => d.hasFirstSale, href: "/app/sales" },
  ],
}

interface Order {
  id: string
  product_id: string
  amount_cents: number
  status: string
  created_at: string
}

interface DashboardClientProps {
  creatorId: string
  displayName: string
  initialSetupSteps: SetupStep[]
  productIds: string[]
  initialOrders?: Order[]
  initialTotalOrders?: number
  initialTotalRevenue?: number
}

type TimeframeOption = {
  value: string
  label: string
  getDates: () => { start: Date; end: Date }
}

const timeframeOptions: TimeframeOption[] = [
  {
    value: "today",
    label: "Today",
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
    value: "last_48_hours",
    label: "Last 48 hours",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setHours(start.getHours() - 48)
      return { start, end }
    },
  },
  {
    value: "last_7_days",
    label: "Last 7 days",
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
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 90)
      return { start, end }
    },
  },
  {
    value: "last_365_days",
    label: "Last 365 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 365)
      return { start, end }
    },
  },
  {
    value: "last_year",
    label: "Last year",
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
    getDates: () => {
      const end = new Date()
      const start = new Date(2020, 0, 1) // Start from 2020
      return { start, end }
    },
  },
]

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

// Helper function to format period text naturally
const formatPeriodText = (timeframeValue: string): string => {
  switch (timeframeValue) {
    case "today":
      return "today"
    case "yesterday":
      return "yesterday"
    case "last_48_hours":
      return "in last 48h"
    case "last_7_days":
      return "in last 7 days"
    case "last_30_days":
      return "in last 30 days"
    case "this_month":
      return "this month"
    case "last_90_days":
      return "in last 90 days"
    case "last_365_days":
      return "in last 365 days"
    case "last_year":
      return "last year"
    case "all_time":
      return "all time"
    default:
      return ""
  }
}

// Progress circle component with purple accent
function ProgressCircle({ progress, size = 32 }: { progress: number; size?: number }) {
  const strokeWidth = 2.5
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#f3f4f6"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  )
}

// Mobile Bottom Sheet for Timeframe Selector with swipe-to-close (only from handle area)
function TimeframeBottomSheet({
  isOpen,
  onClose,
  options,
  selectedValue,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  options: TimeframeOption[]
  selectedValue: string
  onSelect: (value: string) => void
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = { current: 0 }
  const sheetRef = { current: null as HTMLDivElement | null }

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      // Use a small delay to ensure DOM is ready for smooth animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400) // Match the longer animation duration
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setDragY(0)
    setTimeout(() => {
      onClose()
    }, 400) // Match the longer animation duration
  }

  // Only allow drag from the handle area (top 60px of the sheet)
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetElement = sheetRef.current
    if (!sheetElement) return

    const sheetRect = sheetElement.getBoundingClientRect()
    const touchYInSheet = touch.clientY - sheetRect.top

    // Only start dragging if touch is in the handle area (top 60px)
    if (touchYInSheet <= 60) {
      startY.current = touch.clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current
    if (diff > 0) {
      // Add resistance to the drag
      setDragY(diff * 0.8)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 80) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100] md:hidden">
      {/* Backdrop with smooth fade */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-400 ease-out ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: '400ms' }}
        onClick={handleClose}
      />
      {/* Bottom Sheet with smooth spring-like animation */}
      <div
        ref={(el) => { sheetRef.current = el }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Handle bar area - this is the drag zone */}
        <div className="pt-3 pb-2">
          <button
            onClick={handleClose}
            className="w-full flex justify-center py-2 cursor-pointer touch-none"
          >
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>
        <div className="px-4 pb-4">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">Select time period</h3>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto overscroll-contain">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onSelect(option.value)
                  handleClose()
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-[15px] font-medium transition-colors ${
                  selectedValue === option.value
                    ? "bg-[#f5f3ff] text-[#8b5cf6]"
                    : "text-[#374151] hover:bg-[#f9fafb] active:bg-[#f3f4f6]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleClose}
            className="w-full mt-4 py-3 text-[15px] font-medium text-[#6b7280] bg-[#f3f4f6] rounded-xl active:bg-[#e5e7eb] transition-colors"
          >
            Cancel
          </button>
        </div>
        {/* Safe area padding for iOS */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

export function DashboardClient({
  creatorId,
  displayName,
  initialSetupSteps,
  productIds,
  initialOrders = [],
  initialTotalOrders = 0,
  initialTotalRevenue = 0,
}: DashboardClientProps) {
  const [timeframe, setTimeframe] = useState("last_7_days")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [openKPIModal, setOpenKPIModal] = useState<KPIType>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [isChartLoading, setIsChartLoading] = useState(false)
  const [analyticsData, setAnalyticsData] = useState({
    totalViews: 0,
    totalOrders: initialTotalOrders,
    totalRevenue: initialTotalRevenue,
    conversionRate: 0,
    periodViews: 0,
    periodOrders: initialTotalOrders,
    periodRevenue: initialTotalRevenue,
    // Previous period for comparison
    prevPeriodViews: 0,
    prevPeriodOrders: 0,
    prevPeriodRevenue: 0,
    prevConversionRate: 0,
  })

  const formatCurrency = (cents: number, compact = false) => {
    const value = cents / 100
    if (compact && value >= 1000) {
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`
      }
      return `$${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
    }
    // Remove decimal places if they are .00
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value)
    return formatted
  }

  // Format numbers compactly (10.5K, 1.2M, etc.)
  const formatCompactNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`
    }
    return num.toLocaleString()
  }

  const fetchAnalytics = async (selectedTimeframe: string) => {
    setIsLoading(true)
    const supabase = createClient()

    try {
      const option = timeframeOptions.find((o) => o.value === selectedTimeframe)
      if (!option) return

      const { start, end } = option.getDates()

      // Calculate previous period dates (same duration, immediately before)
      const periodDuration = end.getTime() - start.getTime()
      const prevEnd = new Date(start.getTime() - 1) // 1ms before current period start
      const prevStart = new Date(prevEnd.getTime() - periodDuration)

      // Fetch views for the current period (analytics_events are OK to fetch client-side)
      const { data: viewEvents } = await supabase
        .from("analytics_events")
        .select("id, visitor_id, session_id, product_id, created_at")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())

      const uniqueViewKeys = new Set(
        (viewEvents || [])
          .map((e: any) => {
            const identity = e.visitor_id || e.session_id
            if (!identity) return null
            return `${identity}__${e.product_id || "store"}`
          })
          .filter(Boolean)
      )

      const periodViews = uniqueViewKeys.size || 0

      // Fetch views for the previous period
      const { data: prevViewEvents } = await supabase
        .from("analytics_events")
        .select("id, visitor_id, session_id, product_id, created_at")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString())

      const prevUniqueViewKeys = new Set(
        (prevViewEvents || [])
          .map((e: any) => {
            const identity = e.visitor_id || e.session_id
            if (!identity) return null
            return `${identity}__${e.product_id || "store"}`
          })
          .filter(Boolean)
      )

      const prevPeriodViews = prevUniqueViewKeys.size || 0

      // Filter orders from initialOrders (server-side fetched data - bypasses RLS)
      const completedOrders = initialOrders.filter(o => o.status === "completed")

      // Current period orders
      const periodOrdersData = completedOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate >= start && orderDate <= end
      })
      const periodOrders = periodOrdersData.length
      const periodRevenue = periodOrdersData.reduce((sum, o) => sum + (o.amount_cents || 0), 0)

      // Previous period orders
      const prevPeriodOrdersData = completedOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate >= prevStart && orderDate <= prevEnd
      })
      const prevPeriodOrders = prevPeriodOrdersData.length
      const prevPeriodRevenue = prevPeriodOrdersData.reduce((sum, o) => sum + (o.amount_cents || 0), 0)

      // Fetch all-time views
      const { data: allViewEvents } = await supabase
        .from("analytics_events")
        .select("id, visitor_id, session_id, product_id")
        .eq("creator_id", creatorId)
        .eq("event_type", "view")

      const allUniqueViewKeys = new Set(
        (allViewEvents || [])
          .map((e: any) => {
            const identity = e.visitor_id || e.session_id
            if (!identity) return null
            return `${identity}__${e.product_id || "store"}`
          })
          .filter(Boolean)
      )

      const totalViews = allUniqueViewKeys.size || 0

      // All-time orders from initialOrders (already filtered for completed)
      const totalOrders = completedOrders.length
      const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)

      const conversionRate = periodViews > 0 ? (periodOrders / periodViews) * 100 : 0
      const prevConversionRate = prevPeriodViews > 0 ? (prevPeriodOrders / prevPeriodViews) * 100 : 0

      setAnalyticsData({
        totalViews,
        totalOrders,
        totalRevenue,
        conversionRate: Number(conversionRate.toFixed(2)),
        periodViews,
        periodOrders,
        periodRevenue,
        prevPeriodViews,
        prevPeriodOrders,
        prevPeriodRevenue,
        prevConversionRate: Number(prevConversionRate.toFixed(2)),
      })
    } catch (error) {
      console.error("Error fetching analytics:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch detailed chart data for KPI modal
  const fetchChartData = async (kpiType: KPIType) => {
    if (!kpiType) return

    setIsChartLoading(true)
    const supabase = createClient()

    try {
      const option = timeframeOptions.find((o) => o.value === timeframe)
      if (!option) return

      const { start, end } = option.getDates()
      const points: ChartDataPoint[] = []

      // Filter completed orders from initialOrders (server-side fetched data)
      const completedOrders = initialOrders.filter(o => o.status === "completed")

      // Determine grouping based on timeframe
      const isToday = timeframe === "today"
      const isAllTime = timeframe === "all_time"
      const isYear = timeframe === "last_year" || timeframe === "last_365_days"
      const isMonth = timeframe === "last_30_days" || timeframe === "this_month"
      const is90Days = timeframe === "last_90_days"

      if (isToday) {
        // Group by hour for today
        for (let hour = 0; hour <= new Date().getHours(); hour++) {
          const hourStart = new Date(start)
          hourStart.setHours(hour, 0, 0, 0)
          const hourEnd = new Date(start)
          hourEnd.setHours(hour, 59, 59, 999)

          let value = 0
          let secondaryValue = 0

          if (kpiType === "views") {
            const { data } = await supabase
              .from("analytics_events")
              .select("id, visitor_id, session_id, product_id")
              .eq("creator_id", creatorId)
              .eq("event_type", "view")
              .gte("created_at", hourStart.toISOString())
              .lte("created_at", hourEnd.toISOString())

            const uniqueKeys = new Set((data || []).map((e: any) => {
              const identity = e.visitor_id || e.session_id
              return identity ? `${identity}__${e.product_id || "store"}` : null
            }).filter(Boolean))
            value = uniqueKeys.size

            // Get clicks for secondary value
            const { data: clicks } = await supabase
              .from("analytics_events")
              .select("id")
              .eq("creator_id", creatorId)
              .eq("event_type", "click")
              .gte("created_at", hourStart.toISOString())
              .lte("created_at", hourEnd.toISOString())
            secondaryValue = clicks?.length || 0
          } else if (kpiType === "orders") {
            // Filter orders locally from initialOrders
            const periodOrders = completedOrders.filter(o => {
              const orderDate = new Date(o.created_at)
              return orderDate >= hourStart && orderDate <= hourEnd
            })
            value = periodOrders.length
          } else if (kpiType === "revenue") {
            // Filter orders locally from initialOrders
            const periodOrders = completedOrders.filter(o => {
              const orderDate = new Date(o.created_at)
              return orderDate >= hourStart && orderDate <= hourEnd
            })
            value = periodOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          }

          points.push({
            label: `${hour.toString().padStart(2, '0')}:00`,
            value,
            secondaryValue: kpiType === "views" ? secondaryValue : undefined
          })
        }
      } else if (isAllTime) {
        // Group by year for all time
        const currentYear = new Date().getFullYear()
        const startYear = 2020

        for (let year = startYear; year <= currentYear; year++) {
          const yearStart = new Date(year, 0, 1)
          const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

          let value = 0
          let secondaryValue = 0

          if (kpiType === "views") {
            const { data } = await supabase
              .from("analytics_events")
              .select("id, visitor_id, session_id, product_id")
              .eq("creator_id", creatorId)
              .eq("event_type", "view")
              .gte("created_at", yearStart.toISOString())
              .lte("created_at", yearEnd.toISOString())

            const uniqueKeys = new Set((data || []).map((e: any) => {
              const identity = e.visitor_id || e.session_id
              return identity ? `${identity}__${e.product_id || "store"}` : null
            }).filter(Boolean))
            value = uniqueKeys.size

            const { data: clicks } = await supabase
              .from("analytics_events")
              .select("id")
              .eq("creator_id", creatorId)
              .eq("event_type", "click")
              .gte("created_at", yearStart.toISOString())
              .lte("created_at", yearEnd.toISOString())
            secondaryValue = clicks?.length || 0
          } else if (kpiType === "orders") {
            const periodOrders = completedOrders.filter(o => {
              const orderDate = new Date(o.created_at)
              return orderDate >= yearStart && orderDate <= yearEnd
            })
            value = periodOrders.length
          } else if (kpiType === "revenue") {
            const periodOrders = completedOrders.filter(o => {
              const orderDate = new Date(o.created_at)
              return orderDate >= yearStart && orderDate <= yearEnd
            })
            value = periodOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          }

          points.push({
            label: year.toString(),
            value,
            secondaryValue: kpiType === "views" ? secondaryValue : undefined
          })
        }
      } else if (isYear) {
        // Group by month for year
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const currentMonth = new Date().getMonth()

        for (let month = 0; month <= currentMonth; month++) {
          const currentYear = new Date().getFullYear()
          const monthStart = new Date(currentYear, month, 1)
          const monthEnd = new Date(currentYear, month + 1, 0, 23, 59, 59, 999)

          let value = 0
          let secondaryValue = 0

          if (kpiType === "views") {
            const { data } = await supabase
              .from("analytics_events")
              .select("id, visitor_id, session_id, product_id")
              .eq("creator_id", creatorId)
              .eq("event_type", "view")
              .gte("created_at", monthStart.toISOString())
              .lte("created_at", monthEnd.toISOString())

            const uniqueKeys = new Set((data || []).map((e: any) => {
              const identity = e.visitor_id || e.session_id
              return identity ? `${identity}__${e.product_id || "store"}` : null
            }).filter(Boolean))
            value = uniqueKeys.size

            const { data: clicks } = await supabase
              .from("analytics_events")
              .select("id")
              .eq("creator_id", creatorId)
              .eq("event_type", "click")
              .gte("created_at", monthStart.toISOString())
              .lte("created_at", monthEnd.toISOString())
            secondaryValue = clicks?.length || 0
          } else if (kpiType === "orders") {
            // Filter orders locally from initialOrders
            const periodOrders = completedOrders.filter(o => {
              const orderDate = new Date(o.created_at)
              return orderDate >= monthStart && orderDate <= monthEnd
            })
            value = periodOrders.length
          } else if (kpiType === "revenue") {
            // Filter orders locally from initialOrders
            const periodOrders = completedOrders.filter(o => {
              const orderDate = new Date(o.created_at)
              return orderDate >= monthStart && orderDate <= monthEnd
            })
            value = periodOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          }

          points.push({
            label: monthNames[month],
            value,
            secondaryValue: kpiType === "views" ? secondaryValue : undefined
          })
        }
      } else if (is90Days) {
        // Group by week for 90 days (12 weeks)
        for (let week = 11; week >= 0; week--) {
          const weekStart = new Date(end)
          weekStart.setDate(weekStart.getDate() - (week * 7 + 6))
          weekStart.setHours(0, 0, 0, 0)
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekEnd.getDate() + 6)
          weekEnd.setHours(23, 59, 59, 999)

          let value = 0
          let secondaryValue = 0

          if (kpiType === "views") {
            const { data } = await supabase
              .from("analytics_events")
              .select("id, visitor_id, session_id, product_id")
              .eq("creator_id", creatorId)
              .eq("event_type", "view")
              .gte("created_at", weekStart.toISOString())
              .lte("created_at", weekEnd.toISOString())

            const uniqueKeys = new Set((data || []).map((e: any) => {
              const identity = e.visitor_id || e.session_id
              return identity ? `${identity}__${e.product_id || "store"}` : null
            }).filter(Boolean))
            value = uniqueKeys.size

            const { data: clicks } = await supabase
              .from("analytics_events")
              .select("id")
              .eq("creator_id", creatorId)
              .eq("event_type", "click")
              .gte("created_at", weekStart.toISOString())
              .lte("created_at", weekEnd.toISOString())
            secondaryValue = clicks?.length || 0
          } else if (kpiType === "orders") {
            const periodOrders = completedOrders.filter(o => {
              const orderDate = new Date(o.created_at)
              return orderDate >= weekStart && orderDate <= weekEnd
            })
            value = periodOrders.length
          } else if (kpiType === "revenue") {
            const periodOrders = completedOrders.filter(o => {
              const orderDate = new Date(o.created_at)
              return orderDate >= weekStart && orderDate <= weekEnd
            })
            value = periodOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          }

          points.push({
            label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value,
            secondaryValue: kpiType === "views" ? secondaryValue : undefined
          })
        }
      } else {
        // Group by day for 7 days / 30 days / 48 hours
        let dayCount = 7
        if (isMonth) dayCount = 10
        if (timeframe === "last_48_hours") dayCount = 2

        const dayStep = isMonth ? 3 : 1

        for (let i = dayCount - 1; i >= 0; i--) {
          const dayStart = new Date(end)
          dayStart.setDate(dayStart.getDate() - (i * dayStep))
          dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(dayStart)
          dayEnd.setDate(dayEnd.getDate() + dayStep - 1)
          dayEnd.setHours(23, 59, 59, 999)

          let value = 0
          let secondaryValue = 0

          if (kpiType === "views") {
            const { data } = await supabase
              .from("analytics_events")
              .select("id, visitor_id, session_id, product_id")
              .eq("creator_id", creatorId)
              .eq("event_type", "view")
              .gte("created_at", dayStart.toISOString())
              .lte("created_at", dayEnd.toISOString())

            const uniqueKeys = new Set((data || []).map((e: any) => {
              const identity = e.visitor_id || e.session_id
              return identity ? `${identity}__${e.product_id || "store"}` : null
            }).filter(Boolean))
            value = uniqueKeys.size

            const { data: clicks } = await supabase
              .from("analytics_events")
              .select("id")
              .eq("creator_id", creatorId)
              .eq("event_type", "click")
              .gte("created_at", dayStart.toISOString())
              .lte("created_at", dayEnd.toISOString())
            secondaryValue = clicks?.length || 0
          } else if (kpiType === "orders") {
            // Filter orders locally from initialOrders
            const periodOrders = completedOrders.filter(o => {
              const orderDate = new Date(o.created_at)
              return orderDate >= dayStart && orderDate <= dayEnd
            })
            value = periodOrders.length
          } else if (kpiType === "revenue") {
            // Filter orders locally from initialOrders
            const periodOrders = completedOrders.filter(o => {
              const orderDate = new Date(o.created_at)
              return orderDate >= dayStart && orderDate <= dayEnd
            })
            value = periodOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          }

          points.push({
            label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value,
            secondaryValue: kpiType === "views" ? secondaryValue : undefined
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

  // Fetch chart data when modal opens or timeframe changes
  useEffect(() => {
    if (openKPIModal) {
      // Reset chart data and re-fetch when timeframe changes
      setChartData([])
      fetchChartData(openKPIModal)
    }
  }, [openKPIModal, timeframe, creatorId])

  useEffect(() => {
    fetchAnalytics(timeframe)
  }, [timeframe, creatorId])

  // Close dropdown when clicking outside (desktop only)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(".timeframe-dropdown")) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const selectedOption = timeframeOptions.find((o) => o.value === timeframe)
  const completedSteps = initialSetupSteps.filter((s) => s.completed).length
  const totalSteps = initialSetupSteps.length
  const allCompleted = completedSteps === totalSteps

  // Derive completion status from steps
  const hasProducts = initialSetupSteps.find((s) => s.id === "product")?.completed || false
  const hasPayouts = initialSetupSteps.find((s) => s.id === "payouts")?.completed || false

  // Announcement bar state
  const [announcementType, setAnnouncementType] = useState<"upgrade" | "steps" | "payouts">("upgrade")
  const [announcementVisible, setAnnouncementVisible] = useState(true)
  const [progressWidth, setProgressWidth] = useState(0)

  // Rotate announcements every 15 seconds with progress bar
  useEffect(() => {
    const DURATION = 15000 // 15 seconds
    const PROGRESS_INTERVAL = 50 // Update progress every 50ms

    // Reset progress when announcement changes
    setProgressWidth(0)

    // Progress bar animation
    const progressTimer = setInterval(() => {
      setProgressWidth((prev) => {
        const newWidth = prev + (100 / (DURATION / PROGRESS_INTERVAL))
        return newWidth >= 100 ? 100 : newWidth
      })
    }, PROGRESS_INTERVAL)

    // Rotate announcements
    const rotateTimer = setTimeout(() => {
      setAnnouncementVisible(false)
      setTimeout(() => {
        setAnnouncementType((prev) => {
          if (prev === "upgrade") {
            if (!allCompleted) return "steps"
            if (hasProducts && !hasPayouts) return "payouts"
            return "upgrade"
          } else if (prev === "steps") {
            if (hasProducts && !hasPayouts) return "payouts"
            return "upgrade"
          } else {
            return "upgrade"
          }
        })
        setProgressWidth(0)
        setAnnouncementVisible(true)
      }, 300)
    }, DURATION)

    return () => {
      clearInterval(progressTimer)
      clearTimeout(rotateTimer)
    }
  }, [announcementType, allCompleted, hasProducts, hasPayouts])

  // Build substep data based on step completion
  const getSubstepData = (step: SetupStep) => {
    return {
      hasAvatar: step.id === "branding" ? step.completed : false,
      hasName: step.id === "branding" ? step.completed : false,
      hasBio: step.id === "branding" ? step.completed : false,
      hasProducts: step.id === "product" ? step.completed : false,
      hasPayouts: step.id === "payouts" ? step.completed : false,
      hasOnePage: step.id === "onepage" ? step.completed : false,
      hasOnePageBlock: step.id === "onepage" ? step.completed : false,
      hasFirstSale: step.id === "sale" ? step.completed : false,
    }
  }

  const handleStepClick = (stepId: string, e: React.MouseEvent) => {
    e.preventDefault()
    setExpandedStep(expandedStep === stepId ? null : stepId)
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fa] dashboard-scroll-container">
      {/* Announcement Bar - positioned normally in document flow */}
      <div className="bg-[#8b5cf6] text-white">
        <div className="py-2 px-4 md:py-2.5">
          <div
            className={`max-w-[1200px] mx-auto flex items-center justify-center gap-2 md:gap-3 text-center transition-opacity duration-300 ${
              announcementVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            {announcementType === "upgrade" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">Try Pro free</span>
                  <span className="hidden md:inline"> — our most popular plan for content creators and businesses.</span>
                </span>
                <Link
                  href="/upgrade"
                  className="relative inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-gray-900 to-black text-white text-[11px] md:text-[13px] font-medium rounded-full transition-all shrink-0 overflow-hidden group"
                >
                  <span className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/50 transition-colors" />
                  <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)', animation: 'laser-sweep 2s infinite linear' }} />
                  <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 relative z-10" />
                  <span className="relative z-10">Upgrade</span>
                </Link>
              </>
            )}
            {announcementType === "steps" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">Complete setup</span>
                  <span className="md:hidden"> — {completedSteps}/{totalSteps}</span>
                  <span className="hidden md:inline"> — {totalSteps - completedSteps} steps remaining to get started.</span>
                </span>
                <button
                  onClick={() => {
                    const setupSection = document.getElementById("store-setup-section")
                    setupSection?.scrollIntoView({ behavior: "smooth" })
                  }}
                  className="inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-white/90 to-gray-100/90 text-gray-800 text-[11px] md:text-[13px] font-medium rounded-full transition-all hover:from-white hover:to-gray-50 shrink-0"
                >
                  Continue
                  <ChevronRight className="h-3 w-3 md:h-3.5 md:w-3.5" />
                </button>
              </>
            )}
            {announcementType === "payouts" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">Get paid</span>
                  <span className="hidden md:inline"> — Connect your payouts to receive payments.</span>
                </span>
                <Link
                  href="/app/payouts"
                  className="inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-white/90 to-gray-100/90 text-gray-800 text-[11px] md:text-[13px] font-medium rounded-full transition-all hover:from-white hover:to-gray-50 shrink-0"
                >
                  <Wallet className="h-3 w-3 md:h-3.5 md:w-3.5" />
                  Connect
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

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">
              Welcome back, {displayName}
            </h1>
            <p className="text-[14px] text-[#6b7280] mt-1">Here's what's happening with your store</p>
          </div>

          {/* Desktop Dropdown */}
          <div className="relative timeframe-dropdown hidden md:block">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm"
            >
              {selectedOption?.label || "Last 7 days"}
              <ChevronDown
                className={`h-4 w-4 text-[#9ca3af] transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                {timeframeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setTimeframe(option.value)
                      setIsDropdownOpen(false)
                    }}
                    className={`w-full text-left px-4 py-2 text-[13px] font-medium transition-colors ${
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

          {/* Mobile Timeframe Button */}
          <button
            onClick={() => setIsMobileSheetOpen(true)}
            className="md:hidden w-fit inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] shadow-sm"
          >
            {selectedOption?.label || "Last 7 days"}
            <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
          </button>
        </div>

        {/* Mobile Bottom Sheet */}
        <TimeframeBottomSheet
          isOpen={isMobileSheetOpen}
          onClose={() => setIsMobileSheetOpen(false)}
          options={timeframeOptions}
          selectedValue={timeframe}
          onSelect={setTimeframe}
        />

        {/* Stats Cards */}
        <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8 ${isLoading ? "opacity-60" : ""}`}>
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
                    <span className="text-[11px] font-medium text-violet-600">Views</span>
                    <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedOption?.label}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isChartLoading ? (
                  <div className="h-[80px] flex items-end gap-[2px]">
                    {[35, 50, 25, 60, 40, 55, 30].map((h, i) => (
                      <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                        <div
                          className="w-full rounded-sm bg-violet-200/60 skeleton-bar"
                          style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }}
                        />
                      </div>
                    ))}
                  </div>
                ) : chartData.length === 0 || !chartData.some(d => d.value > 0) ? (
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
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-medium text-[#6b7280]">Views</span>
                  <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                    <Eye className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                </div>
                <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                  <span className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">{formatCompactNumber(analyticsData.periodViews)}</span>
                  <PercentChangeIndicator current={analyticsData.periodViews} previous={analyticsData.prevPeriodViews} />
                </div>
                <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">{formatCompactNumber(analyticsData.totalViews)} all time</p>
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
                    <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedOption?.label}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isChartLoading ? (
                  <div className="h-[80px] flex items-end gap-[2px]">
                    {[30, 45, 55, 35, 50, 40, 60].map((h, i) => (
                      <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                        <div
                          className="w-full rounded-sm bg-violet-200/60 skeleton-bar"
                          style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }}
                        />
                      </div>
                    ))}
                  </div>
                ) : chartData.length === 0 || !chartData.some(d => d.value > 0) ? (
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
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-medium text-[#6b7280]">Orders</span>
                  <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                    <ShoppingCart className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                </div>
                <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                  <span className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">{formatCompactNumber(analyticsData.periodOrders)}</span>
                  <PercentChangeIndicator current={analyticsData.periodOrders} previous={analyticsData.prevPeriodOrders} />
                </div>
                <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">{formatCompactNumber(analyticsData.totalOrders)} all time</p>
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
                    <span className="text-[10px] text-[#9ca3af] hidden sm:inline">• {selectedOption?.label}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isChartLoading ? (
                  <div className="h-[80px] flex items-end gap-[2px]">
                    {[40, 55, 30, 50, 45, 35, 55].map((h, i) => (
                      <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
                        <div
                          className="w-full rounded-sm bg-violet-200/60 skeleton-bar"
                          style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }}
                        />
                      </div>
                    ))}
                  </div>
                ) : chartData.length === 0 || !chartData.some(d => d.value > 0) ? (
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
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-medium text-[#6b7280]">Revenue</span>
                  <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                    <DollarSign className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                </div>
                <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                  <span className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">{formatCurrency(analyticsData.periodRevenue)}</span>
                  <PercentChangeIndicator current={analyticsData.periodRevenue} previous={analyticsData.prevPeriodRevenue} />
                </div>
                <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">{formatCurrency(analyticsData.totalRevenue)} all time</p>
              </>
            )}
          </div>

          {/* Conversion Rate */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#6b7280]">Conversion Rate</span>
              <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
              </div>
            </div>
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
              <span className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">{analyticsData.conversionRate.toFixed(2)}%</span>
              <PercentChangeIndicator current={analyticsData.conversionRate} previous={analyticsData.prevConversionRate} />
            </div>
            <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">Views to orders</p>
          </div>
        </div>

        {/* Storelib Promotional Banner - Responsive for all devices */}
        <div className="mb-8">
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1541367777708-7905fe3296c0?w=1200&h=300&fit=crop')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />
            <div className="relative z-10 px-5 py-5 sm:px-8 sm:py-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] sm:text-[15px] font-semibold text-white">Storelib Editions</span>
                <span className="text-white/60 hidden sm:inline">|</span>
                <span className="text-[13px] sm:text-[15px] text-white/90 hidden sm:inline">Winter '26</span>
              </div>
              <p className="text-[16px] sm:text-[20px] font-medium text-white mb-3 sm:mb-4">The commerce renaissance is here.</p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Link
                  href="/editions"
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg text-[12px] sm:text-[13px] font-semibold text-[#1a1a2e] hover:bg-white/90 transition-colors"
                >
                  Explore updates
                </Link>
                <Link
                  href="/editions"
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-[12px] sm:text-[13px] font-medium text-white hover:bg-white/20 transition-colors"
                >
                  <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">/editions</span>
                  <span className="sm:hidden">View</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid - Store Setup + Quick Actions */}
        <div className="grid gap-6 lg:grid-cols-[370px_1fr]">
          {/* Left Column - Store Setup Checklist */}
          {!allCompleted && (
            <div id="store-setup-section" className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-fit">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-semibold text-[#1a1a2e]">Store setup</h2>
                <span className="text-[13px] font-medium text-[#6b7280] bg-[#f3f4f6] px-2.5 py-1 rounded-full">
                  {completedSteps}/{totalSteps}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[#f3f4f6] rounded-full mb-5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#8b5cf6] to-[#a78bfa] rounded-full transition-all duration-500"
                  style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                />
              </div>

              {/* Steps List with Collapsible Substeps */}
              <div className="space-y-1">
                {initialSetupSteps.map((step) => {
                  const Icon = stepIcons[step.id] || Package
                  const isExpanded = expandedStep === step.id
                  const substeps = stepSubsteps[step.id] || []
                  const substepData = getSubstepData(step)

                  return (
                    <div key={step.id}>
                      <button
                        onClick={(e) => handleStepClick(step.id, e)}
                        className="group relative flex items-center gap-3 p-3 rounded-xl hover:bg-[#f9fafb] transition-all duration-150 w-full text-left"
                      >
                        {/* Checkmark or Progress circle */}
                        <div className="relative shrink-0">
                          {step.completed ? (
                            <div className="w-8 h-8 rounded-full bg-[#8b5cf6] flex items-center justify-center">
                              <Check className="h-4 w-4 text-white" strokeWidth={2.5} />
                            </div>
                          ) : (
                            <div className="relative">
                              <ProgressCircle progress={0} size={32} />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Icon className="h-3.5 w-3.5 text-[#9ca3af]" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-[13px] font-medium ${step.completed ? "text-[#8b5cf6]" : "text-[#1a1a2e]"}`}
                          >
                            {step.title}
                          </p>
                          <p className="text-[11px] text-[#9ca3af] mt-0.5 truncate">{step.description}</p>
                        </div>

                        {/* Expand/Collapse Arrow */}
                        <ChevronDown
                          className={`h-4 w-4 text-[#d1d5db] shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        />

                        {/* Tooltip on hover - hidden on mobile, wider on desktop */}
                        <div className="hidden lg:block absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                          <div className="bg-[#1a1a2e] text-white text-[12px] px-4 py-2.5 rounded-xl shadow-lg w-[220px] whitespace-normal leading-relaxed">
                            {step.tooltip}
                            <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-4 border-transparent border-r-[#1a1a2e]" />
                          </div>
                        </div>
                      </button>

                      {/* Collapsible Substeps */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ease-out ${
                          isExpanded ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
                        }`}
                      >
                        <div className="pl-11 pr-3 pb-2 space-y-1">
                          {substeps.map((substep, idx) => {
                            const isSubstepComplete = substep.check(substepData)
                            return (
                              <Link
                                key={idx}
                                href={substep.href}
                                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[#f5f3ff]/50 transition-colors"
                              >
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                  isSubstepComplete
                                    ? "bg-[#8b5cf6] border-[#8b5cf6]"
                                    : "border-[#d1d5db]"
                                }`}>
                                  {isSubstepComplete && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                </div>
                                <span className={`text-[12px] ${
                                  isSubstepComplete ? "text-[#8b5cf6]" : "text-[#6b7280]"
                                }`}>
                                  {substep.label}
                                </span>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Right Column - Quick Actions */}
          <div className="space-y-4">
            {/* Add a product card */}
            <Link
              href="/app/products/new"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#f5f3ff] to-[#ede9fe]">
                <Package className="h-6 w-6 text-[#8b5cf6]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    Add a product
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">Go from idea to product offer in minutes</p>
              </div>
              <div className="hidden sm:block w-20 h-20 rounded-xl bg-[#f3f4f6] overflow-hidden">
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-[#9ca3af]" />
                </div>
              </div>
            </Link>

            {/* Market your products card */}
            <Link
              href="/app/onepage"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#ecfdf5] to-[#d1fae5]">
                <Link2 className="h-6 w-6 text-[#10b981]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    Edit your OnePage
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">Customize your link-in-bio page</p>
              </div>
            </Link>

            {/* View analytics card */}
            <Link
              href="/app/analytics"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#fef3c7] to-[#fde68a]">
                <TrendingUp className="h-6 w-6 text-[#f59e0b]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    View analytics
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">See how your store is performing</p>
              </div>
            </Link>
          </div>
        </div>

        {/* All setup completed celebration */}
        {allCompleted && (
          <div className="mt-6 bg-gradient-to-r from-[#f5f3ff] via-[#ede9fe] to-[#f5f3ff] rounded-2xl border border-[#8b5cf6]/20 p-6">
            <div className="flex items-center gap-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#8b5cf6]">
                <Trophy className="h-7 w-7 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[17px] font-semibold text-[#1a1a2e]">You're all set up!</h3>
                  <Sparkles className="h-5 w-5 text-[#8b5cf6]" />
                </div>
                <p className="text-[14px] text-[#6b7280] mt-1">
                  Your store is ready to go. Keep creating products and sharing your links to grow your audience.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dashboard Scrollbar Styles */}
      <style jsx>{`
        @keyframes laser-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
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
        .dashboard-scroll-container {
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
        }
        .dashboard-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .dashboard-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .dashboard-scroll-container::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 3px;
        }
        .dashboard-scroll-container::-webkit-scrollbar-thumb:hover {
          background-color: rgba(156, 163, 175, 0.7);
        }
        @media (max-width: 768px) {
          .dashboard-scroll-container::-webkit-scrollbar {
            display: none;
          }
          .dashboard-scroll-container {
            scrollbar-width: none;
          }
        }
      `}</style>
    </div>
  )
}
