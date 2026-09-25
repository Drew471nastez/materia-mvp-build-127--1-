"use client"

/**
 * ===========================================================================
 *  THE CATEGORY BROWSER
 * ===========================================================================
 * "Its look, its icons and how it appears are not liked." The More pill on
 * Explore and the header's category menu both opened a list that grew
 * accordions in place, with a line icon beside every row. This is the one
 * list both use now, shaped like the product editor's category picker
 * (app/app/products/new/category-picker.tsx), which the owner pointed at as
 * the one done right:
 *
 *   plain rows, no icons beside them; a chevron says a row opens, a check
 *   says which one you are on
 *
 *   a category with subcategories opens into a level of its own, with a back
 *   row on top. The two levels CROSS: the old one fades as it drifts a
 *   little left, the new one fades in as it settles from a little right, and
 *   back reverses it. Each level is its own scroller, so coming back puts
 *   you where you were in the list
 *
 *   an optional search on top, which finds a category or a subcategory by
 *   name and chooses it on Enter
 *
 * It lays itself out in whatever box it is given (`flex-1 min-h-0` inside a
 * box of a definite height): a popover on a computer, the shared bottom
 * sheet (components/ui/bottom-sheet.tsx) in `fill` mode on a phone. The
 * levels move by transform and opacity only, so a change of level never lays
 * anything out and never touches the sheet's own drag.
 *
 * Data-agnostic: Explore gives it its CATEGORIES, the header gives it its
 * own list, and each decides what a pick does.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export type BrowseItem = { id: string; label: string }
export type BrowseGroup = { id: string; label: string; items: readonly BrowseItem[] }

/**
 * THE CROSS, NOT A SLIDE. The levels used to slide the whole width: the new
 * one came in from the right with a shadow along its edge while the old one
 * slid a third of the way out and dimmed. "Too laggy", and the shadow read
 * as a bar coming in. A full width move is a long way for the eye to follow
 * on a list this simple, and the blurred edge was re-rastered on every frame
 * of it.
 *
 * Now each level moves a few pixels and fades: the one leaving goes quickly,
 * the one arriving follows a moment later and settles on the sheet's own
 * curve, so the two are barely on screen together. Transform and opacity
 * only, nothing laid out and nothing re-rastered.
 */
export const BROWSE_SLIDE_MS = 280
/** The level arriving fades in over this, a moment after the one leaving starts to go. */
const FADE_IN_MS = 220
const FADE_DELAY_MS = 50
/** The level leaving is gone before the one arriving is half in. */
const FADE_OUT_MS = 140
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** How far each level travels: the one opening comes from the right, the one it covers drifts left. */
const SHIFT_IN = "24px"
const SHIFT_OUT = "-16px"

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/**
 * Whether the pointer is on a computer, by the width the rest of Explore
 * uses for the same decision (md, 768px). False on the server and on the
 * first render, which is fine: nothing using it is open on arrival.
 */
export function useDesktop(query = "(min-width: 768px)") {
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setDesktop(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [query])
  return desktop
}

/* ── Drawn here rather than taken from an icon set: two strokes and a tick. */
export function Chevron({ dir = "right", className }: { dir?: "right" | "left" | "down"; className?: string }) {
  const d = dir === "right" ? "M6 3.5 10.5 8 6 12.5" : dir === "left" ? "M10 3.5 5.5 8l4.5 4.5" : "M3.5 6 8 10.5 12.5 6"
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={cn("h-4 w-4 shrink-0", className)}>
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Tick({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={cn("h-4 w-4 shrink-0", className)}>
      <path d="M3.5 8.4 6.6 11.4 12.5 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Magnifier({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={cn("h-4 w-4 shrink-0", className)}>
      <circle cx="7.2" cy="7.2" r="4.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.6 10.6 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export type Found = { group: BrowseGroup; item: BrowseItem | null }

/** Word starts first, then anywhere; a group's own name before what is in it. */
export function findInGroups(groups: readonly BrowseGroup[], query: string): Found[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const starts: Found[] = []
  const inside: Found[] = []
  const put = (label: string, f: Found) => {
    const l = label.toLowerCase()
    if (l.startsWith(q) || l.includes(` ${q}`)) starts.push(f)
    else if (l.includes(q)) inside.push(f)
  }
  for (const g of groups) {
    put(g.label, { group: g, item: null })
    for (const it of g.items) put(it.label, { group: g, item: it })
  }
  return [...starts, ...inside]
}

export function CategoryBrowser({
  groups,
  selectedGroup,
  selectedItem,
  onPick,
  phone,
  search = false,
  searchInHeader = false,
  query: controlledQuery,
  onQueryChange,
  allRow,
  heading,
  rootTop,
  rootBottom,
  autoFocusSearch = false,
  className,
}: {
  groups: readonly BrowseGroup[]
  /** The group that is on, or null for none. */
  selectedGroup: string | null
  /** The item in it that is on, or null for all of it. */
  selectedItem: string | null
  /** A group with no item is "all of it". */
  onPick: (groupId: string, itemId: string | null) => void
  /** 48px rows and 16px text on a phone, 36px and 14px on a computer. */
  phone: boolean
  /** A search field above the list. */
  search?: boolean
  /** The field is drawn by the caller (in a sheet's header), which then owns the text. */
  searchInHeader?: boolean
  query?: string
  onQueryChange?: (q: string) => void
  /** A first row that clears the category: "All categories". */
  allRow?: { id: string; label: string }
  /** A small label over the list. */
  heading?: string
  /** Scrolls with the first level, above and below its rows (a menu's other links). */
  rootTop?: React.ReactNode
  rootBottom?: React.ReactNode
  autoFocusSearch?: boolean
  className?: string
}) {
  const [ownQuery, setOwnQuery] = useState("")
  const query = controlledQuery ?? ownQuery
  const setQuery = onQueryChange ?? setOwnQuery
  /* Which level is showing, and which group the second level holds. The
     second is kept after going back so it still has rows while it slides out. */
  const [open, setOpen] = useState<string | null>(null)
  const [held, setHeld] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const lastOpened = useRef<string | null>(null)
  const listId = useId()

  const found = useMemo(() => (query.trim() ? findInGroups(groups, query) : null), [groups, query])
  const heldGroup = groups.find((g) => g.id === held) ?? null
  const inSub = open !== null && !found

  /* Typing is a question about the whole list, so it answers from the top level. */
  useEffect(() => {
    if (found) setOpen(null)
  }, [found])

  const drillIn = useCallback((id: string) => {
    lastOpened.current = id
    setHeld(id)
    setOpen(id)
    if (subRef.current) subRef.current.scrollTop = 0
  }, [])
  const back = useCallback(() => setOpen(null), [])

  /* Focus follows the level for a keyboard: in, to the back row; out, to the row that was opened. */
  const keyboardRef = useRef(false)
  useLayoutEffect(() => {
    if (!keyboardRef.current) return
    keyboardRef.current = false
    if (open) subRef.current?.querySelector<HTMLElement>("[data-browse-back]")?.focus({ preventScroll: true })
    else if (lastOpened.current)
      rootRef.current?.querySelector<HTMLElement>(`[data-browse-group="${CSS.escape(lastOpened.current)}"]`)?.focus({ preventScroll: true })
  }, [open])

  const rowBase = phone
    ? "flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[16px] leading-5 active:bg-[#f1f2f4]"
    : "flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] leading-5 hover:bg-[#f4f5f6] focus-visible:bg-[#f1f2f4]"
  const rowCommon =
    "cursor-pointer select-none text-[#1a1a2e] outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent]"
  const labelCls = phone
    ? "px-4 pb-1 pt-3 text-[13px] font-medium text-[#6b7280]"
    : "px-2.5 pb-1 pt-2 text-[12px] font-medium text-[#6b7280]"
  const detailCls = "max-w-[45%] shrink-0 truncate text-[13px] text-[#9ca3af]"

  const onKeys = (paneOf: () => HTMLElement | null) => (e: React.KeyboardEvent) => {
    const pane = paneOf()
    if (e.key === "ArrowLeft" && open && pane === subRef.current) {
      e.preventDefault()
      keyboardRef.current = true
      back()
      return
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const rows = [...(pane?.querySelectorAll<HTMLElement>("[data-browse-row]") ?? [])]
    const i = rows.indexOf(document.activeElement as HTMLElement)
    e.preventDefault()
    if (i < 0) { rows[0]?.focus(); return }
    const next = i + (e.key === "ArrowDown" ? 1 : -1)
    if (next < 0) { searchRef.current?.focus(); return }
    rows[Math.min(rows.length - 1, next)]?.focus()
  }

  const groupRow = (g: BrowseGroup) => {
    const on = selectedGroup === g.id
    const opens = g.items.length > 0
    const detail = on && opens ? g.items.find((it) => it.id === selectedItem)?.label ?? "All" : null
    return (
      <button
        key={g.id}
        type="button"
        data-browse-row=""
        data-browse-group={g.id}
        aria-current={on && !opens ? "true" : undefined}
        aria-haspopup={opens ? "true" : undefined}
        onClick={(e) => {
          if (opens) {
            keyboardRef.current = e.detail === 0
            drillIn(g.id)
          } else onPick(g.id, null)
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && opens) {
            e.preventDefault()
            keyboardRef.current = true
            drillIn(g.id)
          }
        }}
        className={cn(rowBase, rowCommon, on && "font-medium")}
      >
        <span className="min-w-0 flex-1 truncate">{g.label}</span>
        {detail ? <span className={detailCls}>{detail}</span> : null}
        {opens ? (
          <Chevron className="text-[#9ca3af]" />
        ) : (
          <Tick className={cn("text-[#1a1a2e]", on ? "opacity-100" : "opacity-0")} />
        )}
      </button>
    )
  }

  const pickRow = (key: string, label: string, on: boolean, pick: () => void, detail?: string | null) => (
    <button
      key={key}
      type="button"
      data-browse-row=""
      data-browse-option={key}
      aria-current={on ? "true" : undefined}
      onClick={pick}
      className={cn(rowBase, rowCommon, on && "font-medium")}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? <span className={detailCls}>{detail}</span> : null}
      <Tick className={cn("text-[#1a1a2e]", on ? "opacity-100" : "opacity-0")} />
    </button>
  )

  const allOn = allRow ? selectedGroup === null || selectedGroup === allRow.id : false

  /* ── The first level: the whole list, or what a search found. ── */
  const rootBody = found ? (
    <div className={phone ? "pb-2" : "p-1.5"}>
      {found.length ? (
        found.map(({ group, item }) =>
          item
            ? pickRow(`${group.id}/${item.id}`, item.label, selectedGroup === group.id && selectedItem === item.id, () => onPick(group.id, item.id), group.label)
            : pickRow(group.id, group.label, selectedGroup === group.id && !selectedItem, () => onPick(group.id, null), group.items.length ? "All" : null),
        )
      ) : (
        <p className={cn(labelCls, "pt-4")}>Nothing called “{query.trim()}”</p>
      )}
    </div>
  ) : (
    <>
      {rootTop}
      <div className={phone ? "pb-2" : "p-1.5"}>
        {heading ? <p className={labelCls}>{heading}</p> : null}
        {allRow ? pickRow(allRow.id, allRow.label, allOn, () => onPick(allRow.id, null)) : null}
        {groups.map(groupRow)}
      </div>
      {rootBottom}
    </>
  )

  /* ── The second level: a back row, all of it, then its items. ── */
  const subBody = heldGroup ? (
    <div className={phone ? "pb-2" : "p-1.5"}>
      <button
        type="button"
        data-browse-row=""
        data-browse-back=""
        onClick={(e) => {
          keyboardRef.current = e.detail === 0
          back()
        }}
        className={cn(rowBase, rowCommon, "font-semibold", phone ? "pl-2.5" : "pl-1")}
      >
        <Chevron dir="left" className={cn("text-[#6b7280]", phone && "h-5 w-5")} />
        <span className="min-w-0 flex-1 truncate">{heldGroup.label}</span>
      </button>
      {pickRow(
        `${heldGroup.id}/*`,
        `All ${heldGroup.label}`,
        selectedGroup === heldGroup.id && !selectedItem,
        () => onPick(heldGroup.id, null),
      )}
      {heldGroup.items.map((it) =>
        pickRow(`${heldGroup.id}/${it.id}`, it.label, selectedGroup === heldGroup.id && selectedItem === it.id, () => onPick(heldGroup.id, it.id)),
      )}
    </div>
  ) : null

  const still = reducedMotion()
  const arrive = still ? "none" : `transform ${BROWSE_SLIDE_MS}ms ${EASE}, opacity ${FADE_IN_MS}ms ${EASE} ${FADE_DELAY_MS}ms`
  const leave = still ? "none" : `transform ${BROWSE_SLIDE_MS}ms ${EASE}, opacity ${FADE_OUT_MS}ms ${EASE}`
  const pane = "absolute inset-0 overflow-y-auto overscroll-contain bg-white"

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)} data-category-browser="">
      {search && !searchInHeader ? (
        <div className={phone ? "shrink-0 px-4 pb-2 pt-1" : "shrink-0 border-b border-[#eef0f2] p-2"}>
          <BrowseSearch
            ref={searchRef}
            value={query}
            onChange={setQuery}
            phone={phone}
            autoFocus={autoFocusSearch}
            controls={listId}
            onEnter={() => {
              const first = found?.[0]
              if (first) onPick(first.group.id, first.item?.id ?? null)
            }}
            onDown={() => rootRef.current?.querySelector<HTMLElement>("[data-browse-row]")?.focus()}
          />
        </div>
      ) : null}
      <div id={listId} className="relative min-h-0 flex-1 overflow-hidden" style={{ contain: "layout paint" }}>
        <div
          ref={rootRef}
          data-browse-level="root"
          inert={inSub || undefined}
          aria-hidden={inSub || undefined}
          onKeyDown={onKeys(() => rootRef.current)}
          className={pane}
          style={{
            transform: inSub ? `translate3d(${SHIFT_OUT}, 0, 0)` : "translate3d(0, 0, 0)",
            opacity: inSub ? 0 : 1,
            transition: inSub ? leave : arrive,
            touchAction: "pan-y",
          }}
        >
          {rootBody}
        </div>
        <div
          ref={subRef}
          data-browse-level="sub"
          inert={!inSub || undefined}
          aria-hidden={!inSub || undefined}
          onKeyDown={onKeys(() => subRef.current)}
          onTransitionEnd={(e) => {
            /* Out of sight, out of the tree's work: nothing to paint behind the list. */
            if (e.target === e.currentTarget && e.propertyName === "transform" && !inSub) setHeld(null)
          }}
          className={pane}
          style={{
            transform: inSub ? "translate3d(0, 0, 0)" : `translate3d(${SHIFT_IN}, 0, 0)`,
            opacity: inSub ? 1 : 0,
            transition: inSub ? arrive : leave,
            touchAction: "pan-y",
            visibility: heldGroup ? "visible" : "hidden",
          }}
        >
          {subBody}
        </div>
      </div>
    </div>
  )
}

/** The search field, as the product editor's category picker draws it. */
export const BrowseSearch = ({
  ref,
  value,
  onChange,
  phone,
  autoFocus,
  onEnter,
  onDown,
  controls,
}: {
  ref?: React.Ref<HTMLInputElement>
  value: string
  onChange: (next: string) => void
  phone: boolean
  autoFocus?: boolean
  onEnter?: () => void
  onDown?: () => void
  controls?: string
}) => {
  const local = useRef<HTMLInputElement | null>(null)
  return (
    <label className={cn("flex cursor-text items-center gap-2 bg-[#f1f2f4] px-3", phone ? "h-11 rounded-[10px]" : "h-9 rounded-lg")}>
      <Magnifier className="text-[#6b7280]" />
      <input
        ref={(el) => {
          local.current = el
          if (typeof ref === "function") ref(el)
          else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
        }}
        type="search"
        data-browse-search=""
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-label="Search categories"
        aria-controls={controls}
        placeholder="Search categories"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onEnter?.() }
          if (e.key === "ArrowDown") { e.preventDefault(); onDown?.() }
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] [&::-webkit-search-cancel-button]:hidden",
          phone ? "text-[16px]" : "text-[14px]",
        )}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => { onChange(""); local.current?.focus() }}
          className="relative -mr-1.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6b7280] outline-none after:absolute after:-inset-2 after:content-[''] hover:text-[#1a1a2e]"
        >
          <svg aria-hidden viewBox="0 0 16 16" fill="none" className="h-4 w-4">
            <path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </label>
  )
}
