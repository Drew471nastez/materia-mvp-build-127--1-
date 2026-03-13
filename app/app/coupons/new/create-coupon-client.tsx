"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ChevronDown,
  HelpCircle,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createPortal } from "react-dom"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string
  title: string
  price_cents: number
  thumbnail_url: string | null
  status: string
}

interface CreateCouponClientProps {
  creatorId: string
  products: Product[]
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)

  const show = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPos({ x: rect.left + rect.width / 2, y: rect.top })
    }
    setVisible(true)
  }
  const hide = () => setVisible(false)

  return (
    <span ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} className="inline-flex items-center shrink-0">
      <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
      {visible && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y - 6,
            transform: "translate(-50%, -100%)",
            zIndex: 99999,
            pointerEvents: "none",
          }}
          className="px-2.5 py-1 bg-neutral-900 text-white text-[11px] font-medium rounded-md whitespace-nowrap shadow-lg"
        >
          {text}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-neutral-900" />
        </div>,
        document.body
      )}
    </span>
  )
}

// ─── Default form ─────────────────────────────────────────────────────────────

const emptyForm = () => ({
  code: "",
  discount_type: "percentage" as "percentage" | "fixed",
  discount_value: "",
  product_ids: [] as string[],
  appliesTo: "all" as "all" | "specific",
  usage_limit: "",
  has_start_date: false,
  has_expiry_date: false,
  has_min_purchase: false,
  starts_at: "",
  expires_at: "",
  min_purchase_amount: "",
  is_active: true,
})

// ─── Main Component ───────────────────────────────────────────────────────────

export function CreateCouponClient({ products }: CreateCouponClientProps) {
  const router = useRouter()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof ReturnType<typeof emptyForm>, value: unknown) =>
    setForm(f => ({ ...f, [key]: value }))

  const toggleProduct = (id: string) =>
    set("product_ids", form.product_ids.includes(id)
      ? form.product_ids.filter(p => p !== id)
      : [...form.product_ids, id]
    )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.code.trim()) return setError("Code is required")
    if (!form.discount_value || Number(form.discount_value) <= 0)
      return setError("Discount value must be greater than 0")
    if (form.discount_type === "percentage" && Number(form.discount_value) > 100)
      return setError("Percentage cannot exceed 100")

    setSaving(true)
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          discount_type: form.discount_type,
          discount_value: Number(form.discount_value),
          product_ids: form.appliesTo === "specific" ? form.product_ids : null,
          usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
          starts_at: form.has_start_date && form.starts_at
            ? new Date(form.starts_at).toISOString() : null,
          expires_at: form.has_expiry_date && form.expires_at
            ? new Date(form.expires_at).toISOString() : null,
          min_purchase_cents: form.has_min_purchase && form.min_purchase_amount
            ? Math.round(Number(form.min_purchase_amount) * 100) : null,
          is_active: form.is_active,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create coupon")
      // Navigate back to list; the page re-fetches and shows the new coupon
      router.push(`/app/coupons?created=${encodeURIComponent(data.coupon.code)}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      setError(message)
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-50/40">
      {/* Sticky header */}
      <div className="bg-white border-b border-gray-100 shrink-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/app/coupons")}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
            aria-label="Back to coupons"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <h1 className="text-[15px] font-semibold text-gray-900">Create coupon</h1>
        </div>
      </div>

      {/* Scrollable form area */}
      <div className="flex-1 overflow-y-auto">
      <form id="create-coupon-form" onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">

          {/* ── Coupon code ─────────────────────────────────────── */}
          <div className="px-5 sm:px-6 py-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Coupon code
            </label>
            <input
              type="text"
              value={form.code}
              onChange={e => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))}
              placeholder="SUMMER20"
              className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 uppercase placeholder:normal-case"
              maxLength={32}
            />
          </div>

          {/* ── Discount ────────────────────────────────────────── */}
          <div className="px-5 sm:px-6 py-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Discount
            </label>
            <div className="flex gap-2">
              <div className="relative">
                <select
                  value={form.discount_type}
                  onChange={e => set("discount_type", e.target.value)}
                  className="h-11 pl-3.5 pr-8 rounded-xl border border-gray-200 text-sm appearance-none bg-white focus:outline-none focus:border-gray-400 cursor-pointer"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed ($)</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              <div className="relative flex-1">
                {form.discount_type === "fixed" && (
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                )}
                <input
                  type="number"
                  value={form.discount_value}
                  onChange={e => set("discount_value", e.target.value)}
                  placeholder={form.discount_type === "percentage" ? "10" : "5.00"}
                  min={form.discount_type === "percentage" ? "1" : "0.01"}
                  max={form.discount_type === "percentage" ? "100" : undefined}
                  step={form.discount_type === "percentage" ? "1" : "0.01"}
                  className={cn(
                    "w-full h-11 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200",
                    form.discount_type === "fixed" ? "pl-7 pr-3.5" : "px-3.5"
                  )}
                />
                {form.discount_type === "percentage" && (
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Applies to ──────────────────────────────────────── */}
          <div className="px-5 sm:px-6 py-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Applies to
            </label>
            <div className="flex gap-2 mb-3">
              {(["all", "specific"] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set("appliesTo", opt)}
                  className={cn(
                    "flex-1 h-10 rounded-xl text-sm font-medium border transition-colors cursor-pointer",
                    form.appliesTo === opt
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  )}
                >
                  {opt === "all" ? "All products" : "Specific products"}
                </button>
              ))}
            </div>
            {form.appliesTo === "specific" && products.length > 0 && (
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-52 overflow-y-auto">
                {products.map(p => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 px-3.5 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={form.product_ids.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer"
                    />
                    {p.thumbnail_url && (
                      <img src={p.thumbnail_url} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
                    )}
                    <span className="text-sm text-gray-700 flex-1 truncate">{p.title}</span>
                    <span className="text-xs text-gray-400 shrink-0">${(p.price_cents / 100).toFixed(2)}</span>
                  </label>
                ))}
              </div>
            )}
            {form.appliesTo === "specific" && products.length === 0 && (
              <p className="text-sm text-gray-400 mt-1">No published products found.</p>
            )}
          </div>

          {/* ── Usage limit ─────────────────────────────────────── */}
          <div className="px-5 sm:px-6 py-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Usage limit
            </label>
            <input
              type="number"
              value={form.usage_limit}
              onChange={e => set("usage_limit", e.target.value)}
              placeholder="Unlimited"
              min="1"
              step="1"
              className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            />
            <p className="text-xs text-gray-400 mt-1.5">Leave empty for unlimited uses.</p>
          </div>

          {/* ── Min purchase ─────────────────────────────────────── */}
          <div className="overflow-hidden">
            <label className="flex items-center gap-2.5 px-5 sm:px-6 py-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.has_min_purchase}
                onChange={e => set("has_min_purchase", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0"
              />
              <Tooltip text="Coupon only applies when cart total meets this minimum" />
              <span className="text-sm font-medium text-gray-700">Require minimum purchase amount</span>
            </label>
            <div
              className="overflow-hidden transition-all duration-300 ease-out"
              style={{ maxHeight: form.has_min_purchase ? "72px" : "0px", opacity: form.has_min_purchase ? 1 : 0 }}
            >
              <div className="px-5 sm:px-6 pb-4">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">$</span>
                  <input
                    type="number"
                    value={form.min_purchase_amount}
                    onChange={e => set("min_purchase_amount", e.target.value)}
                    placeholder="10.00"
                    min="0.01"
                    step="0.01"
                    className="w-full h-11 pl-7 pr-3.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Start date ───────────────────────────────────────── */}
          <div className="overflow-hidden">
            <label className="flex items-center gap-2.5 px-5 sm:px-6 py-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.has_start_date}
                onChange={e => set("has_start_date", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0"
              />
              <Tooltip text="Coupon becomes valid on this date" />
              <span className="text-sm font-medium text-gray-700">Set start date for coupon</span>
            </label>
            <div
              className="overflow-hidden transition-all duration-300 ease-out"
              style={{ maxHeight: form.has_start_date ? "72px" : "0px", opacity: form.has_start_date ? 1 : 0 }}
            >
              <div className="px-5 sm:px-6 pb-4">
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={e => set("starts_at", e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                />
              </div>
            </div>
          </div>

          {/* ── End date ─────────────────────────────────────────── */}
          <div className="overflow-hidden">
            <label className="flex items-center gap-2.5 px-5 sm:px-6 py-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.has_expiry_date}
                onChange={e => set("has_expiry_date", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-violet-600 cursor-pointer shrink-0"
              />
              <Tooltip text="Coupon expires after this date" />
              <span className="text-sm font-medium text-gray-700">Set end date for coupon</span>
            </label>
            <div
              className="overflow-hidden transition-all duration-300 ease-out"
              style={{ maxHeight: form.has_expiry_date ? "72px" : "0px", opacity: form.has_expiry_date ? 1 : 0 }}
            >
              <div className="px-5 sm:px-6 pb-4">
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={e => set("expires_at", e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                />
              </div>
            </div>
          </div>

          {/* ── Active toggle ────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Active</p>
              <p className="text-xs text-gray-500 mt-0.5">Buyers can use this code at checkout</p>
            </div>
            <button
              type="button"
              onClick={() => set("is_active", !form.is_active)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                form.is_active ? "bg-gray-900" : "bg-gray-200"
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform",
                  form.is_active ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Bottom spacer so content isn't hidden behind sticky bar */}
        <div className="h-4" />
      </form>
      </div>

      {/* Sticky bottom action bar */}
      <div className="shrink-0 bg-white border-t border-gray-100 px-4 sm:px-6 py-3 z-10"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/app/coupons")}
            className="h-9 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-coupon-form"
            disabled={saving || !form.code.trim()}
            className="h-10 px-6 rounded-xl bg-[#8b5cf6] text-white text-sm font-medium hover:bg-[#7c3aed] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Creating…" : "Create coupon"}
          </button>
        </div>
      </div>
    </div>
  )
}
