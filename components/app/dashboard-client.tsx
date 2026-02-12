"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
  Globe,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/i18n"
import { getLinksUrl, getStoreUrl } from "@/lib/url-helpers"
import { useToast } from "@/hooks/use-toast"
import { DashboardDynamicBanner, type BannerContext } from "@/components/app/dashboard-banner"

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

// Substeps for each main step - using translation keys
const stepSubsteps: Record<string, { labelKey: string; check: (data: any) => boolean; href: string }[]> = {
  welcome: [
    { labelKey: "setup.accountCreated", check: () => true, href: "/app/settings" },
  ],
  branding: [
    { labelKey: "setup.addPhoto", check: (d) => !!d.hasAvatar, href: "/app/settings" },
    { labelKey: "setup.setName", check: (d) => !!d.hasName, href: "/app/settings" },
    { labelKey: "setup.writeBio", check: (d) => !!d.hasBio, href: "/app/settings" },
  ],
  product: [
    { labelKey: "setup.createAProduct", check: (d) => d.hasProducts, href: "/app/products/new" },
  ],
  payouts: [
    { labelKey: "setup.connectStripe", check: (d) => d.hasPayouts, href: "/app/payouts" },
  ],
  onepage: [
    { labelKey: "setup.createOnePage", check: (d) => d.hasOnePage, href: "/app/onepage" },
    { labelKey: "setup.addBlocks", check: (d) => d.hasOnePageBlock, href: "/app/onepage" },
  ],
  sale: [
    { labelKey: "setup.shareLink", check: () => false, href: "/app/onepage" },
    { labelKey: "setup.getFirstSale", check: (d) => d.hasFirstSale, href: "/app/sales" },
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
  creatorHandle?: string
  connectedDomain?: string | null
  currentPlan?: "free" | "growth" | "pro"
  productCount?: number
}

function ChainLinkIcon({ className = "w-4 h-4", stroke = "#ffffff" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M10.0002 13C10.4297 13.5741 10.9776 14.0491 11.6067 14.3929C12.2359 14.7367 12.9317 14.9411 13.6468 14.9923C14.362 15.0435 15.0798 14.9403 15.7515 14.6897C16.4233 14.4392 17.0333 14.047 17.5402 13.54L20.5402 10.54C21.451 9.59695 21.955 8.33394 21.9436 7.02296C21.9322 5.71198 21.4063 4.45791 20.4793 3.53087C19.5523 2.60383 18.2982 2.07799 16.9872 2.0666C15.6762 2.0552 14.4132 2.55918 13.4702 3.46997L11.7502 5.17997M14.0002 11C13.5707 10.4258 13.0228 9.95078 12.3936 9.60703C11.7645 9.26327 11.0687 9.05885 10.3535 9.00763C9.63841 8.95641 8.92061 9.0596 8.24885 9.31018C7.5771 9.56077 6.96709 9.9529 6.4602 10.46L3.4602 13.46C2.54941 14.403 2.04544 15.666 2.05683 16.977C2.06822 18.288 2.59407 19.542 3.52111 20.4691C4.44815 21.3961 5.70221 21.9219 7.01319 21.9333C8.32418 21.9447 9.58719 21.4408 10.5302 20.53L12.2402 18.82"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CopyLinkIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M10.0696 7C10.3869 3.9787 11.8424 3 15.5 3C19.7059 3 21 4.29412 21 8.5C21 12.1576 20.0213 13.6131 17 13.9304M3 15.5C3 11.2941 4.29412 10 8.5 10C12.7059 10 14 11.2941 14 15.5C14 19.7059 12.7059 21 8.5 21C4.29412 21 3 19.7059 3 15.5Z"
        stroke="#6b6b6b"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type TimeframeOption = {
  value: string
  label: string
  getDates: () => { start: Date; end: Date }
}

function QuickAccessRow({
  label,
  url,
  icon,
  actionLabel,
  isCopied,
  onAction,
  onOpen,
}: {
  label: string
  url: string
  icon: ReactNode
  actionLabel: "copy" | "setup"
  isCopied: boolean
  onAction: () => void
  onOpen: () => void
}) {
  const isSetupAction = actionLabel === "setup"

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen()
      }}
      className="w-full text-left rounded-2xl border border-[#ececf1] p-3.5 hover:bg-[#fafafa] active:bg-[#f4f4f5] transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[#111827]">{label}</p>
          <p className="text-[12px] text-[#6b7280] truncate">{url}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAction()
          }}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
            isSetupAction
              ? "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9] hover:bg-[#ede9fe]"
              : isCopied
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#f8fafc]"
          }`}
        >
          {isSetupAction ? (
            <ArrowRight className="h-3.5 w-3.5" />
          ) : isCopied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <CopyLinkIcon className="h-3.5 w-3.5" />
          )}
          {isSetupAction ? "Set up" : isCopied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  )
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

// Mobile Bottom Sheet for Timeframe Selector with smooth GPU-accelerated swipe-to-close
function TimeframeBottomSheet({
  isOpen,
  onClose,
  options,
  selectedValue,
  onSelect,
  t,
}: {
  isOpen: boolean
  onClose: () => void
  options: TimeframeOption[]
  selectedValue: string
  onSelect: (value: string) => void
  t: (key: any) => string
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const lastYRef = useRef(0)
  const lastTimeRef = useRef(0)
  const velocityRef = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setIsDragging(false)
    setDragY(0)
    velocityRef.current = 0
    setTimeout(() => {
      onClose()
    }, 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetElement = sheetRef.current
    if (!sheetElement) return
    const sheetRect = sheetElement.getBoundingClientRect()
    // Allow drag from anywhere above the sheet content area (backdrop + handle + header)
    // Only block drag if touch is deep inside sheet content (scrollable area)
    const touchYInSheet = touch.clientY - sheetRect.top
    if (touchYInSheet <= 0 || touchYInSheet <= 100) {
      // Touch is on backdrop (above sheet) or in handle/header area
      startYRef.current = touch.clientY
      lastYRef.current = touch.clientY
      lastTimeRef.current = Date.now()
      velocityRef.current = 0
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startYRef.current
    if (diff > 0) {
      e.preventDefault()
      const now = Date.now()
      const dt = Math.max(1, now - lastTimeRef.current)
      velocityRef.current = (currentY - lastYRef.current) / dt
      lastYRef.current = currentY
      lastTimeRef.current = now
      const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
      setDragY(resisted)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 92 || velocityRef.current > 0.55) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible) return null

  return (
    <div
      className="fixed inset-0 z-[100] md:hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Backdrop with smooth fade + blur */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        style={{
          opacity: isAnimating ? 1 : 0,
          transition: isDragging ? 'none' : 'opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={handleClose}
      />
      {/* Bottom Sheet - GPU accelerated */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translate3d(0, ${dragY}px, 0)` : "translate3d(0, 100%, 0)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        {/* Handle bar */}
        <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none" data-sheet-handle>
          <div className="h-[5px] w-10 rounded-full bg-gray-300" />
        </div>
        <div className="px-4 pb-4">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">{t("time.selectPeriod")}</h3>
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
        </div>
        {/* Safe area padding for iOS */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

function QuickAccessBottomSheet({
  isOpen,
  onClose,
  onePageUrl,
  storeUrl,
  isOnePageCopied,
  isStoreCopied,
  onCopyOnePage,
  onCopyStore,
  isOnePageReady,
  onSetupOnePage,
}: {
  isOpen: boolean
  onClose: () => void
  onePageUrl: string
  storeUrl: string
  isOnePageCopied: boolean
  isStoreCopied: boolean
  onCopyOnePage: () => void
  onCopyStore: () => void
  isOnePageReady: boolean
  onSetupOnePage: () => void
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const lastYRef = useRef(0)
  const lastTimeRef = useRef(0)
  const velocityRef = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
      requestAnimationFrame(() => requestAnimationFrame(() => setIsAnimating(true)))
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setIsDragging(false)
    setDragY(0)
    velocityRef.current = 0
    setTimeout(() => onClose(), 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetElement = sheetRef.current
    if (!sheetElement) return
    const sheetRect = sheetElement.getBoundingClientRect()
    const touchYInSheet = touch.clientY - sheetRect.top
    // Allow drag from backdrop (above sheet) or handle/header area
    if (touchYInSheet <= 0 || touchYInSheet <= 100) {
      startYRef.current = touch.clientY
      lastYRef.current = touch.clientY
      lastTimeRef.current = Date.now()
      velocityRef.current = 0
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startYRef.current
    if (diff > 0) {
      e.preventDefault()
      const now = Date.now()
      const dt = Math.max(1, now - lastTimeRef.current)
      velocityRef.current = (currentY - lastYRef.current) / dt
      lastYRef.current = currentY
      lastTimeRef.current = now
      const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
      setDragY(resisted)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 92 || velocityRef.current > 0.55) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible) return null

  return (
    <div
      className="fixed inset-0 z-[110] md:hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        style={{
          opacity: isAnimating ? 1 : 0,
          transition: isDragging ? 'none' : 'opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={handleClose}
      />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translate3d(0, ${dragY}px, 0)` : "translate3d(0, 100%, 0)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        {/* Invisible extended touch zone above sheet for easier grab */}
        <div className="absolute left-0 right-0 h-6 -top-6" />
        <div className="pt-3 pb-2">
          <div className="w-full flex justify-center py-2 cursor-grab active:cursor-grabbing touch-none">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </div>
        </div>
        <div className="px-4 pb-5">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">Quick access</h3>
          <div className="space-y-2">
            <QuickAccessRow
              label="OnePage"
              url={isOnePageReady ? onePageUrl : "Set up your OnePage to create a link"}
              actionLabel={isOnePageReady ? "copy" : "setup"}
              isCopied={isOnePageCopied}
              onAction={() => {
                if (isOnePageReady) {
                  onCopyOnePage()
                } else {
                  onSetupOnePage()
                  handleClose()
                }
              }}
              onOpen={() => {
                if (isOnePageReady) {
                  window.open(onePageUrl, "_blank", "noopener,noreferrer")
                } else {
                  onSetupOnePage()
                }
                handleClose()
              }}
              icon={<div className="w-8 h-8 rounded-full bg-[#8b5cf6] flex items-center justify-center"><ChainLinkIcon className="w-4 h-4" stroke="#ffffff" /></div>}
            />

            <QuickAccessRow
              label="Store"
              url={storeUrl}
              actionLabel="copy"
              isCopied={isStoreCopied}
              onAction={onCopyStore}
              onOpen={() => {
                window.open(storeUrl, "_blank", "noopener,noreferrer")
                handleClose()
              }}
              icon={<div className="w-8 h-8 rounded-full bg-black flex items-center justify-center overflow-hidden"><img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/image2vector.svg" alt="" width={20} height={20} className="w-5 h-5" loading="eager" decoding="async" /></div>}
            />
          </div>
        </div>
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
  creatorHandle = "",
  connectedDomain = null,
  currentPlan = "free",
  productCount = 0,
}: DashboardClientProps) {
  const [timeframe, setTimeframe] = useState("last_7_days")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isProfileAccessOpen, setIsProfileAccessOpen] = useState(false)
  const [isProfileAccessVisible, setIsProfileAccessVisible] = useState(false)
  const [isProfileAccessAnimating, setIsProfileAccessAnimating] = useState(false)
  const [isQuickAccessMobileOpen, setIsQuickAccessMobileOpen] = useState(false)
  const profileAccessRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()

  const publicStoreUrl = connectedDomain ? `https://${connectedDomain}` : (creatorHandle ? getStoreUrl(creatorHandle) : "")
  const publicOnePageUrl = connectedDomain ? `https://${connectedDomain}/links` : (creatorHandle ? getLinksUrl(creatorHandle) : "")
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
  const [liveVisitors, setLiveVisitors] = useState(0)
  const { t } = useLanguage()
  const { toast } = useToast()
  const [copiedTarget, setCopiedTarget] = useState<"onepage" | "store" | null>(null)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)

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

  // Fetch live visitors (active in last 5 minutes)
  const fetchLiveVisitors = async () => {
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

      // Count unique visitors
      const uniqueVisitors = new Set(
        (recentViews || [])
          .map((e: any) => e.visitor_id || e.session_id)
          .filter(Boolean)
      )

      setLiveVisitors(uniqueVisitors.size)
    } catch (error) {
      console.error("Error fetching live visitors:", error)
    }
  }

  // Poll for live visitors every 3 seconds for real-time updates
  useEffect(() => {
    fetchLiveVisitors()
    const interval = setInterval(fetchLiveVisitors, 3000)
    return () => clearInterval(interval)
  }, [creatorId])

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
  const copyQuickAccessUrl = async (target: "onepage" | "store") => {
    const url = target === "onepage" ? publicOnePageUrl : publicStoreUrl
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiedTarget(target)
      setCopyNotice("Link copied")
      toast({ title: "Link copied" })
      setTimeout(() => setCopiedTarget((prev) => (prev === target ? null : prev)), 1800)
      setTimeout(() => setCopyNotice(null), 1800)
    } catch {
      toast({ title: "Copy failed", description: "Please copy the link manually.", variant: "destructive" })
    }
  }


  useEffect(() => {
    if (isProfileAccessOpen) {
      setIsProfileAccessVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setIsProfileAccessAnimating(true)))
    } else if (isProfileAccessVisible) {
      setIsProfileAccessAnimating(false)
      const timer = setTimeout(() => setIsProfileAccessVisible(false), 180)
      return () => clearTimeout(timer)
    }
  }, [isProfileAccessOpen, isProfileAccessVisible])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(".timeframe-dropdown")) {
        setIsDropdownOpen(false)
      }
      if (profileAccessRef.current && !profileAccessRef.current.contains(target)) {
        setIsProfileAccessOpen(false)
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
  const hasOnePageSetup = initialSetupSteps.find((s) => s.id === "onepage")?.completed || false
  const mobileHandleLabel = creatorHandle.length > 14 ? `${creatorHandle.slice(0, 14)}...` : creatorHandle

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
                  <span className="font-semibold text-white">{t("dashboard.tryProFree")}</span>
                  <span className="hidden md:inline"> — {t("dashboard.proSubtitle")}</span>
                </span>
                <Link
                  href="/upgrade"
                  className="relative inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-gray-900 to-black text-white text-[11px] md:text-[13px] font-medium rounded-full transition-all shrink-0 overflow-hidden group"
                >
                  <span className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/50 transition-colors" />
                  <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)', animation: 'laser-sweep 2s infinite linear' }} />
                  <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 relative z-10" />
                  <span className="relative z-10">{t("dashboard.upgrade")}</span>
                </Link>
              </>
            )}
            {announcementType === "steps" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">{t("dashboard.completeSetup")}</span>
                  <span className="md:hidden"> — {completedSteps}/{totalSteps}</span>
                  <span className="hidden md:inline"> — {totalSteps - completedSteps} {t("dashboard.stepsRemaining")}</span>
                </span>
                <button
                  onClick={() => {
                    const setupSection = document.getElementById("store-setup-section")
                    setupSection?.scrollIntoView({ behavior: "smooth" })
                  }}
                  className="inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-white/90 to-gray-100/90 text-gray-800 text-[11px] md:text-[13px] font-medium rounded-full transition-all hover:from-white hover:to-gray-50 shrink-0"
                >
                  {t("common.continue")}
                  <ChevronRight className="h-3 w-3 md:h-3.5 md:w-3.5" />
                </button>
              </>
            )}
            {announcementType === "payouts" && (
              <>
                <span className="text-[12px] md:text-[14px] text-white/90">
                  <span className="font-semibold text-white">{t("dashboard.getPaid")}</span>
                  <span className="hidden md:inline"> — {t("dashboard.connectPayoutsDesc")}</span>
                </span>
                <Link
                  href="/app/payouts"
                  className="inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-white/90 to-gray-100/90 text-gray-800 text-[11px] md:text-[13px] font-medium rounded-full transition-all hover:from-white hover:to-gray-50 shrink-0"
                >
                  <Wallet className="h-3 w-3 md:h-3.5 md:w-3.5" />
                  {t("common.connect")}
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
        {copyNotice && (
          <div className="fixed top-4 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-[#111827] px-4 py-2 text-xs font-medium text-white shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
            {copyNotice}
          </div>
        )}
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="mb-1 flex justify-end md:hidden">
              {creatorHandle && (
                <button
                  type="button"
                  onClick={() => setIsQuickAccessMobileOpen(true)}
                  className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#e5e7eb] bg-white/90 text-[12px] font-medium text-[#4b5563] transition-all cursor-pointer overflow-hidden"
                >
                  <span className="absolute -inset-px rounded-full opacity-40 pointer-events-none animate-[spin_12s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,rgba(139,92,246,0.30)_320deg,transparent_360deg)]" />
                  <span className="absolute inset-[1px] rounded-full bg-white/95" />
                  <span className="relative z-[1] inline-flex items-center gap-1.5">
                    @{mobileHandleLabel}
                    <ExternalLink className="h-3.5 w-3.5 text-[#9ca3af]" />
                  </span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">
                {t("dashboard.welcome")}, {displayName}
              </h1>
              {creatorHandle && (
                <div ref={profileAccessRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        setIsQuickAccessMobileOpen(true)
                        return
                      }
                      setIsProfileAccessOpen((v) => !v)
                    }}
                    className="hidden md:inline-flex relative items-center gap-1.5 px-3 py-1 rounded-full border border-[#e5e7eb] bg-white/90 text-[12px] font-medium text-[#4b5563] hover:text-[#111827] hover:border-[#d1d5db] hover:bg-white transition-all cursor-pointer overflow-hidden"
                  >
                    <span className="absolute -inset-px rounded-full opacity-45 pointer-events-none animate-[spin_12s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,rgba(139,92,246,0.30)_320deg,transparent_360deg)]" />
                    <span className="absolute inset-[1px] rounded-full bg-white/95" />
                    <span className="relative z-[1] inline-flex items-center gap-1.5">
                      @{creatorHandle}
                      <ExternalLink className="h-3.5 w-3.5 text-[#9ca3af]" />
                    </span>
                  </button>
                  {isProfileAccessVisible && (
                    <div className={`absolute left-0 top-full mt-2 w-[280px] sm:w-[320px] rounded-2xl border border-[#e5e7eb] bg-white shadow-xl p-2 z-50 origin-top-left transition-all duration-180 ease-out ${isProfileAccessAnimating ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-1 scale-[0.98]"}`}>
                      <p className="px-2 pt-1 pb-2 text-[11px] text-[#6b7280]">Quick access</p>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (hasOnePageSetup) {
                            window.open(publicOnePageUrl, "_blank", "noopener,noreferrer")
                          } else {
                            router.push("/app/onepage")
                          }
                          setIsProfileAccessOpen(false)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            if (hasOnePageSetup) {
                              window.open(publicOnePageUrl, "_blank", "noopener,noreferrer")
                            } else {
                              router.push("/app/onepage")
                            }
                            setIsProfileAccessOpen(false)
                          }
                        }}
                        className="w-full text-left rounded-xl p-3 hover:bg-[#f9fafb] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]"><span className="w-5 h-5 rounded-full bg-[#8b5cf6] flex items-center justify-center"><ChainLinkIcon className="w-2.5 h-2.5" stroke="#ffffff" /></span>OnePage</div>
                        <div className="mt-1 flex items-center justify-between gap-2"><p className="text-[11px] text-[#6b7280] truncate">{hasOnePageSetup ? publicOnePageUrl : "Set up your OnePage to create a link"}</p><button type="button" onClick={(e) => { e.stopPropagation(); if (hasOnePageSetup) { copyQuickAccessUrl("onepage") } else { router.push("/app/onepage"); setIsProfileAccessOpen(false) } }} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all ${hasOnePageSetup ? (copiedTarget === "onepage" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e5e7eb] text-[#6b7280] bg-white") : "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]"}`}>{hasOnePageSetup ? (copiedTarget === "onepage" ? <Check className="h-3 w-3" /> : <CopyLinkIcon className="h-3 w-3" />) : <ArrowRight className="h-3 w-3" />}{hasOnePageSetup ? (copiedTarget === "onepage" ? "Copied" : "Copy") : "Set up"}</button></div>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          window.open(publicStoreUrl, "_blank", "noopener,noreferrer")
                          setIsProfileAccessOpen(false)
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { window.open(publicStoreUrl, "_blank", "noopener,noreferrer"); setIsProfileAccessOpen(false) } }}
                        className="w-full text-left rounded-xl p-3 hover:bg-[#f9fafb] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]"><span className="w-5 h-5 rounded-full bg-black flex items-center justify-center overflow-hidden"><img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/logostorelib_pixian_ai.png" alt="Storelib" className="w-3.5 h-3.5 object-contain" /></span>Store</div>
                        <div className="mt-1 flex items-center justify-between gap-2"><p className="text-[11px] text-[#6b7280] truncate">{publicStoreUrl}</p><button type="button" onClick={(e) => { e.stopPropagation(); copyQuickAccessUrl("store") }} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all ${copiedTarget === "store" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e5e7eb] text-[#6b7280] bg-white"}`}>{copiedTarget === "store" ? <Check className="h-3 w-3" /> : <CopyLinkIcon className="h-3 w-3" />}{copiedTarget === "store" ? "Copied" : "Copy"}</button></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-[14px] text-[#6b7280] mt-1">{t("dashboard.subtitle")}</p>
          </div>

          {/* Desktop: Timeframe Dropdown + Live Indicator */}
          <div className="hidden md:flex items-center gap-3">
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
            {/* Live Indicator Pill - Desktop */}
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[#f3f4f6] rounded-lg">
              <div
                className={`w-2 h-2 rounded-full ${
                  liveVisitors > 0
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                    : "bg-gray-400"
                }`}
                style={{
                  animation: liveVisitors > 0 ? "pulse-glow 2s ease-in-out infinite" : "none",
                }}
              />
              <span className={`text-[13px] font-medium ${liveVisitors > 0 ? "text-emerald-600" : "text-gray-500"}`}>
                {liveVisitors} {t("dashboard.liveVisitors")}
              </span>
            </div>
          </div>

          {/* Mobile: Live Indicator + Timeframe Button */}
          <div className="md:hidden flex items-center gap-2">
            {/* Live Indicator Pill - Mobile */}
            <div className="flex items-center gap-1.5 px-2.5 py-2 bg-[#f3f4f6] rounded-xl h-[38px]">
              <div
                className={`w-2 h-2 rounded-full ${
                  liveVisitors > 0
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                    : "bg-gray-400"
                }`}
                style={{
                  animation: liveVisitors > 0 ? "pulse-glow 2s ease-in-out infinite" : "none",
                }}
              />
              <span className={`text-[12px] font-medium ${liveVisitors > 0 ? "text-emerald-600" : "text-gray-500"}`}>
                {liveVisitors} {t("dashboard.liveVisitors")}
              </span>
            </div>
            <button
              onClick={() => setIsMobileSheetOpen(true)}
              className="w-fit inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] shadow-sm h-[38px]"
            >
              {selectedOption?.label || "Last 7 days"}
              <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
            </button>
          </div>
        </div>

        {/* Mobile Bottom Sheet */}
        <TimeframeBottomSheet
          isOpen={isMobileSheetOpen}
          onClose={() => setIsMobileSheetOpen(false)}
          options={timeframeOptions}
          selectedValue={timeframe}
          onSelect={setTimeframe}
          t={t}
        />
        <QuickAccessBottomSheet
          isOpen={isQuickAccessMobileOpen}
          onClose={() => setIsQuickAccessMobileOpen(false)}
          onePageUrl={hasOnePageSetup ? publicOnePageUrl : "Set up your OnePage to create a link"}
          storeUrl={publicStoreUrl}
          isOnePageCopied={copiedTarget === "onepage"}
          isStoreCopied={copiedTarget === "store"}
          onCopyOnePage={() => copyQuickAccessUrl("onepage")}
          onCopyStore={() => copyQuickAccessUrl("store")}
          isOnePageReady={hasOnePageSetup}
          onSetupOnePage={() => router.push("/app/onepage")}
        />

        {/* Stats Cards */}
        <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8 transition-opacity duration-500 ease-out ${isLoading ? "opacity-50" : "opacity-100"}`}>
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
                    <span className="text-[11px] font-medium text-violet-600">{t("dashboard.views")}</span>
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
                    <span className="text-[12px] text-[#9ca3af]">{t("time.noData")}</span>
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
                  <span className="text-[13px] font-medium text-[#6b7280]">{t("dashboard.views")}</span>
                  <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                    <Eye className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                </div>
                <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                  <span className={`text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight transition-all duration-300 ${isLoading ? "blur-[2px]" : "blur-0"}`}>{formatCompactNumber(analyticsData.periodViews)}</span>
                  <PercentChangeIndicator current={analyticsData.periodViews} previous={analyticsData.prevPeriodViews} />
                </div>
                <p className={`text-[11px] sm:text-[12px] text-[#9ca3af] mt-1 transition-all duration-300 ${isLoading ? "blur-[1px]" : "blur-0"}`}>{formatCompactNumber(analyticsData.totalViews)} {t("dashboard.allTime")}</p>
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
                    <span className="text-[11px] font-medium text-violet-600">{t("dashboard.orders")}</span>
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
                    <span className="text-[12px] text-[#9ca3af]">{t("time.noData")}</span>
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
                  <span className="text-[13px] font-medium text-[#6b7280]">{t("dashboard.orders")}</span>
                  <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                    <ShoppingCart className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                </div>
                <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                  <span className={`text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight transition-all duration-300 ${isLoading ? "blur-[2px]" : "blur-0"}`}>{formatCompactNumber(analyticsData.periodOrders)}</span>
                  <PercentChangeIndicator current={analyticsData.periodOrders} previous={analyticsData.prevPeriodOrders} />
                </div>
                <p className={`text-[11px] sm:text-[12px] text-[#9ca3af] mt-1 transition-all duration-300 ${isLoading ? "blur-[1px]" : "blur-0"}`}>{formatCompactNumber(analyticsData.totalOrders)} {t("dashboard.allTime")}</p>
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
                    <span className="text-[11px] font-medium text-violet-600">{t("dashboard.revenue")}</span>
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
                    <span className="text-[12px] text-[#9ca3af]">{t("time.noData")}</span>
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
                  <span className="text-[13px] font-medium text-[#6b7280]">{t("dashboard.revenue")}</span>
                  <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                    <DollarSign className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                </div>
                <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                  <span className={`text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight transition-all duration-300 ${isLoading ? "blur-[2px]" : "blur-0"}`}>{formatCurrency(analyticsData.periodRevenue)}</span>
                  <PercentChangeIndicator current={analyticsData.periodRevenue} previous={analyticsData.prevPeriodRevenue} />
                </div>
                <p className={`text-[11px] sm:text-[12px] text-[#9ca3af] mt-1 transition-all duration-300 ${isLoading ? "blur-[1px]" : "blur-0"}`}>{formatCurrency(analyticsData.totalRevenue)} {t("dashboard.allTime")}</p>
              </>
            )}
          </div>

          {/* Conversion Rate */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#6b7280]">{t("dashboard.conversionRate")}</span>
              <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
              </div>
            </div>
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
              <span className={`text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight transition-all duration-300 ${isLoading ? "blur-[2px]" : "blur-0"}`}>{analyticsData.conversionRate.toFixed(2)}%</span>
              <PercentChangeIndicator current={analyticsData.conversionRate} previous={analyticsData.prevConversionRate} />
            </div>
            <p className={`text-[11px] sm:text-[12px] text-[#9ca3af] mt-1 transition-all duration-300 ${isLoading ? "blur-[1px]" : "blur-0"}`}>{t("dashboard.viewsToOrders")}</p>
          </div>
        </div>

        {/* Dynamic Contextual Banner */}
        <DashboardDynamicBanner
          context={{
            hasProducts,
            productCount,
            totalOrders: initialTotalOrders,
            totalRevenue: initialTotalRevenue,
            isStripeConnected: hasPayouts,
            hasCustomDomain: !!connectedDomain,
            currentPlan,
            setupComplete: allCompleted,
            creatorHandle,
            connectedDomain,
          }}
        />

        {/* Main Content Grid - Store Setup + Quick Actions */}
        <div className="grid gap-6 lg:grid-cols-[370px_1fr]">
          {/* Left Column - Store Setup Checklist */}
          {!allCompleted && (
            <div id="store-setup-section" className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] h-fit">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{t("dashboard.storeSetup")}</h2>
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
                                  {t(substep.labelKey as any)}
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
                    {t("dashboard.createProduct")}
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">{t("dashboard.createProductDesc")}</p>
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
                    {t("dashboard.editOnePage")}
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">{t("dashboard.editOnePageDesc")}</p>
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
                    {t("dashboard.viewAnalytics")}
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">{t("dashboard.viewAnalyticsDesc")}</p>
              </div>
            </Link>

            {/* Add Custom Domain card */}
            <Link
              href="/app/settings?tab=domains"
              className="group flex items-center gap-5 bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#8b5cf6]/30 hover:shadow-[0_4px_12px_rgba(139,92,246,0.08)] transition-all duration-200"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#e0e7ff] to-[#c7d2fe]">
                <Globe className="h-6 w-6 text-[#6366f1]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#1a1a2e] group-hover:text-[#8b5cf6] transition-colors">
                    Add Custom Domain
                  </p>
                  <ArrowRight className="h-4 w-4 text-[#d1d5db] group-hover:text-[#8b5cf6] group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[13px] text-[#6b7280] mt-0.5">Connect your own domain to your store</p>
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
                  <h3 className="text-[17px] font-semibold text-[#1a1a2e]">{t("dashboard.allSetUp")}</h3>
                  <Sparkles className="h-5 w-5 text-[#8b5cf6]" />
                </div>
                <p className="text-[14px] text-[#6b7280] mt-1">
                  {t("dashboard.allSetUpDesc")}
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
        @keyframes pulse-glow {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
          }
          50% {
            opacity: 0.7;
            box-shadow: 0 0 12px rgba(16, 185, 129, 0.8);
          }
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
