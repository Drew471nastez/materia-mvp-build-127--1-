"use client"

/**
 * Choose one of your published products for a product block: a searchable
 * list with each product's picture, name and price. A popover on a
 * computer, the shared sheet on a phone, like the product picker in
 * Analytics (components/app/product-picker.tsx).
 */
import * as React from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { pickerSurface, usePhone } from "@/components/app/date-range-picker"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { inputClass } from "./ui"
import { tt } from "@/lib/i18n/text"

export interface PickedProduct {
  id: string
  title: string
  slug: string
  price_cents: number | null
  thumbnail_url: string | null
}

export function priceLabel(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) return "Free"
  return `$${(cents / 100).toFixed(2)}`
}

let cache: { creatorId: string; products: PickedProduct[] } | null = null

function useProducts(creatorId: string | null, open: boolean) {
  const [products, setProducts] = React.useState<PickedProduct[] | null>(cache && cache.creatorId === creatorId ? cache.products : null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!open || !creatorId || products) return
    let live = true
    createClient()
      .from("products")
      .select("id, title, slug, price_cents, thumbnail_url")
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .order("title")
      .then(({ data, error: e }: { data: unknown; error: unknown }) => {
        if (!live) return
        if (e) {
          setError(tt("Could not load your products. Try again."))
          return
        }
        const list = (data ?? []) as PickedProduct[]
        cache = { creatorId, products: list }
        setProducts(list)
      })
    return () => {
      live = false
    }
  }, [open, creatorId, products])
  return { products, error }
}

function List({ creatorId, open, onPick, compact }: { creatorId: string | null; open: boolean; onPick: (p: PickedProduct) => void; compact: boolean }) {
  const { products, error } = useProducts(creatorId, open)
  const [q, setQ] = React.useState("")
  const shown = (products ?? []).filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className={compact ? "px-2 pb-3" : "p-1.5"}>
      {(products?.length ?? 0) > 8 ? (
        <div className="px-1 pb-2 pt-0.5">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Search products")} aria-label={tt("Search products")} className={inputClass} autoComplete="off" />
        </div>
      ) : null}
      {error ? <p className="px-3 py-6 text-center text-[13px] text-[#b42318]">{error}</p> : null}
      {!error && products === null ? <p className="px-3 py-6 text-center text-[13px] text-[#6b7280]">{tt("Loading your products")}</p> : null}
      {products && products.length === 0 ? (
        <p className="px-3 py-6 text-center text-[13px] text-[#6b7280]">{tt("Publish a product first, then it can go in an email.")}</p>
      ) : null}
      <div role="listbox" aria-label={tt("Products")} className={cn(!compact && "max-h-[320px] overflow-y-auto overscroll-contain")}>
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => onPick(p)}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 text-left outline-none transition-colors duration-100 hover:bg-[#f4f4f6] focus-visible:bg-[#f1f1f4]",
              compact ? "min-h-[56px]" : "min-h-[48px]",
            )}
          >
            <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[#f1f2f4]">
              {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e] sm:text-[13px]">{p.title}</span>
            <span className="shrink-0 text-[13px] tabular-nums text-[#6b7280]">{priceLabel(p.price_cents)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ProductPicker({
  creatorId,
  open,
  onOpenChange,
  onPick,
  trigger,
}: {
  creatorId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onPick: (p: PickedProduct) => void
  trigger: React.ReactElement
}) {
  const phone = usePhone()
  const pick = (p: PickedProduct) => {
    onPick(p)
    onOpenChange(false)
  }
  if (phone) {
    return (
      <>
        {React.cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, { onClick: () => onOpenChange(true) })}
        <BottomSheet isOpen={open} onClose={() => onOpenChange(false)} title={tt("Choose a product")} hideFrom="sm">
          <List creatorId={creatorId} open={open} onPick={pick} compact />
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className={cn(pickerSurface, "w-[320px]")}>
        <List creatorId={creatorId} open={open} onPick={pick} compact={false} />
      </PopoverContent>
    </Popover>
  )
}
