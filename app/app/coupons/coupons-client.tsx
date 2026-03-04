"use client"

import { useState } from "react"
import { Plus, TicketPercent, Copy, Check, Pencil, Trash2, X, ChevronDown, Zap } from "lucide-react"
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

// ─── Empty form default ──────────────────────────────────────────────────────

const emptyForm = () => ({
  code: "",
  discount_type: "percentage" as "percentage" | "fixed",
  discount_value: "",
  product_ids: [] as string[],
  appliesTo: "all" as "all" | "specific",
  usage_limit: "",
  starts_at: "",
  expires_at: "",
  is_active: true,
})

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

// ─── Form Modal ───────────────────────────────────────────────────────────────

function CouponModal({
  mode,
  initial,
  products,
  onClose,
  onSave,
}: {
  mode: "create" | "edit"
  initial: ReturnType<typeof emptyForm>
  products: Product[]
  onClose: () => void
  onSave: (data: ReturnType<typeof emptyForm>) => Promise<void>
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof form, value: unknown) => setForm(f => ({ ...f, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.code.trim()) return setError("Code is required")
    if (!form.discount_value || Number(form.discount_value) <= 0) return setError("Discount value must be greater than 0")
    if (form.discount_type === "percentage" && Number(form.discount_value) > 100) return setError("Percentage cannot exceed 100")
    setSaving(true)
    try {
      await onSave(form)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  const toggleProduct = (id: string) => {
    set("product_ids", form.product_ids.includes(id)
      ? form.product_ids.filter(p => p !== id)
      : [...form.product_ids, id]
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === "create" ? "Create coupon" : "Edit coupon"}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Coupon code</label>
            <input
              type="text"
              value={form.code}
              onChange={e => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))}
              placeholder="SUMMER20"
              className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 uppercase placeholder:normal-case"
              maxLength={32}
            />
          </div>

          {/* Discount type + value */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Discount</label>
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
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  {form.discount_type === "percentage" ? "" : "$"}
                </span>
                <input
                  type="number"
                  value={form.discount_value}
                  onChange={e => set("discount_value", e.target.value)}
                  placeholder={form.discount_type === "percentage" ? "10" : "5.00"}
                  min="0.01"
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

          {/* Applies to */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Applies to</label>
            <div className="flex gap-2 mb-2">
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
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                {products.map(p => (
                  <label key={p.id} className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={form.product_ids.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer"
                    />
                    {p.thumbnail_url && (
                      <img src={p.thumbnail_url} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
                    )}
                    <span className="text-sm text-gray-700 flex-1 truncate">{p.title}</span>
                    <span className="text-xs text-gray-400">${(p.price_cents / 100).toFixed(2)}</span>
                  </label>
                ))}
              </div>
            )}
            {form.appliesTo === "specific" && products.length === 0 && (
              <p className="text-sm text-gray-400 mt-1">No published products found.</p>
            )}
          </div>

          {/* Usage limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Usage limit</label>
            <input
              type="number"
              value={form.usage_limit}
              onChange={e => set("usage_limit", e.target.value)}
              placeholder="Unlimited"
              min="1"
              step="1"
              className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            />
            <p className="text-xs text-gray-400 mt-1">Leave empty for unlimited uses.</p>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start date</label>
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={e => set("starts_at", e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Expiry date</label>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={e => set("expires_at", e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-900">Active</p>
              <p className="text-xs text-gray-500">Buyers can use this code at checkout</p>
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

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="coupon-form"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 h-11 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : mode === "create" ? "Create coupon" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Coupon Row ───────────────────────────────────────────────────────────────

function CouponRow({
  coupon,
  products,
  onEdit,
  onDelete,
  onToggle,
}: {
  coupon: Coupon
  products: Product[]
  onEdit: () => void
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
      "rounded-2xl border bg-white p-4 sm:p-5 transition-opacity",
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
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5 text-gray-500" />
          </button>
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
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Coupon | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const { toast } = useToast()

  // ── Create ──────────────────────────────────────────────────────────────────

  const handleCreate = async (form: ReturnType<typeof emptyForm>) => {
    const res = await fetch("/api/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        product_ids: form.appliesTo === "specific" ? form.product_ids : null,
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        is_active: form.is_active,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to create coupon")
    setCoupons(prev => [data.coupon, ...prev])
    setShowModal(false)
    toast({ title: "Coupon created", description: `${data.coupon.code} is ready to share.` })
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  const handleEdit = async (form: ReturnType<typeof emptyForm>) => {
    if (!editTarget) return
    const res = await fetch(`/api/coupons/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        product_ids: form.appliesTo === "specific" ? form.product_ids : null,
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        is_active: form.is_active,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to save coupon")
    setCoupons(prev => prev.map(c => c.id === editTarget.id ? data.coupon : c))
    setEditTarget(null)
    toast({ title: "Coupon updated" })
  }

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
    toast({ title: "Coupon deleted" })
  }

  // ── Convert coupon → edit form ──────────────────────────────────────────────

  const couponToForm = (c: Coupon): ReturnType<typeof emptyForm> => ({
    code: c.code,
    discount_type: c.discount_type,
    discount_value: String(c.discount_value),
    product_ids: c.product_ids || [],
    appliesTo: c.product_ids?.length ? "specific" : "all",
    usage_limit: c.usage_limit !== null ? String(c.usage_limit) : "",
    starts_at: c.starts_at ? new Date(c.starts_at).toLocaleString("sv").replace(" ", "T").slice(0, 16) : "",
    expires_at: c.expires_at ? new Date(c.expires_at).toLocaleString("sv").replace(" ", "T").slice(0, 16) : "",
    is_active: c.is_active,
  })

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 leading-tight">Coupons</h1>
            <p className="text-sm text-gray-500 mt-0.5">Create discount codes for your buyers.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-700 transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            New coupon
          </button>
        </div>

        {/* Tips */}
        <div className="rounded-2xl bg-purple-50 border border-purple-100 p-4 flex gap-3 items-start">
          <Zap className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
          <p className="text-sm text-purple-800">
            Share coupon codes with your audience to offer discounts at checkout. Buyers enter the code on the payment page.
          </p>
        </div>

        {/* List */}
        {coupons.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <TicketPercent className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-800 mb-1">No coupons yet</h3>
            <p className="text-sm text-gray-400 mb-5 max-w-xs mx-auto">
              Create your first discount code to share with your audience.
            </p>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create coupon
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {coupons.map(coupon => (
              <CouponRow
                key={coupon.id}
                coupon={coupon}
                products={products}
                onEdit={() => setEditTarget(coupon)}
                onDelete={() => setConfirmDelete(coupon.id)}
                onToggle={() => handleToggle(coupon)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <CouponModal
          mode="create"
          initial={emptyForm()}
          products={products}
          onClose={() => setShowModal(false)}
          onSave={handleCreate}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <CouponModal
          mode="edit"
          initial={couponToForm(editTarget)}
          products={products}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-5 h-5 text-red-500" />
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
                className="flex-1 h-11 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer"
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
