"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, ChevronLeft, Loader2, Package } from "lucide-react"
import { cn } from "@/lib/utils"
import { CODE_PATTERN, COUPON_STATE_LABEL, couponState } from "@/lib/checkout/coupons"
import { buttonAccent, buttonSecondary, iconButton } from "../../orders/order-parts"
import { FormSwitch, SWITCH_GROUP, Segmented, SwitchRow } from "../../products/new/editor-controls"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string
  title: string
  price_cents: number
  thumbnail_url: string | null
  status: string
}

export interface CouponRecord {
  id: string
  code: string
  discount_type: "percentage" | "fixed"
  discount_value: number
  product_ids: string[] | null
  usage_limit: number | null
  usage_count?: number
  starts_at: string | null
  expires_at: string | null
  min_purchase_cents?: number | null
  is_active: boolean
}

interface CreateCouponClientProps {
  products: Product[]
  initialCoupon?: CouponRecord | null
}

// ─── The form's values ───────────────────────────────────────────────────────

const emptyForm = () => ({
  code: "",
  discount_type: "percentage" as "percentage" | "fixed",
  discount_value: "",
  appliesTo: "all" as "all" | "specific",
  product_ids: [] as string[],
  has_usage_limit: false,
  usage_limit: "",
  has_min_purchase: false,
  min_purchase_amount: "",
  has_start_date: false,
  starts_at: "",
  has_expiry_date: false,
  expires_at: "",
  is_active: true,
})

type Form = ReturnType<typeof emptyForm>

/** A datetime-local field's value: "YYYY-MM-DDTHH:mm" in the viewer's own time. */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fromCoupon = (c: CouponRecord): Form => ({
  code: c.code,
  discount_type: c.discount_type,
  discount_value: String(Number(c.discount_value)),
  appliesTo: c.product_ids && c.product_ids.length > 0 ? "specific" : "all",
  product_ids: c.product_ids ?? [],
  has_usage_limit: c.usage_limit !== null,
  usage_limit: c.usage_limit !== null ? String(c.usage_limit) : "",
  has_min_purchase: !!c.min_purchase_cents,
  min_purchase_amount: c.min_purchase_cents ? (c.min_purchase_cents / 100).toFixed(2) : "",
  has_start_date: !!c.starts_at,
  starts_at: toLocalInput(c.starts_at),
  has_expiry_date: !!c.expires_at,
  expires_at: toLocalInput(c.expires_at),
  is_active: c.is_active,
})

/** A code nobody has to think up: eight letters and digits, none of the ones that look alike. */
const suggestCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
}

const SECTION = "mb-3 space-y-3 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mb-4 sm:space-y-4 sm:p-6"
const HEADING = "text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"
const HINT = "text-[13px] leading-5 text-[#6b7280]"
const FIELD =
  "h-11 w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_1px_#1a1a2e] sm:h-10 sm:rounded-lg sm:text-[14px]"

// ─── The form ────────────────────────────────────────────────────────────────

/**
 * ===========================================================================
 *  A COUPON, CREATED OR EDITED
 * ===========================================================================
 * The product editor's frame: one bar at the top with Cancel, the code and
 * its state, and Save (Cmd or Ctrl and S too); then the settings in cards in
 * one column. The choices a buyer never sees stay folded behind switches.
 * Every rule here is checked again on the server (lib/checkout/coupons.ts,
 * readCouponInput), where it counts; this only answers sooner.
 */
export function CreateCouponClient({ products, initialCoupon }: CreateCouponClientProps) {
  const router = useRouter()
  const isEdit = !!initialCoupon
  const [initial] = useState<Form>(() => (initialCoupon ? fromCoupon(initialCoupon) : emptyForm()))
  const [form, setForm] = useState<Form>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const paneRef = useRef<HTMLDivElement>(null)

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial])
  const state = initialCoupon ? couponState({ ...initialCoupon, usage_count: initialCoupon.usage_count ?? 0 }) : null

  const toggleProduct = (id: string) =>
    set("product_ids", form.product_ids.includes(id) ? form.product_ids.filter((p) => p !== id) : [...form.product_ids, id])

  /** The first thing a buyer-facing rule would refuse, before asking the server. */
  const problem = (): string | null => {
    if (!CODE_PATTERN.test(form.code) && !(isEdit && form.code === initialCoupon?.code)) return "A code is 3 to 32 letters, numbers, - or _."
    const value = Number(form.discount_value)
    if (!form.discount_value || !(value > 0)) return "Enter how much the code takes off."
    if (form.discount_type === "percentage" && value > 100) return "A percentage discount is at most 100%."
    if (form.appliesTo === "specific" && form.product_ids.length === 0) return "Pick at least one product, or apply it to all."
    if (form.has_usage_limit && !(Number.isInteger(Number(form.usage_limit)) && Number(form.usage_limit) >= 1)) return "A use limit is a whole number from 1."
    if (form.has_min_purchase && !(Number(form.min_purchase_amount) > 0)) return "Enter the minimum order."
    if (form.has_start_date && !form.starts_at) return "Pick when it starts."
    if (form.has_expiry_date && !form.expires_at) return "Pick when it ends."
    if (form.has_start_date && form.has_expiry_date && form.starts_at && form.expires_at && new Date(form.expires_at) <= new Date(form.starts_at)) return "The end has to be after the start."
    return null
  }

  const canSave = !saving && !!form.code.trim() && (!isEdit || dirty)

  const save = async () => {
    if (!canSave) return
    setError(null)
    const wrong = problem()
    if (wrong) {
      setError(wrong)
      paneRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    setSaving(true)
    try {
      const payload = {
        code: form.code,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        product_ids: form.appliesTo === "specific" ? form.product_ids : null,
        usage_limit: form.has_usage_limit && form.usage_limit ? Number(form.usage_limit) : null,
        starts_at: form.has_start_date && form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.has_expiry_date && form.expires_at ? new Date(form.expires_at).toISOString() : null,
        min_purchase_cents: form.has_min_purchase && form.min_purchase_amount ? Math.round(Number(form.min_purchase_amount) * 100) : null,
        is_active: form.is_active,
      }
      const res = await fetch(isEdit ? `/api/coupons/${initialCoupon!.id}` : "/api/coupons", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "The coupon could not be saved. Try again.")
      const code = data.coupon?.code ?? form.code
      /* The list is kept by the router for five minutes; drop it, then go to it. */
      router.refresh()
      router.push(`/app/coupons?${isEdit ? "updated" : "created"}=${encodeURIComponent(code)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "The coupon could not be saved. Try again.")
      setSaving(false)
      paneRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const leave = () => {
    if (dirty && !window.confirm("Leave without saving? Your changes will be lost.")) return
    router.push("/app/coupons")
  }

  /* Cmd or Ctrl and S, from anywhere on the page. */
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "s") return
      e.preventDefault()
      void saveRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const statusLine = saving
    ? "Saving"
    : dirty && isEdit
      ? "Unsaved changes"
      : state
        ? `${COUPON_STATE_LABEL[state]} · used ${initialCoupon?.usage_count ?? 0} ${initialCoupon?.usage_count === 1 ? "time" : "times"}`
        : "Not saved yet"

  return (
    <div
      ref={paneRef}
      data-coupon-form=""
      className="page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa]"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
    >
      {/* The bar: the same frame as the product editor's. */}
      <div
        data-editor-bar=""
        className={cn(
          "sticky top-0 z-30 bg-[#f8f9fa] transition-shadow duration-150",
          scrolled ? "shadow-[0_1px_0_#e3e5e8,0_4px_12px_-8px_rgba(17,24,39,0.12)]" : "",
        )}
      >
        <div className="mx-auto flex h-14 max-w-[640px] items-center gap-1.5 px-2 sm:h-16 sm:gap-2 sm:px-6">
          <button type="button" onClick={leave} className="inline-flex h-11 shrink-0 items-center rounded-[10px] px-2.5 text-[16px] text-[#1a1a2e] active:bg-[#eceef1] sm:hidden">
            Cancel
          </button>
          <Link
            href="/app/coupons"
            onClick={(e) => {
              e.preventDefault()
              leave()
            }}
            aria-label="Back to coupons"
            className={cn(iconButton, "-ml-2 hidden h-9 w-9 sm:inline-flex")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1 px-1 sm:px-0">
            <h1 className="truncate text-[16px] font-semibold leading-5 text-[#1a1a2e] sm:text-[20px] sm:leading-6">
              {isEdit ? <span className="font-mono tracking-wide">{initialCoupon!.code}</span> : "New coupon"}
            </h1>
            <p aria-live="polite" className="mt-0.5 flex h-4 items-center gap-1.5 truncate text-[12px] leading-4 text-[#6b7280] sm:h-5 sm:text-[13px] sm:leading-5">
              {dirty && isEdit && !saving ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#d97706]" /> : null}
              {statusLine}
            </p>
          </div>
          <button type="button" onClick={leave} className={cn(buttonSecondary, "hidden sm:inline-flex")}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            aria-keyshortcuts="Meta+S Control+S"
            className={cn(buttonAccent, "h-10 min-w-[68px] shrink-0 rounded-[10px] px-4 text-[15px] sm:h-8 sm:min-w-[60px] sm:rounded-lg sm:px-3 sm:text-[13px]")}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" /> : "Save"}
          </button>
        </div>
      </div>

      <form
        className="mx-auto w-full max-w-[640px] px-4 pb-6 pt-3 sm:px-6 sm:pb-16 sm:pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {error && (
          <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">
            {error}
          </div>
        )}

        {/* Code */}
        <section className={SECTION} aria-labelledby="coupon-code-label">
          <div className="flex items-baseline justify-between gap-3">
            <label id="coupon-code-label" htmlFor="coupon-code" className={HEADING}>
              Code
            </label>
            <button type="button" onClick={() => set("code", suggestCode())} className="h-8 shrink-0 rounded-lg px-2 text-[14px] font-medium text-[#6d28d9] hover:bg-[#f5f3ff] sm:text-[13px]">
              Make one up
            </button>
          </div>
          <input
            id="coupon-code"
            type="text"
            value={form.code}
            onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
            placeholder="SUMMER20"
            maxLength={32}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            className={cn(FIELD, "font-mono tracking-wide uppercase placeholder:normal-case")}
          />
          <p className={HINT}>What buyers type at checkout. Letters, numbers, - and _.</p>
        </section>

        {/* Discount */}
        <section className={SECTION} aria-labelledby="coupon-discount-label">
          <h2 id="coupon-discount-label" className={HEADING}>
            Discount
          </h2>
          <Segmented
            label="Kind of discount"
            value={form.discount_type}
            onChange={(v) => set("discount_type", v)}
            options={[
              { value: "percentage", label: "Percentage" },
              { value: "fixed", label: "Fixed amount" },
            ]}
          />
          <div className="relative">
            {form.discount_type === "fixed" ? <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-[#9ca3af] sm:text-[14px]">$</span> : null}
            <input
              type="text"
              inputMode="decimal"
              aria-label={form.discount_type === "percentage" ? "Percent off" : "Amount off, in dollars"}
              value={form.discount_value}
              onChange={(e) => set("discount_value", e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder={form.discount_type === "percentage" ? "10" : "5.00"}
              className={cn(FIELD, form.discount_type === "fixed" ? "pl-7" : "pr-9")}
            />
            {form.discount_type === "percentage" ? <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[16px] text-[#9ca3af] sm:text-[14px]">%</span> : null}
          </div>
        </section>

        {/* Applies to */}
        <section className={SECTION} aria-labelledby="coupon-applies-label">
          <h2 id="coupon-applies-label" className={HEADING}>
            Applies to
          </h2>
          <Segmented
            label="Products the code applies to"
            value={form.appliesTo}
            onChange={(v) => set("appliesTo", v)}
            options={[
              { value: "all", label: "All products" },
              { value: "specific", label: "Some products" },
            ]}
          />
          {form.appliesTo === "specific" ? (
            products.length > 0 ? (
              <div>
                <ul className="max-h-[320px] divide-y divide-[#eef0f2] overflow-y-auto rounded-xl border border-[#e5e7eb]">
                  {products.map((p) => {
                    const on = form.product_ids.includes(p.id)
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggleProduct(p.id)}
                          className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left active:bg-[#f6f7f8] sm:min-h-[52px] sm:hover:bg-[#fafbfb]"
                        >
                          <span className={cn("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border transition-colors sm:h-5 sm:w-5", on ? "border-[#8b5cf6] bg-[#8b5cf6] text-white" : "border-[#c7cad1] bg-white")}>
                            {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                          </span>
                          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[#eef0f2] bg-[#f3f4f6]">
                            {p.thumbnail_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.thumbnail_url} alt="" width={40} height={40} loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full items-center justify-center">
                                <Package className="h-4 w-4 text-[#9ca3af]" />
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[15px] text-[#1a1a2e] sm:text-[14px]">{p.title}</span>
                          <span className="shrink-0 text-[13px] tabular-nums text-[#6b7280]">${(p.price_cents / 100).toFixed(2)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <p className={cn(HINT, "mt-2")}>
                  {form.product_ids.length === 0 ? "None picked yet." : `${form.product_ids.length} of ${products.length} picked.`}
                </p>
              </div>
            ) : (
              <p className={HINT}>Publish a product first; a code can only be for products buyers can see.</p>
            )
          ) : null}
        </section>

        {/* Limits and dates */}
        <section className={SECTION} aria-labelledby="coupon-rules-label">
          <h2 id="coupon-rules-label" className={HEADING}>
            Limits
          </h2>
          <div className={SWITCH_GROUP}>
            <div>
              <SwitchRow title="Minimum order" hint="Only on orders over an amount" checked={form.has_min_purchase} onChange={(v) => set("has_min_purchase", v)} />
              {form.has_min_purchase ? (
                <div className="relative px-4 pb-3">
                  <span className="pointer-events-none absolute left-[30px] top-[22px] -translate-y-1/2 text-[16px] text-[#9ca3af] sm:top-5 sm:text-[14px]">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Minimum order, in dollars"
                    value={form.min_purchase_amount}
                    onChange={(e) => set("min_purchase_amount", e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="25.00"
                    className={cn(FIELD, "pl-7")}
                  />
                </div>
              ) : null}
            </div>
            <div>
              <SwitchRow title="Limit total uses" hint="Stops working after this many orders" checked={form.has_usage_limit} onChange={(v) => set("has_usage_limit", v)} />
              {form.has_usage_limit ? (
                <div className="px-4 pb-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Total uses"
                    value={form.usage_limit}
                    onChange={(e) => set("usage_limit", e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="100"
                    className={FIELD}
                  />
                </div>
              ) : null}
            </div>
            <div>
              <SwitchRow title="Start later" hint="Works from a date you pick" checked={form.has_start_date} onChange={(v) => set("has_start_date", v)} />
              {form.has_start_date ? (
                <div className="px-4 pb-3">
                  <input type="datetime-local" aria-label="Starts" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} className={FIELD} />
                </div>
              ) : null}
            </div>
            <div>
              <SwitchRow title="End date" hint="Stops working after a date you pick" checked={form.has_expiry_date} onChange={(v) => set("has_expiry_date", v)} />
              {form.has_expiry_date ? (
                <div className="px-4 pb-3">
                  <input type="datetime-local" aria-label="Ends" value={form.expires_at} onChange={(e) => set("expires_at", e.target.value)} className={FIELD} />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* On or off */}
        <section className={cn(SECTION, "mb-0 flex items-center gap-3 space-y-0 sm:mb-0 sm:space-y-0")}>
          <div className="min-w-0 flex-1">
            <p className={HEADING}>On</p>
            <p className={HINT}>Buyers can use it at checkout. Turn it off to pause it without losing it.</p>
          </div>
          <FormSwitch checked={form.is_active} onChange={(v) => set("is_active", v)} label="On" />
        </section>
      </form>
    </div>
  )
}
