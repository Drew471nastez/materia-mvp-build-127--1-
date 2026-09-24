"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Home,
  Info,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react"

import { AnchoredPanel } from "@/components/website-builder/anchored-panel"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  WHICH PAGE AM I EDITING
 * ===========================================================================
 *
 * One dark pill in the middle of the bar: reload on the left, the page's path
 * in the middle, a chevron on the right. The reload lives INSIDE the pill
 * rather than beside it because it acts on the page the pill names, and a
 * control that acts on a thing belongs on that thing.
 *
 * The panel underneath is grouped the way a store is grouped, not the way the
 * database is: the pages everybody has, then the ones this seller made, then
 * the product page. Groups with more than one member fold, so a seller with
 * thirty pages is not scrolling past them to reach the product page.
 */

export interface SwitcherPage {
  key: string
  name: string
  /** Where it lives, shown as the pill's label. */
  path: string
  /** Built-ins cannot be deleted; custom pages can. */
  custom?: boolean
}

const ICONS: Record<string, typeof Home> = {
  home: Home,
  product: ShoppingBag,
  about: Info,
  contact: Mail,
}

export interface SwitcherProduct {
  id: string
  title: string
}

/** How many of your own pages are listed before the group scrolls. */
const PAGES_BEFORE_SCROLL = 3

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
}: {
  pages: SwitcherPage[]
  current: string
  onSelect: (key: string) => void
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
  onSelectProduct?: (title: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  /**
   * Which page is being asked about. Deleting a page used to only take it
   * out of the list until the next reload, so a stray click cost nothing;
   * it now deletes the page and its sections for good, so it asks first.
   * In the row rather than in a dialog, because the row is the thing.
   */
  const [confirming, setConfirming] = useState<string | null>(null)
  /**
   * SHUT, like the products group beside it.
   *
   * It used to open by default on the reasoning that a folded group of your
   * own pages is one you unfold every time. That was true when the group was
   * pages somebody had made on purpose; every site now ships three policy
   * pages, so the default state was a list of legal pages covering the pages
   * somebody actually works on.
   */
  const [yoursOpen, setYoursOpen] = useState(false)
  const [productsOpen, setProductsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** The pill the menu hangs from, and the menu itself, which is portalled
   *  out of this component's own subtree and so is not inside `rootRef`. */
  const pillRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      // The menu lives in `document.body` now, so "inside the component" is
      // two places. Checking only the first closed the menu on every click
      // in it.
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    setConfirming(null)
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  // The field is pre-filled with the current path and selected, the way an
  // address bar behaves: one keystroke replaces it, Escape keeps it.
  useEffect(() => {
    if (open) {
      setQuery(pages.find((p) => p.key === current)?.path ?? "")
      const id = window.setTimeout(() => {
        searchRef.current?.focus({ preventScroll: true })
        searchRef.current?.select()
      }, 40)
      return () => window.clearTimeout(id)
    }
  }, [open, current, pages])

  const currentPage = pages.find((p) => p.key === current)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cur = currentPage?.path.toLowerCase()
    // The pre-filled current path is not a filter, it is a prompt.
    const active = q && q !== cur
    return pages.filter((p) => !active || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q))
  }, [pages, query, currentPage])

  const builtIn = filtered.filter((p) => !p.custom && p.key !== "product")
  const yours = filtered.filter((p) => p.custom)
  const product = filtered.find((p) => p.key === "product")

  const row = (p: SwitcherPage, indent = false) => {
    const Icon = ICONS[p.key] ?? FileText
    const active = p.key === current
    return (
      <div key={p.key} className="group/row relative">
        <button
          type="button"
          onClick={() => {
            onSelect(p.key)
            setOpen(false)
          }}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg py-2 pr-2.5 text-left text-[14px] transition-colors",
            indent ? "pl-9" : "pl-2.5",
            active ? "bg-white/[0.08] text-white" : "text-white/85 hover:bg-white/[0.06] hover:text-white",
          )}
        >
          {active ? (
            <Check className="h-4 w-4 shrink-0" strokeWidth={2.25} />
          ) : (
            <Icon className="h-4 w-4 shrink-0 opacity-60" strokeWidth={1.75} />
          )}
          <span className="min-w-0 flex-1 truncate">{p.path}</span>
        </button>
        {p.custom && onDelete && !active && (
          confirming === p.key ? (
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(null)
                  onDelete(p.key)
                }}
                className="rounded-md bg-[#e5484d] px-2 py-1 text-[12px] font-medium text-white transition-colors hover:bg-[#d43b40]"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(null)
                }}
                className="rounded-md px-2 py-1 text-[12px] text-white/60 transition-colors hover:text-white"
              >
                Keep
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
               * Shown on hover on a pointer, and always on a touch screen.
               * It was hover-only everywhere, which on a phone is a button
               * with no way to reach it: custom pages could not be deleted
               * there at all.
               */
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-white/50 opacity-100 transition-[color,background-color,opacity] hover:bg-white/10 hover:text-white focus-visible:opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100"
              aria-label={`Delete ${p.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )
        )}
      </div>
    )
  }

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
          aria-label="Reload preview"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", reloading && "animate-spin")} strokeWidth={2} />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-full min-w-0 flex-1 items-center gap-2 pl-1 text-[12.5px] font-medium text-white"
        >
          <span className="min-w-0 flex-1 truncate text-center">
            {current === "product" && currentProduct ? currentProduct : (currentPage?.name ?? "Page")}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-white/60 transition-transform duration-200", open && "rotate-180")}
            strokeWidth={2}
          />
        </button>
      </div>

      {open && (
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
          role="menu"
          className={cn(
            "flex w-[300px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1f1f1f] text-white shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)]",
            "origin-top animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150",
          )}
        >
          <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-white/50" strokeWidth={2} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none selection:bg-white/25 placeholder:text-white/40"
            />
            <button
              type="button"
              onClick={() => (query ? setQuery("") : setOpen(false))}
              className="rounded p-0.5 text-white/50 transition-colors hover:text-white"
              aria-label={query ? "Clear search" : "Close"}
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="wb-slim-scroll max-h-[360px] min-h-0 flex-1 overflow-y-auto p-2">
            {builtIn.map((p) => row(p))}

            {/* The seller's own pages fold, because this is the group that
                grows, and it is shut until asked. */}
            {yours.length > 0 && (
              <>
                <div className="mx-1 my-1.5 border-t border-white/10" />
                <button
                  type="button"
                  onClick={() => setYoursOpen((v) => !v)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <FileText className="h-4 w-4 shrink-0 opacity-60" strokeWidth={1.75} />
                  <span className="flex-1">Pages</span>
                  <span className="text-[12px] text-white/40">{yours.length}</span>
                  <ChevronRight
                    className={cn("h-4 w-4 text-white/50 transition-transform duration-200", yoursOpen && "rotate-90")}
                    strokeWidth={2}
                  />
                </button>
                {/**
                  * THREE, THEN IT SCROLLS INSIDE ITSELF.
                  *
                  * Unfolded, this group is as long as the site has pages, and
                  * it pushed Products and everything under it off the bottom
                  * of a panel that is already scrolling. A nested scroller is
                  * usually a mistake; here it is what keeps the groups BELOW
                  * this one reachable without collapsing it first.
                  *
                  * The height is three rows exactly, so the fourth is half
                  * visible and the list reads as continuing rather than
                  * ending.
                  */}
                {yoursOpen && (
                  <div
                    className={cn(yours.length > PAGES_BEFORE_SCROLL && "wb-slim-scroll max-h-[132px] overflow-y-auto overscroll-contain")}
                  >
                    {yours.map((p) => row(p, true))}
                  </div>
                )}
              </>
            )}

            {product && (
              <>
                <div className="mx-1 my-1.5 border-t border-white/10" />
                {/* The product page is a template until a product stands in
                    for it. The fold lists the store's products; picking one
                    opens the product page showing THAT product, which is the
                    only way to see what a buyer will see. */}
                {products.length > 0 && onSelectProduct ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setProductsOpen((v) => !v)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] transition-colors",
                        current === "product" ? "bg-white/[0.08] text-white" : "text-white/85 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      {current === "product" ? (
                        <Check className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                      ) : (
                        <ShoppingBag className="h-4 w-4 shrink-0 opacity-60" strokeWidth={1.75} />
                      )}
                      <span className="flex-1">Products</span>
                      <span className="text-[12px] text-white/40">{products.length}</span>
                      <ChevronRight
                        className={cn("h-4 w-4 text-white/50 transition-transform duration-200", productsOpen && "rotate-90")}
                        strokeWidth={2}
                      />
                    </button>
                    {productsOpen &&
                      products.map((pr) => {
                        const active = current === "product" && currentProduct === pr.title
                        return (
                          <button
                            key={pr.id}
                            type="button"
                            onClick={() => {
                              onSelectProduct(pr.title)
                              setOpen(false)
                            }}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg py-2 pl-9 pr-2.5 text-left text-[14px] transition-colors",
                              active ? "bg-white/[0.08] text-white" : "text-white/85 hover:bg-white/[0.06] hover:text-white",
                            )}
                          >
                            {active && <Check className="h-4 w-4 shrink-0" strokeWidth={2.25} />}
                            <span className="min-w-0 flex-1 truncate">{pr.title}</span>
                          </button>
                        )
                      })}
                  </>
                ) : (
                  row(product)
                )}
              </>
            )}

            {filtered.length === 0 && (
              <p className="px-2.5 py-6 text-center text-[14px] text-white/50">No page matches that.</p>
            )}
          </div>

          <div className="border-t border-white/10 p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onCreate()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] font-medium text-white transition-colors hover:bg-white/[0.08]"
            >
              <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
              Create page
            </button>
          </div>
        </AnchoredPanel>
      )}
    </div>
  )
}
