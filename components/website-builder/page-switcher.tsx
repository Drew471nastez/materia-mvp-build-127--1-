"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { Check, ChevronDown, Plus, RefreshCw, Search, Trash2, X } from "lucide-react"

import { AnchoredPanel } from "@/components/website-builder/anchored-panel"
import { OverlayRail } from "@/components/storefront/overlay-scroll"
import { PAGE_SEARCH_FROM, PRODUCTS_LISTED, groupPages, pageGroupOf, pageMatches, type PageGroupKey } from "@/lib/website-builder/page-groups"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  WHICH PAGE AM I EDITING
 * ===========================================================================
 *
 * One dark pill in the middle of the bar: reload on the left, the page's name
 * in the middle, a chevron on the right. The reload lives INSIDE the pill
 * rather than beside it because it acts on the page the pill names, and a
 * control that acts on a thing belongs on that thing.
 *
 * ONE LIST, IN GROUPS, WITH ONE SCROLL. "The pages are not organized into
 * categories, like Shopify has done it. It has sub-levels with sub scroll
 * bars, it's weird and bad." It had: the creator's pages folded away behind a
 * row of their own, the store's products behind another, and the first of
 * those scrolled inside the panel that was already scrolling. Now every page
 * is a row under the heading of the group it belongs to (Home, Shop,
 * Products, Pages, Customer accounts, Contact, Policies: see
 * lib/website-builder/page-groups.ts), in one list that is the only thing
 * that scrolls. A search at the top once there are more than a handful, the
 * page being edited ticked, Create page at the foot.
 *
 * The same list is the Pages tab of the sidebar and of the phone's sheet
 * (`PageList`, below), light there and 48px a row on a phone.
 *
 * NAMES ONLY. "It shows the URLs of those pages, /products, /search, I don't
 * want that." A row is the page's name; the address stays in the data
 * (`path`) for anything that needs it, and off the screen.
 *
 * THE BAR'S MENU FOLDS ITS GROUPS. Every group open made a menu taller than
 * the canvas ("too big"). There, each group is a heading row with its count
 * that opens and closes, and only the group holding the page being edited
 * starts open; a search opens every group with a match. The sidebar's list
 * is drawn the way the Pages tab was before the groups: each group a
 * bordered box of rows under a bold heading (`boxed`).
 */

export interface SwitcherPage {
  key: string
  name: string
  /** Where it lives, shown beside its name. */
  path: string
  /** Built-ins cannot be deleted; custom pages can. */
  custom?: boolean
}

export interface SwitcherProduct {
  id: string
  title: string
}

type Tone = "dark" | "light"

/** The two skins of one list: the bar's dark menu, and the sidebar's light panel. */
const SKIN: Record<Tone, {
  heading: string
  row: string
  rowOn: string
  detail: string
  check: string
  input: string
  empty: string
  action: string
  trash: string
}> = {
  dark: {
    heading: "text-white/45",
    row: "text-white/85 hover:bg-white/[0.06] hover:text-white",
    rowOn: "bg-white/[0.08] text-white",
    detail: "text-white/40",
    check: "text-white",
    input: "text-white placeholder:text-white/40 selection:bg-white/25",
    empty: "text-white/50",
    action: "text-white hover:bg-white/[0.08]",
    trash: "text-white/50 hover:bg-white/10 hover:text-white",
  },
  light: {
    heading: "text-[#6b7280]",
    row: "text-[#1a1a2e] hover:bg-[#f5f6f7] active:bg-[#f0f1f3]",
    rowOn: "bg-[#f3f4f6] font-medium text-[#1a1a2e]",
    detail: "text-[#9ca3af]",
    check: "text-[#1a1a2e]",
    input: "text-[#1a1a2e] placeholder:text-[#9ca3af]",
    empty: "text-[#6b7280]",
    action: "text-[#1a1a2e] hover:bg-[#f3f4f6] active:bg-[#eceef1]",
    trash: "text-[#9ca3af] hover:bg-[#eceef1] hover:text-[#1a1a2e]",
  },
}

/** The menu's exit, in globals.css (`.wb-pages-menu[data-state="closed"]`), and a frame to spare. */
const MENU_EXIT_MS = 140

/**
 * ===========================================================================
 *  ONE GRID, AND EVERY ROW ON IT
 * ===========================================================================
 * "This kind of UI misaligned should never happen." The menu was placed a
 * row at a time: a group's label started 34px into its section, its own
 * children's 28px, so a child's name sat six pixels to the LEFT of the group
 * it belongs to; and the children's highlights were pushed in by a `pl-4` on
 * their `ul` while the group's highlight ran the full width, so the
 * backgrounds stepped in and out down the list.
 *
 * One grid now, and nothing is placed off it:
 *
 *   ROW_PAD_X    12   a row's own side padding. Every row's background,
 *                     group rows included, runs the full width of the list's
 *                     content box, so the highlights are one clean column.
 *   CHEVRON_COL  22   the chevron on a group row plus its gap (14 + 8). A
 *                     group's label starts at ROW_PAD_X + CHEVRON_COL = 34.
 *   CHILD_STEP   12   how much further in a child's label sits than its
 *                     group's. One step, the same for every child: 46.
 *   The right column   a group's count, the tick on the page being edited
 *                     and a page's bin all end ROW_PAD_X from the row's
 *                     right edge, so the right side is one x as well.
 *
 * The classes below carry these numbers literally (Tailwind reads them from
 * the source, so they cannot be built at runtime); tests/library-and-pages
 * .test.ts pins them to this table, and scripts/check-builder-menu-align.mjs
 * measures the rendered menu against it.
 */
export const PAGE_MENU_GRID = {
  rowPadX: 12,
  chevronCol: 22,
  childStep: 12,
  /** Where a label starts, from the row's own left edge. */
  groupLabelX: 34,
  childLabelX: 46,
} as const

type RowItem =
  | { kind: "page"; page: SwitcherPage }
  | { kind: "product"; product: SwitcherProduct }
  | { kind: "more"; count: number }

/**
 * ===========================================================================
 *  THE LIST
 * ===========================================================================
 * `touch` is a phone: rows 48px tall, the search 44px with 16px type (iOS
 * zooms a page whose field is smaller), and a page's delete button always
 * showing, since there is no hover to find it by. Otherwise rows are 40px.
 */
export function PageList({
  pages,
  current,
  currentProduct = null,
  products = [],
  onSelect,
  onSelectProduct,
  onIntent,
  onCreate,
  onDelete,
  tone,
  touch = false,
  autoFocus = false,
  onDone,
  className,
  collapsible = false,
  boxed = false,
  onIntent,
}: {
  pages: SwitcherPage[]
  current: string
  /** The product standing in for the product page, by title. */
  currentProduct?: string | null
  products?: SwitcherProduct[]
  onSelect: (key: string) => void
  /** The product page, shown as this product. Without it the product page is one row, the template. */
  onSelectProduct?: (id: string) => void
  /**
   * A page is about to be chosen: the pointer rests on its row, the keyboard
   * reaches it, or a finger lands on it. The editor reads that page's
   * sections then, so the switch does not begin with a wait after the press.
   */
  onIntent?: (key: string) => void
  onCreate?: () => void
  onDelete?: (key: string) => void
  tone: Tone
  touch?: boolean
  /** Put the cursor in the search as the list appears (a computer's menu). */
  autoFocus?: boolean
  /** Called after a choice, so a menu can close. */
  onDone?: () => void
  className?: string
  /** Groups are headings that open and close; the current page's group starts open. */
  collapsible?: boolean
  /** Each group a bordered box of rows, the sidebar's look. */
  boxed?: boolean
  /** The pointer rests on a page's row (or the keyboard is on it): the page can be read before the press (round 25). */
  onIntent?: (key: string) => void
}) {
  const skin = SKIN[tone]
  const [query, setQuery] = useState("")
  const [allProducts, setAllProducts] = useState(false)
  /**
   * Which page is being asked about. Deleting a page deletes it and its
   * sections for good, so it asks first, in the row rather than in a dialog,
   * because the row is the thing.
   */
  const [confirming, setConfirming] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  /** The groups a person opened (collapsible only). The page being edited opens its own. */
  const [openGroups, setOpenGroups] = useState<Set<PageGroupKey>>(() => new Set([pageGroupOf(current)]))
  const toggleGroup = (k: PageGroupKey) =>
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const productRows = !!onSelectProduct && products.length > 0
  /* The product page is one row, or the store's products in its place. */
  const count = pages.length + (productRows ? products.length - (pages.some((p) => p.key === "product") ? 1 : 0) : 0)
  const searchable = count >= PAGE_SEARCH_FROM
  const searching = searchable && query.trim().length > 0

  const groups = useMemo(() => {
    const out: { key: PageGroupKey; label: string; rows: RowItem[] }[] = []
    for (const g of groupPages(pages)) {
      let rows: RowItem[]
      if (g.key === "products" && productRows) {
        const hits = products.filter((pr) => !searching || pageMatches({ name: pr.title }, query))
        /* A store with many products shows its first few and says how many more, and always the one being edited. */
        const cap = searching || allProducts || hits.length <= PRODUCTS_LISTED + 1 ? hits.length : PRODUCTS_LISTED
        const shown = hits.slice(0, cap)
        const on = current === "product" ? hits.find((pr) => pr.title === currentProduct) : undefined
        if (on && !shown.includes(on)) shown.push(on)
        rows = shown.map((product) => ({ kind: "product", product }))
        if (shown.length < hits.length) rows.push({ kind: "more", count: hits.length })
      } else {
        rows = g.pages.filter((p) => !searching || pageMatches(p, query)).map((page) => ({ kind: "page", page }))
      }
      if (rows.length) out.push({ key: g.key, label: g.label, rows })
    }
    return out
  }, [pages, products, productRows, searching, query, allProducts, current, currentProduct])

  /* The cursor in the search, a frame after the list appears, so it costs its entrance nothing. */
  useEffect(() => {
    if (!autoFocus || !searchable) return
    const raf = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(raf)
  }, [autoFocus, searchable])

  /**
   * The page being edited is in view when the list opens, even when it is a
   * policy at the foot: near the top, under its group's heading, because on a
   * phone the foot of the list can be below the screen at the sheet's middle
   * stop.
   */
  useLayoutEffect(() => {
    const box = scrollRef.current
    const on = box?.querySelector<HTMLElement>("[aria-current='page']")
    if (!box || !on) return
    const r = on.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    if (r.bottom > b.top + Math.min(b.height, 360) * 0.6) box.scrollTop += r.top - b.top - 36
    // Once, as it opens; afterwards the scroll is the person's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = (fn: () => void) => {
    fn()
    onDone?.()
  }

  /* Up and down between rows, from the search into the list and back. */
  const rowsIn = () => Array.from(scrollRef.current?.querySelectorAll<HTMLElement>("[data-page-row]") ?? [])
  const onListKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return
    /* In the search, Home and End move the caret, as they should. */
    if (e.target === searchRef.current && (e.key === "Home" || e.key === "End")) return
    const rows = rowsIn()
    if (!rows.length) return
    e.preventDefault()
    const at = rows.indexOf(document.activeElement as HTMLElement)
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : e.key === "ArrowDown" ? Math.min(rows.length - 1, at + 1) : at - 1
    if (next < 0) searchRef.current?.focus()
    else rows[next]?.focus()
  }

  /**
   * A row. `indented` is a child of a group heading, which is every row in
   * the collapsible menu: its label sits one step in from its group's, and
   * its background still runs the full width, so the highlights line up.
   */
  const rowClass = (on: boolean, indented = false) =>
    cn(
      "flex w-full min-w-0 items-center gap-3 text-left outline-none transition-colors duration-100",
      boxed ? "rounded-none" : "rounded-lg",
      "focus-visible:ring-2 focus-visible:ring-inset",
      tone === "dark" ? "focus-visible:ring-white/30" : "focus-visible:ring-[#1a1a2e]/20",
      touch ? "h-12 pr-14 text-[15px]" : "h-10 pr-10 text-[14px]",
      /* PAGE_MENU_GRID: 12 on its own, 46 under a group heading. */
      indented ? "pl-[46px]" : "pl-3",
      on ? skin.rowOn : skin.row,
    )
  /**
   * The slot on the right of every row, where the tick or a page's delete
   * goes. It is as wide as a thumb needs (44px), and its glyph is pushed to
   * the right column: 4px of offset plus 8px of padding is the same 12px a
   * group's count ends at, so ticks, bins and counts share one edge.
   */
  const slot = cn("right-1 justify-end pr-2", touch ? "w-11" : "w-8")

  const pageRow = (p: SwitcherPage, indented = false) => {
    const active = p.key === current && !(p.key === "product" && productRows)
    return (
      <li key={p.key} className="group/row relative">
        <button
          type="button"
          data-page-row={p.key}
          aria-current={active ? "page" : undefined}
          onPointerEnter={onIntent && !active ? (e) => { if (e.pointerType === "mouse") onIntent(p.key) } : undefined}
          onFocus={onIntent && !active ? () => onIntent(p.key) : undefined}
          onClick={() => choose(() => onSelect(p.key))}
          onPointerEnter={active || !onIntent ? undefined : (e) => { if (e.pointerType === "mouse") onIntent(p.key) }}
          onPointerDown={active || !onIntent ? undefined : () => onIntent(p.key)}
          onFocus={active || !onIntent ? undefined : () => onIntent(p.key)}
          className={rowClass(active, indented)}
        >
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
        </button>
        {active && (
          <span aria-hidden className={cn("pointer-events-none absolute top-1/2 flex -translate-y-1/2", slot, skin.check)}>
            <Check className="h-4 w-4" strokeWidth={2.25} />
          </span>
        )}
        {p.custom && onDelete && !active && (
          confirming === p.key ? (
            <div className={cn("absolute inset-y-1 right-1 flex items-center gap-1 rounded-md pl-2", tone === "dark" ? "bg-[#1f1f1f]" : "bg-white")}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(null)
                  onDelete(p.key)
                }}
                className={cn("rounded-md bg-[#e5484d] px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-[#d43b40]", touch ? "h-10" : "h-7")}
              >
                {tt("Delete")}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(null)
                }}
                className={cn("rounded-md px-2.5 text-[12px] transition-colors", touch ? "h-10" : "h-7", tone === "dark" ? "text-white/60 hover:text-white" : "text-[#6b7280] hover:text-[#1a1a2e]")}
              >
                {tt("Keep")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setConfirming(p.key)
              }}
              /**
               * Always there on a phone, which has no hover to find it by; on
               * a computer it comes up under the pointer and on focus, so the
               * list is not a column of bins.
               */
              className={cn(
                "absolute top-1/2 flex -translate-y-1/2 items-center rounded-md transition-[color,background-color,opacity]",
                slot,
                touch ? "h-11" : "h-8 opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100",
                skin.trash,
              )}
              aria-label={tt("Delete {name}", { name: p.name })}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )
        )}
      </li>
    )
  }

  const productRow = (pr: SwitcherProduct, indented = false) => {
    const active = current === "product" && currentProduct === pr.title
    return (
      <li key={`product:${pr.id}`} className="relative">
        <button
          type="button"
          data-page-row={`product:${pr.id}`}
          aria-current={active ? "page" : undefined}
          onClick={() => choose(() => onSelectProduct?.(pr.id))}
          className={rowClass(active, indented)}
        >
          <span className="min-w-0 flex-1 truncate">{pr.title}</span>
        </button>
        {active && (
          <span aria-hidden className={cn("pointer-events-none absolute top-1/2 flex -translate-y-1/2", slot, skin.check)}>
            <Check className="h-4 w-4" strokeWidth={2.25} />
          </span>
        )}
      </li>
    )
  }

  const moreRow = (n: number, indented = false) => (
    <li key="more">
      <button
        type="button"
        data-page-row="more"
        onClick={() => setAllProducts(true)}
        className={cn(rowClass(false, indented), "font-medium", tone === "dark" ? "text-white/60" : "text-[#6b7280]")}
      >
        {tt("Show all {n} products", { n })}
      </button>
    </li>
  )

  const light = tone === "light"
  /**
   * The light list's side padding, measured once here and used by both the
   * search above the list and the list itself, so the search box is exactly
   * as wide as the rows under it.
   */
  const sidePad = boxed ? (touch ? "px-4" : "px-3") : "px-2"
  return (
    <div data-page-list="" className={cn("flex min-h-0 flex-col", className)} onKeyDown={onListKey}>
      {searchable &&
        (light ? (
          <div className={cn("shrink-0", sidePad, touch ? "pb-2 pt-1" : "pb-2 pt-3")}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") rowsIn()[0]?.click()
                }}
                placeholder={tt("Search pages")}
                aria-label={tt("Search pages")}
                className={cn(
                  "w-full rounded-lg border border-[#e5e7eb] bg-white pl-9 pr-9 focus:border-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-black/5 [&::-webkit-search-cancel-button]:hidden",
                  touch ? "h-11 text-[16px]" : "h-9 text-[14px]",
                  skin.input,
                )}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    searchRef.current?.focus()
                  }}
                  aria-label={tt("Clear the search")}
                  className={cn("absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a2e]", touch ? "h-10 w-10" : "h-7 w-7")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* pl-3.5 puts what is typed at 40px, where a group's label starts; pr-4 puts the clear button's glyph on the counts' column. */
          <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-white/10 pl-3.5 pr-4">
            <Search className="h-4 w-4 shrink-0 text-white/50" strokeWidth={2} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") rowsIn()[0]?.click()
              }}
              placeholder={tt("Search pages")}
              aria-label={tt("Search pages")}
              className={cn("min-w-0 flex-1 bg-transparent text-[14px] outline-none", skin.input)}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("")
                  searchRef.current?.focus()
                }}
                className="rounded p-0.5 text-white/50 transition-colors hover:text-white"
                aria-label={tt("Clear the search")}
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
          </div>
        ))}

      {/**
        * THE ONE THING THAT SCROLLS. Groups are headings in it, not boxes of their own.
        *
        * On the bar's dark menu the platform's bar is hidden and a 6px thumb
        * is drawn over the rows instead (OverlayRail). Chrome's thin bar took
        * 10px of the list the moment it could scroll, so every row, the
        * ticked one included, ended 17px from the menu's edge on the right
        * and 7px on the left, and the counts moved in. The thumb takes no
        * width: a long menu has the same edges as a short one
        * (scripts/check-page-menu-scroll.mjs). The light list keeps the
        * sidebar's slim bar, where a reserved column is invisible.
        */}
      <div className={cn("relative flex min-h-0 flex-col", light && "flex-1")}>
      <div
        ref={scrollRef}
        data-page-list-scroll=""
        data-sheet-scroll=""
        className={cn(
          "min-h-0 overflow-y-auto overscroll-contain",
          light
            ? cn("wb-slim-scroll flex-1", sidePad, touch ? "pb-6" : "pb-4")
            : /* Ten rows at most on a tall window, and always room for the search, the foot and a gutter. */
              "cp-overlay-scroll max-h-[min(400px,calc(100dvh-200px))] p-1.5",
        )}
      >
        {groups.map((g, i) => {
          /* In the collapsible menu every row is a child of its group heading, so it takes the child indent. */
          const rows = g.rows.map((row) =>
            row.kind === "page" ? pageRow(row.page, collapsible) : row.kind === "product" ? productRow(row.product, collapsible) : moreRow(row.count, collapsible),
          )
          const createAction = light && g.key === "pages" && onCreate && (
            <button
              type="button"
              onClick={onCreate}
              className={cn("-mr-2 flex items-center gap-1 rounded-md px-2 text-[13px] font-medium", touch ? "h-11" : "h-7", skin.action)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
              {tt("Create page")}
            </button>
          )
          if (collapsible) {
            const expanded = searching || openGroups.has(g.key)
            const count = g.rows.reduce((n, r) => n + (r.kind === "more" ? 0 : 1), 0)
            return (
              <section key={g.key} data-page-group={g.key} aria-label={g.label} className={i === 0 ? "" : "mt-0.5"}>
                <button
                  type="button"
                  data-page-group-toggle={g.key}
                  aria-expanded={expanded}
                  onClick={() => toggleGroup(g.key)}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] font-medium outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-inset",
                    tone === "dark" ? "text-white/80 hover:bg-white/[0.06] focus-visible:ring-white/30" : "text-[#1a1a2e] hover:bg-[#f5f6f7] focus-visible:ring-[#1a1a2e]/20",
                  )}
                >
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", expanded ? "rotate-0" : "-rotate-90", skin.detail)}
                    strokeWidth={2.25}
                  />
                  <span className="min-w-0 flex-1 truncate">{g.label}</span>
                  <span className={cn("text-[12px] font-normal tabular-nums", skin.detail)}>{count}</span>
                </button>
                {/* Opens by its rows' height on the grid, so the menu grows smoothly instead of jumping. */}
                <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <div className="min-h-0 overflow-hidden" inert={!expanded}>
                    {/* No padding of its own: a child's indent is in its row, so its highlight keeps its group's edges. */}
                    <ul role="list" className="pb-1">{rows}</ul>
                  </div>
                </div>
              </section>
            )
          }
          if (boxed) {
            return (
              <section key={g.key} data-page-group={g.key} aria-label={g.label} className={i === 0 ? "pt-1" : "pt-4"}>
                {/* 13px: the box's border and a row's 12px padding, so the heading starts where the rows' names do. */}
                <div className={cn("flex items-center justify-between px-[13px]", touch ? "min-h-8 pb-1" : "pb-1.5")}>
                  <h3 className="text-[12px] font-semibold text-[#1a1a2e]">{g.label}</h3>
                  {createAction}
                </div>
                <ul role="list" className="overflow-hidden rounded-lg border border-[#e5e7eb] bg-white divide-y divide-[#eef0f2]">
                  {rows}
                </ul>
              </section>
            )
          }
          return (
            <section key={g.key} data-page-group={g.key} aria-label={g.label}>
              <div className={cn("flex items-center justify-between px-3", i === 0 ? "pt-1" : "pt-3", touch ? "min-h-8 pb-0.5" : "pb-1")}>
                <h3 className={cn("text-[12px] font-medium", skin.heading)}>{g.label}</h3>
                {/* Light panels have no foot to hold it: Create page is where the pages it makes will be. */}
                {createAction}
              </div>
              <ul role="list">{rows}</ul>
            </section>
          )
        })}
        {groups.length === 0 && (
          <p className={cn("px-3 py-8 text-center text-[14px]", skin.empty)}>{tt("No page matches “{value}”", { value: query.trim() })}</p>
        )}
      </div>
      {!light && <OverlayRail scrollerRef={scrollRef} tone="dark" />}
      </div>

      {!light && onCreate && (
        /* p-1.5, the list's own padding, so this row's background has the same left and right edges as the rows above it. */
        <div className="shrink-0 border-t border-white/10 p-1.5">
          <button
            type="button"
            onClick={() => choose(onCreate)}
            /* 12 + 16 + 6 = 34: the plus sits in the chevrons' column and the words start where a group's label does. */
            className={cn("flex h-10 w-full items-center gap-1.5 rounded-lg px-3 text-left text-[14px] font-medium transition-colors", skin.action)}
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
            {tt("Create page")}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * ===========================================================================
 *  THE PILL, AND THE MENU IT OPENS
 * ===========================================================================
 * Opening and closing is opacity and a short drop, both on the compositor
 * (`.wb-pages-menu` in globals.css), so nothing is laid out for them. The
 * menu is built as it opens, from its closed look (@starting-style), and
 * kept for the length of its exit, `inert`, so a close plays to the end
 * rather than vanishing; then it goes. Kept any longer it would follow the
 * pill through every scroll of the canvas while nobody could see it. Built
 * fresh each time, its search is empty and the page being edited in view.
 */
export function PageSwitcher({
  pages,
  current,
  onSelect,
  onCreate,
  onDelete,
  onReload,
  reloading,
  disabled,
  products = [],
  currentProduct = null,
  onSelectProduct,
  onIntent,
}: {
  pages: SwitcherPage[]
  current: string
  onSelect: (key: string) => void
  /** A page is about to be chosen (PageList's onIntent). */
  onIntent?: (key: string) => void
  onCreate: () => void
  onDelete?: (key: string) => void
  onReload: () => void
  reloading?: boolean
  disabled?: boolean
  /** The store's products, so the product page can be previewed AS one of
   *  them rather than as a template with placeholder data. */
  products?: SwitcherProduct[]
  /** The product currently standing in for the product page, by title. */
  currentProduct?: string | null
  onSelectProduct?: (id: string) => void
  /** A page's row under the pointer (PageList onIntent). */
  onIntent?: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  /** In the page while open, and for as long as its close takes. */
  const [present, setPresent] = useState(false)
  if (open && !present) setPresent(true)
  useEffect(() => {
    if (open || !present) return
    const id = window.setTimeout(() => setPresent(false), MENU_EXIT_MS)
    return () => window.clearTimeout(id)
  }, [open, present])
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** The pill the menu hangs from, and the menu itself, which is portalled
   *  out of this component's own subtree and so is not inside `rootRef`. */
  const pillRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      // The menu lives in `document.body`, so "inside the component" is two
      // places. Checking only the first closed the menu on every click in it.
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      /* Back to the pill, which is where the keyboard came from. */
      if (menuRef.current?.contains(document.activeElement)) triggerRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const currentPage = pages.find((p) => p.key === current)

  return (
    <div ref={rootRef} className="relative min-w-0">
      {/* The pill. Reload is a button inside a button-shaped container, so it
          is a sibling of the trigger rather than nested in it: a button inside
          a button is invalid markup and reads as one target to a screen
          reader. */}
      <div
        ref={pillRef}
        className={cn(
          // Slim, like the mode pill beside it. At h-9 it was the tallest
          // thing on a 48px bar and read as a field rather than a label.
          "flex h-7 min-w-[220px] max-w-[380px] items-center rounded-full border border-white/10 bg-white/[0.07] pl-1 pr-2.5 transition-colors",
          open && "bg-white/[0.11]",
          disabled && "opacity-50",
        )}
      >
        <button
          type="button"
          onClick={onReload}
          disabled={disabled}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={tt("Reload preview")}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", reloading && "animate-spin")} strokeWidth={2} />
        </button>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          data-page-switcher=""
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex h-full min-w-0 flex-1 items-center gap-2 pl-1 text-[12.5px] font-medium text-white"
        >
          <span className="min-w-0 flex-1 truncate text-center">
            {current === "product" && currentProduct ? currentProduct : (currentPage?.name ?? tt("Page"))}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-white/60 transition-transform duration-200", open && "rotate-180")}
            strokeWidth={2}
          />
        </button>
      </div>

      {present && (
        /**
         * Portalled out of the top bar. The bar is `relative z-50`, so a
         * panel rendered inside it is one layer at 50 no matter what it
         * declares, and the code editor's pane at z-[80] painted straight
         * over this one the same way it did over the Publish panel.
         */
        <AnchoredPanel
          anchorRef={pillRef}
          align="center"
          gap={8}
          panelRef={menuRef}
          role="dialog"
          aria-label={tt("Pages")}
          data-state={open ? "open" : "closed"}
          className="wb-pages-menu flex w-[280px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1f1f1f] text-white shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)]"
        >
          {/* `inert` while closed: out of the tab order and the accessibility tree. */}
          <div inert={!open} className="flex min-h-0 flex-col">
            <PageList
              tone="dark"
              pages={pages}
              current={current}
              currentProduct={currentProduct}
              products={products}
              onSelect={onSelect}
              onSelectProduct={onSelectProduct}
              onIntent={onIntent}
              onCreate={onCreate}
              onDelete={onDelete}
              onIntent={onIntent}
              collapsible
              autoFocus
              onDone={() => {
                setOpen(false)
                /* A choice made from the keyboard leaves the keyboard on the pill, not on a row that is going. */
                if (menuRef.current?.contains(document.activeElement)) triggerRef.current?.focus({ preventScroll: true })
              }}
            />
          </div>
        </AnchoredPanel>
      )}
    </div>
  )
}
