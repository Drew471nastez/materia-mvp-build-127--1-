"use client"

/**
 * ===========================================================================
 *  EVERY COMBINATION, AS ROWS A SELLER CAN FILL IN QUICKLY
 * ===========================================================================
 * Under the options (./variant-options.tsx). Each row is one variant: its
 * photo, its name, its price and its quantity, and behind the chevron its
 * compare at price, SKU, barcode, weight and cost, and whether it is sold.
 *
 *   two options or more   rows are grouped by the first option, as Shopify
 *                         does: "S, 4 variants", folded open, with one price
 *                         and one photo that apply to the whole group
 *   Edit all              one price, compare at, quantity, weight or cost
 *                         for every variant, or every one with a value
 *   phone                 the name and photo on top, price and quantity
 *                         side by side under them; nothing scrolls sideways
 *
 * Prices are in the store's currency (lib/store/currency-context.tsx).
 */

import * as React from "react"
import { ChevronDown, ImagePlus, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { combinationKey, variantName } from "@/lib/physical/variants"
import { marginPercent } from "@/lib/physical/totals"
import { formatStoreMoney } from "@/lib/store/currency"
import { useStoreCurrency } from "@/lib/store/currency-context"
import type { Location, ProductOption } from "@/lib/physical/types"
import type { WeightUnit } from "@/lib/physical/units"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, DecimalInput, Field, Modal, MoneyInput, NumberInput, SelectInput, TextInput, Toggle, centsOf } from "./ui"
import { groupByFirst, priceRange, type VariantRow } from "./variant-rows"

const GRID = "md:grid-cols-[44px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_36px]"

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
  /** Several rows at once (a group's price, Edit all). */
  patchRows: (keys: string[], patch: (r: VariantRow) => Partial<VariantRow>) => void
  pickImage: (keys: string[], name: string) => void
}

export function VariantTable(props: VariantTableProps) {
  const { rows, options, trackInventory, locations, stockAt, setStockAt } = props
  const [openRow, setOpenRow] = React.useState<string | null>(null)
  const [folded, setFolded] = React.useState<Set<string>>(new Set())
  const [bulk, setBulk] = React.useState(false)
  const grouped = options.length >= 2
  const groups = grouped ? groupByFirst(rows) : []
  const sold = rows.filter((r) => r.active).length

  return (
    <div className="mt-5" data-variant-table="">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-[#6b7280]">
          {rows.length} {rows.length === 1 ? "variant" : "variants"}
          {sold < rows.length ? `, ${rows.length - sold} not sold` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {trackInventory && locations.length > 1 ? (
            <SelectInput value={stockAt} onChange={setStockAt} className="w-[190px]" aria-label="Location for the quantity column">
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  Quantity at {l.name}
                </option>
              ))}
            </SelectInput>
          ) : null}
          <button type="button" data-variants-edit-all="" onClick={() => setBulk(true)} className={cn(BTN_SECONDARY, "h-9 px-3 text-[13.5px]")}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Edit all
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#eceef1]">
        <div className={cn("hidden gap-3 border-b border-[#eceef1] bg-[#f8f9fa] px-3 py-2 text-[12px] font-medium text-[#6b7280] md:grid", GRID)}>
          <span />
          <span>{grouped ? `Variant, by ${options[0].name.toLowerCase()}` : "Variant"}</span>
          <span>Price</span>
          <span>{trackInventory ? "Quantity" : "Stock"}</span>
          <span />
        </div>
        {grouped
          ? groups.map((g) => {
              const isFolded = folded.has(g.value.toLowerCase())
              return (
                <div key={g.value} className="border-b border-[#eceef1] last:border-b-0" data-variant-group={g.value}>
                  <GroupLine {...props} value={g.value} rows={g.rows} folded={isFolded} toggle={() => setFolded((s) => { const n = new Set(s); const k = g.value.toLowerCase(); if (n.has(k)) n.delete(k); else n.add(k); return n })} />
                  {isFolded ? null : (
                    <div className="border-t border-[#f1f2f4] bg-[#fcfcfd]">
                      {g.rows.map((r) => (
                        <VariantLine key={combinationKey(r.options)} {...props} row={r} label={r.options.slice(1).filter(Boolean).join(" / ")} nested open={openRow === combinationKey(r.options)} setOpen={(o) => setOpenRow(o ? combinationKey(r.options) : null)} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          : rows.map((r) => (
              <div key={combinationKey(r.options)} className="border-b border-[#eceef1] last:border-b-0">
                <VariantLine {...props} row={r} label={variantName(r.options)} open={openRow === combinationKey(r.options)} setOpen={(o) => setOpenRow(o ? combinationKey(r.options) : null)} />
              </div>
            ))}
      </div>
      <BulkEdit {...props} open={bulk} onClose={() => setBulk(false)} />
    </div>
  )
}

function Thumb({ url, label, onClick, small }: { url: string | null; label: string; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={url ? `Change the photo for ${label}` : `Add a photo for ${label}`}
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-lg border bg-[#fafafa] text-[#9ca3af] transition-colors hover:border-[#9ca3af] hover:text-[#4b5563]",
        url ? "border-[#e5e7eb]" : "border-dashed border-[#d1d5db]",
        small ? "h-9 w-9" : "h-11 w-11",
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImagePlus className="h-4 w-4" />
      )}
    </button>
  )
}

function GroupLine({ value, rows, folded, toggle, basePrice, trackInventory, stockAt, patchRows, pickImage }: VariantTableProps & { value: string; rows: VariantRow[]; folded: boolean; toggle: () => void }) {
  const currency = useStoreCurrency()
  const keys = rows.map((r) => combinationKey(r.options))
  const prices = new Set(rows.map((r) => r.price))
  const shared = prices.size === 1 ? rows[0].price : ""
  const images = new Set(rows.map((r) => r.imageUrl))
  const image = images.size === 1 ? rows[0].imageUrl : rows.find((r) => r.imageUrl)?.imageUrl ?? null
  const qty = rows.reduce((n, r) => n + (Number.parseInt(r.stock[stockAt] ?? "", 10) || 0), 0)
  const range = priceRange(rows, basePrice, (c) => formatStoreMoney(c, currency))
  return (
    <div className={cn("grid grid-cols-[44px_minmax(0,1fr)_36px] items-center gap-x-3 gap-y-2 px-3 py-3", GRID)}>
      <Thumb url={image} label={`every ${value}`} onClick={() => pickImage(keys, value)} />
      <button type="button" onClick={toggle} aria-expanded={!folded} className="flex min-w-0 flex-col items-start text-left">
        <span className="truncate text-[14px] font-medium text-[#1a1a2e]">{value}</span>
        <span className="text-[12.5px] text-[#6b7280]">
          {rows.length} {rows.length === 1 ? "variant" : "variants"}
          {prices.size > 1 && range ? `, ${range}` : ""}
        </span>
      </button>
      <div className="col-span-3 col-start-1 row-start-2 grid grid-cols-2 gap-2 md:col-span-1 md:col-start-auto md:row-start-auto md:contents">
        <label className="md:contents">
          <span className="mb-1 block text-[12px] text-[#6b7280] md:hidden">Price for all {value}</span>
          <MoneyInput aria-label={`Price for every ${value}`} value={shared} placeholder={prices.size > 1 ? "Mixed" : basePrice || undefined} onChange={(v) => patchRows(keys, () => ({ price: v }))} />
        </label>
        <div>
          <span className="mb-1 block text-[12px] text-[#6b7280] md:hidden">Quantity</span>
          <span className="flex h-10 items-center text-[13.5px] tabular-nums text-[#4b5563]">{trackInventory && stockAt ? `${qty} in all` : "Not tracked"}</span>
        </div>
      </div>
      <button type="button" onClick={toggle} aria-label={folded ? `Show ${value}` : `Hide ${value}`} className={cn(BTN_GHOST, "col-start-3 row-start-1 h-9 w-9 px-0 md:col-start-auto md:row-start-auto")}>
        <ChevronDown className={cn("h-4 w-4 transition-transform", !folded && "rotate-180")} />
      </button>
    </div>
  )
}

function VariantLine({ row, label, nested, open, setOpen, basePrice, trackInventory, stockAt, weightUnit, setRow, pickImage }: VariantTableProps & { row: VariantRow; label: string; nested?: boolean; open: boolean; setOpen: (o: boolean) => void }) {
  const key = combinationKey(row.options)
  const name = variantName(row.options)
  const committed = stockAt ? row.committed[stockAt] ?? 0 : 0
  const margin = marginPercent(centsOf(row.price) ?? centsOf(basePrice) ?? 0, centsOf(row.cost))
  const extra = [row.sku && `SKU ${row.sku}`, row.compareAt && "On sale"].filter(Boolean).join(" · ")
  return (
    <div data-variant-row={name} className={cn(!row.active && "bg-[#fafafa]")}>
      <div className={cn("grid grid-cols-[44px_minmax(0,1fr)_36px] items-center gap-x-3 gap-y-2 py-2.5 pr-3", nested ? "pl-6 md:pl-3" : "pl-3", GRID)}>
        <div className={cn(nested && "md:pl-1")}>
          <Thumb url={row.imageUrl} label={name} onClick={() => pickImage([key], name)} small={nested} />
        </div>
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-col items-start text-left">
          <span className={cn("max-w-full truncate text-[14px]", row.active ? "font-medium text-[#1a1a2e]" : "text-[#9ca3af] line-through")}>{label || name}</span>
          {!row.active ? <span className="text-[12px] text-[#6b7280]">Not sold</span> : extra ? <span className="max-w-full truncate text-[12px] text-[#6b7280]">{extra}</span> : null}
        </button>
        <div className="col-span-3 col-start-1 row-start-2 grid grid-cols-2 gap-2 md:col-span-1 md:col-start-auto md:row-start-auto md:contents">
          <label className="md:contents">
            <span className="mb-1 block text-[12px] text-[#6b7280] md:hidden">Price</span>
            <MoneyInput aria-label={`Price for ${name}`} value={row.price} placeholder={basePrice || undefined} onChange={(v) => setRow(key, { price: v })} />
          </label>
          <label className="md:contents">
            <span className="mb-1 block text-[12px] text-[#6b7280] md:hidden">Quantity</span>
            {trackInventory && stockAt ? (
              <div>
                <NumberInput allowNegative aria-label={`Quantity for ${name}`} value={row.stock[stockAt] ?? ""} placeholder="0" onChange={(v) => setRow(key, { stock: { ...row.stock, [stockAt]: v } })} />
                {committed > 0 ? <span className="mt-0.5 block text-[11.5px] text-[#6b7280]">{committed} held for orders</span> : null}
              </div>
            ) : (
              <span className="flex h-10 items-center text-[13px] text-[#6b7280]">Not tracked</span>
            )}
          </label>
        </div>
        <button type="button" aria-expanded={open} aria-label={`More for ${name}`} onClick={() => setOpen(!open)} className={cn(BTN_GHOST, "col-start-3 row-start-1 h-9 w-9 px-0 md:col-start-auto md:row-start-auto")}>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open ? (
        <div className="grid gap-3 border-t border-dashed border-[#eceef1] bg-white px-3 py-3 sm:grid-cols-2 lg:grid-cols-3" data-variant-details="">
          <Field label="Compare-at price" hint="Shown crossed out, when higher">
            <MoneyInput value={row.compareAt} onChange={(v) => setRow(key, { compareAt: v })} />
          </Field>
          <Field label="SKU" hint="Your code, on orders and packing slips">
            <TextInput value={row.sku} maxLength={64} placeholder="Optional" onChange={(e) => setRow(key, { sku: e.target.value })} />
          </Field>
          <Field label="Barcode" hint="ISBN, UPC, EAN or GTIN">
            <TextInput value={row.barcode} maxLength={64} inputMode="numeric" placeholder="Optional" onChange={(e) => setRow(key, { barcode: e.target.value })} />
          </Field>
          <Field label="Weight" hint="Empty uses the product's">
            <DecimalInput value={row.weight} onChange={(v) => setRow(key, { weight: v })} suffix={weightUnit} />
          </Field>
          <Field label="Cost per item" hint={margin !== null ? `${margin}% margin. Buyers never see this.` : "Buyers never see this."}>
            <MoneyInput value={row.cost} onChange={(v) => setRow(key, { cost: v })} />
          </Field>
          <div className="flex flex-col justify-end pb-1">
            <Toggle label="Sell this variant" description={row.active ? "Buyers can choose it." : "Hidden from buyers. Its stock and orders stay."} checked={row.active} onChange={(v) => setRow(key, { active: v })} />
          </div>
        </div>
      ) : null}
    </div>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Price">
            <MoneyInput value={price} onChange={setPrice} placeholder="Unchanged" />
          </Field>
          <Field label="Compare-at price">
            <MoneyInput value={compareAt} onChange={setCompareAt} placeholder="Unchanged" />
          </Field>
          {trackInventory && stockAt ? (
            <Field label="Quantity" hint={locations.length > 1 && where ? `At ${where.name}` : undefined}>
              <NumberInput allowNegative value={qty} onChange={setQty} placeholder="Unchanged" />
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
