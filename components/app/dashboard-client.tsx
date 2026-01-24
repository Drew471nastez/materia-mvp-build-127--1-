"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Eye,
  ShoppingCart,
  DollarSign,
  TrendingUp,
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

// Icon mapping for setup steps
const stepIcons: Record<string, any> = {
  welcome: User,
  branding: Palette,
  product: Package,
  payouts: CreditCard,
  onepage: Link2,
  sale: Trophy,
}

interface DashboardClientProps {
  creatorId: string
  displayName: string
  initialSetupSteps: SetupStep[]
  productIds: string[]
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
    value: "last_48_hours",
    label: "Last 48 hours",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setTime(end.getTime() - 48 * 60 * 60 * 1000)
      return { start, end }
    },
  },
  {
    value: "last_7_days",
    label: "Last 7 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      return { start, end }
    },
  },
  {
    value: "last_30_days",
    label: "Last 30 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 29)
      start.setHours(0, 0, 0, 0)
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
      start.setDate(start.getDate() - 89)
      start.setHours(0, 0, 0, 0)
      return { start, end }
    },
  },
  {
    value: "last_365_days",
    label: "Last 365 days",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 364)
      start.setHours(0, 0, 0, 0)
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
      start.setHours(0, 0, 0, 0)
      return { start, end }
    },
  },
]

// Helper function to format period text naturally
const formatPeriodText = (timeframeValue: string): string => {
  switch (timeframeValue) {
    case "today":
      return "today"
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

export function DashboardClient({
  creatorId,
  displayName,
  initialSetupSteps,
  productIds,
}: DashboardClientProps) {
  const [timeframe, setTimeframe] = useState("last_7_days")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [analyticsData, setAnalyticsData] = useState({
    totalViews: 0,
    totalOrders: 0,
    totalRevenue: 0,
    conversionRate: 0,
    periodViews: 0,
    periodOrders: 0,
    periodRevenue: 0,
  })

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const fetchAnalytics = async (selectedTimeframe: string) => {
    setIsLoading(true)
    const supabase = createClient()

    try {
      const option = timeframeOptions.find((o) => o.value === selectedTimeframe)
      if (!option) return

      const { start, end } = option.getDates()

      // Fetch views for the period
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

      // Fetch orders for the period
      let periodOrders = 0
      let periodRevenue = 0

      if (productIds.length > 0) {
        const { data: orders } = await supabase
          .from("orders")
          .select("amount_cents")
          .eq("status", "completed")
          .in("product_id", productIds)
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())

        periodOrders = orders?.length || 0
        periodRevenue = orders?.reduce((sum: number, o: any) => sum + (o?.amount_cents || 0), 0) || 0
      }

      // Fetch all-time totals
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

      let totalOrders = 0
      let totalRevenue = 0

      if (productIds.length > 0) {
        const { data: allOrders } = await supabase
          .from("orders")
          .select("amount_cents")
          .eq("status", "completed")
          .in("product_id", productIds)

        totalOrders = allOrders?.length || 0
        totalRevenue = allOrders?.reduce((sum: number, o: any) => sum + (o?.amount_cents || 0), 0) || 0
      }

      const conversionRate = periodViews > 0 ? (periodOrders / periodViews) * 100 : 0

      setAnalyticsData({
        totalViews,
        totalOrders,
        totalRevenue,
        conversionRate: Number(conversionRate.toFixed(2)),
        periodViews,
        periodOrders,
        periodRevenue,
      })
    } catch (error) {
      console.error("Error fetching analytics:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics(timeframe)
  }, [timeframe, creatorId])

  // Close dropdown when clicking outside
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

  return (
    <div className="bg-[#f8f9fa] min-h-svh">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto pb-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">
              Welcome back, {displayName}
            </h1>
            <p className="text-[14px] text-[#6b7280] mt-1">Here's what's happening with your store</p>
          </div>
          <div className="relative timeframe-dropdown">
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
        </div>

        {/* Stats Cards */}
        <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8 ${isLoading ? "opacity-60" : ""}`}>
          {/* Total Views */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#6b7280]">Total Views</span>
              <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                <Eye className="h-4 w-4 text-[#9ca3af]" />
              </div>
            </div>
            <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
              {analyticsData.totalViews.toLocaleString()}
            </div>
            <p className="text-[12px] text-[#9ca3af] mt-1">
              {analyticsData.periodViews.toLocaleString()} {formatPeriodText(timeframe)}
            </p>
          </div>

          {/* Total Orders */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#6b7280]">Total Orders</span>
              <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                <ShoppingCart className="h-4 w-4 text-[#9ca3af]" />
              </div>
            </div>
            <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
              {analyticsData.totalOrders.toLocaleString()}
            </div>
            <p className="text-[12px] text-[#9ca3af] mt-1">
              {analyticsData.periodOrders.toLocaleString()} {formatPeriodText(timeframe)}
            </p>
          </div>

          {/* Total Revenue */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#6b7280]">Total Revenue</span>
              <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-[#9ca3af]" />
              </div>
            </div>
            <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
              {formatCurrency(analyticsData.totalRevenue)}
            </div>
            <p className="text-[12px] text-[#9ca3af] mt-1">
              {formatCurrency(analyticsData.periodRevenue)} {formatPeriodText(timeframe)}
            </p>
          </div>

          {/* Conversion Rate */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#6b7280]">Conversion Rate</span>
              <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
              </div>
            </div>
            <div className="text-[28px] font-semibold text-[#1a1a2e] tracking-tight">
              {analyticsData.conversionRate.toFixed(2)}%
            </div>
            <p className="text-[12px] text-[#9ca3af] mt-1">Views to orders</p>
          </div>
        </div>

        {/* Storelib Promotional Banner - Desktop Only */}
        <div className="hidden lg:block mb-8">
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1541367777708-7905fe3296c0?w=1200&h=300&fit=crop')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent" />
            <div className="relative z-10 flex items-center justify-between px-8 py-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[15px] font-semibold text-white">Storelib Editions</span>
                  <span className="text-white/60">|</span>
                  <span className="text-[15px] text-white/90">Winter '26</span>
                </div>
                <p className="text-[20px] font-medium text-white mb-4">The commerce renaissance is here.</p>
                <div className="flex items-center gap-3">
                  <Link
                    href="/editions"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-[13px] font-semibold text-[#1a1a2e] hover:bg-white/90 transition-colors"
                  >
                    Explore 150+ updates
                  </Link>
                  <Link
                    href="/editions"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-[13px] font-medium text-white hover:bg-white/20 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    /editions
                  </Link>
                </div>
              </div>
              <div className="hidden xl:block">
                {/* Decorative illustration placeholder */}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid - Store Setup + Quick Actions */}
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Left Column - Store Setup Checklist */}
          {!allCompleted && (
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-fit">
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

              {/* Steps List */}
              <div className="space-y-1">
                {initialSetupSteps.map((step) => {
                  const Icon = stepIcons[step.id] || Package

                  return (
                    <Link
                      key={step.id}
                      href={step.href}
                      className="group relative flex items-center gap-3 p-3 rounded-xl hover:bg-[#f9fafb] transition-all duration-150"
                      title={step.tooltip}
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

                      {/* Arrow on hover for incomplete steps */}
                      {!step.completed && (
                        <ChevronRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] shrink-0 transition-colors" />
                      )}

                      {/* Tooltip on hover - hidden on mobile */}
                      <div className="hidden lg:block absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200">
                        <div className="bg-[#1a1a2e] text-white text-[11px] px-3 py-2 rounded-lg shadow-lg max-w-[200px] whitespace-normal">
                          {step.tooltip}
                          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-4 border-transparent border-r-[#1a1a2e]" />
                        </div>
                      </div>
                    </Link>
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
              <div className="hidden sm:block w-20 h-20 rounded-xl bg-gradient-to-br from-[#f9fafb] to-[#f3f4f6] overflow-hidden">
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-[#d1d5db]" />
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
    </div>
  )
}
