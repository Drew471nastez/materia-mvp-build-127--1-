"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Wallet,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  Download,
  Eye,
  Loader2,
  TrendingUp,
  Shield,
  Zap,
  ChevronRight,
  ChevronDown,
  X,
  XCircle,
  HelpCircle,
  Landmark,
  Package,
  Mail,
  CreditCard,
  FileText,
  RotateCcw,
  ArrowDownLeft,
  ArrowUpRight,
  ShoppingCart,
  Users,
  Copy,
  Check,
  Send,
  MapPin,
  Monitor,
  Smartphone,
  Tablet,
  UserX,
} from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts"

interface Creator {
  id: string
  username?: string
  stripe_account_id?: string
  stripe_onboarding_status?: string
  default_currency?: string
  payout_schedule?: string
  payout_threshold?: number
  instant_payouts_enabled?: boolean
}

interface OrderPayment {
  id: string
  amount_cents: number
  fee_cents: number
  created_at: string
  status: string
  customer_email?: string
  buyer_email?: string
  product_id: string
  stripe_payment_intent_id?: string
  refund_reason?: string
  refund_amount_cents?: number
  refunded_at?: string
  stripe_refund_id?: string
  receipt_token?: string
  buyer_first_name?: string
  buyer_last_name?: string
  payment_method?: string
  card_brand?: string | null
  card_last4?: string | null
  paypal_email?: string
  buyer_country?: string
  buyer_device_type?: string
  buyer_os?: string
  buyer_browser?: string
  product?: {
    title: string
    thumbnail_url?: string | null
    type?: string
  } | null
}

interface PayoutsClientProps {
  creator: Creator
  initialData: {
    totalEarnings: number
    totalFees: number
    netEarnings: number
    pendingAmount: number
    availableBalance: number
  }
  initialOrders?: OrderPayment[]
}


interface RevenuePoint {
  date: string
  amount: number
}

interface TimelineEvent {
  label: string
  timestamp: string
  type: string
}
interface StripePayout {
  id: string
  amount: number
  currency: string
  status: string
  arrival_date: number
  created: number
  method: string
  type: string
  description: string | null
  destination: string | null
}

type ActiveTab = "payouts" | "sales" | "withdraw"

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
      return { start, end: new Date() }
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
    value: "this_year",
    label: "This year",
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
    getDates: () => {
      const end = new Date()
      const start = new Date(2020, 0, 1)
      return { start, end }
    },
  },
]

// Mobile Bottom Sheet for Timeframe Selector
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
    const diff = e.touches[0].clientY - startY.current
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
        }}
      >
        <div className="pt-3 pb-2">
          <button onClick={handleClose} className="w-full flex justify-center py-2 cursor-pointer touch-none">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>
        <div className="px-4 pb-4">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e] mb-4">Select time period</h3>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto overscroll-contain">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => { onSelect(option.value); handleClose() }}
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
        <div style={{ height: 'max(env(safe-area-inset-bottom), 0px)', minHeight: '0' }} />
      </div>
    </div>
  )
}

// Order Details Modal with swipe-to-close on mobile — matching sales page exactly
function OrderDetailsModal({
  isOpen,
  onClose,
  selectedOrder,
  formatPrice,
  formatFullDate,
  handleDownloadInvoice,
  handleOpenRefund,
  handleResendReceipt,
  handleEditEmail,
  handleUnsubscribe,
  invoiceLoading,
  receiptResendCounts,
  timelineEvents,
  timelineLoading,
  isFreeOrderTimeline,
}: {
  isOpen: boolean
  onClose: () => void
  selectedOrder: OrderPayment | null
  formatPrice: (cents: number) => string
  formatFullDate: (dateString: string) => string
  handleDownloadInvoice: (order: OrderPayment) => void
  handleOpenRefund: (order: OrderPayment) => void
  handleResendReceipt: (order: OrderPayment) => void
  handleEditEmail: (order: OrderPayment) => void
  handleUnsubscribe: (order: OrderPayment) => void
  invoiceLoading: boolean
  receiptResendCounts: Record<string, number>
  timelineEvents: TimelineEvent[]
  timelineLoading: boolean
  isFreeOrderTimeline: boolean
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
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
    const diff = e.touches[0].clientY - startY.current
    if (diff > 0) setDragY(diff * 0.9)
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 90) handleClose()
    else setDragY(0)
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
      case "refunded":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-700">
            <RotateCcw className="h-3 w-3" />
            Refunded
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

  if (!isVisible || !selectedOrder) return null

  const coverImage = selectedOrder.product?.thumbnail_url
  const productTitle = selectedOrder.product?.title || "Unknown Product"
  const productType = selectedOrder.product?.type || "Digital Product"

  if (typeof window === "undefined") return null

  return createPortal(
    <>
      {/* Desktop Modal */}
      <div className="fixed inset-0 z-[200] hidden sm:flex items-center justify-center p-4">
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
                    {selectedOrder.buyer_first_name && selectedOrder.buyer_last_name
                      ? `${selectedOrder.buyer_first_name} ${selectedOrder.buyer_last_name}`
                      : "Unknown"}
                  </p>
                </div>
                <div>
                  <span className="text-[#6b7280]">Email</span>
                  <p className="font-medium text-[#1a1a2e] break-all">
                    {selectedOrder.customer_email || selectedOrder.buyer_email || "N/A"}
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
                  <p className="font-medium text-[#1a1a2e]">
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
            <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
              <h3 className="text-[13px] font-semibold text-[#1a1a2e]">Timeline</h3>
              {timelineLoading ? (
                <p className="text-[12px] text-[#6b7280]">Loading timeline...</p>
              ) : isFreeOrderTimeline ? (
                <p className="text-[12px] text-[#6b7280]">No payout timeline for free orders.</p>
              ) : timelineEvents.length === 0 ? (
                <p className="text-[12px] text-[#6b7280]">No payout events yet.</p>
              ) : (
                <div className="space-y-2">
                  {timelineEvents.map((event, idx) => (
                    <div key={`${event.type}-${idx}`} className="flex items-center justify-between text-[12px]">
                      <span className="text-[#374151]">{event.label}</span>
                      <span className="text-[#6b7280]">{formatFullDate(event.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
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
            <div className="mx-6 mb-4 p-3 bg-[#f9fafb] rounded-xl border border-[#e5e7eb]/60 space-y-1">
              <p className="text-[13px] font-medium text-[#374151] flex items-center gap-1.5"><RotateCcw className="h-3.5 w-3.5 text-[#9ca3af]" /> Refund Details</p>
              {selectedOrder.refund_amount_cents && <p className="text-[12px] text-[#6b7280]">Amount: {formatPrice(selectedOrder.refund_amount_cents)}</p>}
              {selectedOrder.refunded_at && <p className="text-[12px] text-[#6b7280]">Date: {formatFullDate(selectedOrder.refunded_at)}</p>}
              {selectedOrder.refund_reason && <p className="text-[12px] text-[#6b7280]">Reason: {selectedOrder.refund_reason}</p>}
            </div>
          )}

          {/* Desktop Footer */}
          <div className="sticky bottom-0 bg-white border-t border-[#e5e7eb] px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadInvoice(selectedOrder)}
                disabled={invoiceLoading}
                className="px-4 py-2 text-[13px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors flex items-center gap-2 disabled:opacity-60"
              >
                {invoiceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {invoiceLoading ? "Loading..." : "Invoice"}
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
      <div className="fixed inset-0 z-[200] sm:hidden">
        <div
          className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
          style={{ transitionDuration: '400ms' }}
          onClick={handleClose}
        />
        <div
          ref={sheetRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl flex flex-col"
          style={{
            transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
            transition: isDragging ? 'none' : 'transform 360ms cubic-bezier(0.22, 0.9, 0.24, 1)',
            maxHeight: '90vh',
          }}
        >
          {/* Handle bar area */}
          <div className="pt-3 pb-2 flex-shrink-0">
            <button onClick={handleClose} className="w-full flex justify-center py-2 cursor-pointer touch-none">
              <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
            </button>
          </div>

          {/* Header */}
          <div className="px-4 pb-3 flex items-center justify-between border-b border-[#e5e7eb] flex-shrink-0">
            <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Order Details</h3>
            {getStatusBadge(selectedOrder.status)}
          </div>

          {/* Scrollable Content */}
          <div className="px-4 py-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
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
                      {selectedOrder.buyer_first_name && selectedOrder.buyer_last_name
                        ? `${selectedOrder.buyer_first_name} ${selectedOrder.buyer_last_name}`
                        : "Unknown"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#6b7280]">Email</span>
                    <p className="font-medium text-[#1a1a2e] break-all">{selectedOrder.customer_email || selectedOrder.buyer_email || "N/A"}</p>
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
                    <span className="text-[12px] font-medium text-[#1a1a2e]">
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

              <div className="bg-[#f9fafb] rounded-xl p-3 space-y-2">
                <h4 className="text-[12px] font-semibold text-[#1a1a2e]">Timeline</h4>
                {timelineLoading ? <p className="text-[11px] text-[#6b7280]">Loading timeline...</p> : isFreeOrderTimeline ? <p className="text-[11px] text-[#6b7280]">No payout timeline for free orders.</p> : timelineEvents.length === 0 ? <p className="text-[11px] text-[#6b7280]">No payout events yet.</p> : timelineEvents.map((event, idx) => (
                  <div key={`${event.type}-m-${idx}`} className="flex items-center justify-between text-[11px]">
                    <span className="text-[#374151]">{event.label}</span>
                    <span className="text-[#6b7280]">{formatFullDate(event.timestamp)}</span>
                  </div>
                ))}
              </div>

              {/* Refund info on mobile — inside scrollable area to prevent overlap */}
              {selectedOrder.status === "refunded" && (
                <div className="p-3 bg-[#f9fafb] rounded-xl border border-[#e5e7eb]/60 space-y-1">
                  <p className="text-[12px] font-medium text-[#374151] flex items-center gap-1.5"><RotateCcw className="h-3 w-3 text-[#9ca3af]" /> Refund Details</p>
                  {selectedOrder.refund_amount_cents && <p className="text-[11px] text-[#6b7280]">Amount: {formatPrice(selectedOrder.refund_amount_cents)}</p>}
                  {selectedOrder.refunded_at && <p className="text-[11px] text-[#6b7280]">Date: {formatFullDate(selectedOrder.refunded_at)}</p>}
                  {selectedOrder.refund_reason && <p className="text-[11px] text-[#6b7280]">Reason: {selectedOrder.refund_reason}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Mobile Footer Actions */}
          <div className="px-4 pt-4 border-t border-[#e5e7eb] bg-white flex-shrink-0" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => handleDownloadInvoice(selectedOrder)}
                disabled={invoiceLoading}
                className="flex-1 px-3 py-2.5 text-[12px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg active:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {invoiceLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                {invoiceLoading ? "Loading..." : "Invoice"}
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

        </div>
      </div>
    </>,
    document.body
  )
}

export function PayoutsClient({ creator, initialData, initialOrders = [] }: PayoutsClientProps) {
  const router = useRouter()
  const { t } = useLanguage()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<ActiveTab>("sales")
  const [isConnecting, setIsConnecting] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Timeframe
  const [timeframe, setTimeframe] = useState("all_time")
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false)
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false)

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean
    status: string
    accountId?: string
    chargesEnabled?: boolean
    payoutsEnabled?: boolean
    bankAccount?: {
      last4: string
      bankName: string
      currency: string
    }
  } | null>(null)

  // Stripe payouts data
  const [stripePayouts, setStripePayouts] = useState<StripePayout[]>([])
  const [payoutsLoading, setPayoutsLoading] = useState(false)
  const [stripeBalance, setStripeBalance] = useState<{
    available: { amount: number; currency: string }[]
    pending: { amount: number; currency: string }[]
  } | null>(null)
  const [paidOut, setPaidOut] = useState<{ amount: number; currency: string }[]>([])
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [revenueTimeframe, setRevenueTimeframe] = useState<"7d" | "30d" | "90d" | "all">("30d")
  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([])
  const [revenueLoading, setRevenueLoading] = useState(false)
  const [orderTimeline, setOrderTimeline] = useState<TimelineEvent[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [isFreeOrderTimeline, setIsFreeOrderTimeline] = useState(false)

  // Payment detail
  const [selectedOrder, setSelectedOrder] = useState<OrderPayment | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Refund modal
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [refundOrder, setRefundOrder] = useState<OrderPayment | null>(null)
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

  // Edit email modal
  const [showEditEmailModal, setShowEditEmailModal] = useState(false)
  const [editEmail, setEditEmail] = useState("")

  const currency = creator.default_currency || "USD"
  const isStripeConnected = creator.stripe_onboarding_status === "connected"
  const isStripePending = creator.stripe_onboarding_status === "pending"

  const selectedOption = timeframeOptions.find((o) => o.value === timeframe)

  // Filter orders by timeframe
  const filteredOrders = useMemo(() => {
    const option = timeframeOptions.find((o) => o.value === timeframe)
    if (!option) return initialOrders
    const { start, end } = option.getDates()
    return initialOrders.filter((o) => {
      const orderDate = new Date(o.created_at)
      return orderDate >= start && orderDate <= end
    })
  }, [timeframe, initialOrders])

  // Compute summary based on filtered orders
  const computedData = useMemo(() => {
    const completed = filteredOrders.filter((o) => o.status === "completed")
    const totalEarnings = completed.reduce((sum, o) => sum + (o.amount_cents || 0), 0)
    const totalFees = completed.reduce((sum, o) => sum + (o.fee_cents || 0), 0)
    const netEarnings = totalEarnings - totalFees

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    let pendingAmount = 0
    let availableBalance = 0
    completed.forEach((order) => {
      const orderDate = new Date(order.created_at)
      const netAmount = (order.amount_cents || 0) - (order.fee_cents || 0)
      if (orderDate > sevenDaysAgo) {
        pendingAmount += netAmount
      } else {
        availableBalance += netAmount
      }
    })

    return { totalEarnings, totalFees, netEarnings, pendingAmount, availableBalance }
  }, [filteredOrders])

  // Close timeframe dropdown on outside click
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

  // Fetch Stripe connection status
  const fetchConnectionStatus = async () => {
    setStatusLoading(true)
    try {
      const response = await fetch("/api/stripe/connect/status")
      if (response.ok) {
        const data = await response.json()
        setConnectionStatus(data)
      }
    } catch (err) {
      console.error("Error fetching connection status:", err)
    } finally {
      setStatusLoading(false)
    }
  }

  // Fetch Stripe payouts
  const fetchStripePayouts = async () => {
    setPayoutsLoading(true)
    try {
      const response = await fetch("/api/stripe/payouts")
      if (response.ok) {
        const data = await response.json()
        setStripePayouts(data.payouts || [])
        setStripeBalance(data.balance || null)
        setPaidOut(data.paidOut || [])
      }
    } catch (err) {
      console.error("Error fetching payouts:", err)
    } finally {
      setPayoutsLoading(false)
    }
  }



  const fetchRevenue = async (tf: "7d" | "30d" | "90d" | "all") => {
    setRevenueLoading(true)
    try {
      const response = await fetch(`/api/stripe/payouts/revenue?timeframe=${tf}`)
      const data = await response.json()
      if (response.ok) setRevenueData(data.points || [])
    } catch (err) {
      console.error("Error fetching revenue:", err)
    } finally {
      setRevenueLoading(false)
    }
  }

  const loadOrderTimeline = async (orderId: string) => {
    setTimelineLoading(true)
    try {
      const response = await fetch(`/api/stripe/payouts/order-timeline?orderId=${orderId}`)
      const data = await response.json()
      if (response.ok) {
        setOrderTimeline(data.events || [])
        setIsFreeOrderTimeline(!!data.freeOrder)
      }
    } finally {
      setTimelineLoading(false)
    }
  }

  const handleWithdraw = async () => {
    setWithdrawLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/stripe/payouts", { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to withdraw")
      setSuccess("Payout created successfully.")
      await fetchStripePayouts()
    } catch (err: any) {
      setError(err.message || "Failed to withdraw")
    } finally {
      setWithdrawLoading(false)
    }
  }

  // Sync refund status from Stripe on load (catches refunds done via Stripe Dashboard)
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

  useEffect(() => {
    fetchConnectionStatus()
    if (isStripeConnected) {
      fetchStripePayouts()
      fetchRevenue(revenueTimeframe)
    }
    syncRefunds()
  }, [creator.stripe_account_id])

  useEffect(() => {
    if (isStripeConnected) fetchRevenue(revenueTimeframe)
  }, [revenueTimeframe, isStripeConnected])

  useEffect(() => {
    if (selectedOrder?.id) loadOrderTimeline(selectedOrder.id)
  }, [selectedOrder?.id])

  const handleConnectStripe = async () => {
    setIsConnecting(true)
    setError(null)
    try {
      const response = await fetch("/api/stripe/connect/start", { method: "POST" })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to start Stripe Connect")
      }
      const { url } = await response.json()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setIsConnecting(false)
    }
  }

  // Open refund modal
  const handleOpenRefund = (order: OrderPayment) => {
    setRefundOrder(order)
    setRefundAmount((order.amount_cents / 100).toFixed(2))
    setRefundReason("")
    setRefundError(null)
    setDetailOpen(false)
    setRefundModalOpen(true)
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
        throw new Error(`Amount cannot exceed $${maxAmount.toFixed(2)}`)
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

      toast({ title: "Refund processed", description: "Refund has been initiated. Confirmation emails have been sent to the buyer and seller." })
      setRefundModalOpen(false)
      setRefundOrder(null)
      setRefundReason("")
      setRefundAmount("")
      setDetailOpen(false)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setRefundError(msg)
      toast({ title: "Refund failed", description: msg, variant: "destructive" })
    } finally {
      setIsRefunding(false)
    }
  }

  // Invoice download handler
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const handleDownloadInvoice = async (order: OrderPayment) => {
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
      toast({ title: "Invoice downloaded", description: `Invoice for order #${order.id.slice(0, 8)} has been saved to your device.` })
    } catch (err) {
      console.error("Invoice download failed:", err)
      toast({ title: "Download failed", description: "Failed to download invoice. Please try again.", variant: "destructive" })
    } finally {
      setInvoiceLoading(false)
    }
  }

  // Resend receipt handler
  const handleResendReceipt = async (order: OrderPayment) => {
    const currentCount = receiptResendCounts[order.id] || 0
    if (currentCount >= 5) {
      toast({ title: "Limit reached", description: "Maximum resend limit (5) reached for this order" })
      return
    }

    const email = order.customer_email || order.buyer_email || "customer"

    if (!order.receipt_token) {
      toast({ title: "Unable to resend", description: "Missing receipt token for this order", variant: "destructive" })
      return
    }

    try {
      const response = await fetch('/api/receipt/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptToken: order.receipt_token,
          orderId: order.id,
          resendType: 'buyer'
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        const newCounts = { ...receiptResendCounts, [order.id]: currentCount + 1 }
        setReceiptResendCounts(newCounts)
        localStorage.setItem('receiptResendCounts', JSON.stringify(newCounts))
        toast({ title: "Receipt sent", description: `Receipt sent to ${email} (${currentCount + 1}/5)` })
      } else if (data.limitReached) {
        toast({ title: "Limit reached", description: "Maximum resend limit (5) reached for this order" })
      } else {
        toast({ title: "Failed", description: data.error || "Failed to send receipt", variant: "destructive" })
      }
    } catch (error) {
      console.error("Error resending receipt:", error)
      toast({ title: "Error", description: "Failed to send receipt. Please try again.", variant: "destructive" })
    }
  }

  // Edit email handler
  const handleEditEmail = (order: OrderPayment) => {
    setSelectedOrder(order)
    setEditEmail(order.customer_email || order.buyer_email || "")
    setShowEditEmailModal(true)
  }

  // Unsubscribe handler
  const handleUnsubscribe = (order: OrderPayment) => {
    const email = order.customer_email || order.buyer_email || "Unknown email"
    toast({ title: "Unsubscribed", description: `${email} has been unsubscribed from emails` })
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(cents / 100)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatTimestamp = (ts: number) => {
    return new Date(ts * 1000).toLocaleDateString("en-US", {
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

  const getPayoutStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[11px]"><CheckCircle2 className="mr-1 h-3 w-3" />Paid</Badge>
      case "pending":
        return <Badge className="bg-amber-50 text-amber-700 border-0 text-[11px]"><Clock className="mr-1 h-3 w-3" />Pending</Badge>
      case "in_transit":
        return <Badge className="bg-blue-50 text-blue-700 border-0 text-[11px]"><ArrowUpRight className="mr-1 h-3 w-3" />In Transit</Badge>
      case "failed":
        return <Badge className="bg-red-50 text-red-600 border-0 text-[11px]"><XCircle className="mr-1 h-3 w-3" />Failed</Badge>
      case "canceled":
        return <Badge className="bg-gray-50 text-gray-600 border-0 text-[11px]">Canceled</Badge>
      default:
        return <Badge className="bg-gray-50 text-gray-600 border-0 text-[11px]">{status}</Badge>
    }
  }

  // Stripe SVG icon component
  const StripeIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 1024 1024" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="512" cy="512" r="512" fill="#635bff"/>
      <path d="M781.67 515.75c0-38.35-18.58-68.62-54.08-68.62s-57.23 30.26-57.23 68.32c0 45.09 25.47 67.87 62 67.87 17.83 0 31.31-4 41.5-9.74v-30c-10.19 5.09-21.87 8.24-36.7 8.24-14.53 0-27.42-5.09-29.06-22.77h73.26c.01-1.92.31-9.71.31-13.3zm-74-14.23c0-16.93 10.34-24 19.78-24 9.14 0 18.88 7 18.88 24zm-95.14-54.39a42.32 42.32 0 0 0-29.36 11.69l-1.95-9.29h-33v174.68l37.45-7.94.15-42.4c5.39 3.9 13.33 9.44 26.52 9.44 26.82 0 51.24-21.57 51.24-69.06-.12-43.45-24.84-67.12-51.05-67.12zm-9 103.22c-8.84 0-14.08-3.15-17.68-7l-.15-55.58c3.9-4.34 9.29-7.34 17.83-7.34 13.63 0 23.07 15.28 23.07 34.91.01 20.03-9.28 35.01-23.06 35.01zM496.72 438.29l37.6-8.09v-30.41l-37.6 7.94v30.56zm0 11.39h37.6v131.09h-37.6zm-40.3 11.08L454 449.68h-32.34v131.08h37.45v-88.84c8.84-11.54 23.82-9.44 28.46-7.79v-34.45c-4.78-1.8-22.31-5.1-31.15 11.08zm-74.91-43.59L345 425l-.15 120c0 22.17 16.63 38.5 38.8 38.5 12.28 0 21.27-2.25 26.22-4.94v-30.45c-4.79 1.95-28.46 8.84-28.46-13.33v-53.19h28.46v-31.91h-28.51zm-101.27 70.56c0-5.84 4.79-8.09 12.73-8.09a83.56 83.56 0 0 1 37.15 9.59V454a98.8 98.8 0 0 0-37.12-6.87c-30.41 0-50.64 15.88-50.64 42.4 0 41.35 56.93 34.76 56.93 52.58 0 6.89-6 9.14-14.38 9.14-12.43 0-28.32-5.09-40.9-12v35.66a103.85 103.85 0 0 0 40.9 8.54c31.16 0 52.58-15.43 52.58-42.25-.17-44.63-57.25-36.69-57.25-53.47z" fill="#fff"/>
    </svg>
  )

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="border-violet-200 bg-violet-50 text-violet-800">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Timeframe Selector */}
      <div className="flex items-center justify-start">
        {/* Desktop Timeframe Dropdown */}
        <div className="relative timeframe-dropdown hidden md:block">
          <button
            onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e7eb] rounded-xl text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors shadow-sm cursor-pointer"
          >
            {selectedOption?.label || "All time"}
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
          {selectedOption?.label || "All time"}
          <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
        </button>
      </div>

      {/* Earnings Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-[#9ca3af]" />
            <span className="text-[12px] text-[#6b7280] font-medium">Total Earnings</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[#1a1a2e]">{formatPrice(computedData.totalEarnings)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
            <span className="text-[12px] text-[#6b7280] font-medium">Net Earnings</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[#1a1a2e]">{formatPrice(computedData.netEarnings)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-[#9ca3af]" />
            <span className="text-[12px] text-[#6b7280] font-medium">Pending</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[#1a1a2e]">
            {(() => {
              const cl = currency.toLowerCase()
              const m = stripeBalance?.pending?.filter(b => b.currency === cl) || []
              return m.length ? formatPrice(m.reduce((s, b) => s + b.amount, 0)) : formatPrice(initialData.pendingAmount)
            })()}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-[#9ca3af]" />
            <span className="text-[12px] text-[#6b7280] font-medium">Available</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[#1a1a2e]">
            {(() => {
              const cl = currency.toLowerCase()
              const m = stripeBalance?.available?.filter(b => b.currency === cl) || []
              return m.length ? formatPrice(m.reduce((s, b) => s + b.amount, 0)) : formatPrice(initialData.availableBalance)
            })()}
          </p>
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e5e7eb]/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Revenue</h3>
            <div className="flex gap-1">
              {(["7d","30d","90d","all"] as const).map((tf) => (
                <button key={tf} onClick={() => setRevenueTimeframe(tf)} className={`px-2.5 py-1 rounded-md text-[11px] ${revenueTimeframe === tf ? "bg-[#635bff] text-white" : "bg-[#f3f4f6] text-[#374151]"}`}>{tf.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="h-52">
            {revenueLoading ? (
              <div className="h-full animate-pulse rounded-xl bg-[#f3f4f6]" />
            ) : revenueData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[13px] text-[#6b7280]">No revenue yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: any) => formatPrice(Number(value))} />
                  <Area type="monotone" dataKey="amount" stroke="#635bff" fill="#c4b5fd" fillOpacity={0.35} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-4 space-y-3">
          <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Balances</h3>
          <div className="text-[12px] text-[#6b7280]">Available to cash out</div>
          <div className="space-y-1">{(stripeBalance?.available || []).map((b) => <div key={`av-${b.currency}`} className="text-[14px] font-semibold text-[#1a1a2e]">{new Intl.NumberFormat("en-US", { style: "currency", currency: b.currency.toUpperCase() }).format(b.amount / 100)}</div>)}</div>
          <div className="text-[12px] text-[#6b7280]">Available soon</div>
          <div className="space-y-1">{(stripeBalance?.pending || []).map((b) => <div key={`pe-${b.currency}`} className="text-[14px] font-semibold text-[#1a1a2e]">{new Intl.NumberFormat("en-US", { style: "currency", currency: b.currency.toUpperCase() }).format(b.amount / 100)}</div>)}</div>
          <div className="text-[12px] text-[#6b7280]">Paid out</div>
          <div className="space-y-1">{paidOut.length ? paidOut.map((b) => <div key={`po-${b.currency}`} className="text-[14px] font-semibold text-[#1a1a2e]">{new Intl.NumberFormat("en-US", { style: "currency", currency: b.currency.toUpperCase() }).format(b.amount / 100)}</div>) : <div className="text-[13px] text-[#9ca3af]">No payouts yet</div>}</div>
          <Button className="w-full rounded-xl bg-[#635bff] hover:bg-[#5146e5]" disabled={withdrawLoading || !(stripeBalance?.available || []).some((b) => b.amount > 0)} onClick={handleWithdraw}>
            {withdrawLoading ? "Withdrawing..." : "Cash Out"}
          </Button>
          {!(stripeBalance?.available || []).some((b) => b.amount > 0) && <p className="text-[12px] text-[#9ca3af]">No funds available.</p>}
        </div>
      </div>

      {/* Stripe Connection Card */}
      {!isStripeConnected && (
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-5">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12">
                  <circle cx="512" cy="512" r="512" fill="#635bff"></circle>
                  <path d="M781.67 515.75c0-38.35-18.58-68.62-54.08-68.62s-57.23 30.26-57.23 68.32c0 45.09 25.47 67.87 62 67.87 17.83 0 31.31-4 41.5-9.74v-30c-10.19 5.09-21.87 8.24-36.7 8.24-14.53 0-27.42-5.09-29.06-22.77h73.26c.01-1.92.31-9.71.31-13.3zm-74-14.23c0-16.93 10.34-24 19.78-24 9.14 0 18.88 7 18.88 24zm-95.14-54.39a42.32 42.32 0 0 0-29.36 11.69l-1.95-9.29h-33v174.68l37.45-7.94.15-42.4c5.39 3.9 13.33 9.44 26.52 9.44 26.82 0 51.24-21.57 51.24-69.06-.12-43.45-24.84-67.12-51.05-67.12zm-9 103.22c-8.84 0-14.08-3.15-17.68-7l-.15-55.58c3.9-4.34 9.29-7.34 17.83-7.34 13.63 0 23.07 15.28 23.07 34.91.01 20.03-9.28 35.01-23.06 35.01zM496.72 438.29l37.6-8.09v-30.41l-37.6 7.94v30.56zm0 11.39h37.6v131.09h-37.6zm-40.3 11.08L454 449.68h-32.34v131.08h37.45v-88.84c8.84-11.54 23.82-9.44 28.46-7.79v-34.45c-4.78-1.8-22.31-5.1-31.15 11.08zm-74.91-43.59L345 425l-.15 120c0 22.17 16.63 38.5 38.8 38.5 12.28 0 21.27-2.25 26.22-4.94v-30.45c-4.79 1.95-28.46 8.84-28.46-13.33v-53.19h28.46v-31.91h-28.51zm-101.27 70.56c0-5.84 4.79-8.09 12.73-8.09a83.56 83.56 0 0 1 37.15 9.59V454a98.8 98.8 0 0 0-37.12-6.87c-30.41 0-50.64 15.88-50.64 42.4 0 41.35 56.93 34.76 56.93 52.58 0 6.89-6 9.14-14.38 9.14-12.43 0-28.32-5.09-40.9-12v35.66a103.85 103.85 0 0 0 40.9 8.54c31.16 0 52.58-15.43 52.58-42.25-.17-44.63-57.25-36.69-57.25-53.47z" fill="#fff"></path>
                </svg>
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-[16px] font-semibold text-[#1a1a2e]">
                    {statusLoading ? "Checking payout connection..." : isStripePending ? "Complete your Stripe setup" : "Get paid — Connect your payouts to receive payments."}
                  </h3>
                  <p className="text-[14px] text-[#6b7280] mt-1">
                    {statusLoading
                      ? "Loading Stripe status..."
                      : isStripePending
                        ? "Your Stripe account needs additional verification to enable payouts."
                        : "Connect your bank account through Stripe to start receiving payments from your sales."}
                  </p>
                </div>
                {isStripePending && (
                  <div className="flex items-center gap-2 text-[13px] text-gray-400">
                    <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                    <span>Verification required</span>
                  </div>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <Button onClick={handleConnectStripe} disabled={isConnecting} className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium cursor-pointer">
                    {isConnecting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting...</>) : isStripePending ? (<>Complete Setup<ChevronRight className="ml-1 h-4 w-4" /></>) : (<>Connect Stripe<ChevronRight className="ml-1 h-4 w-4" /></>)}
                  </Button>
                  <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#6b7280] hover:text-[#1a1a2e] transition-colors">Learn more</a>
                </div>
              </div>
            </div>
          </div>
          {!isStripePending && (
            <div className="px-6 py-4 bg-[#f9fafb] border-t border-[#e5e7eb]/60">
              <div className="flex items-center gap-4 text-[12px] text-[#6b7280]">
                <div className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /><span>Secure payments</span></div>
                <div className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /><span>Instant setup</span></div>
                <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /><span>Bank deposits</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content — Orders & Payouts */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* Section header with tab switcher */}
        <div className="p-4 sm:p-5 border-b border-[#e5e7eb]/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Bank Payouts</h3>
              <p className="text-[13px] text-[#6b7280] mt-0.5">Transfers to your bank account & sales</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 p-1 bg-[#f3f4f6] rounded-xl">
                {isStripeConnected && (
                  <button
                    onClick={() => setActiveTab("payouts")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer",
                      activeTab === "payouts"
                        ? "bg-white text-[#1a1a2e] shadow-sm"
                        : "text-[#6b7280] hover:text-[#1a1a2e]"
                    )}
                  >
                    <Landmark className="inline-block mr-1 h-3.5 w-3.5" />
                    Payouts
                  </button>
                )}
                {isStripeConnected && (
                  <button
                    onClick={() => setActiveTab("withdraw")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer",
                      activeTab === "withdraw"
                        ? "bg-white text-[#1a1a2e] shadow-sm"
                        : "text-[#6b7280] hover:text-[#1a1a2e]"
                    )}
                  >
                    <Wallet className="inline-block mr-1 h-3.5 w-3.5" />
                    Withdraw
                  </button>
                )}
                <button
                  onClick={() => setActiveTab("sales")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer",
                    activeTab === "sales"
                      ? "bg-white text-[#1a1a2e] shadow-sm"
                      : "text-[#6b7280] hover:text-[#1a1a2e]"
                  )}
                >
                  <ShoppingCart className="inline-block mr-1 h-3.5 w-3.5" />
                  Sales
                </button>
              </div>
              {/* Refresh button removed per design */}
            </div>
          </div>
        </div>

        {/* Payouts Tab Content */}
        {activeTab === "payouts" && isStripeConnected && (
          <>
            {payoutsLoading ? (
              <div className="p-8 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#8b5cf6]" /></div>
            ) : stripePayouts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="p-4 bg-[#f3f4f6] rounded-full mb-4"><Landmark className="h-8 w-8 text-[#9ca3af]" /></div>
                <h3 className="font-medium text-[15px] text-[#1a1a2e] mb-1">No payouts yet</h3>
                <p className="text-[13px] text-[#6b7280] max-w-sm">Stripe sends payouts to your bank based on your payout schedule. Once a payout is created, it&apos;ll appear here.</p>
              </div>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="divide-y divide-[#e5e7eb]/60 sm:hidden">
                  {stripePayouts.map((payout) => (
                    <div key={payout.id} className="px-4 py-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-[#f3f4f6] flex items-center justify-center shrink-0">
                            <ArrowDownLeft className="h-4 w-4 text-[#6b7280]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-[#1a1a2e]">{formatPrice(payout.amount)}</p>
                            <p className="text-[11px] text-[#9ca3af] mt-0.5">{formatTimestamp(payout.arrival_date)}</p>
                          </div>
                        </div>
                        <div className="shrink-0">{getPayoutStatusBadge(payout.status)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-[#e5e7eb]">
                        <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider pl-5">Amount</TableHead>
                        <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Arrival Date</TableHead>
                        <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Initiated</TableHead>
                        <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Status</TableHead>
                        <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Destination</TableHead>
                        <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider pr-5">Payout ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stripePayouts.map((payout) => (
                        <TableRow key={payout.id} className="hover:bg-[#f9fafb] border-b border-[#e5e7eb]/60 last:border-0">
                          <TableCell className="text-[14px] font-medium text-[#1a1a2e] pl-5">{formatPrice(payout.amount)}</TableCell>
                          <TableCell className="text-[13px] text-[#6b7280]">{formatTimestamp(payout.arrival_date)}</TableCell>
                          <TableCell className="text-[13px] text-[#6b7280]">{formatTimestamp(payout.created)}</TableCell>
                          <TableCell>{getPayoutStatusBadge(payout.status)}</TableCell>
                          <TableCell className="text-[13px] text-[#6b7280]">{payout.destination || "Bank account"}</TableCell>
                          <TableCell className="text-[12px] text-[#6b7280] font-mono pr-5">{payout.id}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="px-5 py-3 border-t border-[#e5e7eb] text-[12px] text-[#6b7280] space-y-1">
                  <p>Showing {stripePayouts.length} payout{stripePayouts.length !== 1 ? "s" : ""}</p>
                  <p>Most payouts arrive in 1–3 business days depending on your bank.</p>
                </div>
              </>
            )}
          </>
        )}

        {activeTab === "withdraw" && isStripeConnected && (
          <div className="p-5 space-y-3">
            <p className="text-[13px] text-[#6b7280]">Available to cash out</p>
            <div className="space-y-1">{(stripeBalance?.available || []).map((b) => <div key={`w-${b.currency}`} className="text-[18px] font-bold text-[#1a1a2e]">{new Intl.NumberFormat("en-US", { style: "currency", currency: b.currency.toUpperCase() }).format(b.amount / 100)}</div>)}</div>
            <Button className="rounded-xl bg-[#635bff] hover:bg-[#5146e5]" onClick={handleWithdraw} disabled={withdrawLoading || !(stripeBalance?.available || []).some((b) => b.amount > 0)}>
              {withdrawLoading ? "Withdrawing..." : "Withdraw"}
            </Button>
            <p className="text-[12px] text-[#6b7280]">Most payouts arrive in 1–3 business days depending on your bank.</p>
          </div>
        )}


        {/* Sales Tab Content */}
        {activeTab === "sales" && (
          <>
            {filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="p-4 bg-[#f3f4f6] rounded-full mb-4"><Wallet className="h-8 w-8 text-[#9ca3af]" /></div>
                <h3 className="font-medium text-[15px] text-[#1a1a2e] mb-1">No sales yet</h3>
                <p className="text-[13px] text-[#6b7280] max-w-sm">Once you start making sales, all orders will appear here.</p>
              </div>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="divide-y divide-[#e5e7eb]/60 sm:hidden">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="px-4 py-3.5 cursor-pointer hover:bg-[#f9fafb] transition-colors active:bg-[#f3f4f6]" onClick={() => { setSelectedOrder(order); setDetailOpen(true) }}>
                      <div className="flex items-center gap-3">
                        {order.product?.thumbnail_url ? (
                          <img src={order.product.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center shrink-0"><Package className="h-4 w-4 text-[#9ca3af]" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-[#1a1a2e] truncate">{order.product?.title || "Product"}</p>
                          <p className="text-[11px] text-[#9ca3af] truncate mt-0.5">{order.customer_email || order.buyer_email || "—"}</p>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="flex items-center gap-1.5 justify-end">
                            <p className="text-[14px] font-semibold text-[#1a1a2e]">{formatPrice(order.amount_cents)}</p>
                          </div>
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            {order.status === "refunded" ? (
                              <Badge className="bg-red-50 text-red-600 border-0 text-[9px] px-1.5 py-0">Refunded</Badge>
                            ) : (
                              <p className="text-[11px] text-[#9ca3af]">{formatDate(order.created_at)}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-[#e5e7eb]">
                        <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider pl-5">Customer</TableHead>
                        <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Product</TableHead>
                        <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Date</TableHead>
                        <TableHead className="text-right text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Amount</TableHead>
                        <TableHead className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Status</TableHead>
                        <TableHead className="w-10 pr-5"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => (
                        <TableRow key={order.id} className="hover:bg-[#f9fafb] border-b border-[#e5e7eb]/60 last:border-0 cursor-pointer group" onClick={() => { setSelectedOrder(order); setDetailOpen(true) }}>
                          <TableCell className="text-[13px] text-[#6b7280] truncate max-w-[180px] pl-5">{order.customer_email || order.buyer_email || "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {order.product?.thumbnail_url ? (
                                <img src={order.product.thumbnail_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center shrink-0"><Package className="h-3.5 w-3.5 text-[#9ca3af]" /></div>
                              )}
                              <span className="text-[13px] font-medium text-[#1a1a2e] truncate max-w-[200px]">{order.product?.title || "Product"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-[13px] text-[#6b7280] whitespace-nowrap">{formatDate(order.created_at)}</TableCell>
                          <TableCell className="text-right text-[14px] font-medium text-[#1a1a2e] whitespace-nowrap">{formatPrice(order.amount_cents)}</TableCell>
                          <TableCell>
                            {order.status === "refunded" ? (
                              <Badge className="bg-red-50 text-red-600 border-0 text-[11px]">Refunded</Badge>
                            ) : (
                              <Badge className="bg-violet-50 text-violet-700 border-0 text-[11px]"><CheckCircle2 className="mr-1 h-3 w-3" />Completed</Badge>
                            )}
                          </TableCell>
                          <TableCell className="pr-5">
                            <button onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); setDetailOpen(true) }} className="p-1.5 rounded-lg hover:bg-[#f3f4f6] transition-colors opacity-0 group-hover:opacity-100">
                              <Eye className="h-4 w-4 text-[#9ca3af]" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="px-5 py-3 border-t border-[#e5e7eb] text-[12px] text-[#6b7280]">
                  Showing {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Payout Account + Help Section — side by side on desktop */}
      <div className={cn(
        "grid gap-4",
        isStripeConnected ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
      )}>
        {/* Payout Account Card */}
        {isStripeConnected && (
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b border-[#e5e7eb]/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#f3f4f6] rounded-lg">
                    <Landmark className="h-4 w-4 text-[#6b7280]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#1a1a2e]">
                      {t("payouts.payoutAccount")}
                    </h3>
                    <p className="text-[12px] text-[#6b7280] mt-0.5">Where your earnings are deposited</p>
                  </div>
                </div>
                <Badge className="bg-violet-50 text-violet-700 border-0 text-[11px]">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {t("common.connected")}
                </Badge>
              </div>
            </div>
            <div className="p-4 sm:p-5 flex-1">
              <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-[#f9fafb] rounded-xl">
                <div className="p-2 bg-white rounded-lg border border-[#e5e7eb]/60 shrink-0">
                  <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-[#6b7280]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[13px] sm:text-[14px] text-[#1a1a2e] truncate">{connectionStatus?.bankAccount?.bankName || "Bank Account"}</p>
                  <p className="text-[12px] sm:text-[13px] text-[#6b7280]">****{connectionStatus?.bankAccount?.last4 || "····"} ({currency})</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg shrink-0 text-[13px]"
                  disabled={isConnecting}
                  onClick={() => {
                    setIsConnecting(true)
                    fetch("/api/stripe/connect/start", { method: "POST" })
                      .then(r => r.json())
                      .then(data => {
                        if (data.url) window.open(data.url, "_blank", "noopener,noreferrer")
                        setIsConnecting(false)
                      })
                      .catch(() => setIsConnecting(false))
                  }}
                >
                  {isConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("common.update")}
                </Button>
              </div>
            </div>
            <div className="px-4 sm:px-5 pb-4 sm:pb-5">
              <Button variant="outline" className="w-full rounded-xl text-[13px]" asChild>
                <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
                  <StripeIcon className="mr-2 h-4 w-auto" />
                  Open Stripe Dashboard
                </a>
              </Button>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="bg-gradient-to-br from-[#f9fafb] to-[#f3f0ff]/30 rounded-2xl border border-[#e5e7eb]/60 p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col justify-between h-full">
          <div>
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-white rounded-xl border border-[#e5e7eb]/60 shadow-sm shrink-0">
                <HelpCircle className="h-5 w-5 text-[#8b5cf6]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[14px] sm:text-[15px] text-[#1a1a2e]">Need help with payouts?</h3>
                <p className="text-[12px] sm:text-[13px] text-[#6b7280] mt-1 leading-relaxed">Learn about payout schedules, fees, and how to optimize your earnings.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button variant="outline" size="sm" className="rounded-xl text-[12px] sm:text-[13px] border-[#e5e7eb] hover:border-[#8b5cf6]/30 hover:bg-[#f5f3ff] transition-colors">
              <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
              View FAQ
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl text-[12px] sm:text-[13px] border-[#e5e7eb] hover:border-[#8b5cf6]/30 hover:bg-[#f5f3ff] transition-colors">
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              Contact Support
            </Button>
          </div>
        </div>
      </div>

      {/* Order Details Modal — matching sales page exactly */}
      <OrderDetailsModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        selectedOrder={selectedOrder}
        formatPrice={formatPrice}
        formatFullDate={formatFullDate}
        handleDownloadInvoice={handleDownloadInvoice}
        handleOpenRefund={handleOpenRefund}
        handleResendReceipt={handleResendReceipt}
        handleEditEmail={handleEditEmail}
        handleUnsubscribe={handleUnsubscribe}
        invoiceLoading={invoiceLoading}
        receiptResendCounts={receiptResendCounts}
        timelineEvents={orderTimeline}
        timelineLoading={timelineLoading}
        isFreeOrderTimeline={isFreeOrderTimeline}
      />

      {/* Timeframe Bottom Sheet (Mobile) */}
      <TimeframeBottomSheet
        isOpen={isMobileSheetOpen}
        onClose={() => setIsMobileSheetOpen(false)}
        options={timeframeOptions}
        selectedValue={timeframe}
        onSelect={setTimeframe}
      />

      {/* Refund Modal */}
      <Dialog open={refundModalOpen} onOpenChange={setRefundModalOpen}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-[18px]">Issue Refund</DialogTitle>
            <DialogDescription className="text-[13px]">
              Process a refund for this order. The customer will be notified via email.
            </DialogDescription>
          </DialogHeader>

          {refundOrder && (
            <div className="space-y-4 py-2">
              {/* Order summary */}
              <div className="flex items-center gap-3 p-3 bg-[#f9fafb] rounded-xl">
                {refundOrder.product?.thumbnail_url ? (
                  <img src={refundOrder.product.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[#e5e7eb] flex items-center justify-center"><Package className="h-4 w-4 text-[#9ca3af]" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-[#1a1a2e] truncate">{refundOrder.product?.title || "Product"}</p>
                  <p className="text-[12px] text-[#9ca3af]">{refundOrder.customer_email || refundOrder.buyer_email || "—"}</p>
                </div>
                <p className="text-[14px] font-semibold text-[#1a1a2e]">{formatPrice(refundOrder.amount_cents)}</p>
              </div>

              {/* Refund amount */}
              <div className="space-y-2">
                <Label htmlFor="refund-amount" className="text-[13px] font-medium">Refund Amount ($)</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(refundOrder.amount_cents / 100).toFixed(2)}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="rounded-xl"
                  placeholder={`Max: $${(refundOrder.amount_cents / 100).toFixed(2)}`}
                />
                <p className="text-[11px] text-[#9ca3af]">Maximum refundable: ${(refundOrder.amount_cents / 100).toFixed(2)}</p>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="refund-reason" className="text-[13px] font-medium">Reason</Label>
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
                      className={cn(
                        "px-3 py-2 rounded-lg text-[13px] font-medium transition-colors border",
                        refundReason === opt.value
                          ? "bg-[#f5f3ff] border-[#8b5cf6] text-[#8b5cf6]"
                          : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {refundError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-[13px]">{refundError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRefundModalOpen(false)} className="rounded-xl">Cancel</Button>
            <Button
              onClick={handleRefund}
              disabled={isRefunding || !refundReason}
              className="rounded-xl bg-[#1a1a2e] hover:bg-[#2d2d42] text-white"
            >
              {isRefunding ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>) : (<><RotateCcw className="mr-2 h-4 w-4" />Confirm Refund</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Email Modal */}
      {showEditEmailModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowEditEmailModal(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-xl animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#1a1a2e]">Edit Email Address</h2>
              <button
                onClick={() => setShowEditEmailModal(false)}
                className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
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
            <div className="border-t border-[#e5e7eb] px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowEditEmailModal(false)}
                className="px-4 py-2 text-[13px] font-medium text-[#6b7280] hover:text-[#374151] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
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
    </div>
  )
}
