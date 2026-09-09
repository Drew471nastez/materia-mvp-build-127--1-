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
  Search,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  WHICH PAGE AM I EDITING
 * ===========================================================================
 *
 * The page you are on is the single most important fact in an editor, and it
 * used to be a button on a rail with a panel behind it — two clicks and a
 * change of context to answer "where am I". It belongs in the middle of the
 * bar, named, with everything else arranged around it: the thing you look at
 * to know where you are should be the thing in the middle.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A LIST WITH GROUPS RATHER THAN A FLAT MENU
 * ---------------------------------------------------------------------------
 * Four built-in pages is a flat menu. Four built-in pages plus however many
 * the seller has made is not: the built-ins never change and the custom ones
 * are the ones being worked on, and mixing them means the list reorders itself
 * as somebody works. So they are two groups with a rule between them, and the
 * custom group is the one that grows.
 *
 * Search filters both. It is shown from four items up, which is the point at
 * which reading a list stops being faster than typing.
 */

export interface SwitcherPage {
  key: string
  name: string
  /** Built-ins cannot be deleted; custom pages can. */
  custom?: boolean
}

const ICONS: Record<string, typeof Home> = {
  home: Home,
  product: ShoppingBag,
  about: Info,
  contact: Mail,
}

export function PageSwitcher({
  pages,
  current,
  onSelect,
  onCreate,
  onDelete,
  disabled,
}: {
  pages: SwitcherPage[]
  current: string
  onSelect: (key: string) => void
  onCreate: () => void
  onDelete?: (key: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  /**
   * Closing on an outside press and on Escape, both. A popover that only
   * closes by pressing its own trigger again is one somebody ends up clicking
   * through the page to dismiss.
   */
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  // The field is where the hands already are when a list is long enough to
  // need one; focusing it is what makes the search worth having.
  useEffect(() => {
    if (open && pages.length > 4) {
      const id = window.setTimeout(() => searchRef.current?.focus(), 60)
      return () => window.clearTimeout(id)
    }
    if (!open) setQuery("")
  }, [open, pages.length])

  const currentName = pages.find((p) => p.key === current)?.name ?? "Page"

  const [builtIn, custom] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (p: SwitcherPage) => !q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)
    return [pages.filter((p) => !p.custom && match(p)), pages.filter((p) => p.custom && match(p))]
  }, [pages, query])

  const row = (p: SwitcherPage) => {
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
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors",
            active ? "bg-muted font-medium text-foreground" : "text-foreground/80 hover:bg-muted/70",
          )}
        >
          <Icon className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          {active && <Check className="h-4 w-4 shrink-0 text-foreground" strokeWidth={2} />}
        </button>
        {/* Delete sits on the row rather than behind a menu: a custom page is
            a thing somebody made by accident as often as on purpose. Built-ins
            have no delete at all, because "cannot" is better said by absence
            than by a disabled control. */}
        {p.custom && onDelete && !active && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(p.key)
            }}
            className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 group-hover/row:block"
            aria-label={`Delete ${p.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-8 min-w-0 max-w-[240px] items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium transition-colors",
          "text-foreground hover:bg-muted disabled:opacity-50",
          open && "bg-muted",
        )}
      >
        <span className="min-w-0 truncate">{currentName}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-200", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          role="menu"
          /**
           * Grown from the trigger rather than faded in place: the panel comes
           * from the control that opened it, which is what makes it read as
           * that control's contents rather than as a dialog that happened to
           * appear. 140ms, because a menu that takes longer than a glance is a
           * menu you wait for.
           */
          className={cn(
            "absolute left-1/2 top-full z-50 mt-1.5 w-[280px] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-lg",
            "origin-top animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-140",
          )}
        >
          {pages.length > 4 && (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
          )}

          <div className="wb-slim-scroll max-h-[320px] overflow-y-auto p-1.5">
            {builtIn.map(row)}

            {custom.length > 0 && (
              <>
                <div className="mx-1 my-1.5 border-t border-border" />
                <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Your pages
                </p>
                {custom.map(row)}
              </>
            )}

            {builtIn.length === 0 && custom.length === 0 && (
              <p className="px-2.5 py-6 text-center text-[13px] text-muted-foreground">No page matches that.</p>
            )}
          </div>

          <div className="border-t border-border p-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onCreate()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
              Create page
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Exported for the guard, and so the chevron has one definition. */
export { ChevronRight }
