"use client"

/**
 * ===========================================================================
 *  EVERY COMBINATION, AS ROWS A SELLER CAN FILL IN QUICKLY
 * ===========================================================================
 * Under the options (./variant-options.tsx). Each row is one variant on one
 * line, at every width: its photo, its name, its price and its quantity,
 * under a header that names the two columns. Behind the chevron its compare
 * at price, cost, SKU, barcode and weight, and whether it is sold, folding
 * out under the row (Reveal) rather than appearing all at once.
 *
 *   two options or more   rows are grouped by the first option, as Shopify
 *                         does: "S, 4 variants", with one price and one photo
 *                         that apply to the whole group; a group folds
 *   Edit all              one price, compare at, quantity, weight or cost
 *                         for every variant, or every one with a value
 *   new rows              a value added above brings its rows in with a short
 *                         fade; the rows already there stay where they are
 *   values                each field keeps only what it can be
 *                         (lib/physical/typed-values.ts): no negative stock,
 *                         two decimal places, a SKU without spaces, a barcode
 *                         of digits; a compare at price that would show no
 *                         sale, a barcode of the wrong length and a SKU two
 *                         variants share are said under the field
 *
 * "Smaller, smoother, cleaner": fields are 40px on a phone and 36px from
 * 640px, with 16px type on a phone so iOS doesn't zoom. Prices are in the
 * store's currency (lib/store/currency-context.tsx).
 */

import * as React from "react"
import { ChevronDown, ImagePlus, Loader2, SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { combinationKey, variantName } from "@/lib/physical/variants"
import { marginPercent } from "@/lib/physical/totals"
import { barcodeProblem, barcodeTyped, compareAtProblem, repeatedSkus, skuTyped } from "@/lib/physical/typed-values"
import { formatStoreMoney } from "@/lib/store/currency"
import { THUMB_QUALITY, thumbable } from "@/lib/files/thumb"
import { useStoreCurrency } from "@/lib/store/currency-context"
import type { Location, ProductOption } from "@/lib/physical/types"
import type { WeightUnit } from "@/lib/physical/units"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, DecimalInput, FIELD_COMPACT, Field, Modal, MoneyInput, NumberInput, Reveal, SelectInput, TextInput, Toggle, centsOf } from "./ui"
import { groupByFirst, priceRange, type VariantRow } from "./variant-rows"

/** One line per variant at every width: photo, name, price, quantity, more. */
const GRID = "grid grid-cols-[34px_minmax(0,1fr)_84px_60px_28px] items-center gap-x-2 md:grid-cols-[40px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.7fr)_32px] md:gap-x-3"

export interface VariantTableProps {
  rows: VariantRow[]
  options: ProductOption[]
  basePrice: string
  trackInventory: boolean
  locations: Location[]
  stockAt: string
  setStockAt: (id: string) => void
  weightUnit: WeightUnit
  setRow: (key: string, patch: Partial<VariantRow>) => void
  /** Several rows at once (a group's price, Edit all, a photo for every Sand). */
  patchRows: (keys: string[], patch: (r: VariantRow) => Partial<VariantRow>) => void
  pickImage: (keys: string[], name: string) => void
  /** Rows whose photo is still uploading: their key and the picture shown meanwhile (a local preview). */
  pending?: Record<string, string>
}

/** Rows that were not there on the last draw, so they can come in with a fade; none on the first draw. */
function useNewKeys(keys: string[]): Set<string> {
  const seen = React.useRef<Set<string> | null>(null)
  const fresh = seen.current ? new Set(keys.filter((k) => !seen.current!.has(k))) : new Set<string>()
  React.useEffect(() => {
    seen.current = new Set(keys)
  })
  return fresh
}

const ENTER = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"

/*
  WHY TYPING IN ONE ROW NO LONGER REDRAWS THIRTY. Every row used to be handed
  the whole table's props (`{...props}`, the rows array among them) and a new
  `setOpen` each draw, so one keystroke in one price redrew every row, every
  input and every hidden details panel: about 90ms a key with 30 variants.
  Now a row gets only its own row and callbacks that keep their identity
  (product-cards.tsx makes setRow, patchRows and pickImage once), and is
  memoised, so a key redraws the one row it was typed in. A row's details
  are built the first time they are opened, not for every row up front.
*/
export function VariantTable(props: VariantTableProps) {
  const { rows, options, basePrice, trackInventory, locations, stockAt, setStockAt, weightUnit, setRow, patchRows, pickImage, pending } = props
  const [openRow, setOpenRow] = React.useState<string | null>(null)
  const [folded, setFolded] = React.useState<Set<string>>(new Set())
  const [bulk, setBulk] = React.useState(false)
  const grouped = options.length >= 2
  const groups = grouped ? groupByFirst(rows) : []
  const sold = rows.filter((r) => r.active).length
  const fresh = useNewKeys(rows.map((r) => combinationKey(r.options)))
  const sharedSkus = repeatedSkus(rows.map((r) => r.sku))
  const toggleFold = React.useCallback(
    (value: string) =>
      setFolded((s) => {
        const n = new Set(s)
        const k = value.toLowerCase()
        if (n.has(k)) n.delete(k)
        else n.add(k)
        return n
      }),
    [],
  )
  const toggleRow = React.useCallback((key: string) => setOpenRow((o) => (o === key ? null : key)), [])
  const line = (r: VariantRow, label: string, nested: boolean) => {
    const key = combinationKey(r.options)
    return (
      <VariantLine
        key={key}
        row={r}
        label={label}
        nested={nested}
        entering={fresh.has(key)}
        skuShared={!!r.sku.trim() && sharedSkus.has(r.sku.trim().toLowerCase())}
        open={openRow === key}
        toggle={toggleRow}
        pendingUrl={pending?.[key]}
        basePrice={basePrice}
        trackInventory={trackInventory}
        stockAt={stockAt}
        weightUnit={weightUnit}
        setRow={setRow}
        patchRows={patchRows}
        pickImage={pickImage}
      />
    )
  }

  return (
    <div className="mt-4" data-variant-table="">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-[#6b7280]" aria-live="polite">
          {rows.length} {rows.length === 1 ? "variant" : "variants"}
          {sold < rows.length ? `, ${rows.length - sold} not sold` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {trackInventory && locations.length > 1 ? (
            <SelectInput value={stockAt} onChange={setStockAt} className="w-[180px]" aria-label="Location for the quantity column">
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  At {l.name}
                </option>
              ))}
            </SelectInput>
          ) : null}
          <button type="button" data-variants-edit-all="" onClick={() => setBulk(true)} className={cn(BTN_SECONDARY, "h-8 px-2.5 text-[13px]")}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Edit all
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#eceef1] bg-white">
        <div className={cn(GRID, "border-b border-[#eceef1] bg-[#f8f9fa] px-2.5 py-1.5 text-[12px] font-medium text-[#6b7280] md:px-3")} data-variant-head="">
          <span />
          <span className="truncate">{grouped ? `By ${options[0].name.toLowerCase()}` : "Variant"}</span>
          <span>Price</span>
          <span>{trackInventory ? "Qty" : "Stock"}</span>
          <span />
        </div>
        {grouped
          ? groups.map((g) => {
              const isFolded = folded.has(g.value.toLowerCase())
              return (
                <div key={g.value} className="border-b border-[#eceef1] last:border-b-0" data-variant-group={g.value}>
                  <GroupLine
                    value={g.value}
                    rows={g.rows}
                    folded={isFolded}
                    toggle={toggleFold}
                    basePrice={basePrice}
                    trackInventory={trackInventory}
                    stockAt={stockAt}
                    patchRows={patchRows}
                    pickImage={pickImage}
                    pendingUrl={pending ? g.rows.map((r) => pending[combinationKey(r.options)]).find(Boolean) : undefined}
                  />
                  <Reveal open={!isFolded}>
                    <div className="border-t border-[#f1f2f4] bg-[#fcfcfd]">{g.rows.map((r) => line(r, r.options.slice(1).filter(Boolean).join(" / "), true))}</div>
                  </Reveal>
                </div>
              )
            })
          : rows.map((r) => (
              <div key={combinationKey(r.options)} className="border-b border-[#eceef1] last:border-b-0">
                {line(r, variantName(r.options), false)}
              </div>
            ))}
      </div>
      <BulkEdit {...props} open={bulk} onClose={() => setBulk(false)} />
    </div>
  )
}

/**
 * A resized copy for a variant's square, never the camera original: a 3000px
 * photo decoded on the main thread to fill 40px was a large part of the
 * stutter. 128px wide is the smallest size Next's optimizer serves that is
 * still sharp at 3x (lib/files/thumb.ts); the Files picker asks for the same
 * width, so a photo seen there is already in the cache here.
 */
export function variantThumbSrc(url: string): string {
  if (!thumbable(url)) return url
  return `/_next/image?url=${encodeURIComponent(url)}&w=128&q=${THUMB_QUALITY}`
}

/**
 * The square at the start of a row. Empty: a dashed square with a plus.
 * Set: the photo, faded in once decoded so it never paints half drawn, in a
 * box of fixed size so nothing beside it moves. With a mouse, a small x in
 * its corner takes the photo off (and with the keyboard); on a phone the
 * picker has Remove photo, and the row's details have Remove.
 * While an upload runs it shows the local preview, a little dimmed, with a
 * spinner: the photo is the row's the moment it is chosen.
 */
const Thumb = React.memo(function Thumb({ url, pendingUrl, label, onPick, onRemove, small, size }: { url: string | null; pendingUrl?: string; label: string; onPick: () => void; onRemove?: () => void; small?: boolean; size?: string }) {
  const src = pendingUrl ?? (url ? variantThumbSrc(url) : null)
  return (
    <div className={cn("group/thumb relative shrink-0", size ?? (small ? "h-8 w-8 md:h-9 md:w-9" : "h-[34px] w-[34px] md:h-10 md:w-10"))} data-variant-thumb={src ? "set" : "empty"}>
      <button
        type="button"
        onClick={onPick}
        aria-label={src ? `Change the photo for ${label}` : `Add a photo for ${label}`}
        className={cn(
          "grid h-full w-full place-items-center overflow-hidden rounded-lg border bg-[#f3f4f6] text-[#9ca3af] outline-none transition-colors hover:border-[#9ca3af] hover:text-[#4b5563] focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40",
          src ? "border-[#e5e7eb]" : "border-dashed border-[#d1d5db] bg-[#fafafa]",
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            decoding="async"
            draggable={false}
            onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "")}
            className={cn("h-full w-full object-cover opacity-0 transition-opacity duration-150 data-[loaded]:opacity-100", pendingUrl && "data-[loaded]:opacity-60")}
          />
        ) : (
          <ImagePlus className="h-3.5 w-3.5" />
        )}
      </button>
      {pendingUrl ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-label="Uploading" data-variant-thumb-uploading="">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1a1a2e]" />
        </span>
      ) : url && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove the photo for ${label}`}
          data-variant-thumb-remove=""
          className="absolute -right-1.5 -top-1.5 hidden h-[18px] w-[18px] place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:text-[#1a1a2e] group-hover/thumb:grid group-has-[:focus-visible]/thumb:grid"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      ) : null}
    </div>
  )
})

type GroupLineProps = Pick<VariantTableProps, "basePrice" | "trackInventory" | "stockAt" | "patchRows" | "pickImage"> & { value: string; rows: VariantRow[]; folded: boolean; toggle: (value: string) => void; pendingUrl?: string }

/** A group's line redraws when one of its own rows changed, not when a row in another group did. */
const sameGroup = (a: GroupLineProps, b: GroupLineProps) =>
  a.value === b.value && a.folded === b.folded && a.basePrice === b.basePrice && a.trackInventory === b.trackInventory && a.stockAt === b.stockAt && a.patchRows === b.patchRows && a.pickImage === b.pickImage && a.toggle === b.toggle && a.pendingUrl === b.pendingUrl && a.rows.length === b.rows.length && a.rows.every((r, i) => r === b.rows[i])

const GroupLine = React.memo(function GroupLine({ value, rows, folded, toggle, basePrice, trackInventory, stockAt, patchRows, pickImage, pendingUrl }: GroupLineProps) {
  const currency = useStoreCurrency()
  const keys = rows.map((r) => combinationKey(r.options))
  const prices = new Set(rows.map((r) => r.price))
  const shared = prices.size === 1 ? rows[0].price : ""
  const images = new Set(rows.map((r) => r.imageUrl))
  const image = images.size === 1 ? rows[0].imageUrl : rows.find((r) => r.imageUrl)?.imageUrl ?? null
  const qty = rows.reduce((n, r) => n + Math.max(0, Number.parseInt(r.stock[stockAt] ?? "", 10) || 0), 0)
  const range = priceRange(rows, basePrice, (c) => formatStoreMoney(c, currency))
  return (
    <div className={cn(GRID, "px-2.5 py-2 md:px-3")}>
      <Thumb url={image} pendingUrl={pendingUrl} label={`every ${value}`} onPick={() => pickImage(keys, value)} onRemove={() => patchRows(keys, () => ({ imageUrl: null }))} />
      <button type="button" onClick={() => toggle(value)} aria-expanded={!folded} className="flex min-w-0 flex-col items-start text-left outline-none focus-visible:underline">
        <span className="max-w-full truncate text-[14px] font-medium leading-5 text-[#1a1a2e]">{value}</span>
        <span className="max-w-full truncate text-[12px] leading-4 text-[#6b7280]">
          {rows.length} {rows.length === 1 ? "variant" : "variants"}
          {prices.size > 1 && range ? `, ${range}` : ""}
        </span>
      </button>
      <MoneyInput compact aria-label={`Price for every ${value}`} value={shared} placeholder={prices.size > 1 ? "Mixed" : basePrice || undefined} onChange={(v) => patchRows(keys, () => ({ price: v }))} />
      <span className={cn("truncate text-[13px] tabular-nums text-[#4b5563]", trackInventory && stockAt && "text-center")} aria-label={trackInventory && stockAt ? `${qty} in all` : undefined}>{trackInventory && stockAt ? qty : "Not tracked"}</span>
      <button type="button" onClick={() => toggle(value)} aria-label={folded ? `Show ${value}` : `Hide ${value}`} className={cn(BTN_GHOST, "h-8 w-7 px-0 md:w-8")}>
        <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", !folded && "rotate-180")} />
      </button>
    </div>
  )
}, sameGroup)

type VariantLineProps = Pick<VariantTableProps, "basePrice" | "trackInventory" | "stockAt" | "weightUnit" | "setRow" | "patchRows" | "pickImage"> & {
  row: VariantRow
  label: string
  nested?: boolean
  entering: boolean
  skuShared: boolean
  open: boolean
  toggle: (key: string) => void
  pendingUrl?: string
}

const VariantLine = React.memo(function VariantLine({ row, label, nested, entering, skuShared, open, toggle, pendingUrl, basePrice, trackInventory, stockAt, weightUnit, setRow, patchRows, pickImage }: VariantLineProps) {
  const key = combinationKey(row.options)
  const name = variantName(row.options)
  /* Built on the first open and kept, so it can fold shut with its motion; never built for rows nobody opens. */
  const [built, setBuilt] = React.useState(open)
  if (open && !built) setBuilt(true)
  const committed = stockAt ? row.committed[stockAt] ?? 0 : 0
  const priceNow = row.price.trim() ? row.price : basePrice
  const saleProblem = compareAtProblem(row.compareAt, priceNow)
  const codeProblem = barcodeProblem(row.barcode)
  const flagged = !!saleProblem || !!codeProblem || skuShared
  const extra = [row.sku && `SKU ${row.sku}`, row.compareAt && !saleProblem && "On sale", committed > 0 && `${committed} held`].filter(Boolean).join(" · ")
  const pick = () => pickImage([key], name)
  const remove = () => patchRows([key], () => ({ imageUrl: null }))
  return (
    <div data-variant-row={name} className={cn(!row.active && "bg-[#fafafa]", entering && ENTER)}>
      <div className={cn(GRID, "py-2 pr-2.5 md:pr-3", nested ? "pl-4 md:pl-5" : "pl-2.5 md:pl-3")}>
        <Thumb url={row.imageUrl} pendingUrl={pendingUrl} label={name} onPick={pick} onRemove={remove} small={nested} />
        <button type="button" onClick={() => toggle(key)} className="flex min-w-0 flex-col items-start text-left outline-none focus-visible:underline">
          <span className={cn("line-clamp-2 max-w-full break-words text-[13.5px] leading-[18px] md:text-[14px]", row.active ? "font-medium text-[#1a1a2e]" : "text-[#9ca3af] line-through")}>{label || name}</span>
          {!row.active ? (
            <span className="text-[12px] leading-4 text-[#6b7280]">Not sold</span>
          ) : flagged ? (
            <span className="text-[12px] leading-4 text-[#b45309]">Check details</span>
          ) : extra ? (
            <span className="max-w-full truncate text-[12px] leading-4 text-[#6b7280]">{extra}</span>
          ) : null}
        </button>
        <MoneyInput compact aria-label={`Price for ${name}`} value={row.price} placeholder={basePrice || undefined} onChange={(v) => setRow(key, { price: v })} />
        {trackInventory && stockAt ? (
          <NumberInput compact inputMode="numeric" aria-label={`Quantity for ${name}`} value={row.stock[stockAt] ?? ""} placeholder="0" onChange={(v) => setRow(key, { stock: { ...row.stock, [stockAt]: v } })} className="px-2 text-center" />
        ) : (
          <span className="text-[12px] leading-4 text-[#6b7280]">Not tracked</span>
        )}
        <button type="button" aria-expanded={open} aria-label={`More for ${name}`} onClick={() => toggle(key)} className={cn(BTN_GHOST, "h-8 w-7 px-0 md:w-8")}>
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>
      <Reveal open={open}>
        {built ? (
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 border-t border-dashed border-[#eceef1] bg-white px-3 pb-3.5 pt-3 sm:grid-cols-3 md:px-4" data-variant-details="">
            <div className="col-span-2 flex items-center gap-3 sm:col-span-3" data-variant-photo="">
              <Thumb url={row.imageUrl} pendingUrl={pendingUrl} label={name} onPick={pick} size="h-14 w-14" />
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-[#4b5563]">Photo</p>
                <p className="truncate text-[12px] leading-4 text-[#9ca3af]">{pendingUrl ? "Uploading" : row.imageUrl ? "Shown when it's picked" : "None: the product's photo shows"}</p>
                <div className="mt-1 flex items-center gap-3 text-[12.5px] font-medium">
                  <button type="button" onClick={pick} className="text-[#1a1a2e] underline-offset-2 hover:underline">
                    {row.imageUrl ? "Change" : "Add photo"}
                  </button>
                  {row.imageUrl && !pendingUrl ? (
                    <button type="button" onClick={remove} className="text-[#6b7280] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <VariantDetails row={row} rowKey={key} basePrice={basePrice} weightUnit={weightUnit} setRow={setRow} skuShared={skuShared} saleProblem={saleProblem} codeProblem={codeProblem} />
          </div>
        ) : null}
      </Reveal>
    </div>
  )
})

function VariantDetails({ row, rowKey: key, basePrice, weightUnit, setRow, skuShared, saleProblem, codeProblem }: { row: VariantRow; rowKey: string; basePrice: string; weightUnit: WeightUnit; setRow: VariantTableProps["setRow"]; skuShared: boolean; saleProblem: string | null; codeProblem: string | null }) {
  const margin = marginPercent(centsOf(row.price) ?? centsOf(basePrice) ?? 0, centsOf(row.cost))
  return (
    <>
      <Small label="Compare-at price" note={saleProblem} hint="Shown crossed out">
        <MoneyInput compact value={row.compareAt} onChange={(v) => setRow(key, { compareAt: v })} placeholder="Optional" />
      </Small>
      <Small label="Cost per item" hint={margin !== null ? `${margin}% margin` : "Buyers never see it"}>
        <MoneyInput compact value={row.cost} onChange={(v) => setRow(key, { cost: v })} placeholder="Optional" />
      </Small>
      <Small label="SKU" note={skuShared ? "Another variant has this SKU" : null}>
        <TextInput value={row.sku} maxLength={64} autoComplete="off" placeholder="Optional" onChange={(e) => setRow(key, { sku: skuTyped(e.target.value) })} className={FIELD_COMPACT} />
      </Small>
      <Small label="Barcode" note={codeProblem} hint="UPC, EAN or ISBN">
        <TextInput value={row.barcode} maxLength={14} inputMode="numeric" autoComplete="off" placeholder="Optional" onChange={(e) => setRow(key, { barcode: barcodeTyped(e.target.value) })} className={FIELD_COMPACT} />
      </Small>
      <Small label="Weight" hint="Blank: the product's">
        <DecimalInput compact value={row.weight} onChange={(v) => setRow(key, { weight: v })} suffix={weightUnit} placeholder="Same" />
      </Small>
      <div className="col-span-2 flex items-end sm:col-span-1">
        <div className="w-full rounded-lg bg-[#f8f9fa] px-3 py-2">
          <Toggle label="Sell this variant" description={row.active ? "Buyers can choose it" : "Hidden. Stock and orders stay"} checked={row.active} onChange={(v) => setRow(key, { active: v })} />
        </div>
      </div>
    </>
  )
}

/** A field in a variant's details: a small label, the field, then a warning or a hint, in one line of 12px. */
function Small({ label, hint, note, children }: { label: string; hint?: string; note?: string | null; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="block text-[12.5px] font-medium text-[#4b5563]">{label}</span>
      {children}
      {note ? <span className="block text-[12px] leading-4 text-[#b45309]">{note}</span> : hint ? <span className="block truncate text-[12px] leading-4 text-[#9ca3af]">{hint}</span> : null}
    </label>
  )
}

/** One value for many variants: every one, or every one with a given value. Empty fields change nothing. */
function BulkEdit({ open, onClose, rows, options, trackInventory, stockAt, locations, weightUnit, patchRows }: VariantTableProps & { open: boolean; onClose: () => void }) {
  const [scope, setScope] = React.useState("all")
  const [price, setPrice] = React.useState("")
  const [compareAt, setCompareAt] = React.useState("")
  const [qty, setQty] = React.useState("")
  const [weight, setWeight] = React.useState("")
  const [cost, setCost] = React.useState("")
  React.useEffect(() => {
    if (!open) return
    setScope("all")
    setPrice("")
    setCompareAt("")
    setQty("")
    setWeight("")
    setCost("")
  }, [open])
  const target = rows.filter((r) => {
    if (scope === "all") return true
    const [pos, value] = scope.split("\u0001")
    return (r.options[Number(pos)] ?? "").toLowerCase() === value.toLowerCase()
  })
  const where = locations.find((l) => l.id === stockAt)
  const apply = () => {
    patchRows(
      target.map((r) => combinationKey(r.options)),
      (r) => ({
        ...(price.trim() ? { price } : {}),
        ...(compareAt.trim() ? { compareAt } : {}),
        ...(cost.trim() ? { cost } : {}),
        ...(weight.trim() ? { weight } : {}),
        ...(qty.trim() && trackInventory && stockAt ? { stock: { ...r.stock, [stockAt]: qty } } : {}),
      }),
    )
    onClose()
  }
  const nothing = !price.trim() && !compareAt.trim() && !qty.trim() && !weight.trim() && !cost.trim()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit variants"
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={nothing || target.length === 0} onClick={apply} data-bulk-apply="">
            Apply to {target.length}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Apply to">
          <SelectInput value={scope} onChange={setScope} aria-label="Which variants">
            <option value="all">All {rows.length} variants</option>
            {options.map((o, pos) =>
              o.values.map((v) => (
                <option key={`${pos}-${v}`} value={`${pos}\u0001${v}`}>
                  {o.name}: {v}
                </option>
              )),
            )}
          </SelectInput>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price">
            <MoneyInput value={price} onChange={setPrice} placeholder="Unchanged" />
          </Field>
          <Field label="Compare-at price">
            <MoneyInput value={compareAt} onChange={setCompareAt} placeholder="Unchanged" />
          </Field>
          {trackInventory && stockAt ? (
            <Field label="Quantity" hint={locations.length > 1 && where ? `At ${where.name}` : undefined}>
              <NumberInput value={qty} onChange={setQty} placeholder="Unchanged" />
            </Field>
          ) : null}
          <Field label="Weight">
            <DecimalInput value={weight} onChange={setWeight} placeholder="Unchanged" suffix={weightUnit} />
          </Field>
          <Field label="Cost per item">
            <MoneyInput value={cost} onChange={setCost} placeholder="Unchanged" />
          </Field>
        </div>
        <p className="text-[13px] text-[#6b7280]">Empty fields stay as they are.</p>
      </div>
    </Modal>
  )
}
