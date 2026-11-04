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
import type { ProductBlockData, ProductBlockStyle } from "@/lib/onepage/types"
import { PRODUCT_LAYOUTS, editorProductState, productLayoutOf, productSheetAction, productTapChoice, sellsInstantly, tapChoicePatch, type EditorProductState, type ProductTapChoice } from "@/lib/onepage/product-block"

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

/*
  ROUND 41, the owner: "Give the option so a product button can: open the sheet (see the product, choose options) then
  check out, or check out instantly, or go to the product page." Three choices, said as what the visitor gets
  (lib/onepage/product-block PRODUCT_TAP_CHOICES), each with what follows from it under it: the sheet's own button,
  and whether instant checkout pays on the page.
*/
export function ProductTapSetting({ data, onChange }: { data: ProductBlockData; onChange: (patch: Partial<ProductBlockData>) => void }) {
  const choice = productTapChoice(data)
  const instantKind = sellsInstantly(data.product_type ?? null)
  const instantOn = (data.instant_checkout === true || (data.quick_checkout === true && !(data.product_price_cents ?? 0))) && instantKind
  const sheetAction = productSheetAction(data)
  const options: { id: ProductTapChoice; icon: typeof CreditCard; label: string; hint: string }[] = [
    { id: "sheet", icon: PanelBottom, label: tt("Open product sheet"), hint: tt("They see it, choose options, then check out") },
    { id: "instant", icon: Zap, label: tt("Instant checkout"), hint: tt("Straight to paying") },
    { id: "page", icon: ExternalLink, label: tt("Product page"), hint: tt("Its full page") },
  ]
  return (
    <div className="space-y-2.5 border-t pt-3" data-product-tap-setting="">
      <p className="text-[13px] font-semibold text-[#1a1a2e]">{tt("When someone taps it")}</p>
      {/* One column that is the panel's width: a long hint is cut with an ellipsis, it never widens the column (min-w-0). */}
      <div role="radiogroup" aria-label={tt("When someone taps it")} className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {options.map((o) => {
          const on = choice === o.id
          const Icon = o.icon
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(tapChoicePatch(o.id))}
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

      {choice === "sheet" ? (
        <div className="space-y-2 rounded-xl bg-[#f7f7f8] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(16,24,40,0.06)]" data-sheet-action-setting="">
          <p className="text-[12.5px] font-medium text-[#1a1a2e]">{tt("Button in the sheet")}</p>
          <div role="radiogroup" aria-label={tt("Button in the sheet")} className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1 shadow-[inset_0_0_0_1px_rgba(16,24,40,0.08)]">
            {(["checkout", "page"] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={sheetAction === a}
                onClick={() => onChange({ sheet_action: a })}
                className={cn("h-8 min-w-0 truncate rounded-md px-2 text-[12.5px] font-medium transition-colors", sheetAction === a ? "bg-[#1a1a2e] text-white" : "text-[#4b5563] hover:text-[#1a1a2e]")}
                data-sheet-action={a}
              >
                {a === "checkout" ? tt("Check out now") : tt("View full page")}
              </button>
            ))}
          </div>
          {sheetAction === "checkout" ? (
            /* Round 43: "Buy now · €49" (lib/onepage/product-block sheetButtonLabel). */
            <div className="flex items-center gap-3 pt-0.5" data-sheet-button-price="">
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-[#6b7280]">{tt("Price on the button")}</p>
              <Switch checked={data.sheet_button_price === true} onChange={(on) => onChange({ sheet_button_price: on })} label={tt("Price on the button")} />
            </div>
          ) : null}
          {sheetAction === "checkout" ? (
            <div className="flex items-center gap-3 pt-0.5">
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-[#6b7280]">{tt("Link to the full page under the button")}</p>
              <Switch checked={data.sheet_page_link !== false} onChange={(on) => onChange({ sheet_page_link: on })} label={tt("Link to the full page under the button")} />
            </div>
          ) : null}
          {instantKind && sheetAction === "checkout" ? (
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-[#6b7280]">{tt("Pay without leaving your page")}</p>
              <Switch checked={instantOn} onChange={(on) => onChange({ instant_checkout: on, quick_checkout: false })} label={tt("Pay without leaving your page")} />
            </div>
          ) : null}
        </div>
      ) : null}

      {choice === "instant" && instantKind ? (
        <div className="flex items-start gap-3 rounded-xl bg-[#f7f7f8] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(16,24,40,0.06)]" data-instant-setting="">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("Pay without leaving your page")}</p>
            <p className="text-[12px] leading-snug text-[#6b7280]">{tt("Off: they go to the checkout page instead.")}</p>
          </div>
          <Switch checked={instantOn} onChange={(on) => onChange({ instant_checkout: on, quick_checkout: false })} label={tt("Pay without leaving your page")} />
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

/*
  ROUND 43, the owner: the layout picker's small previews "look bad". They were the same grey wireframe on every
  page, so a Photo or Tile choice said nothing about how it would sit on this page. Each is now this block on this
  page, small: the page's ground, the card in the page's button style (Solid, Soft, Outline or Glass, its corners
  and border), the words in the colour the card gives them, the button inside it turned around as the live block
  turns it (lib/onepage/button-style cardButtonTheme), and the product's own picture where the layout shows one.
  The proportions are the live layouts' (components/onepage/product-block), at about a quarter of their size.
*/
type ThumbTheme = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function thumbColours(t: ThumbTheme) {
  const fill = t.button_style === "outline" || t.button_style === "glass" || t.button_style === "soft" ? t.button_style : "filled"
  const text = t.text_color || "#111113"
  const btn = t.button_color || "#1a1a2e"
  const btnText = t.button_text_color || "#ffffff"
  const r = Number(t.button_border_radius ?? 8)
  const radius = Math.max(2, Math.min(r >= 100 ? 9 : r * 0.4, 9))
  const border = Number(t.button_border_width) || 0
  const card: React.CSSProperties =
    fill === "outline"
      ? { background: "transparent", boxShadow: `inset 0 0 0 1.25px ${t.button_border_color || btn}`, borderRadius: radius }
      : fill === "glass"
        ? { background: "rgba(255,255,255,0.16)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.28)", borderRadius: radius }
        : fill === "soft"
          ? { background: `color-mix(in srgb, ${btn} 14%, transparent)`, borderRadius: radius }
          : { background: btn, boxShadow: border ? `inset 0 0 0 1px ${t.button_border_color || btn}` : undefined, borderRadius: radius }
  /* A Solid card is the page's button, so its words are the button's and its button is turned around. */
  const ink = fill === "filled" ? btnText : text
  /* Soft, Outline and Glass: the button inside the card is drawn the same way as the card, as the live block draws it. */
  const cta: React.CSSProperties = fill === "filled" ? { background: btnText } : fill === "outline" ? { background: "transparent", boxShadow: `inset 0 0 0 1.25px ${t.button_border_color || btn}` } : fill === "glass" ? { background: "rgba(255,255,255,0.22)" } : { background: `color-mix(in srgb, ${btn} 22%, transparent)` }
  const page = t.background_type === "gradient" && t.background_gradient ? t.background_gradient : t.background_color || "#f7f7f8"
  return { card, ink, cta, page, radius, text, btn }
}

export function ProductLayoutThumb({ id, theme, image }: { id: ProductBlockStyle; theme?: ThumbTheme | null; image?: string | null }) {
  const c = thumbColours(theme ?? {})
  const line = (w: string, strong = false, color = c.ink) => <span className="block h-[3px] shrink-0 rounded-full" style={{ width: w, background: color, opacity: strong ? 0.85 : 0.45 }} />
  const pic = (cls: string, style?: React.CSSProperties) =>
    image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className={cn("block shrink-0 object-cover", cls)} style={style} draggable={false} />
    ) : (
      <span className={cn("block shrink-0", cls)} style={{ background: `color-mix(in srgb, ${c.ink} 22%, transparent)`, ...style }} />
    )
  const cta = (cls: string, extra?: React.CSSProperties) => <span className={cn("block shrink-0", cls)} style={{ ...c.cta, borderRadius: Math.max(2, c.radius - 1), ...extra }} />
  const inner = Math.max(2, c.radius - 2)
  let body: React.ReactNode
  switch (id) {
    case "button":
      body = (
        <span className="flex h-[22px] w-full items-center gap-1.5 px-1.5" style={c.card}>
          {pic("h-3 w-3 rounded-[2px]")}
          <span className="flex flex-1 justify-center">{line("55%", true)}</span>
          {line("16%")}
        </span>
      )
      break
    case "callout":
      body = (
        <span className="flex w-full flex-col gap-1.5 p-1.5" style={c.card}>
          <span className="flex items-center gap-1.5">
            {pic("h-[18px] w-[18px]", { borderRadius: inner })}
            <span className="flex flex-1 flex-col gap-[3px]">{line("80%", true)}{line("40%")}</span>
          </span>
          {cta("h-[7px] w-full")}
        </span>
      )
      break
    case "row":
      body = (
        <span className="flex w-full items-center gap-1.5 p-[5px]" style={c.card}>
          {pic("h-[15px] w-[15px]", { borderRadius: inner })}
          <span className="flex flex-1 flex-col gap-[3px]">{line("85%", true)}{line("35%")}</span>
          {cta("h-[9px] w-[22%]")}
        </span>
      )
      break
    case "preview":
      body = (
        <span className="flex w-full flex-col overflow-hidden" style={c.card}>
          {pic("aspect-[2/1] w-full")}
          <span className="flex flex-col gap-[3px] p-1.5">
            {line("70%", true)}
            {cta("mt-[2px] h-[7px] w-full")}
          </span>
        </span>
      )
      break
    case "side":
      body = (
        <span className="flex h-[40px] w-full overflow-hidden" style={c.card}>
          {pic("h-full w-[36%]")}
          <span className="flex flex-1 flex-col gap-[3px] p-1.5">
            {line("85%", true)}
            {line("50%")}
            <span className="mt-auto">{cta("h-[7px] w-full")}</span>
          </span>
        </span>
      )
      break
    case "tile":
      body = (
        <span className="grid w-full grid-cols-2 gap-1.5">
          {[0, 1].map((i) => (
            <span key={i} className="flex flex-col overflow-hidden" style={c.card}>
              {i === 0 ? pic("aspect-square w-full") : <span className="block aspect-square w-full" style={{ background: `color-mix(in srgb, ${c.ink} 14%, transparent)` }} />}
              <span className="flex flex-col gap-[3px] p-1">
                {line("75%", true)}
                {cta("h-[6px] w-full")}
              </span>
            </span>
          ))}
        </span>
      )
      break
    case "overlay":
      body = (
        <span className="relative block aspect-[4/3] w-[78%] overflow-hidden" style={{ borderRadius: c.radius }}>
          {pic("absolute inset-0 h-full w-full")}
          <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(0,0,0,0.65)_100%)]" />
          <span className="absolute inset-x-1.5 bottom-1.5 flex items-end gap-1">
            <span className="flex flex-1 flex-col gap-[3px]">{line("80%", true, "#ffffff")}{line("45%", false, "#ffffff")}</span>
            {cta("h-[8px] w-[28%]", { background: "#ffffff", boxShadow: "none" })}
          </span>
        </span>
      )
      break
    case "minimal":
      body = (
        <span className="flex w-full items-center gap-1.5 py-1.5" style={{ borderBottom: `1px solid color-mix(in srgb, ${c.text} 22%, transparent)` }}>
          <span className="flex flex-1 flex-col gap-[3px]">{line("70%", true, c.text)}{line("45%", false, c.text)}</span>
          {cta("h-[10px] w-[24%]", c.card.background === "transparent" ? { boxShadow: `inset 0 0 0 1.25px ${c.btn}` } : { background: String(c.card.background) })}
        </span>
      )
      break
  }
  return (
    <span aria-hidden data-product-layout-thumb={id} className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl px-[10%]" style={{ background: c.page }}>
      {body}
    </span>
  )
}

/** Round 43: a link's two layouts the same way, in the page's own colours: Classic (a button) and Featured (a card with its picture). */
export function LinkLayoutThumb({ id, theme, image }: { id: "default" | "pro"; theme?: ThumbTheme | null; image?: string | null }) {
  const c = thumbColours(theme ?? {})
  const line = (w: string) => <span className="block h-[3px] rounded-full" style={{ width: w, background: c.ink, opacity: 0.85 }} />
  const pic = (cls: string, style?: React.CSSProperties) =>
    image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className={cn("block shrink-0 object-cover", cls)} style={style} draggable={false} />
    ) : (
      <span className={cn("block shrink-0", cls)} style={{ background: `color-mix(in srgb, ${c.ink} 22%, transparent)`, ...style }} />
    )
  return (
    <span aria-hidden data-link-layout-thumb={id} className="flex h-full w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl px-[12%]" style={{ background: c.page }}>
      {id === "default" ? (
        <>
          {[0, 1].map((i) => (
            <span key={i} className="relative flex h-[22px] w-full items-center justify-center" style={{ ...c.card, opacity: i ? 0.45 : 1 }}>
              {i === 0 ? pic("absolute left-1 h-[14px] w-[14px]", { borderRadius: Math.max(2, c.radius - 2) }) : null}
              {line(i ? "40%" : "48%")}
            </span>
          ))}
        </>
      ) : (
        <span className="flex w-full flex-col overflow-hidden" style={c.card}>
          {pic("aspect-[16/9] w-full")}
          <span className="grid h-[16px] place-items-center">{line("50%")}</span>
        </span>
      )}
    </span>
  )
}

export function ProductLayoutPicker({ data, theme, onPick }: { data: ProductBlockData; theme?: ({ product_layout?: unknown } & ThumbTheme) | null; onPick: (id: ProductBlockStyle) => void }) {
  const image = data.custom_thumbnail || data.product_thumbnail || null
  /* What the page draws: under a theme that shows products its own way, a block left as the Callout is drawn as the theme says. */
  const current = productLayoutOf(data, theme)
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
              <span className="block aspect-[4/3] overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">
                <ProductLayoutThumb id={id} theme={theme} image={image} />
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
