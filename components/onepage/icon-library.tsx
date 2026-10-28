"use client"

/**
 * ===========================================================================
 *  CHOOSE ICON: THE LINK ICON LIBRARY
 * ===========================================================================
 * Round 11: "make sure the Choose icon library is actually very smooth and
 * clean, nice, and everything working 100%." It was a view inside the
 * thumbnail sheet, built on the tap that opened it (every icon, with a label
 * at 8px), its search and category held by the Links tab (so each letter
 * typed rendered the whole tab), a sidebar on a computer and a row of black
 * chips on a phone, and a close that swapped back to the thumbnail's view in
 * the first frame of the slide.
 *
 * Now it is one component, drawn the same in the phone's own sheet and the
 * computer's dialog:
 *
 *   OPEN        on a phone it is a sheet of its own, kept (built while the
 *               page is idle), over the thumbnail sheet: opening it is a
 *               slide and nothing else.
 *   SEARCH      by name, by id and by the words people use ("money" finds
 *               the dollar, "twitter" finds X), held here, so typing renders
 *               this and nothing else.
 *   CATEGORIES  Storelib's own pills (./pill-tabs PillTabs), the same row
 *               as Add block's chips and Settings'.
 *   GRID        virtual (VirtualIconGrid below): only the rows on screen
 *               and three either side exist, about fifty tiles whatever the
 *               category or search, so the sheet is light to build while
 *               the page is idle, opening it styles nothing new, and a chip
 *               or a letter swaps fifty tiles rather than restyling two
 *               hundred. It scrolls on the compositor; rows arrive ahead of
 *               the finger. Brands in their own colours, the rest in near
 *               black.
 *   CHOOSING    applies at once (the preview redraws with it), the chosen
 *               tile is ringed, and the sheet goes.
 */

import * as React from "react"
import { Check, ChevronLeft, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { LinkIcon } from "@/components/onepage/brand-icons"
import { LINK_ICONS, LINK_ICON_CATEGORIES, isLinkBrandIcon } from "@/components/onepage/link-icons"
import { PillTabs } from "@/components/onepage/pill-tabs"
import { tt } from "@/lib/i18n/text"

/** The categories' names, said through tt (the list in ./link-icons is data). */
function categoryLabel(id: string, fallback: string): string {
  switch (id) {
    case "all": return tt("All")
    case "platforms": return tt("Platforms")
    case "links": return tt("Links")
    case "social": return tt("Contact")
    case "media": return tt("Media")
    case "shopping": return tt("Shopping")
    case "favorites": return tt("Favorites")
    case "files": return tt("Files")
    case "time": return tt("Time")
    case "weather": return tt("Weather")
    case "tech": return tt("Tech")
    case "arrows": return tt("Arrows")
    case "status": return tt("Status")
    default: return fallback
  }
}

/* i18n-ignore-start: the English words a search also answers to. */
const ICON_WORDS: Record<string, string> = {
  twitter: "x tweet",
  mail: "email envelope newsletter",
  phone: "call telephone",
  dollar: "money price pay cash",
  "credit-card": "pay card money",
  shopping: "shop store bag buy",
  cart: "shop store buy",
  tag: "price sale",
  gift: "present free",
  "map-pin": "location place address",
  globe: "website web world",
  calendar: "date booking event",
  clock: "time hours",
  heart: "love like",
  star: "favorite rating review",
  music: "song audio",
  video: "film movie watch",
  camera: "photo picture",
  file: "document pdf",
  book: "guide ebook read",
  message: "chat dm text",
  "apple-music": "music song",
  "apple-podcasts": "podcast show",
  kofi: "tip coffee donate",
  buymeacoffee: "tip coffee donate",
  paypal: "pay money tip",
  cashapp: "pay money tip",
  venmo: "pay money tip",
  amazon: "shop store",
  etsy: "shop store",
  substack: "newsletter",
  "google-forms": "form survey",
  typeform: "form survey",
  "google-calendar": "booking calendar",
  calendly: "booking calendar",
}
/* i18n-ignore-end */

type IconItem = { id: string; name: string; words: string; brand: boolean }

const ITEMS: IconItem[] = LINK_ICONS.map((i) => ({
  id: i.id,
  name: i.name,
  words: `${i.name} ${i.id.replace(/-/g, " ")} ${ICON_WORDS[i.id] ?? ""}`.toLowerCase(),
  brand: isLinkBrandIcon(i.id),
}))
const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]))
const BY_CATEGORY = new Map<string, IconItem[]>(
  LINK_ICON_CATEGORIES.map((c) => [c.id, c.icons.map((id) => ITEM_BY_ID.get(id)).filter((i): i is IconItem => !!i)]),
)

/** One tile. Memoised: only `on` ever changes for the tile it is. */
const IconTile = React.memo(function IconTile({ item, on, onPick }: { item: IconItem; on: boolean; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      data-icon-tile={item.id}
      data-icon-on={on ? "" : undefined}
      aria-pressed={on}
      aria-label={item.name}
      title={item.name}
      onClick={() => onPick(item.id)}
      className={cn(
        "relative flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-1 outline-none [-webkit-tap-highlight-color:transparent]",
        "transition-[background-color,box-shadow] duration-150 ease-out focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.3)] motion-reduce:transition-none",
        on
          ? "bg-white shadow-[inset_0_0_0_1.5px_#1a1a2e,0_1px_3px_rgba(16,24,40,0.08)]"
          : "active:bg-[#f0f0f2] hover:bg-[#f6f6f7]",
      )}
    >
      <LinkIcon name={item.id} size={22} className="text-[#1a1a2e]" tone="brand" />
      <span aria-hidden className={cn("block w-full truncate text-center text-[10.5px] leading-[13px]", on ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{item.name}</span>
      {/* Round 40: the chosen one says so with a small check in its corner, as a picked swatch does. */}
      {on ? (
        <span aria-hidden data-icon-check="" className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[#1a1a2e] text-white animate-in fade-in-0 zoom-in-50 duration-150">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  )
})

/** Rows kept either side of what is on screen, so a quick flick finds them there. */
const OVERSCAN_ROWS = 3
const GAP = 6

/**
 * THE GRID, VIRTUAL. Square tiles in `cols` columns; the scroller's height
 * is every row's, and only the rows near the scroll position are in the
 * document, placed by one transform. The window moves a whole row at a time
 * (a scroll that stays inside a row renders nothing).
 */
function VirtualIconGrid({ items, cols, selected, onPick, scroller, resetKey }: { items: IconItem[]; cols: number; selected: string | null; onPick: (id: string) => void; scroller: React.RefObject<HTMLDivElement | null>; resetKey: string }) {
  const [width, setWidth] = React.useState(0)
  const [row, setRow] = React.useState(0)
  const [viewRows, setViewRows] = React.useState(10)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const tile = width ? (width - GAP * (cols - 1)) / cols : 64
  const rowH = tile + GAP
  const rowHRef = React.useRef(rowH)
  rowHRef.current = rowH

  React.useLayoutEffect(() => {
    const box = boxRef.current
    const sc = scroller.current
    if (!box || !sc) return
    const measure = () => {
      setWidth(box.clientWidth)
      setViewRows(Math.ceil(sc.clientHeight / rowHRef.current) + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    ro.observe(sc)
    const onScroll = () => {
      const next = Math.max(0, Math.floor((sc.scrollTop - box.offsetTop) / rowHRef.current))
      setRow((r) => (r === next ? r : next))
    }
    sc.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      ro.disconnect()
      sc.removeEventListener("scroll", onScroll)
    }
  }, [scroller])
  React.useEffect(() => setRow(0), [resetKey])

  const rows = Math.ceil(items.length / cols)
  const first = Math.max(0, row - OVERSCAN_ROWS)
  const last = Math.min(rows, row + viewRows + OVERSCAN_ROWS)
  const shown = items.slice(first * cols, last * cols)
  return (
    <div ref={boxRef} data-icon-rows={rows} className="relative w-full" style={{ height: rows ? rows * rowH - GAP : 0 }}>
      <div
        className="absolute inset-x-0 top-0 grid"
        style={{ transform: `translate3d(0, ${first * rowH}px, 0)`, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: `${tile}px`, gap: GAP }}
      >
        {shown.map((item) => (
          <IconTile key={item.id} item={item} on={selected === item.id} onPick={onPick} />
        ))}
      </div>
    </div>
  )
}

/* ─── On a phone: its own sheet, opened without rendering the Links tab ── */

let libraryOpen = false
const libraryListeners = new Set<() => void>()
/** Whether Choose icon's sheet is up on a phone (a store, as Add block's is: opening it renders the sheet, not the Links tab). */
export function setIconLibraryOpen(open: boolean): void {
  if (libraryOpen === open) return
  libraryOpen = open
  for (const fn of libraryListeners) fn()
}
export function useIconLibraryOpen(): boolean {
  return React.useSyncExternalStore(
    (fn) => {
      libraryListeners.add(fn)
      return () => { libraryListeners.delete(fn) }
    },
    () => libraryOpen,
    () => false,
  )
}
/** Renders its child with whether the phone's library sheet is up. */
export function IconLibraryGate({ children }: { children: (open: boolean) => React.ReactNode }) {
  return <>{children(useIconLibraryOpen())}</>
}

export function IconLibrary({
  selected,
  onSelect,
  open,
  onBack,
  phone,
}: {
  /** The link's icon now, ringed in the grid. */
  selected: string | null
  /** Applies it; the caller closes the sheet. */
  onSelect: (id: string) => void
  /** Whether it is on screen: the search and category go back once it has gone. */
  open: boolean
  /** The back arrow beside the title (to the thumbnail's choices). */
  onBack: () => void
  phone: boolean
}) {
  const [query, setQuery] = React.useState("")
  const [category, setCategory] = React.useState("all")
  const gridRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (open) return
    const t = window.setTimeout(() => {
      setQuery("")
      setCategory("all")
      if (gridRef.current) gridRef.current.scrollTop = 0
    }, 420)
    return () => window.clearTimeout(t)
  }, [open])

  const pickRef = React.useRef(onSelect)
  pickRef.current = onSelect
  const pick = React.useCallback((id: string) => pickRef.current(id), [])

  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const searching = words.length > 0
  const items = React.useMemo(
    () => (searching ? ITEMS.filter((i) => words.every((w) => i.words.includes(w))) : BY_CATEGORY.get(category) ?? ITEMS),
    [query, category], // eslint-disable-line react-hooks/exhaustive-deps
  )

  /* Storelib's pills (PillTabs, as Add block's chips and Settings): the haptic tick and the transition are theirs. */
  const choose = (id: string) => {
    setCategory(id)
    if (gridRef.current) gridRef.current.scrollTop = 0
  }
  const chips = React.useMemo(() => LINK_ICON_CATEGORIES.map((c) => ({ id: c.id, label: categoryLabel(c.id, c.label) })), [])

  return (
    <div data-icon-library="" className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3 sm:px-4 sm:pt-4">
        <button type="button" onClick={onBack} aria-label={tt("Back")} className="grid h-9 w-9 place-items-center rounded-lg text-[#1a1a2e] outline-none transition-[background-color] duration-150 active:bg-[#f0f0f2] hover:bg-[#f3f4f6]">
          <ChevronLeft aria-hidden className="h-5 w-5" />
        </button>
        <h2 className="text-[16px] font-semibold text-[#111113]">{tt("Choose icon")}</h2>
      </div>
      <div className="shrink-0 space-y-2.5 px-4 pb-3">
        <label className="relative block">
          <span className="sr-only">{tt("Search icons")}</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#9ca3af]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tt("Search icons")}
            enterKeyHint="search"
            autoComplete="off"
            data-icon-search=""
            className="h-11 w-full rounded-xl border border-[#e8e8ec] bg-[#f6f6f7] pl-10 pr-10 text-[16px] text-[#111113] outline-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14.5px] [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" aria-label={tt("Clear search")} onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#9ca3af]">
              <X aria-hidden className="h-4 w-4" />
            </button>
          ) : null}
        </label>
        <div hidden={searching}>
          <PillTabs
            dataRow="icon-categories"
            label={tt("Categories")}
            items={chips}
            value={category}
            onChange={choose}
            keepInView
            itemAttr="data-icon-chip"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            itemClassName="h-10 px-4 text-[13px] sm:h-9"
          />
        </div>
      </div>
      <div ref={gridRef} data-icon-grid="" className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[#f0f0f2] px-3 pb-6 pt-3 [contain:strict]", !phone && "h-[420px] flex-none")}>
        <VirtualIconGrid items={items} cols={phone ? 5 : 6} selected={selected} onPick={pick} scroller={gridRef} resetKey={`${category}|${query}`} />
        {searching && items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[14px] font-medium text-[#111113]">{tt("No icons found")}</p>
            <p className="mt-1 text-[13px] text-[#6b7280]">{tt("Try another word.")}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
