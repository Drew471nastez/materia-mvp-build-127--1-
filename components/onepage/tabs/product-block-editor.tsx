"use client"

/**
 * ===========================================================================
 *  THE PRODUCT BLOCK'S EDITOR PIECES (round 10)
 * ===========================================================================
 * Kept apart from links-tab.tsx so the product block's settings live in one
 * place: the creator's products with their status, the two edit buttons, the
 * note under a draft or a product that is gone, "When someone taps it",
 * instant checkout, and the layout picker. The rules are
 * lib/onepage/product-block's, the same ones the live page draws by.
 */
import * as React from "react"
import { ArrowUpRight, CreditCard, ExternalLink, LayoutTemplate, PanelBottom, Package, Trash2, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { teamStoreForProducts } from "@/lib/onepage/team-context"
import { Switch } from "@/components/onepage/editor-kit"
import { ChoiceMark } from "@/components/onepage/choice-marks"
import { tt } from "@/lib/i18n/text"
import type { ProductBlockData, ProductBlockStyle, ProductTapAction } from "@/lib/onepage/types"
import { PRODUCT_LAYOUTS, editorProductState, productLayoutOf, productTapAction, sellsInstantly, type EditorProductState } from "@/lib/onepage/product-block"

/* ── The creator's products, read once for the whole editor ─────────────── */

export interface CreatorProduct {
  id: string
  title: string
  price_cents: number
  thumbnail_url?: string | null
  description?: string | null
  slug?: string | null
  type?: string | null
  status?: string | null
  archived?: boolean | null
}

let shared: Promise<CreatorProduct[] | null> | null = null
const listeners = new Set<(rows: CreatorProduct[] | null) => void>()

async function readCreatorProducts(): Promise<CreatorProduct[] | null> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  /* A team member editing a store's OnePage lists that store's products (lib/onepage/team-context); the owner, their own, as before. */
  const teamStore = teamStoreForProducts()
  const { data: creator } = teamStore ? { data: { id: teamStore } } : await supabase.from("creators").select("id").eq("user_id", user.id).single()
  if (!creator) return []
  /* With the older archive flag where the database has it; the status alone says the same elsewhere (lib/products/visibility). */
  for (const cols of ["id, title, price_cents, thumbnail_url, description, slug, type, status, archived", "id, title, price_cents, thumbnail_url, description, slug, type, status"]) {
    const { data, error } = await supabase.from("products").select(cols).eq("creator_id", creator.id).order("created_at", { ascending: false })
    if (!error) return (data ?? []) as unknown as CreatorProduct[]
  }
  return null
}

/** Asked again (a product published in another tab) when the editor's window comes back into view. */
function refresh() {
  shared = readCreatorProducts().catch(() => null)
  shared.then((rows) => listeners.forEach((l) => l(rows)))
}

/** Every product of the signed in creator, with its status. Null until they arrive (or when they cannot be read). */
export function useCreatorProducts(enabled = true): CreatorProduct[] | null {
  const [rows, setRows] = React.useState<CreatorProduct[] | null>(null)
  React.useEffect(() => {
    if (!enabled) return
    if (!shared) refresh()
    let live = true
    shared!.then((r) => live && setRows(r))
    const l = (r: CreatorProduct[] | null) => live && setRows(r)
    listeners.add(l)
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      live = false
      listeners.delete(l)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [enabled])
  return rows
}

/* ── The status, said small ─────────────────────────────────────────────── */

export function ProductStateBadge({ state, className }: { state: EditorProductState; className?: string }) {
  if (state !== "draft" && state !== "unavailable") return null
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-[10.5px] font-semibold leading-none",
        state === "draft" ? "bg-[#f4f4f6] text-[#4b5563] shadow-[inset_0_0_0_1px_rgba(16,24,40,0.08)]" : "bg-[#fef3f2] text-[#b42318] shadow-[inset_0_0_0_1px_rgba(180,35,24,0.15)]",
        className,
      )}
      data-product-state={state}
    >
      {state === "draft" ? tt("Draft") : tt("Unavailable")}
    </span>
  )
}

/** The block row's badge in the blocks list. */
export function ProductRowBadge({ productId }: { productId: string | null | undefined }) {
  const products = useCreatorProducts(!!productId)
  return <ProductStateBadge state={editorProductState(productId, products)} />
}

/** Under the picker: what a draft or a product that is gone means for the page. */
export function ProductStateNote({ state, productId, onRemove }: { state: EditorProductState; productId: string; onRemove: () => void }) {
  if (state === "draft") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl bg-[#f7f7f8] px-3 py-2.5 text-[12.5px] leading-snug text-[#4b5563] shadow-[inset_0_0_0_1px_rgba(16,24,40,0.06)]" data-product-note="draft">
        <ProductStateBadge state="draft" className="mt-px" />
        <p className="min-w-0 flex-1">
          {tt("Publish it to show it on your page. Until then, visitors do not see it.")}{" "}
          <a href={`/app/products/${encodeURIComponent(productId)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[#1a1a2e] underline decoration-[#c9cbd1] underline-offset-2 hover:decoration-[#1a1a2e]">
            {tt("Publish")}
          </a>
        </p>
      </div>
    )
  }
  if (state === "unavailable") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-[#fef3f2] px-3 py-2.5 text-[12.5px] leading-snug text-[#7a271a] shadow-[inset_0_0_0_1px_rgba(180,35,24,0.12)]" data-product-note="unavailable">
        <p className="min-w-0 flex-1">{tt("This product was archived or deleted, so it is not on your page.")}</p>
        <button type="button" onClick={onRemove} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[12.5px] font-medium text-[#b42318] shadow-[0_0_0_1px_rgba(180,35,24,0.18)] transition-colors hover:bg-[#fff5f4]" data-product-remove="">
          <Trash2 className="h-3.5 w-3.5" />
          {tt("Remove")}
        </button>
      </div>
    )
  }
  return null
}

/* ── Edit the product, edit its page ────────────────────────────────────── */

/**
 * "I don't like the way those 2 text buttons are." Two plain links stacked under the picker read as one thing. Now a
 * pair of quiet buttons side by side, each with its own picture and a small arrow saying it opens in a new tab: the
 * product (its name, price and files) and the product page (how its page looks). Same places as before.
 */
export function ProductEditLinks({ productId }: { productId: string }) {
  /*
    ROUND 40: "Editing a product external link / product page link: smoother." The pair sat in a grey tray behind a
    small "Edit", and each lit up with a shadow that arrived in one step. Now they are two equal keys of the editor's
    own kind, each saying in full what it opens, with the arrow easing up and right a little under a mouse (translate,
    on the compositor) to say it leaves for a new tab. Same places as before.
  */
  const btn = cn(
    "group flex h-11 min-w-0 items-center gap-2 rounded-xl border border-[#e3e4e8] bg-white px-3 text-[13.5px] font-medium text-[#1a1a2e] outline-none [-webkit-tap-highlight-color:transparent]",
    "transition-[border-color,background-color] duration-150 hover:border-[#c9cbd1] active:bg-[#f6f6f7] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]",
  )
  const arrow = "ml-auto h-3.5 w-3.5 shrink-0 text-[#9ca3af] transition-[translate,color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-[1.5px] group-hover:-translate-y-[1.5px] group-hover:text-[#1a1a2e] motion-reduce:transition-none"
  return (
    <div className="grid grid-cols-2 gap-2" data-product-edit-links="">
      <a href={`/app/products/${encodeURIComponent(productId)}`} target="_blank" rel="noopener noreferrer" className={btn} data-edit-product="" title={tt("Edit the product: name, price and files")} aria-label={tt("Edit product")}>
        <Package className="h-4 w-4 shrink-0 text-[#6b7280]" strokeWidth={1.8} />
        <span className="truncate">{tt("Edit product")}</span>
        <ArrowUpRight aria-hidden className={arrow} strokeWidth={2} />
      </a>
      <a href="/creator-page?pageType=product" target="_blank" rel="noopener noreferrer" className={btn} data-edit-product-page="" title={tt("Edit how product pages look")} aria-label={tt("Edit product page")}>
        <LayoutTemplate className="h-4 w-4 shrink-0 text-[#6b7280]" strokeWidth={1.8} />
        <span className="truncate">{tt("Product page")}</span>
        <ArrowUpRight aria-hidden className={arrow} strokeWidth={2} />
      </a>
    </div>
  )
}

/* ── When someone taps it ───────────────────────────────────────────────── */

export function ProductTapSetting({ data, onChange }: { data: ProductBlockData; onChange: (patch: Partial<ProductBlockData>) => void }) {
  const action = productTapAction(data)
  const instantKind = sellsInstantly(data.product_type ?? null)
  const instantOn = (data.instant_checkout === true || (data.quick_checkout === true && !(data.product_price_cents ?? 0))) && instantKind
  const options: { id: ProductTapAction; icon: typeof CreditCard; label: string; hint: string }[] = [
    { id: "checkout", icon: CreditCard, label: tt("Go to checkout"), hint: tt("Straight to paying") },
    { id: "sheet", icon: PanelBottom, label: tt("Open in a sheet"), hint: tt("It slides up over your page") },
    { id: "page", icon: ExternalLink, label: tt("Open product page"), hint: tt("Its full page") },
  ]
  return (
    <div className="space-y-2.5 border-t pt-3" data-product-tap-setting="">
      <p className="text-[13px] font-semibold text-[#1a1a2e]">{tt("When someone taps it")}</p>
      {/* One column that is the panel's width: a long hint is cut with an ellipsis, it never widens the column (min-w-0). */}
      <div role="radiogroup" aria-label={tt("When someone taps it")} className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {options.map((o) => {
          const on = action === o.id
          const Icon = o.icon
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange({ tap_action: o.id })}
              className="relative flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl border border-[#e3e4e8] bg-white px-3 py-2 text-left outline-none transition-colors hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
              data-tap-choice={o.id}
            >
              <ChoiceMark on={on} />
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors", on ? "bg-[#1a1a2e] text-white" : "bg-[#f4f4f6] text-[#4b5563]")}>
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-[#1a1a2e]">{o.label}</span>
                <span className="block truncate text-[12px] text-[#6b7280]">{o.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
      {instantKind && action !== "page" ? (
        <div className="flex items-start gap-3 rounded-xl bg-[#f7f7f8] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(16,24,40,0.06)]" data-instant-setting="">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-[#1a1a2e]" strokeWidth={1.8} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("Instant checkout")}</p>
            <p className="text-[12px] leading-snug text-[#6b7280]">{tt("They pay in a window on your page, like joining a community. For downloads and courses.")}</p>
          </div>
          <Switch checked={instantOn} onChange={(on) => onChange({ instant_checkout: on, quick_checkout: false })} label={tt("Instant checkout")} />
        </div>
      ) : null}
    </div>
  )
}

/* ── The layout picker ──────────────────────────────────────────────────── */

function layoutLabel(id: ProductBlockStyle): string {
  switch (id) {
    case "button": return tt("Button")
    case "callout": return tt("Callout")
    case "preview": return tt("Card")
    case "row": return tt("Compact")
    case "side": return tt("Side by side")
    case "tile": return tt("Tile")
    case "overlay": return tt("Photo")
    case "minimal": return tt("Minimal")
  }
}

/** A small drawing of each layout, in the editor's greys. */
function LayoutSketch({ id }: { id: ProductBlockStyle }) {
  const bar = "block rounded-full bg-[#d9dbe0]"
  const pic = "block rounded-[5px] bg-[#c9ccd2]"
  const btn = "block rounded-[5px] bg-[#1a1a2e]"
  const card = "block w-full rounded-lg border border-[#e3e4e8] bg-white"
  switch (id) {
    case "button":
      return <span className={cn(card, "flex h-8 items-center gap-1.5 px-2")}><span className={cn(pic, "h-4 w-4")} /><span className={cn(bar, "h-1.5 flex-1")} /><span className={cn(bar, "h-1.5 w-4")} /></span>
    case "callout":
      return <span className={cn(card, "p-1.5")}><span className="flex gap-1.5"><span className={cn(pic, "h-6 w-6")} /><span className="flex flex-1 flex-col gap-1 pt-0.5"><span className={cn(bar, "h-1.5 w-4/5")} /><span className={cn(bar, "h-1.5 w-1/2")} /></span></span><span className={cn(btn, "mt-1.5 h-2.5 w-full")} /></span>
    case "row":
      return <span className={cn(card, "flex items-center gap-1.5 p-1.5")}><span className={cn(pic, "h-5 w-5")} /><span className="flex flex-1 flex-col gap-1"><span className={cn(bar, "h-1.5 w-4/5")} /><span className={cn(bar, "h-1.5 w-1/3")} /></span><span className={cn(btn, "h-3.5 w-6 rounded-full")} /></span>
    case "preview":
      return <span className={cn(card, "overflow-hidden")}><span className={cn(pic, "h-6 w-full rounded-none")} /><span className="block space-y-1 p-1.5"><span className={cn(bar, "h-1.5 w-2/3")} /><span className={cn(btn, "h-2.5 w-full")} /></span></span>
    case "side":
      return <span className={cn(card, "flex overflow-hidden")}><span className={cn(pic, "h-[44px] w-[38%] rounded-none")} /><span className="flex flex-1 flex-col gap-1 p-1.5"><span className={cn(bar, "h-1.5 w-4/5")} /><span className={cn(bar, "h-1.5 w-1/2")} /><span className={cn(btn, "mt-auto h-2.5 w-full")} /></span></span>
    case "tile":
      return <span className="grid w-full grid-cols-2 gap-1">{[0, 1].map((i) => <span key={i} className={cn(card, "overflow-hidden")}><span className={cn(pic, "aspect-square w-full rounded-none")} /><span className="block space-y-1 p-1"><span className={cn(bar, "h-1 w-3/4")} /><span className={cn(btn, "h-2 w-full")} /></span></span>)}</span>
    case "overlay":
      return <span className="relative block h-[52px] w-full overflow-hidden rounded-lg bg-[#b9bcc4]"><span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent" /><span className="absolute bottom-1.5 left-1.5 flex flex-col gap-1"><span className="block h-1.5 w-10 rounded-full bg-white/90" /><span className="block h-1.5 w-6 rounded-full bg-white/70" /></span><span className="absolute bottom-1.5 right-1.5 block h-3 w-6 rounded-[4px] bg-white" /></span>
    case "minimal":
      return <span className="flex w-full items-center gap-1.5 border-b border-[#d9dbe0] px-0.5 py-2"><span className="flex flex-1 flex-col gap-1"><span className={cn(bar, "h-1.5 w-3/4")} /><span className={cn(bar, "h-1.5 w-1/2")} /></span><span className={cn(btn, "h-3.5 w-7 rounded-full")} /></span>
  }
}

export function ProductLayoutPicker({ data, onPick }: { data: ProductBlockData; onPick: (id: ProductBlockStyle) => void }) {
  const current = productLayoutOf(data)
  return (
    <div className="space-y-2.5" data-product-layouts="">
      <div>
        <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Layout")}</p>
        <p className="mt-0.5 text-[12.5px] text-[#6b7280]">{tt("Tiles next to each other sit two in a row.")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {PRODUCT_LAYOUTS.map((id) => {
          const on = current === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(id)}
              data-product-layout-choice={id}
              className="relative flex cursor-pointer flex-col items-stretch rounded-2xl border border-[#e3e4e8] bg-white p-1.5 outline-none hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <ChoiceMark on={on} />
              <span className="grid aspect-[4/3] place-items-center rounded-xl bg-[#f7f7f8] px-2">
                <LayoutSketch id={id} />
              </span>
              <span className={cn("block py-1.5 text-center text-[12.5px] font-medium", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{layoutLabel(id)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Layouts drawn on a card of their own colours; the button layout and the minimal line wear the theme alone. */
export function layoutHasCard(style: ProductBlockStyle): boolean {
  return style !== "button" && style !== "minimal"
}
