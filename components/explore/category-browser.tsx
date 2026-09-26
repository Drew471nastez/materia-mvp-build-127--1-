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
 *   row on top. The new level is PUSHED in the way a phone's own lists do it:
 *   it slides in from the right edge while the list under it moves a quarter
 *   of the way left and dims a little, and back reverses it. Each level is
 *   its own scroller, so coming back puts you where you were in the list
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
 * ===========================================================================
 *  A PUSH, THE STANDARD ONE
 * ===========================================================================
 * "More standard, smooth and clean. Going back and going in is laggy. Not so
 * much animation, but not abrupt either." It was first a full width slide
 * with a blurred shadow along the new level's edge ("the shadow read as a
 * bar coming in"), then a cross of two small moves and two fades on
 * different timings, which read as two animations and still stuttered.
 *
 * Now it is the one a phone's own list does, and nothing else: the level
 * opening slides in from the right edge (100% to 0), the list under it moves
 * a quarter of the way left (0 to -25%) and dims a little under a veil, all
 * three on one curve over BROWSE_SLIDE_MS; back plays it in reverse. No
 * shadow, no fade of either list.
 *
 * WHAT MADE IT LAG, AND WHAT DOES NOT ANY MORE. The new level's rows were
 * rendered on the same frame the move began, and each list became a layer
 * of its own only once it started moving, so the first frames waited on
 * React, on painting a list, and on a layer being made. Now:
 *
 *   both lists are layers from the start (`will-change: transform`), so a
 *   move never waits for one to be made;
 *
 *   the tap draws the level and starts its move in one commit, and the
 *   press before it does nothing at all (ONE TAP, below). A transition shows
 *   where it starts on its first frame, so the rows are drawn off the right
 *   edge on that frame, where nobody sees them, and the move begins on the
 *   next: the same two frames a tap took when the rows were drawn earlier;
 *
 *   during the move nothing renders: the rows are the same elements
 *   throughout, and going back keeps the level's rows until they are out of
 *   sight (and after, so going in again is only a move).
 *
 * Transform and opacity only, on the compositor. Under reduced motion it is
 * instant.
 *
 * ===========================================================================
 *  ONE TAP, EVERY TIME
 * ===========================================================================
 * "Tapping a category to go into its subcategories does nothing, feels
 * glitchy, and only works if you tap again later." On an iPhone, in Safari
 * and in the app's WKWebView. The level used to be drawn on the PRESS
 * (pointer down), a moment before the tap, to save the tap that work: its
 * pane went from `visibility: hidden` to visible and filled with a row for
 * every subcategory, off the right edge.
 *
 * WebKit watches what a page does while a finger comes down. When something
 * that holds a control appears between the press and the click, it takes
 * the tap to have opened a hover menu, leaves that on screen and sends no
 * click (ContentChangeObserver, the rule that makes a menu shown on hover
 * work on a touch screen). Ten buttons appearing under the finger is exactly
 * that, so the first tap only drew the level and never opened it; the
 * second tap, with nothing new appearing, did. Chromium has no such rule,
 * which is why every probe here passed while the phone did not.
 *
 * So nothing happens on the press any more: no render, no attribute, no
 * style. Everything happens on the click, which WebKit has already sent by
 * then. scripts/check-explore-drill.mjs taps with real touches, while the
 * sheet rises, as it arrives, after a scroll and after back, and counts the
 * controls that appear between the press and the click: none.
 */
export const BROWSE_SLIDE_MS = 280
export const BROWSE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** How far the list under a new level moves left... */
export const BROWSE_PARALLAX = "-25%"
/** ...and how dark the veil over it gets. */
export const BROWSE_DIM = 0.06

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

/**
 * THE MARK ON THE CHOSEN ROW. "A circled check with a bit of depth." A
 * near-black disc with a white tick, a line of light along its top and a
 * soft shadow under it, the depth the app's buttons have
 * (components/ui/depth-button.ts): no gradient, no glow.
 *
 * It is always there and only shown or not, so a choice moving from one row
 * to another is two small movements on the compositor: the new one grows
 * in from 60% as it fades up, the old one shrinks away a little quicker.
 * Scale and opacity only (Tailwind's `scale-*` is the `scale` property, so
 * that is the one the transition names). Nothing about the row's text
 * changes, so nothing reflows under the finger.
 */
export function CheckDisc({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      data-check-disc={on ? "on" : "off"}
      className={cn(
        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#1a1a2e] text-white",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.25),0_1px_2px_rgba(15,23,42,0.22),0_3px_8px_-2px_rgba(15,23,42,0.24)]",
        "transition-[scale,opacity] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        on ? "scale-100 opacity-100 duration-[240ms]" : "scale-[0.6] opacity-0 duration-150",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3">
        <path d="M3.6 8.4 6.5 11.2 12.4 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export function Magnifier({ className }: { className?: string }) {
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
     second keeps its rows after going back, so they are there while it slides
     out, and there already if the same group is opened again. */
  const [open, setOpen] = useState<string | null>(null)
  const [held, setHeld] = useState<string | null>(null)
  /* The second level is out of sight and still: nothing of it is drawn. */
  const [subOut, setSubOut] = useState(true)
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

  /* On the tap, never the press (ONE TAP): the rows and the move in one commit. */
  const drillIn = useCallback((id: string) => {
    lastOpened.current = id
    if (subRef.current) subRef.current.scrollTop = 0
    setHeld(id)
    setSubOut(false)
    setOpen(id)
  }, [])
  const back = useCallback(() => {
    setOpen(null)
    /* Nothing moves under reduced motion, so no move ends to say it is out. */
    if (reducedMotion()) setSubOut(true)
  }, [])

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
        className={cn(rowBase, rowCommon)}
      >
        <span className="min-w-0 flex-1 truncate">{g.label}</span>
        {detail ? <span className={detailCls}>{detail}</span> : null}
        {opens ? <Chevron className="text-[#9ca3af]" /> : <CheckDisc on={on} />}
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
      className={cn(rowBase, rowCommon)}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? <span className={detailCls}>{detail}</span> : null}
      <CheckDisc on={on} />
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
  /* One move, one curve, for both lists and the veil. */
  const move = still ? "none" : `transform ${BROWSE_SLIDE_MS}ms ${BROWSE_EASE}`
  const veil = still ? "none" : `opacity ${BROWSE_SLIDE_MS}ms ${BROWSE_EASE}`
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
            transform: inSub ? `translate3d(${BROWSE_PARALLAX}, 0, 0)` : "translate3d(0, 0, 0)",
            transition: move,
            willChange: "transform",
            touchAction: "pan-y",
          }}
        >
          {rootBody}
        </div>
        {/* The veil that dims the list under a new level: over it, under the level. */}
        <div
          aria-hidden
          data-browse-veil=""
          className="pointer-events-none absolute inset-0 bg-[#0f172a]"
          style={{ opacity: inSub ? BROWSE_DIM : 0, transition: veil, willChange: "opacity" }}
        />
        <div
          ref={subRef}
          data-browse-level="sub"
          inert={!inSub || undefined}
          aria-hidden={!inSub || undefined}
          onKeyDown={onKeys(() => subRef.current)}
          onTransitionEnd={(e) => {
            /* Out of sight and still: not drawn, but its rows kept, for going in again. */
            if (e.target === e.currentTarget && e.propertyName === "transform" && !inSub) setSubOut(true)
          }}
          className={pane}
          style={{
            transform: inSub ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)",
            transition: move,
            willChange: "transform",
            touchAction: "pan-y",
            visibility: heldGroup && (inSub || !subOut) ? "visible" : "hidden",
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
