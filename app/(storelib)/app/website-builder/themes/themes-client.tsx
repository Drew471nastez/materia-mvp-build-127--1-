"use client"

/**
 * ===========================================================================
 *  THE THEME MARKETPLACE, OVER THE WEBSITE PAGE
 * ===========================================================================
 * It was a page of its own (/app/website-builder/themes), reached by leaving
 * the Website page. It is a layer over that page now: "Theme marketplace"
 * beside Browse themes, and Show more under its six cards, open it where the
 * creator is, and closing it leaves them where they were. It lists every
 * theme the page was given: every published listing and every template
 * that ships with the code (lib/themes/marketplace-server publishedListings),
 * with no page of them held back.
 *
 * A card's cover opens the template's preview over this window
 * (./theme-preview.tsx); its Back lands on this grid again.
 *
 * ON A COMPUTER it is a large window: the title at the top left, a close
 * button at the top right, the categories and the order under them, and a
 * grid of big cover cards that scrolls (three to a row from 1280, two under).
 * It comes up with a fade and a slight rise, and leaves the same way back.
 *
 * ON A PHONE (under 768px) it is a full screen page that slides up over the
 * Website page, one card to a row, inside the safe areas. The close button
 * and the system's back both close it: the Website page pushes a history
 * entry when it opens (website-builder-client.tsx), so Back lands on the
 * page under it and not on wherever the creator was before.
 *
 * MOTION IS TRANSFORM AND OPACITY ONLY, 200 to 280ms, and the window is
 * centred by its margins so the transform is free for the animation. With
 * reduced motion there is none: it is there, then it is not. The page under
 * it does not move: Radix holds the scroll without changing the page's
 * width, and the Website page scrolls inside its own box anyway.
 *
 * Add goes through the Website page's own Add (the same request, the same
 * row arriving in the library, the same full library sheet), so a card here
 * and a card in the Browse themes row can never disagree.
 */
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ChevronDown, X } from "lucide-react"

import { SCRIM } from "@/components/ui/scrim"
import { useEdgeFade } from "@/components/app/use-edge-fade"
import { hapticTap } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { ThemeTemplateCard, type TemplateCardState } from "@/components/website-builder/theme-template-card"
import { THEME_SORTS, categoryLabel, listingPath, sortListings, type ThemeListing, type ThemeSort } from "@/lib/themes/marketplace-shared"

/** In the address while the popup is open: /app/website-builder?themes=1 opens it, and a link can name a theme with &theme=slug. */
export const THEMES_PARAM = "themes"
export const THEME_PARAM = "theme"
/** The Website page with the marketplace open. */
export const THEMES_POPUP_PATH = `/app/website-builder?${THEMES_PARAM}=1`

/** How long the window takes to arrive and to leave. scripts/check-theme-popup.mjs reads these off the page. */
export const POPUP_IN_MS = 260
export const POPUP_OUT_MS = 200
export const SUBPAGE_IN_MS = 280
export const SUBPAGE_OUT_MS = 240

/*
  The window's motion. Keyframes rather than a transition: Radix keeps the
  panel in the page for as long as its exit animation runs, and a transition
  has nothing to run from on the frame the panel is first drawn.
*/
const MOTION = `
@keyframes wb-themes-in { from { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.975); } to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } }
@keyframes wb-themes-out { from { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } to { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.98); } }
@keyframes wb-themes-up { from { transform: translate3d(0, 100%, 0); } to { transform: translate3d(0, 0, 0); } }
@keyframes wb-themes-down { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(0, 100%, 0); } }
@keyframes wb-themes-dim { from { opacity: 0; } to { opacity: 1; } }
@keyframes wb-themes-undim { from { opacity: 1; } to { opacity: 0; } }
[data-themes-scrim][data-state="open"] { animation: wb-themes-dim ${POPUP_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both; }
[data-themes-scrim][data-state="closed"] { animation: wb-themes-undim ${POPUP_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1) both; }
[data-themes-popup][data-state="open"] { animation: wb-themes-in ${POPUP_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both; }
[data-themes-popup][data-state="closed"] { animation: wb-themes-out ${POPUP_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1) both; }
@media (max-width: 767.98px) {
  [data-themes-popup][data-state="open"] { animation: wb-themes-up ${SUBPAGE_IN_MS}ms cubic-bezier(0.32, 0.72, 0, 1) both; }
  [data-themes-popup][data-state="closed"] { animation: wb-themes-down ${SUBPAGE_OUT_MS}ms cubic-bezier(0.4, 0, 0.9, 0.6) both; }
}
@media (prefers-reduced-motion: reduce) {
  [data-themes-scrim][data-state], [data-themes-popup][data-state] { animation: none; }
}
`

export interface ThemeMarketplaceProps {
  open: boolean
  onClose: () => void
  /** Every theme the marketplace offers, in its own order. */
  listings: ThemeListing[]
  /** Add, Adding or In library, for one theme. The Website page decides, as it does for its own row. */
  stateOf: (listing: ThemeListing) => TemplateCardState
  /** Another website is being made: every Add waits for it. */
  waiting?: boolean
  onAdd: (listing: ThemeListing) => void
  /** Preview on a card: the template's preview over this window (./theme-preview.tsx), given the cover that opened it. */
  onPreview: (listing: ThemeListing, opener: HTMLElement) => void
  /** A theme a link named (&theme=slug): brought into view when the popup opens. */
  focusSlug?: string | null
  /** What takes the focus back when it closes: the button that opened it. */
  returnFocus?: () => HTMLElement | null
}

export function ThemeMarketplace({ open, onClose, listings, stateOf, waiting = false, onAdd, onPreview, focusSlug = null, returnFocus }: ThemeMarketplaceProps) {
  const [category, setCategory] = React.useState<string>("all")
  const [sort, setSort] = React.useState<ThemeSort>("featured")
  const scrim = React.useRef<HTMLDivElement>(null)
  const panel = React.useRef<HTMLDivElement>(null)
  const grid = React.useRef<HTMLDivElement>(null)

  /*
    Only the categories that have a theme in them (an empty one is a dead
    end), and by the name a creator reads: two keys that are both shown as
    "General" are one choice, not two buttons with the same word.
  */
  const categories = React.useMemo(() => [...new Set(listings.map((l) => categoryLabel(l.category)))], [listings])
  const shown = React.useMemo(
    () => sortListings(category === "all" ? listings : listings.filter((l) => categoryLabel(l.category) === category), sort),
    [listings, category, sort],
  )
  /* A category whose last theme went (the list changed under it) is not kept. */
  if (category !== "all" && !categories.includes(category)) setCategory("all")

  /* A theme a link named: in view, once the window is there. */
  React.useEffect(() => {
    if (!open || !focusSlug) return
    const id = requestAnimationFrame(() => {
      const card = Array.from(grid.current?.querySelectorAll<HTMLElement>("[data-template-card]") ?? []).find((el) => el.dataset.templateCard === focusSlug)
      card?.scrollIntoView({ block: "center" })
    })
    return () => cancelAnimationFrame(id)
  }, [open, focusSlug])

  return (
    <>
    {/* In the document's head, once, for as long as the page is there: the scrim and the window both need it to the last frame of their exit. */}
    <style href="wb-themes-motion" precedence="default">{MOTION}</style>
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay ref={scrim} data-themes-scrim="" className={cn("fixed inset-0 z-50 max-md:hidden", SCRIM)} />
        <DialogPrimitive.Content
          ref={panel}
          data-themes-popup=""
          aria-describedby={undefined}
          tabIndex={-1}
          /* The window itself takes the focus, so no button wears a ring it was not given by a key. */
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            panel.current?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(e) => {
            const back = returnFocus?.()
            if (!back) return
            e.preventDefault()
            back.focus({ preventScroll: true })
          }}
          /*
            Only a press on the dim itself closes it. The full library sheet
            and a toast are drawn outside this window, and a press on either
            is not a press to close the marketplace under them.
          */
          onPointerDownOutside={(e) => {
            if (e.target !== scrim.current) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (e.target !== scrim.current) e.preventDefault()
          }}
          className={cn(
            "fixed z-50 flex flex-col bg-[#f8f9fa] outline-none [will-change:transform,opacity]",
            /* A phone: the whole screen. */
            "max-md:inset-0",
            /* A computer: a window in the middle, held there by its margins so the transform is the animation's alone. */
            "md:inset-0 md:m-auto md:h-[min(880px,calc(100dvh-48px))] md:w-[min(1184px,calc(100vw-48px))] md:overflow-hidden md:rounded-2xl md:shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_24px_64px_-24px_rgba(17,24,39,0.45),0_4px_12px_rgba(17,24,39,0.08)]",
          )}
        >
          {/* ── Title, close, then the categories and the order ───────── */}
          <header
            data-themes-head=""
            className="shrink-0 border-b border-[#e5e7eb]/80 bg-white pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] md:px-6"
          >
            <div className="flex h-14 items-center justify-between gap-3 md:h-16">
              <div className="flex min-w-0 items-baseline gap-2.5">
                <DialogPrimitive.Title className="truncate text-[18px] font-bold tracking-tight text-[#1a1a2e] md:text-[20px]">{tt("Theme marketplace")}</DialogPrimitive.Title>
                <span className="shrink-0 text-[13px] font-medium tabular-nums text-[#6b7280]">{listings.length}</span>
              </div>
              <DialogPrimitive.Close
                data-themes-close=""
                aria-label={tt("Close")}
                className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#4b5563] outline-none transition-colors duration-150 pointer-fine:hover:bg-[#f3f4f6] pointer-fine:hover:text-[#1a1a2e] active:bg-[#eceef1] pointer-fine:active:bg-[#eceef1] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 md:h-9 md:w-9 md:rounded-lg [-webkit-tap-highlight-color:transparent]"
              >
                <X className="h-5 w-5 md:h-[18px] md:w-[18px]" strokeWidth={2} />
              </DialogPrimitive.Close>
            </div>

            <div className="flex items-center gap-3 pb-3">
              {categories.length > 1 ? (
                <CategoryPills categories={categories} value={category} onChange={setCategory} />
              ) : (
                <span className="flex-1" />
              )}
              <label className="relative shrink-0">
                <span className="sr-only">{tt("Sort by")}</span>
                <select
                  value={sort}
                  data-themes-sort=""
                  onChange={(e) => setSort(e.target.value as ThemeSort)}
                  className="h-9 appearance-none rounded-lg border border-[#e5e7eb] bg-white pl-3 pr-8 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 md:h-8"
                >
                  {THEME_SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {tt(s.label)}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]" strokeWidth={2.25} />
              </label>
            </div>
          </header>

          {/* ── The themes ────────────────────────────────────────────── */}
          <div
            data-themes-scroll=""
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(28px+env(safe-area-inset-bottom))] pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-5 md:px-6 md:pb-8 md:pt-6"
          >
            <div ref={grid} data-themes-grid="" className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2 md:gap-y-9 xl:grid-cols-3">
              {shown.map((l, i) => {
                const state = stateOf(l)
                return (
                  <ThemeTemplateCard
                    key={l.slug}
                    listing={l}
                    size="lg"
                    state={state}
                    priority={i < 3}
                    waiting={waiting}
                    /* Its preview over this window: the home page at a computer's width and a phone's. */
                    onPreview={(opener) => onPreview(l, opener)}
                    /* A price or a plan: its page says the terms, as the Browse themes row does. */
                    viewHref={l.tier !== "free" ? listingPath(l.slug) : null}
                    onAdd={() => onAdd(l)}
                  />
                )
              })}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
    </>
  )
}

/*
  ===========================================================================
   THE CATEGORIES, AS STORELIB'S OWN CHIPS
  ===========================================================================
  The chips of Analytics' All / Digital / Physical / Communities
  (components/app/segmented-pills.tsx, variant "chips"): quiet words on the
  page, the chosen one on a dark pill that slides to the next by transform
  and takes its width, 220ms on the /app curve, so nothing is laid out
  again. Under a mouse a chip takes a faint shade, a press a deeper one, and
  the words ease to white as the pill arrives. Until the pill has been
  measured, the chosen chip draws its own.

  NOTHING IS CLIPPED. The row scrolls sideways when it does not fit, and a
  scroller clips on every side, so the row keeps 4px of room around its
  chips for the focus ring, and fades where it is cut (.edge-fade) rather
  than slicing a word. The chosen chip is kept in view.
*/
function CategoryPills({ categories, value, onChange }: { categories: string[]; value: string; onChange: (c: string) => void }) {
  const row = useEdgeFade<HTMLDivElement>()
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const options = React.useMemo(() => ["all", ...categories], [categories])
  const index = Math.max(0, options.indexOf(value))
  const [box, setBox] = React.useState<{ x: number; w: number } | null>(null)

  React.useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[index]
      if (!el) return
      setBox((b) => (b && b.x === el.offsetLeft && b.w === el.offsetWidth ? b : { x: el.offsetLeft, w: el.offsetWidth }))
    }
    measure()
    const strip = row.current
    const el = refs.current[index]
    if (strip && el && strip.scrollWidth > strip.clientWidth) {
      const left = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2))
      const still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      if (typeof strip.scrollTo === "function") strip.scrollTo({ left, behavior: still ? ("instant" as ScrollBehavior) : "smooth" })
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    if (ro && strip) ro.observe(strip)
    return () => ro?.disconnect()
  }, [index, options.length, row])

  const pick = (i: number) => {
    const c = options[i]
    if (c === undefined || c === value) return
    hapticTap("soft")
    onChange(c)
  }

  return (
    <div
      ref={row}
      role="group"
      aria-label={tt("Category")}
      data-themes-categories=""
      className="edge-fade relative -my-1 -ml-4 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 pl-4 pr-1 [scrollbar-width:none] md:-ml-1 md:pl-1 [&::-webkit-scrollbar]:hidden"
      style={{ touchAction: "pan-x pan-y", overscrollBehaviorX: "contain" }}
    >
      {box ? (
        <span
          aria-hidden
          data-themes-category-pill=""
          className="pointer-events-none absolute left-0 top-1 h-9 rounded-full bg-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.18)] transition-[translate,width] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:h-8"
          style={{ translate: `${box.x}px 0`, width: box.w }}
        />
      ) : null}
      {options.map((c, i) => {
        const on = i === index
        return (
          <button
            key={c}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            aria-pressed={on}
            data-themes-category={c}
            onClick={() => pick(i)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
              e.preventDefault()
              const next = (i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length
              refs.current[next]?.focus()
              pick(next)
            }}
            className={cn(
              "relative z-[1] h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold outline-none md:h-8 [-webkit-tap-highlight-color:transparent]",
              "transition-[color,background-color] duration-200 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25",
              on
                ? cn("text-white", !box && "bg-[#1a1a2e]")
                : "bg-[#1a1a2e]/0 text-[#4b5563] pointer-fine:hover:bg-[#1a1a2e]/[0.05] pointer-fine:hover:text-[#1a1a2e] active:bg-[#1a1a2e]/[0.09] pointer-fine:active:bg-[#1a1a2e]/[0.09] active:text-[#1a1a2e] pointer-fine:active:text-[#1a1a2e]",
            )}
          >
            {c === "all" ? tt("All") : tt(c)}
          </button>
        )
      })}
    </div>
  )
}
