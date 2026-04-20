"use client"

import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, TicketPercent, Copy, Check, Pencil, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

// ─── Types ──────────────────────────────────────────────────────────────────

interface Coupon {
  id: string
  creator_id: string
  code: string
  discount_type: "percentage" | "fixed"
  discount_value: number
  product_ids: string[] | null
  usage_limit: number | null
  usage_count: number
  starts_at: string | null
  expires_at: string | null
  min_purchase_cents: number | null
  is_active: boolean
  created_at: string
}

interface Product {
  id: string
  title: string
  price_cents: number
  thumbnail_url: string | null
  status: string
}

interface CouponsClientProps {
  creatorId: string
  initialCoupons: Coupon[]
  products: Product[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDiscount(coupon: Coupon) {
  if (coupon.discount_type === "percentage") return `${coupon.discount_value}% off`
  return `$${Number(coupon.discount_value).toFixed(2)} off`
}

function isExpired(coupon: Coupon) {
  if (!coupon.expires_at) return false
  return new Date(coupon.expires_at) < new Date()
}

function isScheduled(coupon: Coupon) {
  if (!coupon.starts_at) return false
  return new Date(coupon.starts_at) > new Date()
}

function couponStatus(coupon: Coupon): { label: string; color: string } {
  if (!coupon.is_active) return { label: "Inactive", color: "bg-gray-100 text-gray-500" }
  if (isExpired(coupon)) return { label: "Expired", color: "bg-red-50 text-red-600" }
  if (isScheduled(coupon)) return { label: "Scheduled", color: "bg-blue-50 text-blue-600" }
  if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) return { label: "Maxed out", color: "bg-orange-50 text-orange-600" }
  return { label: "Active", color: "bg-green-50 text-green-700" }
}

// ─── Top Pill Notification ────────────────────────────────────────────────────
// Renders a centered pill at the top of the viewport via createPortal.
// Slides down from above the header, stays 4 s, then fades out.

function TopPill({ message, onDone }: { message: string; onDone: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Double-rAF ensures the initial (hidden) paint has committed before we animate in
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    const outTimer  = setTimeout(() => setVisible(false),  4000)
    const doneTimer = setTimeout(() => onDone(),           4380)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(outTimer)
      clearTimeout(doneTimer)
    }
  }, [onDone])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: visible ? "74px" : "-8px",
        left: "50%",
        transform: "translateX(-50%)",
        opacity: visible ? 1 : 0,
        transition: "top 340ms cubic-bezier(0.32,0.72,0,1), opacity 300ms ease",
        zIndex: 99999,
        pointerEvents: "none",
      }}
    >
      <div className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-[13px] font-medium rounded-full shadow-xl whitespace-nowrap">
        <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0">
          <path d="M3.5 8.5l3 3 6-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {message}
      </div>
    </div>,
    document.body
  )
}

// ─── Coupon Row ───────────────────────────────────────────────────────────────

function CouponRow({
  coupon,
  products,
  onDelete,
  onToggle,
}: {
  coupon: Coupon
  products: Product[]
  onDelete: () => void
  onToggle: () => void
}) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()
  const status = couponStatus(coupon)

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast({ title: "Could not copy" })
    }
  }

  const appliesTo = coupon.product_ids?.length
    ? products.filter(p => coupon.product_ids!.includes(p.id)).map(p => p.title).join(", ") || "Specific products"
    : "All products"

  return (
    <div className={cn(
      "rounded-2xl bg-white border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5 transition-opacity",
      !coupon.is_active && "opacity-60"
    )}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
          <TicketPercent className="w-5 h-5 text-purple-600" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row */}
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-mono font-semibold text-gray-900 text-sm tracking-wide">{coupon.code}</span>
            <button
              type="button"
              onClick={copyCode}
              className="p-1 rounded hover:bg-gray-100 transition-colors cursor-pointer"
              title="Copy code"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
            </button>
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", status.color)}>
              {status.label}
            </span>
          </div>

          {/* Details */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{formatDiscount(coupon)}</span>
            <span>{appliesTo}</span>
            {coupon.usage_limit !== null ? (
              <span>{coupon.usage_count}/{coupon.usage_limit} used</span>
            ) : (
              <span>{coupon.usage_count} used</span>
            )}
            {coupon.expires_at && (
              <span>Expires {new Date(coupon.expires_at).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Active toggle */}
          <button
            type="button"
            onClick={onToggle}
            title={coupon.is_active ? "Deactivate" : "Activate"}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              coupon.is_active ? "bg-gray-900" : "bg-gray-200"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform",
                coupon.is_active ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
          <Link
            href={`/app/coupons/${coupon.id}`}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5 text-gray-500" />
          </Link>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function CouponsClient({ creatorId, initialCoupons, products }: CouponsClientProps) {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [pill, setPill] = useState<{ message: string; id: number } | null>(null)
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const router = useRouter()

  const showPill = useCallback((msg: string) => setPill({ message: msg, id: Date.now() }), [])

  // Show pill when returning from the create or edit subpage
  useEffect(() => {
    const created = searchParams.get("created")
    const updated = searchParams.get("updated")
    const msg = created
      ? `${created} — Coupon created`
      : updated
        ? `${updated} — Coupon updated`
        : null
    if (msg) {
      showPill(msg)
      const url = new URL(window.location.href)
      url.searchParams.delete("created")
      url.searchParams.delete("updated")
      router.replace(url.pathname, { scroll: false })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Toggle active ───────────────────────────────────────────────────────────

  const handleToggle = async (coupon: Coupon) => {
    const res = await fetch(`/api/coupons/${coupon.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !coupon.is_active }),
    })
    const data = await res.json()
    if (!res.ok) { toast({ title: "Failed to update coupon" }); return }
    setCoupons(prev => prev.map(c => c.id === coupon.id ? data.coupon : c))
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/coupons/${id}`, { method: "DELETE" })
    if (!res.ok) { toast({ title: "Failed to delete coupon" }); return }
    setCoupons(prev => prev.filter(c => c.id !== id))
    setConfirmDelete(null)
    showPill("Coupon deleted")
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa] app-page-enter">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Header — matches Products */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[22px] sm:text-[26px] font-bold text-gray-900 leading-tight">Coupons</h1>
            <p className="text-sm text-gray-500 mt-1">Create discount codes for your buyers.</p>
          </div>
          <Link
            href="/app/coupons/new"
            className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-4 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-sm font-medium rounded-xl transition-colors shrink-0"
          >
            <Plus className="h-4 w-4 transition-transform duration-300 ease-out group-hover:rotate-90" />
            New coupon
          </Link>
        </div>

        {/* List */}
        {coupons.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <TicketPercent className="w-7 h-7 text-violet-500" />
            </div>
            <h3 className="text-[16px] font-semibold text-gray-900 mb-1">No coupons yet</h3>
            <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">
              Create your first discount code to share with your audience.
            </p>
            <Link
              href="/app/coupons/new"
              className="group inline-flex items-center gap-2 min-h-[44px] px-5 bg-[#8b5cf6] text-white text-sm font-medium rounded-xl hover:bg-[#7c3aed] transition-colors"
            >
              <Plus className="h-4 w-4 transition-transform duration-300 ease-out group-hover:rotate-90" />
              Create coupon
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {coupons.map(coupon => (
              <CouponRow
                key={coupon.id}
                coupon={coupon}
                products={products}
                onDelete={() => setConfirmDelete(coupon.id)}
                onToggle={() => handleToggle(coupon)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Top pill notification */}
      {pill && <TopPill key={pill.id} message={pill.message} onDone={() => setPill(null)} />}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-5 h-5 text-gray-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 text-center mb-1">Delete coupon?</h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              This action cannot be undone. Buyers will no longer be able to use this code.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 h-11 rounded-xl bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
