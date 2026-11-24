"use client"

/**
 * ===========================================================================
 *  THE THEME MARKETPLACE, OVER THE WEBSITE PAGE
 * ===========================================================================
 * It was a page of its own (/app/website-builder/themes), reached by leaving
 * the Website page. It is a layer over that page now: "Theme marketplace"
 * beside Browse themes, and Show more under its nine cards, open it where the
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
 * ON A PHONE (under 768px) it is the app's own bottom sheet
 * (components/ui/bottom-sheet.tsx, round 58): a handle, the title and close
 * under it, the categories and the order, then the cards scrolling inside
 * the sheet, one to a row. It rises over the Website page with the page
 * showing a little above it, a pull down from the top of the list or the
 * handle closes it, the safe areas are the sheet's, and the page behind does
 * not scroll (the dim takes no swipe). The close button and the system's
 * back both close it: the Website page pushes a history entry when it opens
 * (website-builder-client.tsx), so Back lands on the page under it and not
 * on wherever the creator was before.
 *
 * MOTION IS TRANSFORM AND OPACITY ONLY. The window is centred by its margins
 * so the transform is free for the animation; the sheet moves on the
 * compositor. With reduced motion there is none: it is there, then it is not.
 *
 * Add goes through the Website page's own Add (the same request, the same
 * row arriving in the library, the same full library sheet), so a card here
 * and a card in the Browse themes row can never disagree.
 */
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Check, ChevronDown, X } from "lucide-react"

import { SCRIM } from "@/components/ui/scrim"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { useEdgeFade } from "@/components/app/use-edge-fade"
import { hapticTap } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { ThemeTemplateCard, warmTemplateCover, type TemplateCardState } from "@/components/website-builder/theme-template-card"
import { THEME_SORTS, categoryLabel, listingPath, sortListings, type ThemeListing, type ThemeSort } from "@/lib/themes/marketplace-shared"

/** In the address while the popup is open: /app/website-builder?themes=1 opens it, and a link can name a theme with &theme=slug. */
export const THEMES_PARAM = "themes"
export const THEME_PARAM = "theme"
/** The Website page with the marketplace open. */
export const THEMES_POPUP_PATH = `/app/website-builder?${THEMES_PARAM}=1`

/** How long the window takes to arrive and to leave. scripts/check-theme-popup.mjs reads these off the page. */
export const POPUP_IN_MS = 260
export const POPUP_OUT_MS = 200
/** Under this width the marketplace is a bottom sheet. */
const PHONE_QUERY = "(max-width: 767.98px)"
/**
 * The sheet stops short of the top of the screen, so the page it came from
 * still shows above it: a sheet, not a new page. Fixed, so cards arriving
 * never move its top edge.
 */
const SHEET_HEIGHT = "calc(100dvh - max(env(safe-area-inset-top), 12px) - 32px)"
/** After the window or the sheet has arrived: every cover is fetched and decoded while nobody is pressing anything. */
const WARM_AFTER_MS = 400

/*
  The window's motion. Keyframes rather than a transition: Radix keeps the
  panel in the page for as long as its exit animation runs, and a transition
  has nothing to run from on the frame the panel is first drawn.
*/
const MOTION = `
@keyframes wb-themes-in { from { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.975); } to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } }
@keyframes wb-themes-out { from { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } to { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.98); } }
@keyframes wb-themes-dim { from { opacity: 0; } to { opacity: 1; } }
@keyframes wb-themes-undim { from { opacity: 1; } to { opacity: 0; } }
[data-themes-scrim][data-state="open"] { animation: wb-themes-dim ${POPUP_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both; }
[data-themes-scrim][data-state="closed"] { animation: wb-themes-undim ${POPUP_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1) both; }
[data-themes-popup][data-state="open"] { animation: wb-themes-in ${POPUP_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both; }
[data-themes-popup][data-state="closed"] { animation: wb-themes-out ${POPUP_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1) both; }
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

/* One listener for the phone line. */
const subscribePhone = (onChange: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}
const phoneNow = () => window.matchMedia(PHONE_QUERY).matches
const phoneOnServer = () => false

export function ThemeMarketplace({ open, onClose, listings, stateOf, waiting = false, onAdd, onPreview, focusSlug = null, returnFocus }: ThemeMarketplaceProps) {
  const phone = React.useSyncExternalStore(subscribePhone, phoneNow, phoneOnServer)
  const [category, setCategory] = React.useState<string>("all")
  const [sort, setSort] = React.useState<ThemeSort>("featured")
  const scrim = React.useRef<HTMLDivElement>(null)
  const panel = React.useRef<HTMLDivElement>(null)
  const grid = React.useRef<HTMLDivElement>(null)
  const scroller = React.useRef<HTMLDivElement>(null)

  /*
    Only the categories that have a theme in them (an empty one is a dead
    end), and by the name a creator reads: two keys that are both shown as
    "General" are one choice, not two buttons with the same word.
  */
  const categories = React.useMemo(() => [...new Set(listings.map((l) => categoryLabel(l.category)))], [listings])
  /* A category whose last theme went (the list changed under it) is not kept. */
  if (category !== "all" && !categories.includes(category)) setCategory("all")
  const sorted = React.useMemo(() => sortListings(listings, sort), [listings, sort])
  const inView = (l: ThemeListing) => category === "all" || categoryLabel(l.category) === category

  /*
    ===========================================================================
     A CATEGORY IS A FILTER, NOT A NEW GRID (round 58)
    ===========================================================================
    The owner: switching categories "must feel smooth and clean: the theme
    cards appear on every change with no lag, no flashes, no empty frames".
    Each switch used to unmount the cards it hid and mount the ones it
    showed, so a card coming back was a new element with a new picture: lazy,
    so not asked for until it was on screen, decoded off the frame, and
    faded in from the frame's grey. And the whole grid faded up from a
    quarter of its strength. Sampled frame by frame with the CPU slowed four
    times (scripts/check-builder-modals-r58.mjs): 64 frames over twelve
    switches on a phone with a card showing no picture, every frame of every
    switch dimmed, and tasks up to 207ms.

    Now every card is built once and kept: a category hides the rest
    (`hidden`) and shows its own, in place, so a switch changes attributes
    and nothing else. Every cover is asked for when the cards are built (the
    first screen first, the rest at a low priority, hidden or not), and once
    the window has arrived each is decoded while nothing is moving
    (warmTemplateCover), off the page and without a render, so a card shown
    later is drawn whole on the frame it appears in. (Telling every card to
    warm up through a prop drew all of them again just as the window
    arrived: a 600ms task at a quarter speed.) A card shown before its
    picture is in keeps the frame's grey at the cover's own shape: nothing
    moves when it lands. The list starts at its top, before paint, and there
    is no fade over it.
  */
  const warmed = React.useRef(false)
  const viewNow = React.useRef<ThemeListing[]>([])
  viewNow.current = sorted.filter(inView)
  React.useEffect(() => {
    if (!open || warmed.current) return
    let stop = false
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
    const later = (f: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(f, { timeout: 600 }) : window.setTimeout(f, 32))
    const t = window.setTimeout(() => {
      warmed.current = true
      /* What the category in front of somebody shows first, then the rest, one at a time. Nothing here renders: a cover is fetched and decoded off the page. */
      const first = new Set(viewNow.current)
      const queue = [...viewNow.current, ...listings.filter((l) => !first.has(l))]
      const next = () => {
        const l = queue.shift()
        if (stop || !l) return
        void warmTemplateCover(l, "lg").finally(() => later(next))
      }
      later(next)
    }, WARM_AFTER_MS)
    return () => {
      stop = true
      window.clearTimeout(t)
    }
  }, [open, listings])

  /*
    One pair of handlers per theme, kept for as long as the list is the same,
    so a switch draws again only the cards whose hidden or first-screen state
    changed (ThemeTemplateCard is memoised). They call the newest handlers the
    page gave, which are new on every render of the page.
  */
  const latest = React.useRef({ onPreview, onAdd })
  React.useLayoutEffect(() => {
    latest.current = { onPreview, onAdd }
  })
  const handlers = React.useMemo(
    () =>
      new Map(
        listings.map((l) => [
          l.slug,
          { preview: (opener: HTMLElement) => latest.current.onPreview(l, opener), add: () => latest.current.onAdd(l) },
        ]),
      ),
    [listings],
  )

  const view = `${category}|${sort}`
  const lastView = React.useRef(view)
  React.useLayoutEffect(() => {
    if (lastView.current === view) return
    lastView.current = view
    if (scroller.current) scroller.current.scrollTop = 0
  }, [view])

  /* A theme a link named: in view, once the window is there. */
  React.useEffect(() => {
    if (!open || !focusSlug) return
    const id = requestAnimationFrame(() => {
      const card = Array.from(grid.current?.querySelectorAll<HTMLElement>("[data-template-card]") ?? []).find((el) => el.dataset.templateCard === focusSlug)
      card?.scrollIntoView({ block: "center" })
    })
    return () => cancelAnimationFrame(id)
  }, [open, focusSlug])

  const title = (
    <div className="flex min-w-0 items-baseline gap-2.5">
      <DialogTitle phone={phone} className="truncate text-[18px] font-bold tracking-tight text-[#1a1a2e] md:text-[20px]">
        {tt("Theme marketplace")}
      </DialogTitle>
      <span className="shrink-0 text-[13px] font-medium tabular-nums text-[#6b7280]">{listings.length}</span>
    </div>
  )

  const close = phone ? (
    <button
      type="button"
      data-themes-close=""
      aria-label={tt("Close")}
      /* Closes the way a pull does: the slide first, the page a frame later (bottom-sheet.tsx, data-sheet-close). */
      data-sheet-close=""
      className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#4b5563] outline-none active:bg-[#eceef1] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]"
    >
      <X className="h-5 w-5" strokeWidth={2} />
    </button>
  ) : (
    <DialogPrimitive.Close
      data-themes-close=""
      aria-label={tt("Close")}
      className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#4b5563] outline-none transition-colors duration-150 pointer-fine:hover:bg-[#f3f4f6] pointer-fine:hover:text-[#1a1a2e] active:bg-[#eceef1] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
    >
      <X className="h-[18px] w-[18px]" strokeWidth={2} />
    </DialogPrimitive.Close>
  )

  const filters = (
    <div className="flex items-center gap-3">
      {categories.length > 1 ? <CategoryChips categories={categories} value={category} onChange={setCategory} /> : <span className="flex-1" />}
      <SortMenu value={sort} onChange={setSort} />
    </div>
  )

  const cards = (
    <div ref={grid} data-themes-grid="" className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2 md:gap-y-9 xl:grid-cols-3">
      {sorted.map((l, i) => (
        /*
          The category hides the box round the card, not the card: the card
          (memoised) is not drawn again on a switch, only this attribute
          changes. The first row of the whole list is asked for first.
        */
        <div key={l.slug} data-themes-cell="" hidden={!inView(l)} className="min-w-0">
          <ThemeTemplateCard
            listing={l}
            size="lg"
            state={stateOf(l)}
            priority={i < 3}
            /* Built once and kept, so a card a category shows later already has its picture. */
            eager
            waiting={waiting}
            /* Its preview over this window: the home page at a computer's width and a phone's. */
            onPreview={handlers.get(l.slug)!.preview}
            /* A price or a plan: its page says the terms, as the Browse themes row does. */
            viewHref={l.tier !== "free" ? listingPath(l.slug) : null}
            onAdd={handlers.get(l.slug)!.add}
          />
        </div>
      ))}
    </div>
  )

  if (phone) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={onClose}
        hideFrom="md"
        fill
        height={SHEET_HEIGHT}
        maxHeight={SHEET_HEIGHT}
        /* Under a theme's preview (z-index 50, drawn after it) and the full library sheet (200), as the window was. */
        zIndex={50}
        label={tt("Theme marketplace")}
        header={
          <div data-themes-head="" className="flex h-12 items-center justify-between gap-3 pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]">
            {title}
            {close}
          </div>
        }
      >
        <div data-themes-popup="" data-state={open ? "open" : "closed"} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-[#eef0f2] pb-3 pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-1">{filters}</div>
          <div
            ref={scroller}
            data-themes-scroll=""
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f8f9fa] pb-8 pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-5"
            style={{ touchAction: "pan-y" }}
          >
            {cards}
          </div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <>
    {/* In the document's head, once, for as long as the page is there: the scrim and the window both need it to the last frame of their exit. */}
    <style href="wb-themes-motion" precedence="default">{MOTION}</style>
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay ref={scrim} data-themes-scrim="" className={cn("fixed inset-0 z-50", SCRIM)} />
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
            Only a press on the dim itself closes it. The full library sheet,
            the order's menu and a toast are drawn outside this window, and a
            press on any of them is not a press to close the marketplace.
          */
          onPointerDownOutside={(e) => {
            if (e.target !== scrim.current) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (e.target !== scrim.current) e.preventDefault()
          }}
          className="fixed inset-0 z-50 m-auto flex h-[min(880px,calc(100dvh-48px))] w-[min(1184px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl bg-[#f8f9fa] shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_24px_64px_-24px_rgba(17,24,39,0.45),0_4px_12px_rgba(17,24,39,0.08)] outline-none [will-change:transform,opacity]"
        >
          {/* ── Title, close, then the categories and the order ───────── */}
          <header data-themes-head="" className="shrink-0 border-b border-[#e5e7eb]/80 bg-white px-6">
            <div className="flex h-16 items-center justify-between gap-3">
              {title}
              {close}
            </div>
            <div className="pb-3">{filters}</div>
          </header>

          {/* ── The themes ────────────────────────────────────────────── */}
          <div ref={scroller} data-themes-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-8 pt-6">
            {cards}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
    </>
  )
}

/** The window's title is the dialog's own; the sheet names itself (its label), so there it is a heading. */
function DialogTitle({ phone, className, children }: { phone: boolean; className: string; children: React.ReactNode }) {
  return phone ? <h2 className={className}>{children}</h2> : <DialogPrimitive.Title className={className}>{children}</DialogPrimitive.Title>
}

/*
  ===========================================================================
   THE ORDER, AS STORELIB'S OWN MENU (round 58)
  ===========================================================================
  It was the browser's <select>: a grey system list on a computer and the
  phone's own wheel, in nothing like the rest of the builder. It is the
  app's action list now (components/ui/responsive-action-menu.tsx): a small
  white menu under the button on a computer, the shared bottom sheet on a
  phone, the chosen order marked with a check. The button says the order in
  use and is the height and shape of the chips beside it.
*/
function SortMenu({ value, onChange }: { value: ThemeSort; onChange: (s: ThemeSort) => void }) {
  const items = React.useMemo<ActionMenuItem[]>(
    () =>
      THEME_SORTS.map((s) => ({
        id: `sort-${s.id}`,
        label: tt(s.label),
        /* The rows line up whether or not they carry the check. */
        icon: <Check className={cn(s.id === value ? "text-[#1a1a2e]" : "opacity-0")} strokeWidth={2.4} />,
        onClick: () => {
          if (s.id !== value) onChange(s.id)
        },
      })),
    [value, onChange],
  )
  const current = THEME_SORTS.find((s) => s.id === value) ?? THEME_SORTS[0]
  return (
    <ResponsiveActionMenu
      title={tt("Sort by")}
      items={items}
      menuWidth="w-44"
      trigger={
        <button
          type="button"
          data-themes-sort=""
          className="inline-flex h-9 shrink-0 select-none items-center gap-1 rounded-full bg-white pl-3.5 pr-2.5 text-[13.5px] font-medium text-[#1a1a2e] shadow-[inset_0_0_0_1px_#e5e7eb] outline-none transition-[background-color,box-shadow] duration-150 pointer-fine:hover:bg-[#f9fafb] pointer-fine:hover:shadow-[inset_0_0_0_1px_#d1d5db] active:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 data-[state=open]:bg-[#f3f4f6] [-webkit-tap-highlight-color:transparent]"
        >
          <span className="sr-only">{tt("Sort by")} </span>
          {tt(current.label)}
          <ChevronDown aria-hidden className="h-4 w-4 text-[#6b7280]" strokeWidth={2} />
        </button>
      }
    />
  )
}

/*
  ===========================================================================
   THE CATEGORIES, AS THE BUILDER'S CHIPS
  ===========================================================================
  Round 58, the owner: the row should "look like Storelib's chips rather than
  the selected-text look". It was words on the bar with a faint grey round
  the chosen one, and a press and drag across it selected the words like a
  paragraph (the owner's screenshot: every category highlighted in the
  browser's blue). These are the website builder's own chips (Add a
  section's, section-library.tsx): a soft grey pill for each, the chosen one
  filled dark, the colour eased in place in 150ms and nothing sliding across.
  The words are not selectable. The pressed chip glides to the middle of the
  row when the row is wider than the window.

  NOTHING IS CLIPPED. The row scrolls sideways when it does not fit, and a
  scroller clips on every side, so the row keeps 4px of room around its
  chips for the focus ring, and fades where it is cut (.edge-fade) rather
  than slicing a word.
*/
/** The chips' colour change. scripts/check-theme-popup.mjs reads it. */
export const CATEGORY_FADE_MS = 150
const CATEGORY_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"

function CategoryChips({ categories, value, onChange }: { categories: string[]; value: string; onChange: (c: string) => void }) {
  const row = useEdgeFade<HTMLDivElement>()
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const options = React.useMemo(() => ["all", ...categories], [categories])
  const index = Math.max(0, options.indexOf(value))
  /* The first placing is not a glide: the row opens with the chosen chip already where it belongs. */
  const placed = React.useRef(false)

  React.useEffect(() => {
    const strip = row.current
    const el = refs.current[index]
    if (!strip || !el || strip.scrollWidth <= strip.clientWidth || typeof strip.scrollTo !== "function") return
    const left = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2))
    const still = !placed.current || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    strip.scrollTo({ left, behavior: still ? ("instant" as ScrollBehavior) : "smooth" })
    placed.current = true
  }, [index, row])

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
      className="edge-fade relative -my-1 -ml-4 flex min-w-0 flex-1 select-none items-center gap-2 overflow-x-auto py-1 pl-4 pr-1 [scrollbar-width:none] md:-ml-1 md:pl-1 [&::-webkit-scrollbar]:hidden"
      style={{ touchAction: "pan-x pan-y", overscrollBehaviorX: "contain" }}
    >
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
            data-themes-category-on={on ? "" : undefined}
            onClick={() => pick(i)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
              e.preventDefault()
              const next = (i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length
              refs.current[next]?.focus()
              pick(next)
            }}
            style={{ transitionDuration: `${CATEGORY_FADE_MS}ms`, transitionTimingFunction: CATEGORY_EASE }}
            className={cn(
              "flex h-9 shrink-0 select-none items-center whitespace-nowrap rounded-full px-4 text-[13.5px] font-medium outline-none transition-[color,background-color] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-1 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]",
              on ? "bg-[#1a1a2e] text-white" : "bg-[#f3f4f6] text-[#4b5563] active:bg-[#e5e7eb] pointer-fine:hover:bg-[#eceef1] pointer-fine:hover:text-[#1a1a2e]",
            )}
          >
            {c === "all" ? tt("All") : tt(c)}
          </button>
        )
      })}
    </div>
  )
}
