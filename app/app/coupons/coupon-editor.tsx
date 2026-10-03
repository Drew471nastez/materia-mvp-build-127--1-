"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { PhysicalCouponOptions, type CouponOptionsHandle } from "@/components/physical/coupon-options"
import { ArrowLeft, Package, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUPON_STATE_LABEL, couponState, type CouponState } from "@/lib/checkout/coupon-state"
import { StatusBadge, iconButton } from "../orders/order-parts"
import { LeaveButton, secondaryDepth } from "../products/new/editor-buttons"
import { FormSwitch, SWITCH_GROUP, Segmented, SwitchRow } from "../products/new/editor-controls"
import { useConfirm } from "../products/new/confirm-sheet"
import {
  emptyForm,
  formPayload,
  formProblem,
  fromCoupon,
  generateCode,
  summaryLines,
  toLocalInput,
  typedAmount,
  typedCode,
  typedWhole,
  type CouponField,
  type CouponForm,
  type CouponProblem,
  type CouponProduct,
  type CouponRecord,
} from "./coupon-form"
import { CouponSaveButton, Tick, quietDanger } from "./coupon-parts"
import { returnToCoupons, useCouponListOrigin, warmCoupons } from "./list-return"

/*
  ONE CARD, THE /app CARD (CLAUDE.md), with the product editor's padding. The
  columns space the cards, so a card carries no margin of its own.
*/
/* Sideways padding from --app-card-x (app/globals.css), as every /app card takes it. */
const CARD = "scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:py-6"
const CARD_TITLE = "text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"
const HINT = "text-[13px] leading-5 text-[#6b7280]"
/* Focused, a field takes the app's calm edge (the description editor's, and every /app search field's): a light hairline and a soft halo, not a black ring. */
const FIELD =
  "h-11 w-full rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]"
const FIELD_WRONG = "border-[#c4290c] focus:border-[#c4290c] focus:shadow-[0_0_0_3px_rgba(196,41,12,0.1)]"
/* The adornment inside a field: $ before an amount, % after a percentage. */
const ADORN = "pointer-events-none absolute top-1/2 -translate-y-1/2 text-[16px] text-[#9ca3af] sm:text-[14px]"

const FIELD_ID: Record<CouponField, string> = {
  code: "coupon-code",
  value: "coupon-value",
  products: "coupon-products",
  minimum: "coupon-minimum",
  uses: "coupon-uses",
  start: "coupon-start",
  end: "coupon-end",
}

const STATE_TONE: Record<CouponState, "success" | "neutral"> = {
  active: "success",
  scheduled: "neutral",
  expired: "neutral",
  used_up: "neutral",
  off: "neutral",
}

/** The next whole hour, as a datetime-local value: where a date starts when it is switched on. */
function nextHour(plusDays = 0): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  d.setDate(d.getDate() + plusDays)
  return toLocalInput(d.toISOString())
}

/** Under a field: what went wrong with it, in the words the check gave. */
function FieldError({ id, problem }: { id: string; problem: CouponProblem | null }) {
  if (!problem || FIELD_ID[problem.field] !== id) return null
  return (
    <p id={`${id}-error`} data-field-error="" className="text-[13px] font-medium leading-5 text-[#b42318]">
      {problem.message}
    </p>
  )
}

/**
 * ===========================================================================
 *  A COUPON, NEW OR SAVED
 * ===========================================================================
 * The product editor's frame (app/app/products/new/product-editor.tsx), with
 * a coupon in it:
 *
 *   ON A PHONE a full screen layer over the app's header (../[id]/layout and
 *   ../new/layout, components/app/page-layer), its own bar at the top under
 *   the status bar: Cancel (or Back, with nothing to lose) and Save. The
 *   cards in one column under it.
 *
 *   FROM 768 TO 1023 a page in the shell, the same bar stuck to the top of
 *   the content area, one column of 760px.
 *
 *   FROM lg the 1200px page every /app page uses, 24px under the shell's
 *   header: a page header (back to Coupons, the code, where it stands), two
 *   columns (the coupon on the left, two thirds; its status and a summary on
 *   the right), and Cancel and Save in a bar along the foot of the pane.
 *
 * Opening and leaving is one move each way on a phone and a return to the
 * list at its scroll (./list-return). A save goes back to the list, which
 * says so and tints the row. Every rule is checked again on the server
 * (lib/checkout/coupons.ts readCouponInput); the checks here only answer
 * sooner, under the field they are about.
 */
export function CouponEditor({ products, initialCoupon }: { products: CouponProduct[]; initialCoupon: CouponRecord | null }) {
  const router = useRouter()
  const isEdit = !!initialCoupon
  const [initial] = useState<CouponForm>(() => (initialCoupon ? fromCoupon(initialCoupon) : emptyForm()))
  const [form, setForm] = useState<CouponForm>(initial)
  const [problem, setProblem] = useState<CouponProblem | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [query, setQuery] = useState("")
  const paneRef = useRef<HTMLDivElement>(null)
  const [ask, confirmSheet] = useConfirm()

  /* The list, ready for the way back, and whether it opened this editor (./list-return). */
  useEffect(() => {
    warmCoupons(router)
  }, [router])
  useCouponListOrigin()

  /* Free shipping and the other physical options (components/physical/coupon-options.tsx), while physical commerce is on. */
  const physicalOptions = useRef<CouponOptionsHandle | null>(null)
  const [optionsTouched, setOptionsTouched] = useState(0)
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial) || (optionsTouched > 0 && !!physicalOptions.current?.dirty()), [form, initial, optionsTouched])
  const busy = saving || deleting
  const set = <K extends keyof CouponForm>(key: K, value: CouponForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setProblem(null)
  }

  /* Where the code stands, by the checkout's own rule, from the row as saved. */
  const [now] = useState(() => new Date())
  const state = initialCoupon ? couponState({ ...initialCoupon, usage_count: initialCoupon.usage_count ?? 0 }, now) : null
  const used = initialCoupon?.usage_count ?? 0

  const point = (p: CouponProblem) => {
    setProblem(p)
    const el = document.getElementById(FIELD_ID[p.field])
    if (!el) return
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" })
    el.focus({ preventScroll: true })
  }

  const canSave = !busy && (isEdit ? dirty : dirty && form.code !== "")

  const save = async () => {
    if (busy || !canSave) return
    setServerError(null)
    const wrong = formProblem(form, initialCoupon?.code ?? null, physicalOptions.current?.freeShipping() ?? false)
    if (wrong) return point(wrong)
    setSaving(true)
    try {
      const res = await fetch(isEdit ? `/api/coupons/${initialCoupon!.id}` : "/api/coupons", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formPayload(form), ...(physicalOptions.current?.freeShipping() ? { free_shipping: true } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaving(false)
        const message: string = data.error || "The coupon could not be saved. Try again."
        /* A code that is already taken is the code field's problem. */
        if (res.status === 409 && /code/i.test(message)) return point({ field: "code", message })
        setServerError(message)
        paneRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        return
      }
      const saved = data.coupon as CouponRecord | undefined
      const savedId = saved?.id ?? initialCoupon?.id ?? null
      if (savedId && physicalOptions.current) {
        const problem = await physicalOptions.current.save(savedId)
        if (problem) {
          setSaving(false)
          setServerError(`The code was saved, but its shipping options weren't: ${problem}`)
          return
        }
      }
      const code = saved?.code ?? form.code
      /* Save stays busy while the editor leaves: the list says the rest. */
      returnToCoupons(router, { id: saved?.id ?? initialCoupon?.id ?? null, saved: saved ?? null, message: `${code} ${isEdit ? "saved" : "created"}` })
    } catch {
      setSaving(false)
      setServerError("The coupon could not be saved. Check the connection and try again.")
    }
  }

  /*
    CANCEL, OR BACK, as in the product editor: Cancel while something would
    be lost (a change, or a new coupon never saved), which asks first; Back
    once everything on the screen is saved.
  */
  const leaveMode = isEdit && !dirty ? "back" : "cancel"
  const leave = async () => {
    if (busy) return
    if (dirty) {
      const yes = await ask(
        isEdit
          ? { title: "Discard changes?", body: "Your edits since the last save will be lost.", confirm: "Discard", cancel: "Keep editing" }
          : { title: "Discard this coupon?", body: "It has not been saved yet, so it will not be kept.", confirm: "Discard", cancel: "Keep editing" },
      )
      if (!yes) return
    }
    returnToCoupons(router, { id: initialCoupon?.id ?? null })
  }

  const remove = async () => {
    if (!initialCoupon || busy) return
    const yes = await ask({
      title: `Delete ${initialCoupon.code}?`,
      body: "Buyers can no longer use it. Orders already placed with it keep their discount. To stop it for now, turn it off instead.",
      confirm: "Delete",
      cancel: "Keep it",
    })
    if (!yes) return
    setDeleting(true)
    setServerError(null)
    const res = await fetch(`/api/coupons/${initialCoupon.id}`, { method: "DELETE" }).catch(() => null)
    if (!res?.ok) {
      setDeleting(false)
      setServerError("The coupon could not be deleted. Try again.")
      paneRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    returnToCoupons(router, { id: initialCoupon.id, deleted: true, message: `${initialCoupon.code} deleted` })
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

  /* The products on sale, narrowed by the search when there are more than six. */
  const shownProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? products.filter((p) => p.title.toLowerCase().includes(q)) : products
  }, [products, query])
  const toggleProduct = (id: string) =>
    set("product_ids", form.product_ids.includes(id) ? form.product_ids.filter((p) => p !== id) : [...form.product_ids, id])
  const picked = form.product_ids.filter((id) => products.some((p) => p.id === id)).length
  /* Named by the code but not in the list: a draft, or a product since deleted. Kept, and said. */
  const hidden = form.product_ids.length - picked

  const turn = (key: "has_start" | "has_end", on: boolean) => {
    setForm((f) => {
      const next = { ...f, [key]: on }
      /* A date switched on starts somewhere sensible rather than empty: the next hour, or a week after the start. */
      if (on && key === "has_start" && !f.starts_at) next.starts_at = nextHour()
      if (on && key === "has_end" && !f.expires_at) next.expires_at = f.has_start && f.starts_at ? toLocalInput(new Date(new Date(f.starts_at).getTime() + 7 * 86_400_000).toISOString()) : nextHour(7)
      return next
    })
    setProblem(null)
  }

  const wrong = (field: CouponField) => problem?.field === field
  const described = (field: CouponField, hint?: string) =>
    [wrong(field) ? `${FIELD_ID[field]}-error` : null, hint].filter(Boolean).join(" ") || undefined

  const saveState: "saving" | "unsaved" | "new" | "saved" = saving ? "saving" : dirty ? "unsaved" : isEdit ? "saved" : "new"
  const stateLine =
    saveState === "saving"
      ? "Saving"
      : saveState === "unsaved"
        ? "Unsaved changes"
        : saveState === "new"
          ? "Not saved yet"
          : `${COUPON_STATE_LABEL[state!]} · used ${used} ${used === 1 ? "time" : "times"}`

  const title = isEdit ? initialCoupon!.code : "New coupon"
  const summary = summaryLines(form, products)

  return (
    /*
      THE PANE THAT SCROLLS, as the product editor's: from lg a column, so the
      foot bar sits at the bottom of the pane even when the form is short.
      On a phone it keeps room at its foot for the nav pill (app/globals.css,
      .page-scroll inside a [data-page-layer="pill"]).
    */
    <div
      ref={paneRef}
      data-coupon-editor=""
      className="page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] max-md:[[data-page-layer]_&]:pb-[calc(32px+env(safe-area-inset-bottom))] lg:flex lg:flex-col"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {saving ? "Saving" : deleting ? "Deleting" : ""}
      </p>

      {/*
        THE TOP BAR, BELOW lg: Cancel or Back, and Save. It names nothing:
        the code is in the first field right under it. On a phone the editor
        is a layer over the app's header, so the bar starts under the status
        bar (env(safe-area-inset-top), 0 in a browser); from md the shell's
        header has already taken the inset.
      */}
      <div
        data-editor-bar=""
        className={cn(
          "sticky top-0 z-30 bg-[#f8f9fa] transition-shadow duration-150 max-md:[[data-page-layer]_&]:pt-[env(safe-area-inset-top)] lg:hidden",
          scrolled ? "shadow-[0_1px_0_#e3e5e8,0_4px_12px_-8px_rgba(17,24,39,0.12)]" : "",
        )}
      >
        <h1 className="sr-only">{isEdit ? `Edit coupon ${title}` : "New coupon"}</h1>
        <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between gap-2 app-gutter sm:h-16 sm:px-6">
          <LeaveButton mode={leaveMode} disabled={busy} asks={dirty} label="Going back to coupons" onLeave={() => void leave()} />
          <CouponSaveButton saving={saving} disabled={!canSave} onSave={() => void save()} />
        </div>
      </div>

      <div data-editor-page="" className="mx-auto w-full max-w-[760px] app-gutter pb-6 pt-3 sm:pb-16 sm:pt-4 lg:max-w-[1200px] lg:pb-8 lg:pt-6">
        {/* The page header, from lg: back to Coupons, the code, where it stands. */}
        <header data-editor-head="" className="mb-5 hidden min-h-9 items-center gap-2 lg:flex">
          <button
            type="button"
            aria-label="Back to coupons"
            title="Coupons"
            disabled={busy}
            onClick={() => void leave()}
            className={cn(iconButton, "-ml-1.5 h-9 w-9 shrink-0 hover:bg-[#eceef1] active:bg-[#e4e6ea]")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className={cn("min-w-0 truncate text-[24px] font-bold leading-9 text-[#1a1a2e] sm:text-[28px]", isEdit && "font-mono tracking-wide")}>{title}</h1>
          {state ? (
            <span className="ml-1 shrink-0">
              <StatusBadge tone={STATE_TONE[state]}>{COUPON_STATE_LABEL[state]}</StatusBadge>
            </span>
          ) : null}
        </header>

        {serverError ? (
          <div role="alert" className="mb-3 rounded-xl border border-[#f5c2bd] bg-[#fef3f2] px-4 py-3 text-[14px] leading-5 text-[#8a1c0f] lg:mb-4">
            {serverError}
          </div>
        ) : null}

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          className="flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(272px,1fr)] lg:items-start"
        >
          <div data-editor-main="" className="flex min-w-0 flex-col gap-3 sm:gap-4">
            {/* ── The code ─────────────────────────────────────────── */}
            <section className={CARD} aria-labelledby="coupon-code-title">
              <label id="coupon-code-title" htmlFor="coupon-code" className={cn(CARD_TITLE, "block")}>
                Code
              </label>
              <div className="space-y-1.5">
                <div className="relative">
                  <input
                    id="coupon-code"
                    type="text"
                    value={form.code}
                    onChange={(e) => set("code", typedCode(e.target.value))}
                    placeholder="SUMMER20"
                    maxLength={32}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    aria-invalid={wrong("code") || undefined}
                    aria-describedby={described("code", "coupon-code-hint")}
                    className={cn(FIELD, "pr-[108px] font-mono uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal sm:pr-[100px]", wrong("code") && FIELD_WRONG)}
                  />
                  <button
                    type="button"
                    data-generate-code=""
                    onClick={() => set("code", generateCode())}
                    className={cn(secondaryDepth, "absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-lg px-3 text-[14px] sm:right-1 sm:h-7 sm:rounded-md sm:px-2.5 sm:text-[13px]")}
                  >
                    Generate
                  </button>
                </div>
                <FieldError id="coupon-code" problem={problem} />
                <p id="coupon-code-hint" className={HINT}>
                  What buyers type at checkout.
                </p>
              </div>
            </section>

            {/* ── What it takes off ────────────────────────────────── */}
            <section className={CARD} aria-labelledby="coupon-value-title">
              <h2 id="coupon-value-title" className={CARD_TITLE}>
                Discount
              </h2>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-start">
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
                  {form.discount_type === "fixed" ? <span className={cn(ADORN, "left-3.5")}>$</span> : null}
                  <input
                    id="coupon-value"
                    type="text"
                    inputMode="decimal"
                    aria-label={form.discount_type === "percentage" ? "Percent off" : "Amount off, in dollars"}
                    value={form.discount_value}
                    onChange={(e) => set("discount_value", typedAmount(e.target.value))}
                    placeholder={form.discount_type === "percentage" ? "10" : "5.00"}
                    aria-invalid={wrong("value") || undefined}
                    aria-describedby={described("value")}
                    className={cn(FIELD, "tabular-nums", form.discount_type === "fixed" ? "pl-7" : "pr-9", wrong("value") && FIELD_WRONG)}
                  />
                  {form.discount_type === "percentage" ? <span className={cn(ADORN, "right-3.5")}>%</span> : null}
                </div>
              </div>
              <FieldError id="coupon-value" problem={problem} />
            </section>

            {/* ── What it applies to ───────────────────────────────── */}
            <section className={CARD} aria-labelledby="coupon-applies-title">
              <h2 id="coupon-applies-title" className={CARD_TITLE}>
                Applies to
              </h2>
              <Segmented
                label="Products the code applies to"
                value={form.applies_to}
                onChange={(v) => set("applies_to", v)}
                options={[
                  { value: "all", label: "All products" },
                  { value: "specific", label: "Selected products" },
                ]}
              />
              {form.applies_to === "specific" ? (
                products.length > 0 ? (
                  <div id="coupon-products" tabIndex={-1} className="space-y-2 outline-none">
                    {products.length > 6 ? (
                      <div className="relative">
                        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                        <input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search products"
                          aria-label="Search products"
                          enterKeyHint="search"
                          className={cn(FIELD, "pl-9")}
                        />
                      </div>
                    ) : null}
                    <ul
                      aria-label="Products"
                      className={cn("max-h-[336px] divide-y divide-[#eef0f2] overflow-y-auto overscroll-contain rounded-xl border", wrong("products") ? "border-[#c4290c]" : "border-[#e5e7eb]")}
                    >
                      {shownProducts.map((p) => {
                        const on = form.product_ids.includes(p.id)
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              onClick={() => toggleProduct(p.id)}
                              className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 px-3 py-2 text-left outline-none transition-colors duration-100 focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-[52px] sm:hover:bg-[#fafafb]"
                            >
                              <Tick on={on} />
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
                      {shownProducts.length === 0 ? <li className="px-4 py-6 text-center text-[14px] text-[#6b7280]">No product matches that.</li> : null}
                    </ul>
                    <FieldError id="coupon-products" problem={problem} />
                    <div className="flex min-h-8 items-center justify-between gap-3">
                      <p className={HINT}>
                        {picked === 0 && hidden === 0 ? "None selected yet." : `${picked} of ${products.length} selected`}
                        {hidden > 0 ? `, and ${hidden} not on sale now` : ""}
                      </p>
                      {form.product_ids.length > 0 ? (
                        <button type="button" onClick={() => set("product_ids", [])} className="h-8 shrink-0 cursor-pointer rounded-lg px-2 text-[14px] font-medium text-[#4b5563] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] sm:text-[13px]">
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p id="coupon-products" className={HINT}>
                    Publish a product first. A code can only be for products buyers can see.
                  </p>
                )
              ) : (
                <p className={HINT}>Every product, including ones you add later.</p>
              )}
            </section>

            <PhysicalCouponOptions initial={initialCoupon} handle={physicalOptions} onChange={() => setOptionsTouched((n) => n + 1)} cardClass={CARD} titleClass={CARD_TITLE} />

            {/* ── Limits ───────────────────────────────────────────── */}
            <section className={CARD} aria-labelledby="coupon-limits-title">
              <h2 id="coupon-limits-title" className={CARD_TITLE}>
                Limits
              </h2>
              <div className={SWITCH_GROUP}>
                <div>
                  <SwitchRow title="Minimum order" hint="Only on orders over an amount" checked={form.has_min_purchase} onChange={(v) => set("has_min_purchase", v)} />
                  {form.has_min_purchase ? (
                    <div className="space-y-1.5 px-4 pb-3 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
                      <div className="relative">
                        <span className={cn(ADORN, "left-3.5")}>$</span>
                        <input
                          id="coupon-minimum"
                          type="text"
                          inputMode="decimal"
                          aria-label="Minimum order, in dollars"
                          value={form.min_purchase_amount}
                          onChange={(e) => set("min_purchase_amount", typedAmount(e.target.value))}
                          placeholder="25.00"
                          aria-invalid={wrong("minimum") || undefined}
                          aria-describedby={described("minimum")}
                          className={cn(FIELD, "pl-7 tabular-nums", wrong("minimum") && FIELD_WRONG)}
                        />
                      </div>
                      <FieldError id="coupon-minimum" problem={problem} />
                    </div>
                  ) : null}
                </div>
                <div>
                  <SwitchRow title="Limit total uses" hint="Stops after this many orders" checked={form.has_usage_limit} onChange={(v) => set("has_usage_limit", v)} />
                  {form.has_usage_limit ? (
                    <div className="space-y-1.5 px-4 pb-3 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
                      <input
                        id="coupon-uses"
                        type="text"
                        inputMode="numeric"
                        aria-label="Total uses"
                        value={form.usage_limit}
                        onChange={(e) => set("usage_limit", typedWhole(e.target.value))}
                        placeholder="100"
                        aria-invalid={wrong("uses") || undefined}
                        aria-describedby={described("uses")}
                        className={cn(FIELD, "tabular-nums", wrong("uses") && FIELD_WRONG)}
                      />
                      <FieldError id="coupon-uses" problem={problem} />
                      {isEdit && used > 0 ? <p className={HINT}>Used {used} {used === 1 ? "time" : "times"} so far.</p> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {/* ── Dates ────────────────────────────────────────────── */}
            <section className={CARD} aria-labelledby="coupon-dates-title">
              <h2 id="coupon-dates-title" className={CARD_TITLE}>
                Active dates
              </h2>
              <div className={SWITCH_GROUP}>
                <div>
                  <SwitchRow
                    title="Start later"
                    hint={form.has_start ? "Works from this date and time" : "Works as soon as it is saved"}
                    checked={form.has_start}
                    onChange={(v) => turn("has_start", v)}
                  />
                  {form.has_start ? (
                    <div className="space-y-1.5 px-4 pb-3 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
                      <input
                        id="coupon-start"
                        type="datetime-local"
                        aria-label="Starts"
                        value={form.starts_at}
                        onChange={(e) => set("starts_at", e.target.value)}
                        aria-invalid={wrong("start") || undefined}
                        aria-describedby={described("start")}
                        className={cn(FIELD, "min-w-0 appearance-none", wrong("start") && FIELD_WRONG)}
                      />
                      <FieldError id="coupon-start" problem={problem} />
                    </div>
                  ) : null}
                </div>
                <div>
                  <SwitchRow
                    title="End date"
                    hint={form.has_end ? "Stops working at this date and time" : "Runs until you turn it off"}
                    checked={form.has_end}
                    onChange={(v) => turn("has_end", v)}
                  />
                  {form.has_end ? (
                    <div className="space-y-1.5 px-4 pb-3 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
                      <input
                        id="coupon-end"
                        type="datetime-local"
                        aria-label="Ends"
                        value={form.expires_at}
                        min={form.has_start ? form.starts_at || undefined : undefined}
                        onChange={(e) => set("expires_at", e.target.value)}
                        aria-invalid={wrong("end") || undefined}
                        aria-describedby={described("end")}
                        className={cn(FIELD, "min-w-0 appearance-none", wrong("end") && FIELD_WRONG)}
                      />
                      <FieldError id="coupon-end" problem={problem} />
                    </div>
                  ) : null}
                </div>
              </div>
              <p className={HINT}>Dates are in your own time zone.</p>
            </section>
          </div>

          {/* From lg the side column stays in view while the coupon is filled in, so the summary follows the change. */}
          <div data-editor-side="" className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-6">
            {/* ── On or off, and how it has been used ──────────────── */}
            <section data-coupon-status="" className={CARD} aria-labelledby="coupon-status-title">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id="coupon-status-title" className={CARD_TITLE}>
                    Active
                  </h2>
                  <p className={cn(HINT, "mt-0.5")}>{form.is_active ? "Buyers can use it at checkout." : "Paused. Buyers cannot use it until you turn it on."}</p>
                </div>
                <div className="pt-0.5">
                  <FormSwitch checked={form.is_active} onChange={(v) => set("is_active", v)} label="Active" />
                </div>
              </div>
              {isEdit ? (
                <dl className="grid grid-cols-2 gap-3 border-t border-[#eef0f2] pt-4 lg:grid-cols-1">
                  {/* From lg the badge is in the page header, right above. */}
                  <div className="lg:hidden">
                    <dt className={HINT}>Status</dt>
                    <dd className="mt-1">
                      <StatusBadge tone={STATE_TONE[state!]}>{COUPON_STATE_LABEL[state!]}</StatusBadge>
                    </dd>
                  </div>
                  <div>
                    <dt className={HINT}>Used</dt>
                    <dd className="mt-1 text-[15px] font-medium tabular-nums text-[#1a1a2e] sm:text-[14px]">
                      {used}
                      {initialCoupon!.usage_limit !== null ? <span className="font-normal text-[#6b7280]"> of {initialCoupon!.usage_limit}</span> : null}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </section>

            {/* ── The code in words, from lg ───────────────────────── */}
            <section data-coupon-summary="" className={cn(CARD, "hidden lg:block")} aria-labelledby="coupon-summary-title">
              <h2 id="coupon-summary-title" className={CARD_TITLE}>
                Summary
              </h2>
              <p className={cn("truncate text-[15px]", form.code ? "font-mono font-semibold tracking-wide text-[#1a1a2e]" : "text-[#9ca3af]")}>{form.code || "No code yet"}</p>
              <ul className="space-y-1.5">
                {summary.map((line) => (
                  <li key={line} className="flex gap-2 text-[14px] leading-5 text-[#4b5563]">
                    <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#9ca3af]" />
                    {line}
                  </li>
                ))}
              </ul>
            </section>

            {isEdit ? (
              <div className="flex justify-start lg:justify-end">
                <button type="button" data-delete-coupon="" disabled={busy} onClick={() => void remove()} className={cn(quietDanger, "h-10 rounded-[10px] px-3.5 text-[15px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]")}>
                  Delete coupon
                </button>
              </div>
            ) : null}
          </div>
        </form>
      </div>

      {/*
        THE FOOT BAR, FROM lg: where the page stands in words on the left,
        Cancel (or Back) and Save on the right. Sticky at the bottom of the
        pane, the last box in it, so scrolled to the end it sits under the
        last card and never over it.
      */}
      <div
        data-editor-foot=""
        className="sticky bottom-0 z-30 mt-auto hidden shrink-0 border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)] lg:block"
      >
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-8">
          <p data-editor-state={saveState} className="flex min-w-0 items-center gap-2 text-[14px] leading-5">
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                saveState === "unsaved" ? "bg-[#111113]" : saveState === "saved" && state === "active" ? "bg-[#22a06b]" : "bg-[#b6bac1]",
              )}
            />
            <span className={cn("truncate", saveState === "unsaved" ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{stateLine}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <LeaveButton mode={leaveMode} disabled={busy} asks={dirty} label="Going back to coupons" onLeave={() => void leave()} />
            <CouponSaveButton saving={saving} disabled={!canSave} onSave={() => void save()} />
          </div>
        </div>
      </div>

      {confirmSheet}
    </div>
  )
}
