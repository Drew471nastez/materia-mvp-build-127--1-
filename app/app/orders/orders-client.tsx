"use client"

import React, { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  RotateCcw,
  Package,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  X,
  BarChart3,
  AlertCircle,
  Mail,
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
  Users,
  Calendar,
  ChevronDown,
  Search,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface Product {
  id: string
  title: string
  type?: string
  thumbnail_url?: string | null
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
  card_brand?: string | null
  card_last4?: string | null
  paypal_email?: string | null
  buyer_country?: string | null
  buyer_country_code?: string | null
  buyer_device_type?: string | null
  buyer_os?: string | null
  buyer_browser?: string | null
  refund_reason?: string | null
  refund_amount_cents?: number | null
  refunded_at?: string | null
  stripe_refund_id?: string | null
  customer_email?: string
  buyer?: { email: string; display_name: string } | null
  product?: { id: string; title: string; type: string; thumbnail_url?: string | null } | null
}

interface OrdersClientProps {
  creatorId: string
  initialOrders: Order[]
  products: Product[]
  currency: string
}

type KPIType = "revenue" | "orders" | "netRevenue" | "refunds" | null

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatCompactNumber(num: number) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, "")}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}K`
  return num.toLocaleString()
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
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
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
          <Clock className="h-3 w-3" />
          Pending
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

// ─── KPI Mini Bar Chart ────────────────────────────────────────────────────────

function KPIMiniChart({
  data,
  isLoading,
  formatValue,
}: {
  data: { label: string; value: number }[]
  isLoading: boolean
  formatValue: (v: number) => string
}) {
  if (isLoading) {
    return (
      <div className="h-[80px] flex items-end gap-[2px]">
        {[35, 50, 25, 60, 40, 55, 30].map((h, i) => (
          <div key={i} className="flex-1 min-w-0 flex flex-col justify-end items-center">
            <div className="w-full rounded-sm bg-violet-200/60 animate-pulse" style={{ height: `${h}px` }} />
          </div>
        ))}
      </div>
    )
  }
  if (!data.some(d => d.value > 0)) {
    return (
      <div className="h-[80px] flex items-center justify-center gap-2">
        <BarChart3 className="h-4 w-4 text-[#d1d5db]" />
        <span className="text-[12px] text-[#9ca3af]">No data</span>
      </div>
    )
  }
  const displayData = data.slice(-7)
  const maxValue = Math.max(...displayData.map(d => d.value), 1)
  return (
    <div className="h-[80px] flex items-end gap-[2px]">
      {displayData.map((point, index) => {
        const barHeight = Math.max((point.value / maxValue) * 65, 3)
        return (
          <div key={index} className="flex-1 min-w-0 flex flex-col justify-end items-center group relative">
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#1a1a2e] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
              {point.label}: {formatValue(point.value)}
            </div>
            <div className="w-full rounded-sm bg-violet-400 hover:bg-violet-500 transition-colors cursor-pointer" style={{ height: `${barHeight}px` }} />
          </div>
        )
      })}
    </div>
  )
}

// ─── Order Details Modal ───────────────────────────────────────────────────────

function OrderDetailsModal({
  isOpen,
  onClose,
  order,
  formatPrice,
  formatFullDate,
  onRefund,
  onResendReceipt,
  onDownloadInvoice,
  invoiceLoading,
  receiptResendCounts,
}: {
  isOpen: boolean
  onClose: () => void
  order: Order | null
  formatPrice: (cents: number) => string
  formatFullDate: (date: string) => string
  onRefund: (order: Order) => void
  onResendReceipt: (order: Order) => void
  onDownloadInvoice: (order: Order) => void
  invoiceLoading: boolean
  receiptResendCounts: Record<string, number>
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      requestAnimationFrame(() => requestAnimationFrame(() => setIsAnimating(true)))
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      const t = setTimeout(() => { setIsVisible(false); setDragY(0) }, 400)
      return () => clearTimeout(t)
    }
    return () => { document.body.style.overflow = "" }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setDragY(0)
    setTimeout(onClose, 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const rect = sheetRef.current?.getBoundingClientRect()
    if (rect && touch.clientY - rect.top <= 60) {
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

  const handleCopyId = () => {
    if (!order) return
    navigator.clipboard.writeText(order.id)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  if (!isVisible || !order || typeof window === "undefined") return null

  const productTitle = order.product?.title || "Unknown Product"
  const productType = order.product?.type || "Digital Product"
  const coverImage = order.product?.thumbnail_url

  // Build activity timeline
  const timeline: { label: string; detail: string; color: "green" | "red" | "blue" }[] = [
    { label: "Order Placed", detail: formatFullDate(order.created_at), color: "green" },
    { label: "Payment Received", detail: formatPrice(order.amount_cents), color: "blue" },
  ]
  if (order.status === "refunded" && order.refunded_at) {
    timeline.push({ label: "Refunded", detail: `${formatPrice(order.refund_amount_cents || order.amount_cents)} · ${formatFullDate(order.refunded_at)}`, color: "red" })
  }

  return createPortal(
    <>
      {/* Desktop Modal */}
      <div className="fixed inset-0 z-[200] hidden sm:flex items-center justify-center p-4">
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-400 ${isAnimating ? "opacity-100" : "opacity-0"}`}
          onClick={handleClose}
        />
        <div
          className={`relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl transition-all duration-400 ${isAnimating ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
          style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" }}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold text-[#1a1a2e]">Order Details</h2>
            <button onClick={handleClose} className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Order ID & Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#6b7280]">Order ID:</span>
                <code className="text-[12px] font-mono bg-[#f3f4f6] px-2 py-0.5 rounded">#{order.id.slice(0, 8)}</code>
                <button onClick={handleCopyId} className="p-1 text-[#9ca3af] hover:text-[#6b7280] transition-colors">
                  {copiedId ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <StatusBadge status={order.status} />
            </div>

            {/* Customer */}
            <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
              <h3 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                <Users className="h-4 w-4 text-[#8b5cf6]" />
                Customer Information
              </h3>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <span className="text-[#6b7280]">Name</span>
                  <p className="font-medium text-[#1a1a2e]">
                    {order.buyer_first_name && order.buyer_last_name ? `${order.buyer_first_name} ${order.buyer_last_name}` : "Unknown"}
                  </p>
                </div>
                <div>
                  <span className="text-[#6b7280]">Email</span>
                  <p className="font-medium text-[#1a1a2e] break-all">{order.customer_email || order.buyer_email || "N/A"}</p>
                </div>
                <div>
                  <span className="text-[#6b7280]">First Name</span>
                  <p className="font-medium text-[#1a1a2e]">{order.buyer_first_name || "N/A"}</p>
                </div>
                <div>
                  <span className="text-[#6b7280]">Last Name</span>
                  <p className="font-medium text-[#1a1a2e]">{order.buyer_last_name || "N/A"}</p>
                </div>
              </div>
            </div>

            {/* Product */}
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

            {/* Payment */}
            <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
              <h3 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-[#8b5cf6]" />
                Payment Details
              </h3>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <span className="text-[#6b7280]">Amount</span>
                  <p className="font-semibold text-[#1a1a2e] text-[16px]">{formatPrice(order.amount_cents)}</p>
                </div>
                <div>
                  <span className="text-[#6b7280]">Fee</span>
                  <p className="font-medium text-[#1a1a2e]">{formatPrice(order.fee_cents || 0)}</p>
                </div>
                <div>
                  <span className="text-[#6b7280]">Payment Method</span>
                  <p className="font-medium text-[#1a1a2e] capitalize">
                    {order.payment_method === "card" && order.card_brand ? (
                      <span className="flex items-center gap-1.5">
                        <span className="capitalize">{order.card_brand}</span>
                        {order.card_last4 && <span className="text-[#6b7280]">•••• {order.card_last4}</span>}
                      </span>
                    ) : order.payment_method === "paypal" ? "PayPal" : order.payment_method === "free" ? "Free" : order.payment_method || "Card"}
                  </p>
                </div>
                <div>
                  <span className="text-[#6b7280]">Net Revenue</span>
                  <p className="font-medium text-[#1a1a2e]">{formatPrice(order.amount_cents - (order.fee_cents || 0))}</p>
                </div>
                {order.payment_method === "paypal" && order.paypal_email && (
                  <div className="col-span-2">
                    <span className="text-[#6b7280]">PayPal Email</span>
                    <p className="font-medium text-[#1a1a2e] break-all">{order.paypal_email}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            {order.buyer_country && (
              <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
                <h3 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#8b5cf6]" />
                  Location
                </h3>
                <div className="text-[13px]">
                  <span className="text-[#6b7280]">Country</span>
                  <p className="font-medium text-[#1a1a2e]">{order.buyer_country}</p>
                </div>
              </div>
            )}

            {/* Device */}
            {(order.buyer_device_type || order.buyer_os || order.buyer_browser) && (
              <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
                <h3 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                  {order.buyer_device_type === "Mobile" ? <Smartphone className="h-4 w-4 text-[#8b5cf6]" /> : order.buyer_device_type === "Tablet" ? <Tablet className="h-4 w-4 text-[#8b5cf6]" /> : <Monitor className="h-4 w-4 text-[#8b5cf6]" />}
                  Device Information
                </h3>
                <div className="grid grid-cols-3 gap-3 text-[13px]">
                  {order.buyer_device_type && <div><span className="text-[#6b7280]">Device</span><p className="font-medium text-[#1a1a2e]">{order.buyer_device_type}</p></div>}
                  {order.buyer_os && <div><span className="text-[#6b7280]">OS</span><p className="font-medium text-[#1a1a2e]">{order.buyer_os}</p></div>}
                  {order.buyer_browser && <div><span className="text-[#6b7280]">Browser</span><p className="font-medium text-[#1a1a2e]">{order.buyer_browser}</p></div>}
                </div>
              </div>
            )}

            {/* Activity Timeline */}
            <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
              <h3 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#8b5cf6]" />
                Activity Timeline
              </h3>
              <div className="space-y-3">
                {timeline.map((event, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      event.color === "green" ? "bg-green-500" : event.color === "red" ? "bg-red-500" : "bg-blue-500"
                    }`} />
                    <div>
                      <p className="text-[12px] font-medium text-[#1a1a2e]">{event.label}</p>
                      <p className="text-[11px] text-[#6b7280]">{event.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onResendReceipt(order)}
                className="flex-1 px-4 py-2.5 text-[13px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" />
                Resend Receipt
                <span className="text-[11px] text-[#9ca3af]">({receiptResendCounts[order.id] || 0}/5)</span>
              </button>
            </div>
          </div>

          {/* Desktop Footer */}
          <div className="sticky bottom-0 bg-white border-t border-[#e5e7eb] px-6 py-4 flex items-center justify-between gap-3">
            <button
              onClick={() => onDownloadInvoice(order)}
              disabled={invoiceLoading}
              className="px-4 py-2 text-[13px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              {invoiceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {invoiceLoading ? "Loading..." : "Invoice"}
            </button>
            {order.status === "completed" ? (
              <button
                onClick={() => { handleClose(); setTimeout(() => onRefund(order), 450) }}
                className="px-4 py-2 text-[13px] font-medium text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Issue Refund
              </button>
            ) : order.status === "refunded" ? (
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
          style={{ transitionDuration: "400ms" }}
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
            transition: isDragging ? "none" : "transform 360ms cubic-bezier(0.22, 0.9, 0.24, 1)",
            maxHeight: "90vh",
          }}
        >
          <div className="pt-3 pb-2 flex-shrink-0">
            <button onClick={handleClose} className="w-full flex justify-center py-2 cursor-pointer touch-none">
              <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
            </button>
          </div>
          <div className="px-4 pb-3 flex items-center justify-between border-b border-[#e5e7eb] flex-shrink-0">
            <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Order Details</h3>
            <StatusBadge status={order.status} />
          </div>
          <div className="px-4 py-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#6b7280]">Order ID:</span>
                <code className="text-[12px] font-mono bg-[#f3f4f6] px-2 py-0.5 rounded">#{order.id.slice(0, 8)}</code>
                <button onClick={handleCopyId} className="p-1 text-[#9ca3af]">
                  {copiedId ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="bg-[#f9fafb] rounded-xl p-3 space-y-2">
                <h4 className="text-[12px] font-semibold text-[#1a1a2e] flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-[#8b5cf6]" />Customer Information</h4>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div><span className="text-[#6b7280]">Name</span><p className="font-medium text-[#1a1a2e]">{order.buyer_first_name && order.buyer_last_name ? `${order.buyer_first_name} ${order.buyer_last_name}` : "Unknown"}</p></div>
                  <div><span className="text-[#6b7280]">Email</span><p className="font-medium text-[#1a1a2e] break-all">{order.customer_email || order.buyer_email || "N/A"}</p></div>
                </div>
              </div>

              <div className="bg-[#f9fafb] rounded-xl p-3">
                <h4 className="text-[12px] font-semibold text-[#1a1a2e] flex items-center gap-1.5 mb-2"><Package className="h-3.5 w-3.5 text-[#8b5cf6]" />Product</h4>
                <div className="flex items-center gap-3">
                  {coverImage ? <img src={coverImage} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 rounded-lg bg-[#e5e7eb] flex items-center justify-center"><Package className="h-5 w-5 text-[#9ca3af]" /></div>}
                  <div>
                    <p className="text-[13px] font-medium text-[#1a1a2e]">{productTitle}</p>
                    <p className="text-[11px] text-[#6b7280] capitalize">{productType}</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#f9fafb] rounded-xl p-3 space-y-2">
                <h4 className="text-[12px] font-semibold text-[#1a1a2e] flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-[#8b5cf6]" />Payment Details</h4>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div><span className="text-[#6b7280]">Amount</span><p className="font-semibold text-[#1a1a2e] text-[15px]">{formatPrice(order.amount_cents)}</p></div>
                  <div><span className="text-[#6b7280]">Fee</span><p className="font-medium text-[#1a1a2e]">{formatPrice(order.fee_cents || 0)}</p></div>
                  <div><span className="text-[#6b7280]">Net Revenue</span><p className="font-medium text-[#1a1a2e]">{formatPrice(order.amount_cents - (order.fee_cents || 0))}</p></div>
                  <div><span className="text-[#6b7280]">Method</span><p className="font-medium text-[#1a1a2e] capitalize">{order.payment_method || "Card"}</p></div>
                </div>
              </div>

              {/* Activity Timeline - Mobile */}
              <div className="bg-[#f9fafb] rounded-xl p-3 space-y-2">
                <h4 className="text-[12px] font-semibold text-[#1a1a2e] flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-[#8b5cf6]" />Activity Timeline</h4>
                <div className="space-y-2">
                  {timeline.map((event, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        event.color === "green" ? "bg-green-500" : event.color === "red" ? "bg-red-500" : "bg-blue-500"
                      }`} />
                      <div>
                        <p className="text-[11px] font-medium text-[#1a1a2e]">{event.label}</p>
                        <p className="text-[10px] text-[#6b7280]">{event.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => onResendReceipt(order)}
                className="w-full px-4 py-2.5 text-[13px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors flex items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" />
                Resend Receipt
                <span className="text-[11px] text-[#9ca3af]">({receiptResendCounts[order.id] || 0}/5)</span>
              </button>
            </div>
          </div>
          <div className="flex-shrink-0 px-4 py-4 border-t border-[#e5e7eb] flex items-center justify-between gap-3">
            <button
              onClick={() => onDownloadInvoice(order)}
              disabled={invoiceLoading}
              className="px-4 py-2 text-[13px] font-medium text-[#374151] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              {invoiceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {invoiceLoading ? "Loading..." : "Invoice"}
            </button>
            {order.status === "completed" ? (
              <button
                onClick={() => { handleClose(); setTimeout(() => onRefund(order), 450) }}
                className="px-4 py-2 text-[13px] font-medium text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Refund
              </button>
            ) : order.status === "refunded" ? (
              <span className="px-4 py-2 text-[13px] font-medium text-rose-400 bg-rose-50 rounded-lg flex items-center gap-2 cursor-not-allowed opacity-70">
                <RotateCcw className="h-4 w-4" />
                Refunded
              </span>
            ) : null}
          </div>
          <div style={{ height: "max(env(safe-area-inset-bottom), 0px)" }} />
        </div>
      </div>
    </>,
    document.body
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function OrdersClient({ creatorId, initialOrders, products, currency }: OrdersClientProps) {
  const { toast } = useToast()
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [openKPIModal, setOpenKPIModal] = useState<KPIType>(null)
  const [kpiData, setKpiData] = useState<{ label: string; value: number }[]>([])
  const [kpiLoading, setKpiLoading] = useState(false)
  const [openMenuOrderId, setOpenMenuOrderId] = useState<string | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [receiptResendCounts, setReceiptResendCounts] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("receiptResendCounts")
      return saved ? JSON.parse(saved) : {}
    }
    return {}
  })
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [refundOrder, setRefundOrder] = useState<Order | null>(null)
  const [refundReason, setRefundReason] = useState("")
  const [refundAmount, setRefundAmount] = useState("")
  const [isRefunding, setIsRefunding] = useState(false)
  const [refundError, setRefundError] = useState<string | null>(null)

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100)

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

  const formatFullDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })

  // Derived metrics
  const completedOrders = orders.filter(o => o.status === "completed")
  const refundedOrders = orders.filter(o => o.status === "refunded")
  const totalRevenue = completedOrders.reduce((s, o) => s + (o.amount_cents || 0), 0)
  const totalFees = completedOrders.reduce((s, o) => s + (o.fee_cents || 0), 0)
  const netRevenue = totalRevenue - totalFees
  const totalOrders = (completedOrders.length + refundedOrders.length)

  // Filtered orders for display
  const filteredOrders = orders.filter(o => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      o.id.toLowerCase().includes(q) ||
      o.buyer_email?.toLowerCase().includes(q) ||
      o.buyer_first_name?.toLowerCase().includes(q) ||
      o.buyer_last_name?.toLowerCase().includes(q) ||
      o.product?.title?.toLowerCase().includes(q) ||
      o.customer_email?.toLowerCase().includes(q)
    )
  })

  // KPI mini chart data generator
  useEffect(() => {
    if (!openKPIModal || openKPIModal === "refunds") { setKpiData([]); return }
    setKpiLoading(true)
    const completed = orders.filter(o => o.status === "completed")
    const points: { label: string; value: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999)
      const dayOrders = completed.filter(o => {
        const od = new Date(o.created_at)
        return od >= dayStart && od <= dayEnd
      })
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      if (openKPIModal === "revenue") {
        points.push({ label, value: dayOrders.reduce((s, o) => s + (o.amount_cents || 0), 0) })
      } else if (openKPIModal === "netRevenue") {
        points.push({ label, value: dayOrders.reduce((s, o) => s + (o.amount_cents || 0) - (o.fee_cents || 0), 0) })
      } else {
        points.push({ label, value: dayOrders.length })
      }
    }
    setKpiData(points)
    setKpiLoading(false)
  }, [openKPIModal, orders])

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order)
    setShowOrderModal(true)
  }

  const handleOpenRefund = (order: Order) => {
    setRefundOrder(order)
    setRefundAmount((order.amount_cents / 100).toFixed(2))
    setRefundReason("")
    setRefundError(null)
    setRefundModalOpen(true)
  }

  const handleRefund = async () => {
    if (!refundOrder) return
    setIsRefunding(true)
    setRefundError(null)
    try {
      const amount = refundAmount ? parseFloat(refundAmount) : refundOrder.amount_cents / 100
      const response = await fetch("/api/stripe/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: refundOrder.id, reason: refundReason || "requested_by_customer", amount }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to process refund")
      }
      setOrders(prev => prev.map(o => o.id === refundOrder.id ? {
        ...o, status: "refunded", refunded_at: new Date().toISOString(),
        refund_amount_cents: Math.round(amount * 100), refund_reason: refundReason
      } : o))
      setRefundModalOpen(false)
      setRefundOrder(null)
      toast({ title: "Refund processed", description: "The customer will be notified via email." })
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsRefunding(false)
    }
  }

  const handleResendReceipt = async (order: Order) => {
    const count = receiptResendCounts[order.id] || 0
    if (count >= 5) { toast({ title: "Limit reached", description: "Maximum resend limit (5) reached for this order." }); return }
    if (!order.receipt_token) { toast({ title: "Unable to resend", description: "Missing receipt token for this order." }); return }
    try {
      const response = await fetch("/api/receipt/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptToken: order.receipt_token, orderId: order.id, resendType: "buyer" }),
      })
      const data = await response.json()
      if (response.ok && data.success) {
        const updated = { ...receiptResendCounts, [order.id]: count + 1 }
        setReceiptResendCounts(updated)
        if (typeof window !== "undefined") localStorage.setItem("receiptResendCounts", JSON.stringify(updated))
        toast({ title: "Receipt sent", description: `Sent to ${order.customer_email || order.buyer_email} (${count + 1}/5)` })
      } else if (data.limitReached) {
        toast({ title: "Limit reached", description: "Maximum resend limit (5) reached for this order." })
      } else {
        toast({ title: "Failed to resend", description: data.error || "Failed to send receipt." })
      }
    } catch {
      toast({ title: "Failed to resend receipt" })
    }
  }

  const handleDownloadInvoice = async (order: Order) => {
    setInvoiceLoading(true)
    try {
      const res = await fetch(`/api/invoice?orderId=${order.id}`)
      if (!res.ok) throw new Error("Failed to generate invoice")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = `invoice-${order.id.slice(0, 8)}.pdf`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
      toast({ title: "Invoice downloaded" })
    } catch {
      toast({ title: "Failed to download invoice" })
    } finally {
      setInvoiceLoading(false)
    }
  }

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".order-menu")) setOpenMenuOrderId(null)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const kpiFormatValue = (v: number) => {
    if (openKPIModal === "revenue" || openKPIModal === "netRevenue") return formatPrice(v)
    return v.toLocaleString()
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">Orders</h1>
        <p className="text-[14px] text-[#6b7280] mt-0.5">View and manage all orders for your products</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Total Revenue */}
        <div
          className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${openKPIModal === "revenue" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"}`}
          onClick={() => setOpenKPIModal(openKPIModal === "revenue" ? null : "revenue")}
        >
          {openKPIModal === "revenue" ? (
            <div onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-violet-600">Total Revenue</span>
                <button onClick={e => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <KPIMiniChart data={kpiData} isLoading={kpiLoading} formatValue={kpiFormatValue} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-medium text-[#6b7280]">Total Revenue</span>
                <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-[#9ca3af]" />
                </div>
              </div>
              <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">{formatPrice(totalRevenue)}</div>
              <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">Gross revenue</p>
            </>
          )}
        </div>

        {/* Net Revenue */}
        <div
          className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${openKPIModal === "netRevenue" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"}`}
          onClick={() => setOpenKPIModal(openKPIModal === "netRevenue" ? null : "netRevenue")}
        >
          {openKPIModal === "netRevenue" ? (
            <div onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-violet-600">Net Revenue</span>
                <button onClick={e => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <KPIMiniChart data={kpiData} isLoading={kpiLoading} formatValue={kpiFormatValue} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-medium text-[#6b7280]">Net Revenue</span>
                <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
                </div>
              </div>
              <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">{formatPrice(netRevenue)}</div>
              <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">After platform fees</p>
            </>
          )}
        </div>

        {/* Total Orders */}
        <div
          className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 cursor-pointer transition-all duration-200 ${openKPIModal === "orders" ? "border-violet-300" : "border-[#e5e7eb]/60 hover:border-[#d1d5db]"}`}
          onClick={() => setOpenKPIModal(openKPIModal === "orders" ? null : "orders")}
        >
          {openKPIModal === "orders" ? (
            <div onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-violet-600">Orders</span>
                <button onClick={e => { e.stopPropagation(); setOpenKPIModal(null) }} className="w-6 h-6 aspect-square rounded-md bg-violet-100 text-violet-600 flex items-center justify-center hover:bg-violet-200 transition-colors flex-shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <KPIMiniChart data={kpiData} isLoading={kpiLoading} formatValue={kpiFormatValue} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-medium text-[#6b7280]">Orders</span>
                <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                  <ShoppingCart className="h-4 w-4 text-[#9ca3af]" />
                </div>
              </div>
              <div className="text-[24px] sm:text-[28px] font-semibold text-[#1a1a2e] tracking-tight">{formatCompactNumber(totalOrders)}</div>
              <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">Completed orders</p>
            </>
          )}
        </div>

        {/* Refunds */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-[#6b7280]">Refunds</span>
            <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-[#9ca3af]" />
            </div>
          </div>
          <div className="text-[24px] sm:text-[28px] font-semibold text-rose-500 tracking-tight">{formatCompactNumber(refundedOrders.length)}</div>
          <p className="text-[11px] sm:text-[12px] text-[#9ca3af] mt-1">{formatPrice(refundedOrders.reduce((s, o) => s + (o.refund_amount_cents || o.amount_cents || 0), 0))} refunded</p>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* Table Header */}
        <div className="p-4 sm:p-5 border-b border-[#e5e7eb]/60 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#e5e7eb] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6] transition-colors"
            />
          </div>
          <span className="text-[12px] text-[#9ca3af] ml-auto">{filteredOrders.length} orders</span>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-[#f5f3ff] flex items-center justify-center mb-4">
              <ShoppingCart className="h-8 w-8 text-[#8b5cf6]" />
            </div>
            <h2 className="text-[16px] font-semibold text-[#1a1a2e] mb-2">No orders yet</h2>
            <p className="text-[13px] text-[#6b7280]">Orders will appear here when customers purchase your products.</p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="sm:hidden divide-y divide-[#e5e7eb]">
              {filteredOrders.map(order => {
                const productData = products.find(p => p.id === order.product_id)
                const productImage = productData?.thumbnail_url || order.product?.thumbnail_url
                const customerName = order.buyer_first_name && order.buyer_last_name
                  ? `${order.buyer_first_name} ${order.buyer_last_name}`
                  : "Customer"
                const productTitle = order.product?.title || productData?.title || "Product"
                const mobileDate = new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                return (
                  <div key={order.id} className="px-3 py-3 active:bg-[#f9fafb] cursor-pointer" onClick={() => handleViewOrder(order)}>
                    <div className="flex items-center gap-3">
                      {productImage ? (
                        <img src={productImage} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center flex-shrink-0">
                          <Package className="h-4 w-4 text-[#9ca3af]" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-[13px] font-medium text-[#1a1a2e] truncate">{customerName.slice(0, 14)}{customerName.length > 14 ? "..." : ""}</p>
                          <span className="text-[10px] text-[#9ca3af]">•</span>
                          <span className="text-[10px] text-[#6b7280]">{mobileDate}</span>
                        </div>
                        <p className="text-[11px] text-[#6b7280] truncate">{productTitle.slice(0, 18)}{productTitle.length > 18 ? "..." : ""}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-[13px] font-semibold text-[#1a1a2e]">{formatPrice(order.amount_cents)}</p>
                        {order.status === "refunded" && <span className="text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">Refunded</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop Table */}
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
                  {filteredOrders.map(order => {
                    const productData = products.find(p => p.id === order.product_id)
                    const productImage = productData?.thumbnail_url || order.product?.thumbnail_url
                    const productTitle = order.product?.title || productData?.title || "Unknown Product"
                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-[#f9fafb] transition-colors cursor-pointer"
                        onClick={() => handleViewOrder(order)}
                      >
                        <td className="px-5 py-4">
                          <p className="text-[14px] font-medium text-[#1a1a2e]">
                            {order.buyer_first_name && order.buyer_last_name ? `${order.buyer_first_name} ${order.buyer_last_name}` : "Customer"}
                          </p>
                          <p className="text-[12px] text-[#6b7280]">{order.customer_email || order.buyer_email || ""}</p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {productImage ? (
                              <img src={productImage} alt="" className="w-10 h-10 rounded-lg object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                                <Package className="h-4 w-4 text-[#9ca3af]" />
                              </div>
                            )}
                            <span className="text-[14px] text-[#1a1a2e] truncate max-w-[200px]">{productTitle}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[14px] text-[#6b7280]">{formatDate(order.created_at)}</span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-[14px] font-medium text-[#1a1a2e]">{formatPrice(order.amount_cents)}</span>
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 order-menu" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={e => { e.stopPropagation(); handleViewOrder(order) }}
                              className="px-3 py-1.5 text-[12px] font-medium text-[#1a1a2e] bg-[#f3f4f6] rounded-lg hover:bg-[#e5e7eb] transition-colors cursor-pointer"
                            >
                              View
                            </button>
                            <div className="relative order-menu">
                              <button
                                onClick={e => { e.stopPropagation(); setOpenMenuOrderId(openMenuOrderId === order.id ? null : order.id) }}
                                className="p-1.5 text-[#9ca3af] hover:text-[#6b7280] hover:bg-[#f3f4f6] rounded-lg transition-colors"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                              {openMenuOrderId === order.id && (
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 py-1">
                                  <button
                                    onClick={e => { e.stopPropagation(); handleResendReceipt(order); setOpenMenuOrderId(null) }}
                                    className="w-full text-left px-3 py-2 text-[13px] text-[#374151] hover:bg-[#f9fafb] flex items-center gap-2"
                                  >
                                    <Send className="h-4 w-4 text-[#9ca3af]" />
                                    Resend receipt
                                    <span className="ml-auto text-[11px] text-[#9ca3af]">{receiptResendCounts[order.id] || 0}/5</span>
                                  </button>
                                  {order.status === "completed" && (
                                    <>
                                      <div className="border-t border-[#e5e7eb] my-1" />
                                      <button
                                        onClick={e => { e.stopPropagation(); handleOpenRefund(order); setOpenMenuOrderId(null) }}
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
              <div className="px-5 py-3 border-t border-[#e5e7eb] text-[12px] text-[#6b7280]">
                Showing {filteredOrders.length} of {orders.length} orders
              </div>
            </div>
          </>
        )}
      </div>

      {/* Order Details Modal */}
      <OrderDetailsModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        order={selectedOrder}
        formatPrice={formatPrice}
        formatFullDate={formatFullDate}
        onRefund={handleOpenRefund}
        onResendReceipt={handleResendReceipt}
        onDownloadInvoice={handleDownloadInvoice}
        invoiceLoading={invoiceLoading}
        receiptResendCounts={receiptResendCounts}
      />

      {/* Refund Modal */}
      {refundModalOpen && refundOrder && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRefundModalOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="border-b border-[#e5e7eb] px-6 py-4">
              <h2 className="text-[18px] font-semibold text-[#1a1a2e]">Issue Refund</h2>
              <p className="text-[13px] text-[#6b7280] mt-1">Process a refund for this order. The customer will be notified via email.</p>
            </div>
            <div className="p-6 space-y-4">
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
              <div>
                <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Refund Amount</label>
                <input
                  type="number" step="0.01" min="0.01" max={(refundOrder.amount_cents / 100).toFixed(2)}
                  value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                  className="w-full px-3 py-2 text-[14px] border border-[#e5e7eb] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 focus:border-[#8b5cf6]"
                />
                <p className="text-[11px] text-[#9ca3af] mt-1">Maximum refundable: {formatPrice(refundOrder.amount_cents)}</p>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Reason</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "requested_by_customer", label: "Customer request" },
                    { value: "duplicate", label: "Duplicate charge" },
                    { value: "fraudulent", label: "Fraudulent" },
                    { value: "other", label: "Other" },
                  ].map(opt => (
                    <button key={opt.value} onClick={() => setRefundReason(opt.value)}
                      className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors border ${refundReason === opt.value ? "bg-[#f5f3ff] border-[#8b5cf6] text-[#8b5cf6]" : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"}`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              {refundError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-[13px] text-red-600 flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{refundError}</p>
                </div>
              )}
            </div>
            <div className="border-t border-[#e5e7eb] px-6 py-4 flex items-center justify-end gap-3">
              <button onClick={() => setRefundModalOpen(false)} className="px-4 py-2 text-[13px] font-medium text-[#6b7280] hover:text-[#374151] transition-colors">Cancel</button>
              <button
                onClick={handleRefund}
                disabled={isRefunding || !refundReason}
                className="px-4 py-2 text-[13px] font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isRefunding ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</> : <><RotateCcw className="h-4 w-4" />Confirm Refund</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
