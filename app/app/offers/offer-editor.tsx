"use client"

/**
 * ===========================================================================
 *  ONE OFFER, NEW OR SAVED
 * ===========================================================================
 * Storelib's SheetDialog (components/ui/sheet-dialog.tsx), as the collection
 * editor uses it: on a phone the app's shared bottom sheet, with its grabber,
 * drag and motion; on a computer a dialog in the middle of the page. Both
 * draw the same thing: a title, the form that scrolls, and Cancel and Save
 * at the foot. Questions (discard the changes, delete it) are asked by the
 * page once this has gone (./offers-client.tsx), so nothing is drawn over it.
 *
 * The form, in the order a person decides it:
 *
 *   1. what kind (a new one only): a bundle, or an upsell
 *   2. the name buyers see
 *   3. the products: the bundle's, or the one to offer
 *   4. an upsell's condition: any order, certain products, a collection,
 *      and an order minimum
 *   5. the discount: a percent, an amount, free shipping, or none
 *   6. where it shows: product page, cart, checkout
 *   7. how it looks to a buyer, drawn live from the same arithmetic the
 *      checkout charges by
 *   8. dates, a limit per order, and whether a code can be used on top
 *   9. on or off
 *
 * Every setting here is a field of the offer the server stores and a rule
 * the checkout applies (lib/offers/offers.ts readOffer, applyOffers). What
 * is wrong is said under its own field when Save is pressed, and the first
 * one is brought into view. Ctrl or Cmd and Enter saves.
 */

import * as React from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { MAX_BUNDLE, MAX_TRIGGERS, PLACEMENTS_FOR, type DiscountType, type Offer, type OfferKind, type Placement } from "@/lib/offers/offers"
import { amountOf, bodyOf, draftOf, problemsOf, type Draft, type Problems } from "./offer-draft"
import { SWITCH_GROUP, Segmented, SwitchRow } from "../products/new/editor-controls"
import { Tick } from "../coupons/coupon-parts"
import { ProductThumb, usePhone } from "../products/collections/collection-parts"
import { OfferPreview, PLACEMENT_WORD, currencySign, moneyIn, type OfferCollection, type OfferProduct } from "./offer-parts"

const SHEET_HEIGHT = "calc(var(--vv-h, 100dvh) * 0.92)"
/* The coupon and collection editors' fields: 16px on a phone so iOS does not zoom, 44px to press. */
const FIELD =
  "h-11 w-full min-w-0 rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]"
const BAD = "border-[#f0b4ab] focus:border-[#e3897c]"
const LABEL = "mb-1.5 block text-[13px] font-medium text-[#4b5563]"
const HINT = "text-[13px] leading-5 text-[#6b7280]"
const ERR = "mt-1.5 text-[13px] font-medium leading-5 text-[#b42318]"
const SECTION_TITLE = "text-[15px] font-semibold text-[#1a1a2e] sm:text-[14px]"
const FOOT_BUTTON = "h-12 min-w-0 rounded-xl text-[16px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]"

export function OfferEditor({
  open,
  offer,
  kind,
  products,
  collections,
  currency,
  physical,
  settingsReady,
  onRequestClose,
  onSave,
  onDelete,
  onClosed,
  leaveMs,
}: {
  open: boolean
  /** Null for a new offer. */
  offer: Offer | null
  /** A new offer's kind to start with. */
  kind: OfferKind
  products: OfferProduct[]
  collections: OfferCollection[]
  currency: string
  /** Physical commerce is on: free shipping can be offered. */
  physical: boolean
  /** SQL part 230 has run: dates, places, limits and the rest can be saved. */
  settingsReady: boolean
  onRequestClose: (dirty: boolean) => void
  /** Saves, and answers with what went wrong, or null. */
  onSave: (id: string | null, body: ReturnType<typeof bodyOf>) => Promise<string | null>
  onDelete: (offer: Offer) => void
  onClosed: () => void
  leaveMs: number
}) {
  const phone = usePhone()
  const [d, setD] = React.useState<Draft>(() => draftOf(offer, kind, currency))
  const [initial] = React.useState(() => JSON.stringify(draftOf(offer, kind, currency)))
  const dirty = JSON.stringify(d) !== initial
  const [tried, setTried] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const formRef = React.useRef<HTMLDivElement>(null)
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const byId = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const problems = problemsOf(d, currency)
  const shown: Problems = tried ? problems : {}
  const sign = currencySign(currency)
  const money = moneyIn(currency)

  /* The computer's dialog has no "gone" of its own to report: its fade is a fixed length. The phone's sheet says when it has gone (onClosed below). */
  React.useEffect(() => {
    if (open || phone) return
    const t = window.setTimeout(onClosed, leaveMs)
    return () => window.clearTimeout(t)
  }, [open, phone, onClosed, leaveMs])

  const close = () => {
    if (!busy) onRequestClose(dirty)
  }

  const save = async () => {
    if (busy) return
    setTried(true)
    if (Object.keys(problems).length) {
      /* The first field with something to fix, brought into view. */
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[data-problem]")?.scrollIntoView({ block: "center", behavior: "smooth" }))
      return
    }
    setBusy(true)
    setError(null)
    const problem = await onSave(offer?.id ?? null, bodyOf(d, currency))
    setBusy(false)
    if (problem) setError(problem)
  }

  const pickProduct = (id: string) => {
    if (d.kind === "checkout") return set({ productIds: [id], triggerIds: d.triggerIds.filter((t) => t !== id) })
    if (d.productIds.includes(id)) return set({ productIds: d.productIds.filter((x) => x !== id) })
    if (d.productIds.length >= MAX_BUNDLE) return
    set({ productIds: [...d.productIds, id] })
  }
  const toggle = (list: string[], id: string, max = MAX_TRIGGERS) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(0, max))
  const togglePlace = (p: Placement) => set({ placements: d.placements.includes(p) ? d.placements.filter((x) => x !== p) : PLACEMENTS_FOR[d.kind].filter((x) => x === p || d.placements.includes(x)) })

  const discountOptions: { value: DiscountType; label: string }[] = [
    { value: "percent", label: tt("Percent") },
    { value: "fixed", label: tt("Amount") },
    ...(physical || d.discountType === "free_shipping" ? [{ value: "free_shipping" as const, label: tt("Free shipping") }] : []),
    { value: "none", label: tt("None") },
  ]
  const heading = offer ? tt("Edit offer") : tt("New offer")
  const newSettingsUsed = !settingsReady && (d.condition === "collections" || d.placements.length !== PLACEMENTS_FOR[d.kind].length || !!d.startsAt || !!d.endsAt || !!d.maxPerOrder || !d.combinesWithCodes || !!d.minSubtotal || d.discountType === "free_shipping")

  return (
    <SheetDialog
      open={open}
      onClose={close}
      phone={phone}
      label={heading}
      showCloseButton={false}
      onOpenAutoFocus={(e) => {
        if (!offer) return
        e.preventDefault()
        ;(e.currentTarget as HTMLElement | null)?.focus?.()
      }}
      className="flex max-h-[min(90vh,860px)] flex-col gap-0 overflow-hidden rounded-2xl border-[#e5e7eb] p-0 shadow-[0_20px_48px_-16px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] outline-none sm:max-w-[640px]"
      sheet={{ height: SHEET_HEIGHT, maxHeight: SHEET_HEIGHT, dismissible: !busy, onClosed }}
    >
      <div
        data-offer-editor=""
        className="flex min-h-0 flex-1 flex-col"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void save()
          }
        }}
      >
        <div className="shrink-0 px-5 pb-3 pt-1 sm:px-6 sm:pt-5">
          <SheetDialogTitle className="text-[17px] font-semibold leading-6 text-[#1a1a2e]">{heading}</SheetDialogTitle>
        </div>

        <div ref={formRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 sm:px-6">
          <div className="space-y-5">
            {!offer ? (
              <Segmented
                label={tt("Kind of offer")}
                value={d.kind}
                onChange={(k) => {
                  /* A name typed by hand stays; the other kind's own default name replaces the default one. */
                  const fresh = draftOf(null, k, currency)
                  const typed = d.title !== draftOf(null, d.kind, currency).title
                  setD({ ...fresh, title: typed ? d.title : fresh.title, discountType: d.discountType, amount: d.amount, startsAt: d.startsAt, endsAt: d.endsAt, combinesWithCodes: d.combinesWithCodes, active: d.active })
                }}
                options={[
                  { value: "bundle", label: tt("Bundle") },
                  { value: "checkout", label: tt("Upsell") },
                ]}
              />
            ) : null}

            <div {...(shown.title ? { "data-problem": "" } : {})}>
              <label htmlFor="offer-title" className={LABEL}>
                {tt("Name buyers see")}
              </label>
              <input id="offer-title" value={d.title} maxLength={80} autoComplete="off" onChange={(e) => set({ title: e.target.value })} aria-invalid={!!shown.title} className={cn(FIELD, shown.title && BAD)} />
              {shown.title ? <p className={ERR}>{shown.title}</p> : null}
            </div>

            <section aria-labelledby="offer-products" {...(shown.products ? { "data-problem": "" } : {})}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 id="offer-products" className={SECTION_TITLE}>
                  {d.kind === "bundle" ? tt("Products in the bundle") : tt("Product to offer")}
                </h3>
                {d.kind === "bundle" ? <span className={HINT}>{tt("{n} of {max}", { n: d.productIds.length, max: MAX_BUNDLE })}</span> : null}
              </div>
              <ProductPicker products={products} chosen={d.productIds} onPick={pickProduct} single={d.kind === "checkout"} money={money} name="offer-products" full={d.kind === "bundle" && d.productIds.length >= MAX_BUNDLE} />
              {shown.products ? <p className={ERR}>{shown.products}</p> : null}
            </section>

            {d.kind === "checkout" ? (
              <section aria-labelledby="offer-when" className="space-y-3" {...(shown.triggers ? { "data-problem": "" } : {})}>
                <h3 id="offer-when" className={SECTION_TITLE}>
                  {tt("Show it when the cart has")}
                </h3>
                <Segmented
                  label={tt("Show it when the cart has")}
                  value={d.condition}
                  fit="content"
                  onChange={(condition) => set({ condition })}
                  options={[
                    { value: "any", label: tt("Anything") },
                    { value: "products", label: tt("Certain products") },
                    ...(collections.length || d.condition === "collections" ? [{ value: "collections" as const, label: tt("A collection") }] : []),
                  ]}
                />
                {d.condition === "products" ? (
                  <ProductPicker products={products.filter((p) => !d.productIds.includes(p.id))} chosen={d.triggerIds} onPick={(id) => set({ triggerIds: toggle(d.triggerIds, id) })} money={money} name="offer-triggers" />
                ) : null}
                {d.condition === "collections" ? (
                  <ul aria-label={tt("Collections")} className="divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#e5e7eb]">
                    {collections.map((c) => {
                      const on = d.triggerCollectionIds.includes(c.id)
                      return (
                        <li key={c.id}>
                          <button type="button" role="checkbox" aria-checked={on} onClick={() => set({ triggerCollectionIds: toggle(d.triggerCollectionIds, c.id) })} className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-3.5 text-left outline-none focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-[44px] sm:hover:bg-[#fafafb]">
                            <Tick on={on} />
                            <span className="min-w-0 flex-1 truncate text-[15px] text-[#1a1a2e] sm:text-[14px]">{c.title}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
                {shown.triggers ? <p className={ERR}>{shown.triggers}</p> : null}
                <div {...(shown.minimum ? { "data-problem": "" } : {})}>
                  <label htmlFor="offer-minimum" className={LABEL}>
                    {tt("And the rest of the order is at least")} <span className="font-normal text-[#9ca3af]">{tt("optional")}</span>
                  </label>
                  <MoneyField id="offer-minimum" sign={sign} value={d.minSubtotal} onChange={(minSubtotal) => set({ minSubtotal })} bad={!!shown.minimum} placeholder="0" />
                  {shown.minimum ? <p className={ERR}>{shown.minimum}</p> : null}
                </div>
              </section>
            ) : null}

            <section aria-labelledby="offer-discount" className="space-y-2.5" {...(shown.amount ? { "data-problem": "" } : {})}>
              <h3 id="offer-discount" className={SECTION_TITLE}>
                {tt("Discount")}
              </h3>
              <Segmented label={tt("Discount type")} value={d.discountType} fit="content" onChange={(t) => set({ discountType: t, amount: t === "percent" ? "10" : t === "fixed" ? amountOf(500, currency) : "" })} options={discountOptions} />
              {d.discountType === "percent" || d.discountType === "fixed" ? (
                <div className="flex items-center gap-3">
                  {d.discountType === "fixed" ? (
                    <MoneyField id="offer-amount" sign={sign} value={d.amount} onChange={(amount) => set({ amount })} bad={!!shown.amount} className="w-[150px]" />
                  ) : (
                    <label className="relative block w-[120px]">
                      <span className="sr-only">{tt("Percent off")}</span>
                      <input id="offer-amount" inputMode="numeric" value={d.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} aria-invalid={!!shown.amount} className={cn(FIELD, "pr-8 tabular-nums", shown.amount && BAD)} />
                      <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">%</span>
                    </label>
                  )}
                  <p className={HINT}>{d.kind === "bundle" ? (d.discountType === "fixed" ? tt("Off each complete set.") : tt("Off every product in each complete set.")) : tt("Off the product it offers.")}</p>
                </div>
              ) : (
                <p className={HINT}>{d.discountType === "free_shipping" ? (d.kind === "bundle" ? tt("The whole order ships free once the set is in the cart.") : tt("The whole order ships free once it's added.")) : tt("It's suggested at its own price.")}</p>
              )}
              {shown.amount ? <p className={ERR}>{shown.amount}</p> : null}
            </section>

            <section aria-labelledby="offer-places" className="space-y-2" {...(shown.places ? { "data-problem": "" } : {})}>
              <h3 id="offer-places" className={SECTION_TITLE}>
                {tt("Show it on")}
              </h3>
              <div className={cn(SWITCH_GROUP, "divide-y")}>
                {PLACEMENTS_FOR[d.kind].map((p) => {
                  const on = d.placements.includes(p)
                  return (
                    <button key={p} type="button" role="checkbox" aria-checked={on} data-place={p} onClick={() => togglePlace(p)} className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-4 text-left outline-none focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-[44px] sm:hover:bg-[#fafafb]">
                      <Tick on={on} />
                      <span className="min-w-0 flex-1 text-[15px] text-[#1a1a2e] sm:text-[14px]">{PLACEMENT_WORD[p]()}</span>
                    </button>
                  )
                })}
              </div>
              {shown.places ? <p className={ERR}>{shown.places}</p> : null}
            </section>

            <section aria-labelledby="offer-preview" className="space-y-2">
              <h3 id="offer-preview" className={SECTION_TITLE}>
                {tt("Preview")}
              </h3>
              <OfferPreview draft={{ kind: d.kind, title: d.title, productIds: d.productIds, discountType: d.discountType, discountValue: bodyOf(d, currency).discountValue || 0 }} byId={byId} currency={currency} />
            </section>

            <section aria-labelledby="offer-rules" className="space-y-3">
              <h3 id="offer-rules" className={SECTION_TITLE}>
                {tt("Dates and limits")}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2" {...(shown.dates ? { "data-problem": "" } : {})}>
                <div>
                  <label htmlFor="offer-start" className={LABEL}>
                    {tt("Starts")} <span className="font-normal text-[#9ca3af]">{tt("optional")}</span>
                  </label>
                  <input id="offer-start" type="datetime-local" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className={cn(FIELD, "tabular-nums")} />
                </div>
                <div>
                  <label htmlFor="offer-end" className={LABEL}>
                    {tt("Ends")} <span className="font-normal text-[#9ca3af]">{tt("optional")}</span>
                  </label>
                  <input id="offer-end" type="datetime-local" value={d.endsAt} onChange={(e) => set({ endsAt: e.target.value })} aria-invalid={!!shown.dates} className={cn(FIELD, "tabular-nums", shown.dates && BAD)} />
                </div>
              </div>
              {shown.dates ? <p className={ERR}>{shown.dates}</p> : null}
              {d.discountType === "percent" || d.discountType === "fixed" ? (
                <div {...(shown.limit ? { "data-problem": "" } : {})}>
                  <label htmlFor="offer-limit" className={LABEL}>
                    {d.kind === "bundle" ? tt("Discounted sets per order") : tt("Discounted items per order")}
                  </label>
                  <input id="offer-limit" inputMode="numeric" value={d.maxPerOrder} placeholder={d.kind === "bundle" ? tt("No limit") : "1"} onChange={(e) => set({ maxPerOrder: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} aria-invalid={!!shown.limit} className={cn(FIELD, "w-[150px] tabular-nums", shown.limit && BAD)} />
                  {shown.limit ? <p className={ERR}>{shown.limit}</p> : null}
                </div>
              ) : null}
              <div className={SWITCH_GROUP}>
                <SwitchRow title={tt("Discount codes can be used too")} hint={d.combinesWithCodes ? undefined : tt("With a code, the buyer gets whichever saves more.")} checked={d.combinesWithCodes} onChange={(combinesWithCodes) => set({ combinesWithCodes })} />
                <SwitchRow title={tt("Active")} checked={d.active} onChange={(active) => set({ active })} />
              </div>
            </section>

            {newSettingsUsed ? (
              <p className="rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-5 text-[#5c4300]">{tt("Dates, places, limits, collections, free shipping and the code rule need SQL part 230 before they can be saved.")}</p>
            ) : null}

            {error ? (
              <p role="alert" className="text-[14px] font-medium leading-5 text-[#b42318] sm:text-[13px]">
                {error}
              </p>
            ) : null}

            {offer ? (
              <div className="border-t border-[#eef0f2] pt-4">
                <button type="button" data-delete-offer="" disabled={busy} onClick={() => onDelete(offer)} className={cn(secondaryDepth, "h-11 w-full rounded-xl text-[15px] text-[#4b5563] sm:h-8 sm:w-auto sm:rounded-lg sm:px-3 sm:text-[13px]")}>
                  {tt("Delete offer")}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div data-editor-foot="" className="grid shrink-0 grid-cols-2 gap-2.5 border-t border-[#eef0f2] px-5 pt-3 sm:flex sm:justify-end sm:gap-2 sm:px-6 sm:pb-3">
          <button type="button" onClick={close} disabled={busy} className={cn(secondaryDepth, FOOT_BUTTON)}>
            {tt("Cancel")}
          </button>
          <button
            type="button"
            data-offer-save=""
            onClick={() => void save()}
            disabled={!busy && !!offer && !dirty}
            aria-busy={busy || undefined}
            className={cn(primaryDepth, FOOT_BUTTON, "relative sm:min-w-[60px]", "disabled:cursor-default disabled:bg-[#ebebef] disabled:text-[#a1a1aa] disabled:shadow-none", busy && "cursor-default")}
          >
            <span className={cn(busy && "opacity-0")}>{offer ? tt("Save") : tt("Create")}</span>
            {busy ? (
              <span aria-hidden className="absolute inset-0 flex items-center justify-center">
                <ActivitySpinner size={18} label={tt("Saving")} className="text-white" />
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </SheetDialog>
  )
}

function MoneyField({ id, sign, value, onChange, bad, placeholder, className }: { id: string; sign: string; value: string; onChange: (v: string) => void; bad?: boolean; placeholder?: string; className?: string }) {
  const wide = sign.length > 1
  return (
    <span className={cn("relative block", className ?? "w-[180px]")}>
      <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">
        {sign}
      </span>
      <input id={id} inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 12))} aria-invalid={bad || undefined} className={cn(FIELD, wide ? "pl-12" : "pl-8", "tabular-nums", bad && BAD)} />
    </span>
  )
}

function ProductPicker({ products, chosen, onPick, single = false, money, name, full = false }: { products: OfferProduct[]; chosen: string[]; onPick: (id: string) => void; single?: boolean; money: (minor: number) => string; name: string; full?: boolean }) {
  const [q, setQ] = React.useState("")
  const words = q.toLowerCase().trim()
  /* What is chosen comes first, so a long list never hides it. */
  const ordered = [...products.filter((p) => chosen.includes(p.id)), ...products.filter((p) => !chosen.includes(p.id))]
  const shown = ordered.filter((p) => !words || p.title.toLowerCase().includes(words)).slice(0, 200)
  if (products.length === 0) return <p className={HINT}>{tt("Add a product first, then pick it here.")}</p>
  return (
    <div className="space-y-2" data-product-picker={name}>
      {products.length > 6 ? (
        <label className="relative block">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <input type="search" enterKeyHint="search" data-no-autofocus="" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Search products")} aria-label={tt("Search products")} className={cn(FIELD, "pl-9 [&::-webkit-search-cancel-button]:hidden")} />
        </label>
      ) : null}
      <ul role={single ? "radiogroup" : "group"} aria-label={tt("Products")} className="divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#e5e7eb] sm:max-h-[264px] sm:overflow-y-auto sm:overscroll-contain">
        {shown.map((p) => {
          const on = chosen.includes(p.id)
          const blocked = !on && full
          return (
            <li key={p.id} className="[contain-intrinsic-size:auto_56px] [content-visibility:auto]">
              <button
                type="button"
                role={single ? "radio" : "checkbox"}
                aria-checked={on}
                aria-disabled={blocked || undefined}
                data-pick={p.id}
                onClick={() => !blocked && onPick(p.id)}
                className={cn("flex min-h-[60px] w-full cursor-pointer items-center gap-3 px-3 py-2 text-left outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent] focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-[52px] sm:hover:bg-[#fafafb]", blocked && "cursor-default opacity-50")}
              >
                {single ? <Radio on={on} /> : <Tick on={on} />}
                <ProductThumb src={p.imageUrl} title={p.title} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] leading-5 text-[#1a1a2e] sm:text-[14px]">{p.title}</span>
                  <span className="block truncate text-[13px] leading-[18px] text-[#6b7280] sm:text-[12px]">
                    {p.payWhatYouWant ? tt("Pay what you want, from {amount}", { amount: money(p.priceCents) }) : money(p.priceCents)}
                    {!p.published ? tt(" · Draft") : ""}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {shown.length === 0 ? <li className="px-4 py-6 text-center text-[14px] text-[#6b7280]">{tt("No product matches that.")}</li> : null}
      </ul>
    </div>
  )
}

function Radio({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border transition-colors duration-100 sm:h-[18px] sm:w-[18px]", on ? "border-[#111113] bg-[#111113]" : "border-[#c7cad1] bg-white")}>
      {on ? <span className="h-[7px] w-[7px] rounded-full bg-white" /> : null}
    </span>
  )
}
