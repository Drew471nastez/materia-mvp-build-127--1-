"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  RotateCcw,
  Download,
  Search,
  Filter,
  ChevronDown,
  X,
  Calendar,
  Package,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Eye,
  BarChart3,
  Users,
  Wallet,
  AlertCircle,
  Mail,
  Globe,
  CreditCard,
  Send,
  Copy,
  Check,
  UserX,
  Monitor,
  Smartphone,
  Tablet,
  MapPin,
  Loader2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/i18n"

interface Product {
  id: string
  title: string
  type?: string
  price_cents?: number
  thumbnail_url?: string | null
  view_count?: number
}

interface SalesClientProps {
  creatorId: string
  products: Product[]
  initialSummary: {
    totalSales: number
    totalOrders: number
    avgOrderValue: number
    refundCount: number
    refundAmount: number
  }
  initialOrders: Order[]
  currency: string
  stripeConnected: boolean
  storeName: string
  sellerName: string
}

interface Order {
  id: string
  product_id: string
  amount_cents: number
  fee_cents: number
  status: string
  payment_method?: string
  created_at: string
  buyer_id?: string | null
  buyer_email?: string
  buyer_first_name?: string
  buyer_last_name?: string
  receipt_token?: string
  stripe_payment_intent_id?: string
  // Payment method details
  card_brand?: string | null
  card_last4?: string | null
  paypal_email?: string | null
  // Location info
  buyer_country?: string | null
  buyer_country_code?: string | null
  // Device info
  buyer_device_type?: string | null
  buyer_os?: string | null
  buyer_browser?: string | null
  // Refund fields
  refund_reason?: string | null
  refund_amount_cents?: number | null
  refunded_at?: string | null
  stripe_refund_id?: string | null
  customer_email?: string
  buyer?: {
    email: string
    display_name: string
  } | null
  product?: {
    id: string
    title: string
    type: string
    thumbnail_url?: string | null
  } | null
}

interface ChartDataPoint {
  label: string
  value: number
}

interface MonthlyReport {
  month: string
  year: number
  monthYear: string
  orders: number
  revenue: number
  orderDetails: Order[]
}

type KPIType = "sales" | "orders" | "avgValue" | "refunds" | null

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
    value: "this_year",
    label: "This year",
    shortLabel: "This year",
    getDates: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(0)
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
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
]

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
  const startY = React.useRef(0)
  const sheetRef = React.useRef<HTMLDivElement>(null)
  const handleRef = React.useRef<HTMLDivElement>(null)

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
      setDragY(diff * 0.9)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 90) {
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
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: isDragging ? 'none' : 'transform 360ms cubic-bezier(0.22, 0.9, 0.24, 1)',
        }}
      >
        {/* Handle bar area - this is the drag zone */}
        <div ref={handleRef} className="pt-3 pb-2">
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
        </div>
        {/* Safe area padding for iOS */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

// Mobile Bottom Sheet for Filter with swipe-to-close
function FilterBottomSheet({
  isOpen,
  onClose,
  products,
  filterDateRange,
  setFilterDateRange,
  filterFromDate,
  setFilterFromDate,
  filterToDate,
  setFilterToDate,
  filterProduct,
  setFilterProduct,
  filterMinValue,
  setFilterMinValue,
  filterMaxValue,
  setFilterMaxValue,
  filterCustomer,
  setFilterCustomer,
  filterStatus,
  setFilterStatus,
  onApply,
  onClear,
}: {
  isOpen: boolean
  onClose: () => void
  products: Product[]
  filterDateRange: string
  setFilterDateRange: (v: any) => void
  filterFromDate: string
  setFilterFromDate: (v: string) => void
  filterToDate: string
  setFilterToDate: (v: string) => void
  filterProduct: string
  setFilterProduct: (v: string) => void
  filterMinValue: string
  setFilterMinValue: (v: string) => void
  filterMaxValue: string
  setFilterMaxValue: (v: string) => void
  filterCustomer: string
  setFilterCustomer: (v: string) => void
  filterStatus: string
  setFilterStatus: (v: string) => void
  onApply: () => void
  onClear: () => void
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = React.useRef(0)
  const sheetRef = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsAnimating(true))
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }
    return () => { document.body.style.overflow = "" }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setDragY(0)
    setTimeout(() => onClose(), 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetElement = sheetRef.current
    if (!sheetElement) return
    const sheetRect = sheetElement.getBoundingClientRect()
    const touchYInSheet = touch.clientY - sheetRect.top
    if (touchYInSheet <= 60) {
      startY.current = touch.clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current
    if (diff > 0) setDragY(diff * 0.9)
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 90) handleClose()
    else setDragY(0)
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100] md:hidden">
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-400 ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: '400ms' }}
        onClick={handleClose}
      />
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: isDragging ? 'none' : 'transform 360ms cubic-bezier(0.22, 0.9, 0.24, 1)',
          maxHeight: '85vh',
        }}
      >
        <div className="pt-3 pb-2">
          <button onClick={handleClose} className="w-full flex justify-center py-2 cursor-pointer touch-none">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>
        <div className="px-4 pb-4 overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(85vh - 60px)' }}>
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">Filters</h3>
          <div className="space-y-4">
            {/* Date Range */}
            <div>
              <label className="block text-[12px] font-medium text-[#6b7280] mb-2">Date range</label>
              <div className="flex gap-1">
                {[
                  { value: "today", label: "Today" },
                  { value: "7days", label: "7 days" },
                  { value: "30days", label: "30 days" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFilterDateRange(opt.value)}
                    className={`flex-1 px-2 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                      filterDateRange === opt.value
                        ? "bg-[#8b5cf6] text-white border-[#8b5cf6]"
                        : "bg-white text-[#374151] border-[#e5e7eb] hover:bg-[#f9fafb]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* From / To */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">From</label>
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">To</label>
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                />
              </div>
            </div>

            {/* Product */}
            <div>
              <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">Product</label>
              <select
                value={filterProduct}
                onChange={(e) => setFilterProduct(e.target.value)}
                className="w-full px-2.5 py-2 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] bg-white"
              >
                <option value="all">All products</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            {/* Order Value */}
            <div>
              <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">Order value (optional)</label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  value={filterMinValue}
                  onChange={(e) => setFilterMinValue(e.target.value)}
                  placeholder="Min"
                  className="w-full px-2.5 py-2 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                />
                <input
                  type="number"
                  value={filterMaxValue}
                  onChange={(e) => setFilterMaxValue(e.target.value)}
                  placeholder="Max"
                  className="w-full px-2.5 py-2 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                />
              </div>
            </div>

            {/* Customer */}
            <div>
              <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">Customer</label>
              <input
                type="text"
                value={filterCustomer}
                onChange={(e) => setFilterCustomer(e.target.value)}
                placeholder="Email or name"
                className="w-full px-2.5 py-2 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-2.5 py-2 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] bg-white"
              >
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* Divider */}
            <div className="border-t border-[#e5e7eb]" />

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => { onClear(); handleClose() }}
                className="flex-1 px-3 py-2.5 text-[13px] font-medium text-[#6b7280] bg-white border border-[#e5e7eb] rounded-lg active:bg-[#f3f4f6] transition-colors"
              >
                Clear all
              </button>
              <button
                onClick={() => { onApply(); handleClose() }}
                className="flex-1 px-3 py-2.5 text-[13px] font-medium text-white bg-[#8b5cf6] rounded-lg active:bg-[#7c3aed] transition-colors"
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  )
}

// Order Details Modal with swipe-to-close on mobile
function OrderDetailsModal({
  isOpen,
  onClose,
  selectedOrder,
  products,
  formatPrice,
  formatFullDate,
  handleCopyOrderId,
  copiedId,
  getStatusBadge,
  handleResendReceipt,
  handleUnsubscribe,
  handleEditEmail,
  handleDownloadInvoice,
  handleOpenRefund,
  receiptResendCounts,
  getFlagEmoji,
  setShowOrderModal,
}: {
  isOpen: boolean
  onClose: () => void
  selectedOrder: Order | null
  products: Product[]
  formatPrice: (cents: number, compact?: boolean) => string
  formatFullDate: (dateString: string) => string
  handleCopyOrderId: (orderId: string) => void
  copiedId: boolean
  getStatusBadge: (status: string) => React.ReactNode
  handleResendReceipt: (order: Order) => void
  handleUnsubscribe: (order: Order) => void
  handleEditEmail: (order: Order) => void
  handleDownloadInvoice: (order: Order) => void
  handleOpenRefund: (order: Order) => void
  receiptResendCounts: Record<string, number>
  getFlagEmoji: (countryCode: string) => string
  setShowOrderModal: (show: boolean) => void
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = React.useRef(0)
  const sheetRef = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
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
      }, 400)
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
    }, 400)
  }

  // Handle drag for mobile swipe-to-close
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
      setDragY(diff * 0.9)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 90) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible || !selectedOrder) return null

  const productData = products.find(p => p.id === selectedOrder.product_id)
  const coverImage = productData?.thumbnail_url || selectedOrder.product?.thumbnail_url
  const productTitle = selectedOrder.product?.title || productData?.title || "Unknown Product"
  const productType = selectedOrder.product?.type || productData?.type || "Digital Product"

  return (
    <>
      {/* Desktop Modal */}
      <div className="fixed inset-0 z-50 hidden sm:flex items-center justify-center p-4">
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-400 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
          onClick={handleClose}
        />
        <div
          className={`relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl transition-all duration-400 ${
            isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
        >
          {/* Desktop Header */}
          <div className="sticky top-0 bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold text-[#1a1a2e]">Order Details</h2>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Desktop Content */}
          <div className="p-6 space-y-6">
            {/* Order ID & Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#6b7280]">Order ID:</span>
                <code className="text-[12px] font-mono bg-[#f3f4f6] px-2 py-0.5 rounded">
                  #{selectedOrder.id.slice(0, 8)}
                </code>
                <button
                  onClick={() => handleCopyOrderId(selectedOrder.id)}
                  className="p-1 text-[#9ca3af] hover:text-[#6b7280] transition-colors"
                >
                  {copiedId ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              {getStatusBadge(selectedOrder.status)}
            </div>

            {/* Customer Info */}
            <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
              <h3 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                <Users className="h-4 w-4 text-[#8b5cf6]" />
                Customer Information
              </h3>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <span className="text-[#6b7280]">Name</span>
                  <p className="font-medium text-[#1a1a2e]">
                    {selectedOrder.buyer?.display_name ||
                      (selectedOrder.buyer_first_name && selectedOrder.buyer_last_name
                        ? `${selectedOrder.buyer_first_name} ${selectedOrder.buyer_last_name}`
                        : "Unknown")}
                  </p>
                </div>
                <div>
                  <span className="text-[#6b7280]">Email</span>
                  <p className="font-medium text-[#1a1a2e] break-all">
                    {selectedOrder.buyer?.email || selectedOrder.buyer_email || "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-[#6b7280]">First Name</span>
                  <p className="font-medium text-[#1a1a2e]">{selectedOrder.buyer_first_name || "N/A"}</p>
                </div>
                <div>
                  <span className="text-[#6b7280]">Last Name</span>
                  <p className="font-medium text-[#1a1a2e]">{selectedOrder.buyer_last_name || "N/A"}</p>
                </div>
              </div>
            </div>

            {/* Product Info */}
            <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
              <h3 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                <Package className="h-4 w-4 text-[#8b5cf6]" />
                Product
              </h3>
              <div className="flex items-center gap-3">
                {coverImage ? (
                  <img src={coverImage} alt="" className="w-14 h-14 rounded-lg object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-[#e5e7eb] flex items-center justify-center">
                    <Package className="h-6 w-6 text-[#9ca3af]" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-[#1a1a2e]">{productTitle}</p>
                  <p className="text-[12px] text-[#6b7280] capitalize">{productType}</p>
                </div>
              </div>
            </div>

            {/* Payment Info */}
            <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
              <h3 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-[#8b5cf6]" />
                Payment Details
              </h3>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <span className="text-[#6b7280]">Amount</span>
                  <p className="font-semibold text-[#1a1a2e] text-[16px]">{formatPrice(selectedOrder.amount_cents)}</p>
                </div>
                <div>
                  <span className="text-[#6b7280]">Fee</span>
                  <p className="font-medium text-[#1a1a2e]">{formatPrice(selectedOrder.fee_cents || 0)}</p>
                </div>
                <div>
                  <span className="text-[#6b7280]">Payment Method</span>
                  <p className="font-medium text-[#1a1a2e] capitalize">
                    {selectedOrder.payment_method === "card" && selectedOrder.card_brand ? (
                      <span className="flex items-center gap-1.5">
                        <span className="capitalize">{selectedOrder.card_brand}</span>
                        {selectedOrder.card_last4 && <span className="text-[#6b7280]">•••• {selectedOrder.card_last4}</span>}
                      </span>
                    ) : selectedOrder.payment_method === "paypal" ? "PayPal" : selectedOrder.payment_method === "free" ? "Free" : selectedOrder.payment_method || "Card"}
                  </p>
                </div>
                <div>
                  <span className="text-[#6b7280]">Net Revenue</span>
                  <p className="font-medium text-[#1a1a2e]">{formatPrice(selectedOrder.amount_cents - (selectedOrder.fee_cents || 0))}</p>
                </div>
                {selectedOrder.payment_method === "paypal" && selectedOrder.paypal_email && (
                  <div className="col-span-2">
                    <span className="text-[#6b7280]">PayPal Email</span>
                    <p className="font-medium text-[#1a1a2e] break-all">{selectedOrder.paypal_email}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Location Info */}
            {selectedOrder.buyer_country && (
              <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
                <h3 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#8b5cf6]" />
                  Location
                </h3>
                <div className="text-[13px]">
                  <span className="text-[#6b7280]">Country</span>
                  <p className="font-medium text-[#1a1a2e] flex items-center gap-2">
                    {selectedOrder.buyer_country_code && <span className="text-[16px]">{getFlagEmoji(selectedOrder.buyer_country_code)}</span>}
                    {selectedOrder.buyer_country}
                  </p>
                </div>
              </div>
            )}

            {/* Device Info */}
            {(selectedOrder.buyer_device_type || selectedOrder.buyer_os || selectedOrder.buyer_browser) && (
              <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
                <h3 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                  {selectedOrder.buyer_device_type === "Mobile" ? <Smartphone className="h-4 w-4 text-[#8b5cf6]" /> : selectedOrder.buyer_device_type === "Tablet" ? <Tablet className="h-4 w-4 text-[#8b5cf6]" /> : <Monitor className="h-4 w-4 text-[#8b5cf6]" />}
                  Device Information
                </h3>
                <div className="grid grid-cols-3 gap-3 text-[13px]">
                  {selectedOrder.buyer_device_type && <div><span className="text-[#6b7280]">Device</span><p className="font-medium text-[#1a1a2e]">{selectedOrder.buyer_device_type}</p></div>}
                  {selectedOrder.buyer_os && <div><span className="text-[#6b7280]">OS</span><p className="font-medium text-[#1a1a2e]">{selectedOrder.buyer_os}</p></div>}
                  {selectedOrder.buyer_browser && <div><span className="text-[#6b7280]">Browser</span><p className="font-medium text-[#1a1a2e]">{selectedOrder.buyer_browser}</p></div>}
                </div>
              </div>
            )}

            {/* Order Date & Time */}
            <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
              <h3 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#8b5cf6]" />
                Order Date & Time
              </h3>
              <p className="text-[13px] font-medium text-[#1a1a2e]">{formatFullDate(selectedOrder.created_at)}</p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleResendReceipt(selectedOrder)}
                className="flex-1 px-4 py-2.5 text-[13px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" />
                Resend Receipt
                <span className="text-[11px] text-[#9ca3af]">({receiptResendCounts[selectedOrder.id] || 0}/5)</span>
              </button>
              <button
                onClick={() => handleUnsubscribe(selectedOrder)}
                className="flex-1 px-4 py-2.5 text-[13px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-2"
              >
                <UserX className="h-4 w-4" />
                Unsubscribe
              </button>
            </div>
          </div>

          {/* Refund info if applicable */}
          {selectedOrder.status === "refunded" && (
            <div className="mx-6 mb-4 p-3 bg-red-50 rounded-xl space-y-1">
              <p className="text-[13px] font-medium text-red-700">Refund Details</p>
              {selectedOrder.refund_amount_cents && <p className="text-[12px] text-red-600">Amount: {formatPrice(selectedOrder.refund_amount_cents)}</p>}
              {selectedOrder.refunded_at && <p className="text-[12px] text-red-600">Date: {formatFullDate(selectedOrder.refunded_at)}</p>}
              {selectedOrder.refund_reason && <p className="text-[12px] text-red-600">Reason: {selectedOrder.refund_reason}</p>}
            </div>
          )}

          {/* Desktop Footer */}
          <div className="sticky bottom-0 bg-white border-t border-[#e5e7eb] px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadInvoice(selectedOrder)}
                className="px-4 py-2 text-[13px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Invoice
              </button>
              <button
                onClick={() => { handleClose(); setTimeout(() => handleEditEmail(selectedOrder), 450) }}
                className="px-4 py-2 text-[13px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Edit Email
              </button>
            </div>
            {selectedOrder.status === "completed" ? (
              <button
                onClick={() => { handleClose(); setTimeout(() => handleOpenRefund(selectedOrder), 450) }}
                className="px-4 py-2 text-[13px] font-medium text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Issue Refund
              </button>
            ) : selectedOrder.status === "refunded" ? (
              <span className="px-4 py-2 text-[13px] font-medium text-rose-400 bg-rose-50 rounded-lg flex items-center gap-2 cursor-not-allowed opacity-70">
                <RotateCcw className="h-4 w-4" />
                Refunded
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Sheet */}
      <div className="fixed inset-0 z-50 sm:hidden">
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
          style={{ transitionDuration: '400ms' }}
          onClick={handleClose}
        />
        {/* Bottom Sheet */}
        <div
          ref={sheetRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
          style={{
            transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
            transition: isDragging ? 'none' : 'transform 360ms cubic-bezier(0.22, 0.9, 0.24, 1)',
            maxHeight: '76.5vh', // 15% reduced from 90vh
          }}
        >
          {/* Handle bar area */}
          <div className="pt-3 pb-2">
            <button onClick={handleClose} className="w-full flex justify-center py-2 cursor-pointer touch-none">
              <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
            </button>
          </div>

          {/* Header */}
          <div className="px-4 pb-3 flex items-center justify-between border-b border-[#e5e7eb]">
            <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Order Details</h3>
            {getStatusBadge(selectedOrder.status)}
          </div>

          {/* Scrollable Content */}
          <div className="px-4 py-4 overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(76.5vh - 160px)' }}>
            <div className="space-y-4">
              {/* Order ID */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#6b7280]">Order ID:</span>
                <code className="text-[12px] font-mono bg-[#f3f4f6] px-2 py-0.5 rounded">#{selectedOrder.id.slice(0, 8)}</code>
                <button onClick={() => handleCopyOrderId(selectedOrder.id)} className="p-1 text-[#9ca3af]">
                  {copiedId ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              {/* Customer */}
              <div className="bg-[#f9fafb] rounded-xl p-3 space-y-2">
                <h4 className="text-[12px] font-semibold text-[#1a1a2e] flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-[#8b5cf6]" />
                  Customer Information
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <span className="text-[#6b7280]">Name</span>
                    <p className="font-medium text-[#1a1a2e]">
                      {selectedOrder.buyer?.display_name || (selectedOrder.buyer_first_name && selectedOrder.buyer_last_name ? `${selectedOrder.buyer_first_name} ${selectedOrder.buyer_last_name}` : "Unknown")}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#6b7280]">Email</span>
                    <p className="font-medium text-[#1a1a2e] break-all">{selectedOrder.buyer?.email || selectedOrder.buyer_email || "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-[#6b7280]">First Name</span>
                    <p className="font-medium text-[#1a1a2e]">{selectedOrder.buyer_first_name || "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-[#6b7280]">Last Name</span>
                    <p className="font-medium text-[#1a1a2e]">{selectedOrder.buyer_last_name || "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* Product */}
              <div className="bg-[#f9fafb] rounded-xl p-3">
                <h4 className="text-[12px] font-semibold text-[#1a1a2e] flex items-center gap-1.5 mb-2">
                  <Package className="h-3.5 w-3.5 text-[#8b5cf6]" />
                  Product
                </h4>
                <div className="flex items-center gap-3">
                  {coverImage ? (
                    <img src={coverImage} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[#e5e7eb] flex items-center justify-center">
                      <Package className="h-5 w-5 text-[#9ca3af]" />
                    </div>
                  )}
                  <div>
                    <p className="text-[13px] font-medium text-[#1a1a2e]">{productTitle}</p>
                    <p className="text-[11px] text-[#6b7280] capitalize">{productType}</p>
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div className="bg-[#f9fafb] rounded-xl p-3 space-y-2">
                <h4 className="text-[12px] font-semibold text-[#1a1a2e] flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-[#8b5cf6]" />
                  Payment
                </h4>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#6b7280]">Amount</span>
                  <span className="text-[14px] font-semibold text-[#1a1a2e]">{formatPrice(selectedOrder.amount_cents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#6b7280]">Fee</span>
                  <span className="text-[12px] font-medium text-[#1a1a2e]">{formatPrice(selectedOrder.fee_cents || 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#6b7280]">Net Revenue</span>
                  <span className="text-[12px] font-medium text-[#1a1a2e]">{formatPrice(selectedOrder.amount_cents - (selectedOrder.fee_cents || 0))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#6b7280]">Payment Method</span>
                  <span className="text-[12px] font-medium text-[#1a1a2e] capitalize">
                    {selectedOrder.payment_method === "card" && selectedOrder.card_brand ? (
                      <span className="flex items-center gap-1">
                        <span className="capitalize">{selectedOrder.card_brand}</span>
                        {selectedOrder.card_last4 && <span className="text-[#6b7280]">•••• {selectedOrder.card_last4}</span>}
                      </span>
                    ) : selectedOrder.payment_method === "paypal" ? "PayPal" : selectedOrder.payment_method === "free" ? "Free" : selectedOrder.payment_method || "Card"}
                  </span>
                </div>
                {selectedOrder.payment_method === "paypal" && selectedOrder.paypal_email && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#6b7280]">PayPal Email</span>
                    <span className="text-[12px] font-medium text-[#1a1a2e] break-all max-w-[60%] text-right">{selectedOrder.paypal_email}</span>
                  </div>
                )}
              </div>

              {/* Location */}
              {selectedOrder.buyer_country && (
                <div className="bg-[#f9fafb] rounded-xl p-3 space-y-2">
                  <h4 className="text-[12px] font-semibold text-[#1a1a2e] flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-[#8b5cf6]" />
                    Location
                  </h4>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#6b7280]">Country</span>
                    <span className="text-[12px] font-medium text-[#1a1a2e] flex items-center gap-1">
                      {selectedOrder.buyer_country_code && <span>{getFlagEmoji(selectedOrder.buyer_country_code)}</span>}
                      {selectedOrder.buyer_country}
                    </span>
                  </div>
                </div>
              )}

              {/* Device Info */}
              {(selectedOrder.buyer_device_type || selectedOrder.buyer_os || selectedOrder.buyer_browser) && (
                <div className="bg-[#f9fafb] rounded-xl p-3 space-y-2">
                  <h4 className="text-[12px] font-semibold text-[#1a1a2e] flex items-center gap-1.5">
                    {selectedOrder.buyer_device_type === "Mobile" ? <Smartphone className="h-3.5 w-3.5 text-[#8b5cf6]" /> : selectedOrder.buyer_device_type === "Tablet" ? <Tablet className="h-3.5 w-3.5 text-[#8b5cf6]" /> : <Monitor className="h-3.5 w-3.5 text-[#8b5cf6]" />}
                    Device
                  </h4>
                  {selectedOrder.buyer_device_type && (
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#6b7280]">Type</span>
                      <span className="text-[12px] font-medium text-[#1a1a2e]">{selectedOrder.buyer_device_type}</span>
                    </div>
                  )}
                  {selectedOrder.buyer_os && (
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#6b7280]">OS</span>
                      <span className="text-[12px] font-medium text-[#1a1a2e]">{selectedOrder.buyer_os}</span>
                    </div>
                  )}
                  {selectedOrder.buyer_browser && (
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#6b7280]">Browser</span>
                      <span className="text-[12px] font-medium text-[#1a1a2e]">{selectedOrder.buyer_browser}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Date */}
              <div className="bg-[#f9fafb] rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#6b7280] flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-[#8b5cf6]" />
                    Date
                  </span>
                  <span className="text-[12px] font-medium text-[#1a1a2e]">{formatFullDate(selectedOrder.created_at)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Refund info on mobile */}
          {selectedOrder.status === "refunded" && (
            <div className="mx-4 mb-2 p-3 bg-red-50 rounded-xl space-y-1">
              <p className="text-[12px] font-medium text-red-700">Refund Details</p>
              {selectedOrder.refund_amount_cents && <p className="text-[11px] text-red-600">Amount: {formatPrice(selectedOrder.refund_amount_cents)}</p>}
              {selectedOrder.refunded_at && <p className="text-[11px] text-red-600">Date: {formatFullDate(selectedOrder.refunded_at)}</p>}
              {selectedOrder.refund_reason && <p className="text-[11px] text-red-600">Reason: {selectedOrder.refund_reason}</p>}
            </div>
          )}

          {/* Mobile Footer Actions */}
          <div className="px-4 pt-4 pb-5 border-t border-[#e5e7eb] bg-white">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => handleDownloadInvoice(selectedOrder)}
                className="flex-1 px-3 py-2.5 text-[12px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg active:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                Invoice
              </button>
              <button
                onClick={() => handleResendReceipt(selectedOrder)}
                className="flex-1 px-3 py-2.5 text-[12px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg active:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                Resend
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { handleClose(); setTimeout(() => handleEditEmail(selectedOrder), 450) }}
                className="flex-1 px-3 py-2.5 text-[12px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg active:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-1.5"
              >
                <Mail className="h-3.5 w-3.5" />
                Edit Email
              </button>
              {selectedOrder.status === "completed" ? (
                <button
                  onClick={() => { handleClose(); setTimeout(() => handleOpenRefund(selectedOrder), 450) }}
                  className="flex-1 px-3 py-2.5 text-[12px] font-medium text-rose-600 bg-rose-50 rounded-lg active:bg-rose-100 transition-colors flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Refund
                </button>
              ) : selectedOrder.status === "refunded" ? (
                <span className="flex-1 px-3 py-2.5 text-[12px] font-medium text-rose-400 bg-rose-50 rounded-lg flex items-center justify-center gap-1.5 cursor-not-allowed opacity-70">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Refunded
                </span>
              ) : null}
            </div>
          </div>

          {/* Safe area padding for bottom notch */}
          <div className="h-[env(safe-area-inset-bottom)] min-h-[16px] bg-white" />
        </div>
      </div>
    </>
  )
}

export function SalesClient({ creatorId, products, initialSummary, initialOrders, currency, stripeConnected, storeName, sellerName }: SalesClientProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [timeframe, setTimeframe] = useState("last_30_days")
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false)
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"orders" | "reports">("orders")
  // Check localStorage for banner dismissal (12 hour persistence)
  const [showPayoutsBanner, setShowPayoutsBanner] = useState(() => {
    if (stripeConnected) return false
    if (typeof window !== 'undefined') {
      const dismissedAt = localStorage.getItem('payoutsBannerDismissedAt')
      if (dismissedAt) {
        const dismissedTime = parseInt(dismissedAt, 10)
        const twelveHours = 12 * 60 * 60 * 1000
        if (Date.now() - dismissedTime < twelveHours) {
          return false
        }
      }
    }
    return true
  })

  const handleDismissBanner = () => {
    localStorage.setItem('payoutsBannerDismissedAt', Date.now().toString())
    setShowPayoutsBanner(false)
  }

  // Filter states
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterDateRange, setFilterDateRange] = useState<"today" | "7days" | "30days" | "custom">("30days")
  const [filterFromDate, setFilterFromDate] = useState("")
  const [filterToDate, setFilterToDate] = useState("")
  const [filterProduct, setFilterProduct] = useState("all")
  const [filterMinValue, setFilterMinValue] = useState("")
  const [filterMaxValue, setFilterMaxValue] = useState("")
  const [filterCustomer, setFilterCustomer] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [appliedFilters, setAppliedFilters] = useState<any>(null)

  // Sync server data after router.refresh() — initialOrders/initialSummary props may update
  useEffect(() => {
    setAllOrders(initialOrders)
    setOrders(initialOrders)
    setSummary(initialSummary)
    setTotalCount(initialOrders.length)
  }, [initialOrders, initialSummary])

  // KPI Modal states
  const [openKPIModal, setOpenKPIModal] = useState<KPIType>(null)

  // Announcement bar state - rotating between messages
  const [announcementType, setAnnouncementType] = useState<"upgrade" | "payouts">(showPayoutsBanner ? "payouts" : "upgrade")
  const [announcementVisible, setAnnouncementVisible] = useState(true)
  const [progressWidth, setProgressWidth] = useState(0)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [isChartLoading, setIsChartLoading] = useState(false)
  const { t } = useLanguage()

  const [summary, setSummary] = useState(initialSummary)
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [allOrders, setAllOrders] = useState<Order[]>(initialOrders)
  const [totalCount, setTotalCount] = useState(initialOrders.length)
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReport[]>([])

  // Order details modal states
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showEditEmailModal, setShowEditEmailModal] = useState(false)
  const [editEmail, setEditEmail] = useState("")
  const [copiedId, setCopiedId] = useState(false)
  const [openMenuOrderId, setOpenMenuOrderId] = useState<string | null>(null)

  // Notification state
  const [notification, setNotification] = useState<{ message: string; visible: boolean }>({ message: "", visible: false })

  // Filter bottom sheet state (mobile)
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

  // Refund modal state
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [refundOrder, setRefundOrder] = useState<Order | null>(null)
  const [refundReason, setRefundReason] = useState("")
  const [refundAmount, setRefundAmount] = useState("")
  const [isRefunding, setIsRefunding] = useState(false)
  const [refundError, setRefundError] = useState<string | null>(null)

  // Receipt resend tracking (max 5 per order)
  const [receiptResendCounts, setReceiptResendCounts] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('receiptResendCounts')
      return saved ? JSON.parse(saved) : {}
    }
    return {}
  })

  const showNotification = (message: string) => {
    setNotification({ message, visible: true })
    setTimeout(() => setNotification({ message: "", visible: false }), 5000)
  }

  // Invoice download handler - real PDF from API endpoint
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const handleDownloadInvoice = async (order: Order) => {
    setInvoiceLoading(true)
    try {
      const response = await fetch(`/api/invoice?orderId=${order.id}`)
      if (!response.ok) throw new Error("Failed to generate invoice")
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `invoice-${order.id.slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Invoice download failed:", err)
      showNotification("Failed to download invoice. Please try again.")
    } finally {
      setInvoiceLoading(false)
    }
  }

  // Refund handler
  const handleRefund = async () => {
    if (!refundOrder) return
    setIsRefunding(true)
    setRefundError(null)

    try {
      const maxAmount = refundOrder.amount_cents / 100
      const amount = refundAmount ? parseFloat(refundAmount) : maxAmount

      if (isNaN(amount) || amount <= 0) {
        throw new Error("Please enter a valid refund amount")
      }
      if (amount > maxAmount) {
        throw new Error(`Amount cannot exceed ${formatPrice(Math.round(maxAmount * 100))}`)
      }

      const response = await fetch("/api/stripe/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: refundOrder.id,
          reason: refundReason || "requested_by_customer",
          amount,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to process refund")
      }

      // Immediately update local state so refund status shows without waiting for server refresh
      const refundAmountCents = amount ? Math.round(amount * 100) : refundOrder.amount_cents
      const updatedOrder = {
        ...refundOrder,
        status: "refunded",
        refunded_at: new Date().toISOString(),
        refund_reason: refundReason || "requested_by_customer",
        refund_amount_cents: refundAmountCents,
      }
      setAllOrders(prev => prev.map(o => o.id === refundOrder.id ? updatedOrder : o))
      setOrders(prev => prev.map(o => o.id === refundOrder.id ? updatedOrder : o))
      // Recalculate summary with updated data
      setAllOrders(prev => {
        const completedOrders = prev.filter(o => o.status === "completed")
        const refundedOrders = prev.filter(o => o.status === "refunded")
        setSummary({
          totalSales: completedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0),
          totalOrders: completedOrders.length,
          avgOrderValue: completedOrders.length > 0 ? Math.round(completedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0) / completedOrders.length) : 0,
          refundCount: refundedOrders.length,
          refundAmount: refundedOrders.reduce((sum, o) => sum + (o.refund_amount_cents || o.amount_cents || 0), 0),
        })
        return prev
      })

      showNotification("Refund processed successfully! Confirmation emails have been sent.")
      setRefundModalOpen(false)
      setRefundOrder(null)
      setRefundReason("")
      setRefundAmount("")
      setShowOrderModal(false)
      router.refresh()
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsRefunding(false)
    }
  }

  // Open refund modal for an order
  const handleOpenRefund = (order: Order) => {
    setRefundOrder(order)
    setRefundAmount((order.amount_cents / 100).toFixed(2))
    setRefundReason("")
    setRefundError(null)
    setShowOrderModal(false)
    setOpenMenuOrderId(null)
    setRefundModalOpen(true)
  }

  const handleResendReceipt = async (order: Order) => {
    const currentCount = receiptResendCounts[order.id] || 0
    if (currentCount >= 5) {
      showNotification("Maximum resend limit (5) reached for this order")
      setOpenMenuOrderId(null)
      return
    }

    const email = order.buyer?.email || order.buyer_email || "customer"
    setOpenMenuOrderId(null)

    // Check if order has receipt_token
    if (!order.receipt_token) {
      showNotification("Unable to resend receipt - missing receipt token")
      return
    }

    try {
      // Call the actual API to resend the receipt email
      const response = await fetch('/api/receipt/resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receiptToken: order.receipt_token,
          orderId: order.id,
          resendType: 'buyer'
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Update local count
        const newCounts = { ...receiptResendCounts, [order.id]: currentCount + 1 }
        setReceiptResendCounts(newCounts)
        localStorage.setItem('receiptResendCounts', JSON.stringify(newCounts))
        showNotification(`Receipt sent to ${email} (${currentCount + 1}/5)`)
      } else if (data.limitReached) {
        showNotification("Maximum resend limit (5) reached for this order")
      } else {
        showNotification(data.error || "Failed to send receipt")
      }
    } catch (error) {
      console.error("Error resending receipt:", error)
      showNotification("Failed to send receipt. Please try again.")
    }
  }

  const handleUnsubscribe = (order: Order) => {
    // Here you would call your API to mark this email as unsubscribed
    const email = order.buyer?.email || order.buyer_email || "Unknown email"
    showNotification(`${email} has been unsubscribed from emails`)
    setOpenMenuOrderId(null)
  }

  const formatPrice = (cents: number, compact = false) => {
    const value = cents / 100
    if (compact && value >= 1000) {
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`
      }
      return `$${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
    }
    // Remove decimal places if they are .00
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value)
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

  // Convert country code to flag emoji
  const getFlagEmoji = (countryCode: string) => {
    if (!countryCode || countryCode === "XX") return "🌍"
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0))
    return String.fromCodePoint(...codePoints)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    })
  }

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order)
    setShowOrderModal(true)
    setOpenMenuOrderId(null)
  }

  const handleEditEmail = (order: Order) => {
    setSelectedOrder(order)
    setEditEmail(order.buyer?.email || order.buyer_email || "")
    setShowEditEmailModal(true)
    setOpenMenuOrderId(null)
  }

  const handleCopyOrderId = (orderId: string) => {
    navigator.clipboard.writeText(orderId)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 text-violet-700">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </span>
        )
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        )
      case "refunded":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-700">
            <RotateCcw className="h-3 w-3" />
            Refunded
          </span>
        )
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
            {status}
          </span>
        )
    }
  }

  const fetchSalesData = () => {
    setIsLoading(true)
    try {
      const option = timeframeOptions.find((o) => o.value === timeframe)
      if (!option) return

      let { start, end } = option.getDates()

      // Apply custom date range from filters if set
      if (appliedFilters) {
        if (appliedFilters.fromDate) {
          start = new Date(appliedFilters.fromDate)
          start.setHours(0, 0, 0, 0)
        }
        if (appliedFilters.toDate) {
          end = new Date(appliedFilters.toDate)
          end.setHours(23, 59, 59, 999)
        }
        // Handle preset date ranges from filter
        if (appliedFilters.dateRange === "today") {
          start = new Date()
          start.setHours(0, 0, 0, 0)
          end = new Date()
        } else if (appliedFilters.dateRange === "7days") {
          end = new Date()
          start = new Date()
          start.setDate(start.getDate() - 7)
        } else if (appliedFilters.dateRange === "30days") {
          end = new Date()
          start = new Date()
          start.setDate(start.getDate() - 30)
        }
      }

      // Filter from initialOrders (server-side fetched data - bypasses RLS)
      let filteredOrders = initialOrders.filter(o => {
        const orderDate = new Date(o.created_at)
        return orderDate >= start && orderDate <= end
      })

      // Apply search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        filteredOrders = filteredOrders.filter(
          (o) =>
            o.id.toLowerCase().includes(query) ||
            o.buyer_email?.toLowerCase().includes(query) ||
            o.buyer_first_name?.toLowerCase().includes(query) ||
            o.buyer_last_name?.toLowerCase().includes(query) ||
            o.product?.title?.toLowerCase().includes(query)
        )
      }

      // Apply additional filters if any
      if (appliedFilters) {
        if (appliedFilters.product && appliedFilters.product !== "all") {
          filteredOrders = filteredOrders.filter(o => o.product_id === appliedFilters.product)
        }
        if (appliedFilters.minValue) {
          filteredOrders = filteredOrders.filter(o => o.amount_cents >= parseFloat(appliedFilters.minValue) * 100)
        }
        if (appliedFilters.maxValue) {
          filteredOrders = filteredOrders.filter(o => o.amount_cents <= parseFloat(appliedFilters.maxValue) * 100)
        }
        if (appliedFilters.customer) {
          const customerQuery = appliedFilters.customer.toLowerCase()
          filteredOrders = filteredOrders.filter(o =>
            o.buyer_email?.toLowerCase().includes(customerQuery) ||
            o.buyer_first_name?.toLowerCase().includes(customerQuery) ||
            o.buyer_last_name?.toLowerCase().includes(customerQuery)
          )
        }
        if (appliedFilters.status && appliedFilters.status !== "all") {
          filteredOrders = filteredOrders.filter(o => o.status === appliedFilters.status)
        }
      }

      setTotalCount(filteredOrders.length)
      setOrders(filteredOrders)

      // Calculate summary from filtered orders
      const completedOrders = filteredOrders.filter((o) => o.status === "completed")
      const refundedOrders = filteredOrders.filter((o) => o.status === "refunded")

      const totalSales = completedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
      const totalOrdersCount = completedOrders.length
      const avgOrderValue = totalOrdersCount > 0 ? Math.round(totalSales / totalOrdersCount) : 0

      setSummary({
        totalSales,
        totalOrders: totalOrdersCount,
        avgOrderValue,
        refundCount: refundedOrders.length,
        refundAmount: refundedOrders.reduce((sum, o) => sum + (o.refund_amount_cents || o.amount_cents || 0), 0),
      })

      // Generate monthly reports from ALL initialOrders (all time)
      generateMonthlyReports(initialOrders)
    } catch (error) {
      console.error("Error filtering sales data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Generate monthly reports - includes all orders (paid and free)
  const generateMonthlyReports = (ordersData: Order[]) => {
    // Include all orders except failed ones (completed, pending, refunded, free)
    const validOrders = ordersData.filter(o => o.status !== "failed")
    const reportMap: Record<string, MonthlyReport> = {}

    validOrders.forEach((order) => {
      const date = new Date(order.created_at)
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      const month = monthNames[date.getMonth()]
      const year = date.getFullYear()
      const key = `${year}-${date.getMonth()}`

      if (!reportMap[key]) {
        reportMap[key] = {
          month,
          year,
          monthYear: `${month} ${year}`,
          orders: 0,
          revenue: 0,
          orderDetails: [],
        }
      }

      reportMap[key].orders++
      // Only count revenue from completed orders
      if (order.status === "completed") {
        reportMap[key].revenue += order.amount_cents || 0
      }
      reportMap[key].orderDetails.push(order)
    })

    // Sort by date descending (newest first)
    const sortedReports = Object.values(reportMap).sort((a, b) => {
      const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      const aIndex = a.year * 12 + monthOrder.indexOf(a.month)
      const bIndex = b.year * 12 + monthOrder.indexOf(b.month)
      return bIndex - aIndex
    })

    setMonthlyReports(sortedReports)
  }

  // Generate chart data for KPI using local filtering
  const fetchChartData = (kpiType: KPIType) => {
    if (!kpiType) return

    setIsChartLoading(true)
    try {
      const option = timeframeOptions.find((o) => o.value === timeframe)
      if (!option) {
        setIsChartLoading(false)
        return
      }

      const { start, end } = option.getDates()
      const points: ChartDataPoint[] = []

      // Filter completed orders from initialOrders (server-fetched data)
      const completedOrders = initialOrders.filter(o => o.status === "completed")

      // Determine grouping based on timeframe
      const isToday = timeframe === "today"
      const isAllTime = timeframe === "all_time"
      const isThisYear = timeframe === "this_year"
      const isLast90Days = timeframe === "last_90_days"
      const isLast30Days = timeframe === "last_30_days" || timeframe === "this_month"

      if (isToday) {
        // Group by hour
        for (let hour = 0; hour <= new Date().getHours(); hour++) {
          const hourStart = new Date(start)
          hourStart.setHours(hour, 0, 0, 0)
          const hourEnd = new Date(start)
          hourEnd.setHours(hour, 59, 59, 999)

          const data = completedOrders.filter(o => {
            const orderDate = new Date(o.created_at)
            return orderDate >= hourStart && orderDate <= hourEnd
          })

          let value = 0
          if (kpiType === "sales") {
            value = data.reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          } else if (kpiType === "orders") {
            value = data.length
          } else if (kpiType === "avgValue") {
            const total = data.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
            value = data.length > 0 ? (total / data.length) / 100 : 0
          }

          points.push({
            label: `${hour.toString().padStart(2, '0')}:00`,
            value,
          })
        }
      } else if (isAllTime) {
        // For all time, group by year to show meaningful data
        const currentYear = new Date().getFullYear()
        const startYear = 2020

        for (let year = startYear; year <= currentYear; year++) {
          const yearStart = new Date(year, 0, 1)
          const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

          const data = completedOrders.filter(o => {
            const orderDate = new Date(o.created_at)
            return orderDate >= yearStart && orderDate <= yearEnd
          })

          let value = 0
          if (kpiType === "sales") {
            value = data.reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          } else if (kpiType === "orders") {
            value = data.length
          } else if (kpiType === "avgValue") {
            const total = data.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
            value = data.length > 0 ? (total / data.length) / 100 : 0
          }

          points.push({
            label: year.toString(),
            value,
          })
        }
      } else if (isThisYear) {
        // Group by month for this year
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const currentYear = new Date().getFullYear()
        const currentMonth = new Date().getMonth()

        for (let month = 0; month <= currentMonth; month++) {
          const monthStart = new Date(currentYear, month, 1)
          const monthEnd = new Date(currentYear, month + 1, 0, 23, 59, 59, 999)

          const data = completedOrders.filter(o => {
            const orderDate = new Date(o.created_at)
            return orderDate >= monthStart && orderDate <= monthEnd
          })

          let value = 0
          if (kpiType === "sales") {
            value = data.reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          } else if (kpiType === "orders") {
            value = data.length
          } else if (kpiType === "avgValue") {
            const total = data.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
            value = data.length > 0 ? (total / data.length) / 100 : 0
          }

          points.push({
            label: monthNames[month],
            value,
          })
        }
      } else {
        // Group by day - adjust based on timeframe
        let dayCount = 7
        let dayStep = 1

        if (isLast90Days) {
          dayCount = 12
          dayStep = 7
        } else if (isLast30Days) {
          dayCount = 10
          dayStep = 3
        } else if (timeframe === "last_7_days") {
          dayCount = 7
          dayStep = 1
        }

        for (let i = dayCount - 1; i >= 0; i--) {
          const dayStart = new Date(end)
          dayStart.setDate(dayStart.getDate() - (i * dayStep))
          dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(dayStart)
          dayEnd.setDate(dayEnd.getDate() + dayStep - 1)
          dayEnd.setHours(23, 59, 59, 999)

          const data = completedOrders.filter(o => {
            const orderDate = new Date(o.created_at)
            return orderDate >= dayStart && orderDate <= dayEnd
          })

          let value = 0
          if (kpiType === "sales") {
            value = data.reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100
          } else if (kpiType === "orders") {
            value = data.length
          } else if (kpiType === "avgValue") {
            const total = data.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
            value = data.length > 0 ? (total / data.length) / 100 : 0
          }

          points.push({
            label: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value,
          })
        }
      }

      setChartData(points)
    } catch (error) {
      console.error("Error generating chart data:", error)
    } finally {
      setIsChartLoading(false)
    }
  }

  // Generate PDF report
  const generatePDFReport = (report: MonthlyReport, action: 'view' | 'download' = 'view') => {
    // Calculate avg from completed orders only
    const completedOrders = report.orderDetails.filter(o => o.status === "completed")
    const refundedOrders = report.orderDetails.filter(o => o.status === "refunded")
    const avgOrderValue = completedOrders.length > 0 ? report.revenue / completedOrders.length : 0
    const refundTotal = refundedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
    const netRevenue = report.revenue - refundTotal
    const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const reportId = `RPT-${report.year}${String(new Date(report.month + ' 1, ' + report.year).getMonth() + 1).padStart(2, '0')}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`

    // Create PDF content as HTML for printing
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Report - ${report.monthYear}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1a1a2e; line-height: 1.5; }
          .header { margin-bottom: 30px; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
          .header-left { display: flex; align-items: center; gap: 12px; }
          .logo { width: 32px; height: 32px; }
          .header h1 { font-size: 22px; margin: 0; font-weight: 600; }
          .header-right { text-align: right; }
          .header-right p { color: #6b7280; margin: 2px 0; font-size: 13px; }
          .header-right .report-id { font-family: monospace; font-size: 11px; color: #9ca3af; }
          .seller-info { background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
          .seller-info h3 { font-size: 12px; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; letter-spacing: 0.5px; }
          .seller-info p { font-size: 14px; margin: 4px 0; }
          .summary { display: flex; gap: 20px; margin: 24px 0; flex-wrap: wrap; }
          .summary-item { flex: 1; min-width: 140px; background: #f9fafb; border-radius: 12px; padding: 16px; }
          .summary-item .label { font-size: 11px; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
          .summary-item .value { font-size: 22px; font-weight: 600; }
          .summary-item .value.negative { color: #dc2626; }
          .summary-item .value.positive { color: #059669; }
          .section-title { font-size: 14px; font-weight: 600; margin: 24px 0 12px 0; color: #374151; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          th { text-align: left; padding: 10px 12px; background: #f3f4f6; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
          td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
          .amount { text-align: right; font-weight: 500; }
          .status { text-transform: capitalize; font-size: 12px; padding: 2px 8px; border-radius: 4px; display: inline-block; }
          .status-completed { background: #f3e8ff; color: #7c3aed; }
          .status-pending { background: #fef3c7; color: #d97706; }
          .status-refunded { background: #fee2e2; color: #dc2626; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
          .footer-grid { display: flex; justify-content: space-between; margin-bottom: 16px; }
          .footer-section h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; color: #6b7280; }
          .footer-section p { margin: 2px 0; }
          .legal-notice { background: #f9fafb; padding: 12px; border-radius: 6px; margin-top: 16px; font-size: 10px; line-height: 1.6; }
          .legal-notice strong { color: #374151; }
          @media print {
            body { padding: 20px; }
            .summary-item { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg" alt="Storelib" class="logo" />
            <h1>Storelib - Sales Report</h1>
          </div>
          <div class="header-right">
            <p><strong>Period:</strong> ${report.monthYear}</p>
            <p><strong>Generated:</strong> ${generatedDate}</p>
            <p class="report-id">Report ID: ${reportId}</p>
          </div>
        </div>

        <div class="seller-info">
          <h3>Seller Information</h3>
          <p><strong>Business Name:</strong> ${sellerName}</p>
          <p><strong>Store:</strong> ${storeName}</p>
          <p><strong>Report Period:</strong> ${report.monthYear}</p>
          <p><strong>Currency:</strong> ${currency}</p>
        </div>

        <div class="summary">
          <div class="summary-item">
            <div class="label">Gross Revenue</div>
            <div class="value">${formatPrice(report.revenue)}</div>
          </div>
          <div class="summary-item">
            <div class="label">Refunds</div>
            <div class="value negative">${refundedOrders.length > 0 ? '-' : ''}${formatPrice(refundTotal)}</div>
          </div>
          <div class="summary-item">
            <div class="label">Net Revenue</div>
            <div class="value positive">${formatPrice(netRevenue)}</div>
          </div>
          <div class="summary-item">
            <div class="label">Total Orders</div>
            <div class="value">${report.orders}</div>
          </div>
          <div class="summary-item">
            <div class="label">Avg Order Value</div>
            <div class="value">${formatPrice(avgOrderValue)}</div>
          </div>
        </div>

        <div class="section-title">Transaction Details</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Product</th>
              <th>Status</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${report.orderDetails.map(order => `
              <tr>
                <td>${formatDate(order.created_at)}</td>
                <td>#${order.id.slice(0, 8)}</td>
                <td>${order.buyer?.email || order.buyer_email || 'Unknown'}</td>
                <td>${order.product?.title || 'Unknown'}</td>
                <td><span class="status status-${order.status}">${order.status}</span></td>
                <td class="amount">${order.amount_cents > 0 ? formatPrice(order.amount_cents) : 'Free'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-grid">
            <div class="footer-section">
              <h4>Payment Processing</h4>
              <p>Payments processed via Stripe</p>
              <p>All amounts in ${currency}</p>
            </div>
            <div class="footer-section">
              <h4>Report Summary</h4>
              <p>Total Transactions: ${report.orders}</p>
              <p>Completed: ${completedOrders.length}</p>
              <p>Refunded: ${refundedOrders.length}</p>
            </div>
            <div class="footer-section">
              <h4>Generated By</h4>
              <p>Storelib Platform</p>
              <p>${generatedDate}</p>
            </div>
          </div>

          <div class="legal-notice">
            <strong>Legal Disclaimer:</strong> This sales report is generated for informational and record-keeping purposes only.
            The seller is responsible for maintaining accurate financial records and complying with all applicable tax laws and regulations in their jurisdiction.
            This document does not constitute tax advice. Please consult with a qualified tax professional regarding your tax obligations.
            Storelib acts as a payment facilitator and is not responsible for the accuracy of seller-provided information.
            All sales are subject to Storelib's Terms of Service and applicable platform fees.
            Refunds are processed according to the seller's refund policy and Storelib's refund guidelines.
            <br /><br />
            <strong>Data Retention:</strong> Transaction records are retained for a minimum of 7 years in compliance with financial regulations.
            For questions regarding this report, contact support@storelib.io.
          </div>
        </div>
      </body>
      </html>
    `

    // Open print window
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
      if (action === 'download') {
        printWindow.print()
      }
    }
  }

  // Fetch chart data when KPI modal opens
  useEffect(() => {
    if (openKPIModal && openKPIModal !== "refunds") {
      fetchChartData(openKPIModal)
    }
  }, [openKPIModal, timeframe])

  useEffect(() => {
    fetchSalesData()
  }, [timeframe, searchQuery, appliedFilters])

  // Sync refund status from Stripe on page load (catches refunds done via Stripe Dashboard)
  useEffect(() => {
    const syncRefunds = async () => {
      try {
        const response = await fetch("/api/stripe/sync-refunds", { method: "POST" })
        if (response.ok) {
          const data = await response.json()
          if (data.synced > 0) {
            router.refresh()
          }
        }
      } catch (err) {
        console.error("Error syncing refunds:", err)
      }
    }
    syncRefunds()
  }, [])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(".timeframe-dropdown")) {
        setIsTimeframeOpen(false)
      }
      if (!target.closest(".filter-dropdown") && !target.closest(".filter-button")) {
        setIsFilterOpen(false)
      }
      // Close order menu when clicking outside
      if (!target.closest(".order-menu")) {
        setOpenMenuOrderId(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
            if (showPayoutsBanner) return "payouts"
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
  }, [announcementType, showPayoutsBanner])

  const selectedOption = timeframeOptions.find((o) => o.value === timeframe)

  const handleApplyFilters = () => {
    setAppliedFilters({
      dateRange: filterDateRange,
      fromDate: filterFromDate,
      toDate: filterToDate,
      product: filterProduct,
      minValue: filterMinValue,
      maxValue: filterMaxValue,
      customer: filterCustomer,
      status: filterStatus,
    })
    setIsFilterOpen(false)
  }

  const handleClearFilters = () => {
    setFilterDateRange("30days")
    setFilterFromDate("")
    setFilterToDate("")
    setFilterProduct("all")
    setFilterMinValue("")
    setFilterMaxValue("")
    setFilterCustomer("")
    setFilterStatus("all")
    setAppliedFilters(null)
  }

  // Calculate best performing products
  const getBestPerformingProducts = () => {
    const completedOrders = initialOrders.filter(o => o.status === "completed")
    const productStats: Record<string, {
      productId: string
      title: string
      coverImage?: string
      viewCount: number
      salesCount: number
      revenue: number
    }> = {}

    completedOrders.forEach(order => {
      const productId = order.product_id
      const productData = products.find(p => p.id === productId)
      if (!productStats[productId]) {
        productStats[productId] = {
          productId,
          title: order.product?.title || "Unknown Product",
          coverImage: order.product?.thumbnail_url || undefined,
          viewCount: productData?.view_count || 0,
          salesCount: 0,
          revenue: 0,
        }
      }
      productStats[productId].salesCount += 1
      productStats[productId].revenue += order.amount_cents || 0
    })

    // Sort by revenue descending
    return Object.values(productStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5) // Top 5 products
  }

  const bestProducts = getBestPerformingProducts()

  const handleExportCSV = () => {
    if (orders.length === 0) return

    const headers = ["Order ID", "Date", "Customer Name", "Customer Email", "Product", "Amount", "Status"]
    const rows = orders.map((order) => [
      order.id,
      formatDate(order.created_at),
      order.buyer?.display_name || (order.buyer_first_name && order.buyer_last_name ? `${order.buyer_first_name} ${order.buyer_last_name}` : "Unknown"),
      order.buyer?.email || order.buyer_email || "",
      order.product?.title || "Unknown",
      formatPrice(order.amount_cents),
      order.status,
    ])

    const csv = [headers.join(","), ...rows.map((row) => row.map(cell => `"${cell}"`).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sales-export-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Check if there are any orders in selected timeframe or any orders all time
  const hasOrders = orders.length > 0 || initialOrders.length > 0 || summary.totalOrders > 0
  const hasChartData = chartData.some(d => d.value > 0)

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fa] sales-scroll-container">
      {/* Notification Toast */}
      {notification.visible && (
        <div className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <div className="bg-[#1a1a2e] text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-[13px] font-medium whitespace-nowrap max-w-[calc(100vw-2rem)]">
            <Check className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="hidden sm:block">{notification.message}</span>
            <span className="sm:hidden overflow-hidden text-ellipsis">{
              notification.message.includes("Receipt sent to") ? "Receipt sent" :
              notification.message.includes("Maximum resend limit") ? "Resend limit reached" :
              notification.message.includes("Unable to resend") ? "Receipt unavailable" :
              notification.message.includes("Failed to send") ? "Send failed" :
              notification.message.includes("unsubscribed") ? "Unsubscribed" :
              notification.message
            }</span>
          </div>
        </div>
      )}

      {/* Rotating Announcement Bar */}
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
                  className="inline-flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-white/90 to-gray-100/90 text-gray-800 text-[11px] md:text-[13px] font-medium rounded-full transition-all hover:from-white hover:to-gray-50 shrink-0"
                >
                  Upgrade
                </Link>
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
        {/* Header */}
        <div className="flex flex-col gap-4 mb-6">
          {/* Title and Controls Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3.5">
              <h1 className="text-[20px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">Sales</h1>

              {/* Desktop Timeframe Dropdown */}
              <div className="relative timeframe-dropdown hidden md:block">
                <button
                  onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
                >
                  {selectedOption?.label || "Last 30 days"}
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
                        className={`w-full text-left px-4 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
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
                className="md:hidden inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] shadow-sm"
              >
                {selectedOption?.label || "Last 30 days"}
                <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
              </button>
            </div>

            {/* Right side buttons - Always visible */}
            <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Search - Desktop inline, Mobile opens full-width bar below */}
            <div className="relative">
              {/* Desktop search - inline */}
              <div className="hidden sm:block">
                {isSearchOpen ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search orders..."
                      className="w-48 px-3 py-1.5 text-[13px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        setIsSearchOpen(false)
                        setSearchQuery("")
                      }}
                      className="p-1.5 text-[#9ca3af] hover:text-[#6b7280]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsSearchOpen(true)}
                    className="p-2 bg-white border border-[#e5e7eb] rounded-lg text-[#6b7280] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                )}
              </div>
              {/* Mobile search toggle button - 15% bigger to match timeframe button height */}
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className={`sm:hidden p-2 bg-white border rounded-lg transition-colors shadow-sm cursor-pointer ${
                  isSearchOpen ? "border-[#8b5cf6] text-[#8b5cf6]" : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"
                }`}
              >
                <Search className="h-4 w-4" />
              </button>
            </div>

            {/* Filter - desktop dropdown, mobile bottom sheet */}
            <div className="relative">
              {/* Mobile filter button - opens bottom sheet */}
              <button
                onClick={() => setIsFilterSheetOpen(true)}
                className={`filter-button p-2 bg-white border rounded-lg transition-colors shadow-sm cursor-pointer md:hidden ${
                  appliedFilters ? "border-[#8b5cf6] text-[#8b5cf6]" : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"
                }`}
              >
                <Filter className="h-4 w-4" />
              </button>
              {/* Desktop filter button - opens dropdown */}
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`filter-button p-2 bg-white border rounded-lg transition-colors shadow-sm cursor-pointer hidden md:block ${
                  appliedFilters ? "border-[#8b5cf6] text-[#8b5cf6]" : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"
                }`}
              >
                <Filter className="h-4 w-4" />
              </button>

              {/* Filter Dropdown - Desktop only */}
              {isFilterOpen && (
                <div className="filter-dropdown absolute right-0 top-full mt-2 w-[320px] bg-white border border-[#e5e7eb] rounded-xl shadow-xl z-50 p-4 animate-in fade-in-0 zoom-in-95 duration-100 hidden md:block">
                  <div className="space-y-4">
                    {/* Date Range */}
                    <div>
                      <label className="block text-[12px] font-medium text-[#6b7280] mb-2">Date range</label>
                      <div className="flex gap-1">
                        {[
                          { value: "today", label: "Today" },
                          { value: "7days", label: "7 days" },
                          { value: "30days", label: "30 days" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setFilterDateRange(opt.value as any)}
                            className={`flex-1 px-2 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                              filterDateRange === opt.value
                                ? "bg-[#8b5cf6] text-white border-[#8b5cf6]"
                                : "bg-white text-[#374151] border-[#e5e7eb] hover:bg-[#f9fafb]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* From / To */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">From</label>
                        <input
                          type="date"
                          value={filterFromDate}
                          onChange={(e) => setFilterFromDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">To</label>
                        <input
                          type="date"
                          value={filterToDate}
                          onChange={(e) => setFilterToDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                        />
                      </div>
                    </div>

                    {/* Product */}
                    <div>
                      <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">Product</label>
                      <select
                        value={filterProduct}
                        onChange={(e) => setFilterProduct(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] bg-white"
                      >
                        <option value="all">Select products</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                      </select>
                    </div>

                    {/* Order Value */}
                    <div>
                      <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">Order value (optional)</label>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="number"
                          value={filterMinValue}
                          onChange={(e) => setFilterMinValue(e.target.value)}
                          placeholder="Min"
                          className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                        />
                        <input
                          type="number"
                          value={filterMaxValue}
                          onChange={(e) => setFilterMaxValue(e.target.value)}
                          placeholder="Max"
                          className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                        />
                      </div>
                    </div>

                    {/* Customer */}
                    <div>
                      <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">Customer</label>
                      <input
                        type="text"
                        value={filterCustomer}
                        onChange={(e) => setFilterCustomer(e.target.value)}
                        placeholder="Email or name"
                        className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                      />
                    </div>

                    {/* Status */}
                    <div>
                      <label className="block text-[12px] font-medium text-[#6b7280] mb-1.5">Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-[12px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] bg-white"
                      >
                        <option value="all">All statuses</option>
                        <option value="completed">Completed</option>
                        <option value="pending">Pending</option>
                        <option value="refunded">Refunded</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-[#e5e7eb]" />

                    {/* Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleClearFilters}
                        className="flex-1 px-3 py-2 text-[13px] font-medium text-[#6b7280] bg-white border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors"
                      >
                        Clear all
                      </button>
                      <button
                        onClick={handleApplyFilters}
                        className="flex-1 px-3 py-2 text-[13px] font-medium text-white bg-[#8b5cf6] rounded-lg hover:bg-[#7c3aed] transition-colors"
                      >
                        Apply filters
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Download - 15% bigger on mobile to match timeframe button height */}
            <button
              onClick={handleExportCSV}
              className="p-2 bg-white border border-[#e5e7eb] rounded-lg text-[#6b7280] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
              title="Export CSV"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
          </div>

          {/* Tab Pills - Responsive - Matching Settings page style */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
            <button
              onClick={() => setActiveTab("orders")}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 border ${
                activeTab === "orders"
                  ? "bg-[#f3f4f6] text-[#1a1a2e] border-[#e5e7eb]"
                  : "text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border-transparent"
              }`}
            >
              All Orders
            </button>
            <button
              onClick={() => setActiveTab("reports")}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 border ${
                activeTab === "reports"
                  ? "bg-[#f3f4f6] text-[#1a1a2e] border-[#e5e7eb]"
                  : "text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border-transparent"
              }`}
            >
              Sales Reports
            </button>
          </div>

          {/* Mobile Search Bar - Full width, appears below header */}
          {isSearchOpen && (
            <div className="sm:hidden mt-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 shadow-sm">
                <Search className="h-4 w-4 text-[#9ca3af] flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by customer, product, or order ID..."
                  className="flex-1 text-[14px] bg-transparent outline-none placeholder:text-[#9ca3af]"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setIsSearchOpen(false)
                    setSearchQuery("")
                  }}
                  className="p-1 text-[#9ca3af] hover:text-[#6b7280] flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Bottom Sheet - Timeframe */}
        <TimeframeBottomSheet
          isOpen={isMobileSheetOpen}
          onClose={() => setIsMobileSheetOpen(false)}
          options={timeframeOptions}
          selectedValue={timeframe}
          onSelect={setTimeframe}
        />

        {/* Mobile Bottom Sheet - Filters */}
        <FilterBottomSheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          products={products}
          filterDateRange={filterDateRange}
          setFilterDateRange={setFilterDateRange}
          filterFromDate={filterFromDate}
          setFilterFromDate={setFilterFromDate}
          filterToDate={filterToDate}
          setFilterToDate={setFilterToDate}
          filterProduct={filterProduct}
          setFilterProduct={setFilterProduct}
          filterMinValue={filterMinValue}
          setFilterMinValue={setFilterMinValue}
          filterMaxValue={filterMaxValue}
          setFilterMaxValue={setFilterMaxValue}
          filterCustomer={filterCustomer}
          setFilterCustomer={setFilterCustomer}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
        />

        {/* KPI Cards */}
        <div className={`grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8 ${isLoading ? "opacity-60" : ""}`}>
          {/* Total Sales */}
          <div
            className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
              openKPIModal === "sales" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
            }`}
            onClick={() => setOpenKPIModal(openKPIModal === "sales" ? null : "sales")}
          >
            {openKPIModal === "sales" ? (
              <div onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-violet-600">{t("sales.totalSales")}</span>
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
                        <div className="w-full rounded-sm bg-violet-200/60 skeleton-bar" style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }} />
                      </div>
                    ))}
                  </div>
                ) : !hasChartData ? (
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
                  <span className="text-[13px] font-medium text-[#6b7280]">{t("sales.totalSales")}</span>
                  <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                    <DollarSign className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                </div>
                <div className={`text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight transition-all duration-300 ${isLoading ? "blur-[2px]" : "blur-0"}`}>
                  {formatPrice(summary.totalSales)}
                </div>
                <p className={`text-[11px] sm:text-[12px] text-[#9ca3af] mt-1 transition-all duration-300 ${isLoading ? "blur-[1px]" : "blur-0"}`}>Gross revenue</p>
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
                        <div className="w-full rounded-sm bg-violet-200/60 skeleton-bar" style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }} />
                      </div>
                    ))}
                  </div>
                ) : !hasChartData ? (
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
                <div className={`text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight transition-all duration-300 ${isLoading ? "blur-[2px]" : "blur-0"}`}>
                  {formatCompactNumber(summary.totalOrders)}
                </div>
                <p className={`text-[11px] sm:text-[12px] text-[#9ca3af] mt-1 transition-all duration-300 ${isLoading ? "blur-[1px]" : "blur-0"}`}>Completed orders</p>
              </>
            )}
          </div>

          {/* Avg Order Value */}
          <div
            className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${
              openKPIModal === "avgValue" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"
            }`}
            onClick={() => setOpenKPIModal(openKPIModal === "avgValue" ? null : "avgValue")}
          >
            {openKPIModal === "avgValue" ? (
              <div onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-violet-600">{t("sales.avgOrderValue")}</span>
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
                        <div className="w-full rounded-sm bg-violet-200/60 skeleton-bar" style={{ height: `${h}px`, animationDelay: `${i * 0.1}s` }} />
                      </div>
                    ))}
                  </div>
                ) : !hasChartData ? (
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
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                    <span className="text-[12px] sm:text-[13px] font-medium text-[#6b7280] hidden sm:inline">Avg Order Value</span>
                    <span className="text-[12px] font-medium text-[#6b7280] sm:hidden leading-tight">Avg Order<br />Value</span>
                    {/* Info icon with tooltip - hidden on mobile, shown on desktop */}
                    <div className="group/info relative flex-shrink-0 hidden sm:block">
                      <div className="w-4 h-4 min-w-[16px] min-h-[16px] rounded-full bg-[#f3f4f6] flex items-center justify-center cursor-help">
                        <span className="text-[9px] font-medium text-[#9ca3af]">i</span>
                      </div>
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-[#1a1a2e] text-white text-[11px] rounded-lg opacity-0 group-hover/info:opacity-100 transition-opacity duration-200 pointer-events-none z-30 w-[160px] text-center shadow-lg">
                        Revenue per order
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-[#1a1a2e]" />
                      </div>
                    </div>
                  </div>
                  <div className="w-8 h-8 min-w-[32px] rounded-lg bg-[#f3f4f6] flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
                  </div>
                </div>
                <div className={`text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight transition-all duration-300 ${isLoading ? "blur-[2px]" : "blur-0"}`}>
                  {formatPrice(summary.avgOrderValue)}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <p className={`text-[11px] sm:text-[12px] text-[#9ca3af] transition-all duration-300 ${isLoading ? "blur-[1px]" : "blur-0"}`}>Per transaction</p>
                  {/* Info icon on mobile - positioned next to "Per transaction" */}
                  <div className="group/info relative flex-shrink-0 sm:hidden">
                    <div className="w-4 h-4 min-w-[16px] min-h-[16px] rounded-full bg-[#f3f4f6] flex items-center justify-center cursor-help">
                      <span className="text-[9px] font-medium text-[#9ca3af]">i</span>
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-[#1a1a2e] text-white text-[11px] rounded-lg opacity-0 group-hover/info:opacity-100 transition-opacity duration-200 pointer-events-none z-30 w-[120px] text-center shadow-lg whitespace-nowrap">
                      Revenue per order
                      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-[#1a1a2e]" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Refunds */}
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[#6b7280]">{t("sales.refunds")}</span>
              <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                <RotateCcw className="h-4 w-4 text-[#9ca3af]" />
              </div>
            </div>
            <div className={`text-[24px] sm:text-[28px] font-semibold text-rose-500 tracking-tight transition-all duration-300 ${isLoading ? "blur-[2px]" : "blur-0"}`}>
              {formatCompactNumber(summary.refundCount)}
            </div>
            <p className={`text-[11px] sm:text-[12px] text-[#9ca3af] mt-1 transition-all duration-300 ${isLoading ? "blur-[1px]" : "blur-0"}`}>{formatPrice(summary.refundAmount)} refunded</p>
          </div>
        </div>

        {/* Content Area - Sales or Reports */}
        {activeTab === "reports" ? (
          /* Sales Reports Tab */
          monthlyReports.length > 0 ? (
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              {/* Mobile Card View */}
              <div className="sm:hidden divide-y divide-[#e5e7eb]">
                {monthlyReports.map((report) => (
                  <div key={`${report.year}-${report.month}`} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium text-[#1a1a2e]">{report.monthYear}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[12px] text-[#6b7280]">{report.orders} orders</span>
                          <span className="text-[12px] text-[#9ca3af]">•</span>
                          <span className="text-[12px] font-medium text-[#1a1a2e]">{formatPrice(report.revenue)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => generatePDFReport(report, 'download')}
                        className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#8b5cf6] hover:bg-[#7c3aed] transition-colors rounded-lg flex items-center gap-1.5 flex-shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e5e7eb]">
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Month & Year</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Orders</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Revenue</th>
                      <th className="text-right px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e7eb]">
                    {monthlyReports.map((report) => (
                      <tr key={`${report.year}-${report.month}`} className="hover:bg-[#f9fafb] transition-colors">
                        <td className="px-5 py-4">
                          <span className="text-[14px] font-medium text-[#1a1a2e]">{report.monthYear}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[14px] text-[#1a1a2e]">{report.orders}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[14px] font-medium text-[#1a1a2e]">{formatPrice(report.revenue)}</span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => generatePDFReport(report, 'view')}
                              className="text-[13px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors cursor-pointer hover:underline"
                            >
                              View
                            </button>
                            <span className="text-[#d1d5db]">·</span>
                            <button
                              onClick={() => generatePDFReport(report, 'download')}
                              className="text-[13px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors cursor-pointer hover:underline"
                            >
                              Download
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* No Reports Empty State */
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-12">
              <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-[#f3f4f6] flex items-center justify-center mb-5">
                  <FileText className="h-8 w-8 text-[#9ca3af]" />
                </div>
                <h2 className="text-[18px] font-semibold text-[#1a1a2e] mb-2">
                  No reports available
                </h2>
                <p className="text-[14px] text-[#6b7280] mb-6">
                  Reports will be available once you start making your first orders.
                </p>
                <Link
                  href="/app/products/new"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#8b5cf6] text-white text-[14px] font-medium rounded-full hover:bg-[#7c3aed] transition-colors"
                >
                  Start selling
                </Link>
              </div>
            </div>
          )
        ) : (
          /* All Orders Tab - Orders List or Empty State */
          !hasOrders ? (
            /* Empty State - Simple Icon Design */
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-12">
              <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
                {/* Icon Container with Decorative Elements */}
                <div className="relative mb-7">
                  {/* Background Circle */}
                  <div className="w-20 h-20 rounded-full bg-[#f5f3ff] flex items-center justify-center">
                    {/* Main Icon */}
                    <DollarSign className="h-9 w-9 text-[#8b5cf6]" />
                  </div>
                  {/* Decorative Ring */}
                  <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-dashed border-[#ddd6fe] animate-spin" style={{ animationDuration: '20s' }} />
                </div>

                <h2 className="text-[18px] font-semibold text-[#1a1a2e] mb-2">
                  You're one step away from making your first sale.
                </h2>
                <p className="text-[14px] text-[#6b7280] mb-6">
                  Every time a new customer purchases a product from your Storelib, their email address and other details are added here.
                </p>
                <Link
                  href="/app/products/new"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#8b5cf6] text-white text-[14px] font-medium rounded-full hover:bg-[#7c3aed] transition-colors cursor-pointer"
                >
                  Start selling
                </Link>
              </div>
            </div>
          ) : (
            /* Orders List - Responsive */
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              {/* Mobile View - Card List */}
              <div className="sm:hidden divide-y divide-[#e5e7eb]">
                {orders.map((order) => {
                  const productData = products.find(p => p.id === order.product_id)
                  const productImage = productData?.thumbnail_url || order.product?.thumbnail_url
                  const customerName = order.buyer?.display_name ||
                    (order.buyer_first_name && order.buyer_last_name
                      ? `${order.buyer_first_name} ${order.buyer_last_name}`
                      : "Customer")
                  const productTitle = order.product?.title || productData?.title || "Product"
                  const mobileDate = new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })

                  return (
                    <div
                      key={order.id}
                      className="px-3 py-3 active:bg-[#f9fafb]"
                    >
                      <div className="flex items-center gap-3">
                        {/* Product Thumbnail */}
                        {productImage ? (
                          <img
                            src={productImage}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center flex-shrink-0">
                            <Package className="h-4 w-4 text-[#9ca3af]" />
                          </div>
                        )}

                        {/* Order Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-[13px] font-medium text-[#1a1a2e] truncate max-w-[100px]">
                              {customerName.length > 10 ? customerName.slice(0, 10) + "..." : customerName}
                            </p>
                            <span className="text-[10px] text-[#9ca3af]">•</span>
                            <span className="text-[10px] text-[#6b7280]">{mobileDate}</span>
                          </div>
                          <p className="text-[11px] text-[#6b7280] truncate max-w-[120px]">
                            {productTitle.length > 15 ? productTitle.slice(0, 15) + "..." : productTitle}
                          </p>
                        </div>

                        {/* Amount & View */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <p className="text-[13px] font-semibold text-[#1a1a2e]">
                            {formatPrice(order.amount_cents)}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleViewOrder(order)
                            }}
                            className="px-2.5 py-1.5 text-[12px] font-medium text-[#6b7280] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop View - Full Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e5e7eb]">
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Customer</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Product</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Date</th>
                      <th className="text-right px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Amount</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Status</th>
                      <th className="text-right px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e7eb]">
                    {orders.map((order) => {
                      // Find product thumbnail image
                      const productData = products.find(p => p.id === order.product_id)
                      const productImage = productData?.thumbnail_url || order.product?.thumbnail_url
                      return (
                        <tr
                          key={order.id}
                          className="hover:bg-[#f9fafb] transition-colors cursor-pointer"
                          onClick={(e) => {
                            // Don't open modal if clicking on action buttons
                            if ((e.target as HTMLElement).closest('.order-actions')) return
                            handleViewOrder(order)
                          }}
                        >
                          <td className="px-5 py-4">
                            <div>
                              <p className="text-[14px] font-medium text-[#1a1a2e]">
                                {order.buyer?.display_name || (order.buyer_first_name && order.buyer_last_name ? `${order.buyer_first_name} ${order.buyer_last_name}` : "Customer")}
                              </p>
                              <p className="text-[12px] text-[#6b7280]">{order.buyer?.email || order.buyer_email || ""}</p>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              {productImage ? (
                                <img
                                  src={productImage}
                                  alt=""
                                  className="w-10 h-10 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                                  <Package className="h-4 w-4 text-[#9ca3af]" />
                                </div>
                              )}
                              <span className="text-[14px] text-[#1a1a2e] truncate max-w-[200px]">
                                {order.product?.title || products.find(p => p.id === order.product_id)?.title || "Unknown Product"}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-[14px] text-[#6b7280]">{formatDate(order.created_at)}</span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="text-[14px] font-medium text-[#1a1a2e]">{formatPrice(order.amount_cents)}</span>
                          </td>
                          <td className="px-5 py-4">
                            {getStatusBadge(order.status)}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 order-actions">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleViewOrder(order)
                                }}
                                className="px-3 py-1.5 text-[12px] font-medium text-[#1a1a2e] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors cursor-pointer"
                              >
                                View
                              </button>
                              <div className="relative order-menu">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenMenuOrderId(openMenuOrderId === order.id ? null : order.id)
                                  }}
                                  className="p-1.5 text-[#9ca3af] hover:text-[#6b7280] hover:bg-[#f3f4f6] rounded-lg transition-colors"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                                {openMenuOrderId === order.id && (
                                  <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleEditEmail(order)
                                      }}
                                      className="w-full text-left px-3 py-2 text-[13px] text-[#374151] hover:bg-[#f9fafb] flex items-center gap-2"
                                    >
                                      <Mail className="h-4 w-4 text-[#9ca3af]" />
                                      Edit email address
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleResendReceipt(order)
                                      }}
                                      className="w-full text-left px-3 py-2 text-[13px] text-[#374151] hover:bg-[#f9fafb] flex items-center gap-2"
                                    >
                                      <Send className="h-4 w-4 text-[#9ca3af]" />
                                      Resend receipt
                                      <span className="ml-auto text-[11px] text-[#9ca3af]">
                                        {receiptResendCounts[order.id] || 0}/5
                                      </span>
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleUnsubscribe(order)
                                      }}
                                      className="w-full text-left px-3 py-2 text-[13px] text-[#374151] hover:bg-[#f9fafb] flex items-center gap-2"
                                    >
                                      <UserX className="h-4 w-4 text-[#9ca3af]" />
                                      Unsubscribe from emails
                                    </button>
                                    {order.status === "completed" && (
                                      <>
                                        <div className="border-t border-[#e5e7eb] my-1" />
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleOpenRefund(order)
                                          }}
                                          className="w-full text-left px-3 py-2 text-[13px] text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                        >
                                          <RotateCcw className="h-4 w-4" />
                                          Issue refund
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination info */}
              {totalCount > 0 && (
                <div className="px-4 sm:px-5 py-3 border-t border-[#e5e7eb] text-[12px] sm:text-[13px] text-[#6b7280]">
                  Showing {orders.length} of {totalCount} orders
                </div>
              )}
            </div>
          )
        )}

        {/* Best Performance Products Section */}
        {activeTab === "orders" && bestProducts.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold text-[#1a1a2e]">
                Best Performing Products
              </h2>
              <span className="text-[12px] text-[#6b7280]">By revenue</span>
            </div>
            <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              {/* Mobile card view */}
              <div className="sm:hidden divide-y divide-[#e5e7eb]">
                {bestProducts.map((product, index) => {
                  const productData = products.find(p => p.id === product.productId)
                  const coverImage = productData?.thumbnail_url || product.coverImage
                  return (
                    <div key={product.productId} className="p-4 flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                        index === 0
                          ? "bg-amber-100 text-amber-700"
                          : index === 1
                          ? "bg-gray-100 text-gray-600"
                          : index === 2
                          ? "bg-orange-100 text-orange-700"
                          : "bg-[#f3f4f6] text-[#6b7280]"
                      }`}>
                        {index + 1}
                      </div>
                      {coverImage ? (
                        <img src={coverImage} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-[#9ca3af]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-[#1a1a2e] truncate">
                          {product.title || productData?.title || "Unknown Product"}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[12px] text-[#6b7280]">{product.viewCount.toLocaleString()} views</span>
                          <span className="text-[12px] text-[#6b7280]">{product.salesCount} sales</span>
                        </div>
                      </div>
                      <span className="text-[14px] font-semibold text-[#1a1a2e] shrink-0">{formatPrice(product.revenue)}</span>
                    </div>
                  )
                })}
              </div>
              {/* Desktop table view */}
              <div className="hidden sm:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e5e7eb]">
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider w-12">#</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Product</th>
                      <th className="text-left px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Views</th>
                      <th className="text-right px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Sales</th>
                      <th className="text-right px-5 py-3 text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e7eb]">
                    {bestProducts.map((product, index) => {
                      const productData = products.find(p => p.id === product.productId)
                      const coverImage = productData?.thumbnail_url || product.coverImage
                      return (
                        <tr key={product.productId} className="hover:bg-[#f9fafb] transition-colors">
                          <td className="px-5 py-4">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                              index === 0
                                ? "bg-amber-100 text-amber-700"
                                : index === 1
                                ? "bg-gray-100 text-gray-600"
                                : index === 2
                                ? "bg-orange-100 text-orange-700"
                                : "bg-[#f3f4f6] text-[#6b7280]"
                            }`}>
                              {index + 1}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              {coverImage ? (
                                <img
                                  src={coverImage}
                                  alt=""
                                  className="w-10 h-10 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                                  <Package className="h-4 w-4 text-[#9ca3af]" />
                                </div>
                              )}
                              <span className="text-[14px] font-medium text-[#1a1a2e] truncate max-w-[200px]">
                                {product.title || productData?.title || "Unknown Product"}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-[13px] text-[#6b7280]">{product.viewCount.toLocaleString()}</span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="text-[14px] font-medium text-[#1a1a2e]">{product.salesCount}</span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="text-[14px] font-semibold text-[#1a1a2e]">{formatPrice(product.revenue)}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Order Details Modal - Mobile Bottom Sheet with swipe-to-close, Desktop centered */}
      <OrderDetailsModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        selectedOrder={selectedOrder}
        products={products}
        formatPrice={formatPrice}
        formatFullDate={formatFullDate}
        handleCopyOrderId={handleCopyOrderId}
        copiedId={copiedId}
        getStatusBadge={getStatusBadge}
        handleResendReceipt={handleResendReceipt}
        handleUnsubscribe={handleUnsubscribe}
        handleEditEmail={handleEditEmail}
        handleDownloadInvoice={handleDownloadInvoice}
        handleOpenRefund={handleOpenRefund}
        receiptResendCounts={receiptResendCounts}
        getFlagEmoji={getFlagEmoji}
        setShowOrderModal={setShowOrderModal}
      />

      {/* Edit Email Modal */}
      {showEditEmailModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowEditEmailModal(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-xl animate-in fade-in-0 zoom-in-95 duration-200">
            {/* Header */}
            <div className="border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#1a1a2e]">Edit Email Address</h2>
              <button
                onClick={() => setShowEditEmailModal(false)}
                className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#374151] mb-1.5">
                  Customer Email
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full px-4 py-2.5 text-[14px] border border-[#e5e7eb] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] transition-colors"
                />
                <p className="text-[12px] text-[#6b7280] mt-1.5">
                  This will update the email address for order #{selectedOrder.id.slice(0, 8)}
                </p>
              </div>

              <div className="bg-[#f9fafb] rounded-xl p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[#d1d5db] text-[#8b5cf6] focus:ring-[#8b5cf6]"
                    defaultChecked
                  />
                  <span className="text-[13px] text-[#374151]">
                    Send purchase receipt to new email
                  </span>
                </label>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="border-t border-[#e5e7eb] px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowEditEmailModal(false)}
                className="px-4 py-2 text-[13px] font-medium text-[#6b7280] hover:text-[#374151] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Save email logic here
                  setShowEditEmailModal(false)
                }}
                className="px-4 py-2 text-[13px] font-medium text-white bg-[#8b5cf6] rounded-lg hover:bg-[#7c3aed] transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundModalOpen && refundOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRefundModalOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-xl animate-in fade-in-0 zoom-in-95 duration-200">
            {/* Header */}
            <div className="border-b border-[#e5e7eb] px-6 py-4">
              <h2 className="text-[18px] font-semibold text-[#1a1a2e]">Issue Refund</h2>
              <p className="text-[13px] text-[#6b7280] mt-1">Process a refund for this order. The customer will be notified via email.</p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Order summary */}
              <div className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-xl">
                {refundOrder.product?.thumbnail_url ? (
                  <img src={refundOrder.product.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[#e5e7eb] flex items-center justify-center"><Package className="h-4 w-4 text-[#9ca3af]" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-[#1a1a2e] truncate">{refundOrder.product?.title || "Product"}</p>
                  <p className="text-[12px] text-[#9ca3af]">{refundOrder.buyer_email || refundOrder.customer_email || refundOrder.buyer?.email || "N/A"}</p>
                </div>
                <p className="text-[14px] font-semibold text-[#1a1a2e]">{formatPrice(refundOrder.amount_cents)}</p>
              </div>

              {/* Refund amount */}
              <div>
                <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Refund Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(refundOrder.amount_cents / 100).toFixed(2)}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full px-3 py-2 text-[14px] border border-[#e5e7eb] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                  placeholder={`Max: $${(refundOrder.amount_cents / 100).toFixed(2)}`}
                />
                <p className="text-[11px] text-[#9ca3af] mt-1">Maximum refundable: ${(refundOrder.amount_cents / 100).toFixed(2)}</p>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Reason</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "requested_by_customer", label: "Customer request" },
                    { value: "duplicate", label: "Duplicate charge" },
                    { value: "fraudulent", label: "Fraudulent" },
                    { value: "other", label: "Other" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRefundReason(opt.value)}
                      className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors border ${
                        refundReason === opt.value
                          ? "bg-[#f5f3ff] border-[#8b5cf6] text-[#8b5cf6]"
                          : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {refundError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-[13px] text-red-600 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {refundError}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[#e5e7eb] px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setRefundModalOpen(false)}
                className="px-4 py-2 text-[13px] font-medium text-[#6b7280] hover:text-[#374151] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={isRefunding || !refundReason}
                className="px-4 py-2 text-[13px] font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isRefunding ? (<><Loader2 className="h-4 w-4 animate-spin" />Processing...</>) : (<><RotateCcw className="h-4 w-4" />Confirm Refund</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styles */}
      <style jsx>{`
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
        .sales-scroll-container {
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
        }
        .sales-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .sales-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .sales-scroll-container::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 3px;
        }
        .sales-scroll-container::-webkit-scrollbar-thumb:hover {
          background-color: rgba(156, 163, 175, 0.7);
        }
        @media (max-width: 768px) {
          .sales-scroll-container::-webkit-scrollbar {
            display: none;
          }
          .sales-scroll-container {
            scrollbar-width: none;
          }
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}
