"use client"

/**
 * ===========================================================================
 *  THE PRODUCT A PRODUCT BLOCK SHOWS, AND CHOOSING ANOTHER
 * ===========================================================================
 * Round 40, the owner: "The Select product UI in the product block: I don't
 * like it." It was a 40px box reading "Select a product..." with a 24px
 * picture, and a dropdown under it 240px tall that scrolled inside the
 * panel, whose rows were the browser's own grey.
 *
 * Now the block says what it shows as a card: the product's picture at a
 * size that can be seen, its name, its price, Draft or Unavailable when it
 * is, and Change. Change (or the empty card's Choose a product) opens the
 * products in the shared sheet on a phone and a dialog on a computer
 * (components/ui/sheet-dialog), with a search once there are enough of
 * them, every row a picture, a name and a price, the chosen one checked.
 *
 * On a phone a row closes the sheet first (data-sheet-close) and the choice
 * lands once it has gone, so the block's settings do not render under a
 * sheet that is still sliding.
 */
import * as React from "react"
import { Check, ChevronRight, Package, Plus, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { SheetDialog, SheetDialogTitle, SHEET_DIALOG_MAX_HEIGHT } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { ProductStateBadge } from "@/components/onepage/tabs/product-block-editor"
import type { EditorProductState } from "@/lib/onepage/product-block"

export interface PickerProduct {
  id: string
  title: string
  price_cents: number
  thumbnail_url?: string | null
  type?: string | null
}

const focusRing = "outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
/** More than this many and the sheet has a search. */
const SEARCH_FROM = 6

function Thumb({ src, size, dim }: { src?: string | null; size: "md" | "lg"; dim?: boolean }) {
  const box = size === "lg" ? "h-12 w-12 rounded-xl" : "h-11 w-11 rounded-[11px]"
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-[#f4f4f6] shadow-[inset_0_0_0_1px_rgba(16,24,40,0.05)]", box)}>
      {src ? <img src={src} alt="" className={cn("h-full w-full object-cover", dim && "opacity-50 grayscale")} /> : <Package aria-hidden className="h-5 w-5 text-[#9ca3af]" strokeWidth={1.7} />}
    </span>
  )
}

export function ProductPicker({
  products,
  stateOf,
  selectedId,
  fallback,
  state,
  money,
  onPick,
}: {
  /** The products a block may show (archived ones left out: lib/onepage/product-block pickableProducts). */
  products: readonly PickerProduct[]
  /** Draft, Unavailable or neither, for a product's badge. */
  stateOf: (id: string) => EditorProductState
  selectedId: string | null | undefined
  /** What the block saved about its product, for one that is no longer in the list. */
  fallback?: { title?: string | null; thumbnail?: string | null } | null
  state: EditorProductState
  money: (cents: number, product: PickerProduct) => string
  onPick: (product: PickerProduct) => void
}) {
  const phone = usePhoneWidth()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const pendingRef = React.useRef<PickerProduct | null>(null)
  const selected = selectedId ? products.find((p) => p.id === selectedId) ?? null : null
  const gone = state === "unavailable"
  const title = selected?.title ?? (selectedId ? fallback?.title : null) ?? null
  const thumb = selected?.thumbnail_url ?? (selectedId ? fallback?.thumbnail : null) ?? null

  const q = query.trim().toLowerCase()
  const shown = q ? products.filter((p) => p.title.toLowerCase().includes(q)) : products

  const close = React.useCallback(() => setOpen(false), [])
  /* A computer's dialog has no onClosed: what was typed goes once its close has played. */
  React.useEffect(() => {
    if (open || phone) return
    const t = window.setTimeout(() => setQuery(""), 200)
    return () => window.clearTimeout(t)
  }, [open, phone])
  const choose = (p: PickerProduct) => {
    if (phone) {
      pendingRef.current = p
      return
    }
    onPick(p)
    setOpen(false)
  }

  return (
    <div data-product-picker="">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-product-picked={selectedId ? "" : undefined}
        className={cn(
          "flex w-full min-w-0 items-center gap-3 rounded-2xl border bg-white p-2.5 pr-3 text-left transition-[border-color,background-color] duration-150 [-webkit-tap-highlight-color:transparent]",
          selectedId ? "border-[#e3e4e8] hover:border-[#c9cbd1]" : "border-[#e3e4e8] hover:border-[#c9cbd1] hover:bg-[#fafafb]",
          focusRing,
        )}
      >
        {selectedId ? (
          <Thumb src={thumb} size="lg" dim={gone} />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#e8f6ee] text-[#16794a] shadow-[inset_0_0_0_1px_rgba(22,121,74,0.12)]">
            <Package aria-hidden className="h-5 w-5" strokeWidth={1.75} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate text-[14.5px] font-medium", gone ? "text-[#6b7280]" : "text-[#1a1a2e]")}>{title ?? tt("Choose a product")}</span>
            {selectedId ? <ProductStateBadge state={state} /> : null}
          </span>
          <span className="block truncate text-[12.5px] text-[#6b7280] tabular-nums">
            {selected ? (selected.price_cents > 0 ? money(selected.price_cents, selected) : tt("Free")) : selectedId ? tt("Not in your products") : tt("The one this block sells")}
          </span>
        </span>
        {selectedId ? (
          <span className="inline-flex h-8 shrink-0 items-center rounded-lg bg-[#f4f4f6] px-2.5 text-[12.5px] font-medium text-[#1a1a2e]">{tt("Change")}</span>
        ) : (
          <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-[#1a1a2e]" strokeWidth={1.75} />
        )}
      </button>

      <SheetDialog
        open={open}
        onClose={close}
        phone={phone}
        label={tt("Choose a product")}
        onOpenAutoFocus={(e) => e.preventDefault()}
        sheet={{
          height: products.length > SEARCH_FROM ? SHEET_DIALOG_MAX_HEIGHT : undefined,
          onClosed: () => {
            const p = pendingRef.current
            pendingRef.current = null
            setQuery("")
            if (p) onPick(p)
          },
        }}
        className="mx-auto flex max-h-[min(600px,85vh)] w-[calc(100%-32px)] max-w-[440px] flex-col gap-0 overflow-hidden rounded-2xl border-[#ececf1] p-0 shadow-[0_24px_64px_-12px_rgba(17,17,19,0.25),0_2px_6px_rgba(17,17,19,0.06)]"
      >
        <div className="shrink-0 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <SheetDialogTitle className="text-[17px] font-semibold tracking-[-0.01em] text-[#111113]">{tt("Choose a product")}</SheetDialogTitle>
          {products.length > SEARCH_FROM ? (
            <label className="relative mt-3 block">
              <span className="sr-only">{tt("Search products")}</span>
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#9ca3af]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tt("Search products")}
                enterKeyHint="search"
                autoComplete="off"
                data-product-picker-search=""
                className="h-11 w-full rounded-xl border border-[#e8e8ec] bg-[#f6f6f7] pl-10 pr-10 text-[16px] text-[#111113] outline-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14.5px] [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button type="button" aria-label={tt("Clear search")} onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#9ca3af] hover:text-[#1a1a2e]">
                  <X aria-hidden className="h-4 w-4" />
                </button>
              ) : null}
            </label>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[#f0f0f2] px-2 pb-4 pt-2 sm:px-3" data-product-picker-list="">
          {products.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[14px] font-medium text-[#111113]">{tt("No products yet")}</p>
              <p className="mx-auto mt-1 max-w-[260px] text-[13px] text-[#6b7280]">{tt("Make one, then come back and pick it here.")}</p>
              <a href="/app/products/new" className={cn("mt-4 inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white", focusRing)}>
                <Plus aria-hidden className="h-4 w-4" />
                {tt("Create product")}
              </a>
            </div>
          ) : shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13.5px] text-[#6b7280]">{tt("No products match your search.")}</p>
          ) : (
            <ul role="listbox" aria-label={tt("Your products")} className="space-y-0.5">
              {shown.map((p) => {
                const on = p.id === selectedId
                return (
                  <li key={p.id} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      data-sheet-close={phone ? "" : undefined}
                      data-product-option={p.id}
                      onClick={() => choose(p)}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left transition-[background-color] duration-150 [-webkit-tap-highlight-color:transparent]",
                        on ? "bg-[#f6f6f7]" : "hover:bg-[#f6f6f7] active:bg-[#f0f0f2]",
                        focusRing,
                      )}
                    >
                      <Thumb src={p.thumbnail_url} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[14px] font-medium leading-5 text-[#111113]">{p.title}</span>
                          <ProductStateBadge state={stateOf(p.id)} />
                        </span>
                        <span className="block text-[12.5px] leading-[18px] text-[#6b7280] tabular-nums">{p.price_cents > 0 ? money(p.price_cents, p) : tt("Free")}</span>
                      </span>
                      <span aria-hidden className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full transition-[background-color,opacity] duration-150", on ? "bg-[#1a1a2e] text-white opacity-100" : "opacity-0")}>
                        <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetDialog>
    </div>
  )
}
