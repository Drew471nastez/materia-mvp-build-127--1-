"use client"

/**
 * ===========================================================================
 *  ONE GRID FOR EVERY LINE IN THE SIDEBAR
 * ===========================================================================
 * The sidebar draws four kinds of line: a group's name, a section, a block
 * under a section, and "Add ...". They were each written on their own, so
 * each had its own left edge: a section's chevron hung further left than the
 * header's badge, a block's dot sat between two columns that did not exist
 * on a section's row, and Add section was a violet disc at one indent while
 * Add block was a grey ring at another. Down the sidebar nothing lined up.
 *
 * Every line is laid on the same grid now:
 *
 *      4px   20px      20px     6px
 *     ┌───┬─────────┬─────────┬────┬──────────────────────────┬─────────┐
 *     │pad│ twisty  │  mark   │    │ name                     │ actions │
 *     └───┴─────────┴─────────┴────┴──────────────────────────┴─────────┘
 *       ▲      ▲         ▲                  ▲
 *       │      │         │                  └ every name on one left edge
 *       │      │         └ the grip, the header's badge, a block's dot, the plus
 *       │      └ the chevron, or nothing, never a hanging glyph
 *       └ the same on a group's name, so the headings sit over their rows
 *
 * A block is one step (20px, the width of a column) further in per level, so
 * its mark lands under the name of what holds it: a tree, read down its
 * marks, rather than two lists that nearly agree.
 *
 * The mark is ONE column, never two. A section's grip and a block's dot are
 * the same 20 pixels, and a block swaps its dot for the grip under the
 * pointer rather than carrying both.
 */
import * as React from "react"
import { ChevronRight, Plus } from "lucide-react"

import { cn } from "@/lib/utils"

/** The row's own left padding, and one step in per level of the tree. */
export const ROW_PAD = 4
export const TREE_STEP = 20

/** How far in a line at this depth starts. 0 is a section, 1 its blocks, 2 the blocks inside those. */
export const rowIndent = (depth: number) => ROW_PAD + depth * TREE_STEP

/**
 * A line of the tree: 32px on a computer, a thumb's 44 on a phone. No `gap`
 * — the columns are fixed widths and the name carries the one margin, so a
 * row with no chevron is exactly as wide as a row with one.
 */
export const TREE_ROW =
  "group/row relative flex h-8 max-sm:h-11 cursor-pointer select-none items-center rounded-md pr-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-neutral-900/15"

/** What a row's name looks like, wherever it is drawn. */
export const TREE_NAME = "ml-1.5 min-w-0 flex-1 truncate text-[13px] max-sm:text-[15px] font-medium"

/** The chevron column: the twisty, or the space it would take. */
export function TreeTwisty({
  expanded,
  onToggle,
  label,
  ...rest
}: {
  expanded: boolean
  onToggle: () => void
  label: string
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={cn(
        "relative flex h-6 w-5 shrink-0 items-center justify-center rounded text-[#6b7280] transition-colors hover:text-[#1a1a2e] max-sm:h-8",
        /* A thumb's target without a thumb's column: the box reaches the row's full height and into the padding on its left, never over the grip on its right. */
        "after:absolute after:-left-1 after:right-0 after:-inset-y-1 after:content-[''] max-sm:after:-left-2 max-sm:after:-inset-y-1.5",
      )}
      {...rest}
    >
      <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-150", expanded && "rotate-90")} strokeWidth={2.25} />
    </button>
  )
}

/** The same width, with nothing in it: a row with no blocks keeps its column. */
export function TreeSpacer() {
  return <span aria-hidden className="h-6 w-5 shrink-0 max-sm:h-8" />
}

/**
 * ADD, ON THE SAME GRID. One line for "Add section" and for "Add block": the
 * plus in the mark column and the words on the names' edge. Dark grey, not
 * violet (the owner, round AH): it reads as part of the list, a step
 * stronger than a row's name, and lifts a little under the pointer.
 */
export function TreeAddRow({
  label,
  onClick,
  depth = 0,
  ...rest
}: {
  label: string
  /* The press itself, so a row that opens a panel can place it by the row (block-picker.tsx). */
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  /** 0 for a section, 1 for a section's blocks, and so on. */
  depth?: number
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: rowIndent(depth) }}
      className="group/add flex h-8 w-full items-center rounded-md pr-1 text-left text-[13px] font-medium text-[#4b5563] transition-colors duration-150 hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 active:bg-[#eceef1] max-sm:h-11 max-sm:text-[15px] [-webkit-tap-highlight-color:transparent]"
      {...rest}
    >
      <TreeSpacer />
      {/*
        A small raised key with the plus in it: white, a hairline edge and a
        soft drop. It does not move on the press: it used to sink a pixel and
        swap its drop for an inset, which read as the plus bumping each time
        Add section was clicked (the owner). The row's own grey is the press.
      */}
      <span aria-hidden className="flex h-6 w-5 shrink-0 items-center justify-center max-sm:h-8">
        <span data-add-key="" className="flex h-[18px] w-[18px] items-center justify-center rounded-[6px] bg-white text-[#4b5563] shadow-[0_0_0_1px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.10),inset_0_-1px_0_rgba(16,24,40,0.05)] transition-[box-shadow,color] duration-150 group-hover/add:text-[#1a1a2e] group-hover/add:shadow-[0_0_0_1px_rgba(16,24,40,0.16),0_2px_4px_rgba(16,24,40,0.10),inset_0_-1px_0_rgba(16,24,40,0.05)] max-sm:h-[22px] max-sm:w-[22px]">
          <Plus className="h-3 w-3" strokeWidth={2.75} />
        </span>
      </span>
      <span className="ml-1.5 truncate">{label}</span>
    </button>
  )
}

/**
 * THE LINE BETWEEN TWO ROWS THAT ADDS SOMETHING THERE: between two sections,
 * or two blocks. Quiet at rest, a hair of grey that is barely there, so the
 * list still reads as rows; under the pointer the line fades in from the
 * middle out and the same raised white key Add section wears rises in its
 * centre. Its hit area is taller than it looks (12px), so it is easy to
 * catch without the gap between rows growing. A right click opens `onMenu`.
 */
export function TreeInsertLine({
  onClick,
  onMenu,
  label,
  depth = 0,
  ...rest
}: {
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void
  onMenu?: (x: number, y: number) => void
  label: string
  /** 0 between sections, 1 between a section's blocks: the line starts at that row's indent. */
  depth?: number
} & Omit<React.HTMLAttributes<HTMLDivElement>, "onClick">) {
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      className="group/ins relative -my-1 flex h-3 cursor-pointer select-none items-center justify-center [-webkit-tap-highlight-color:transparent]"
      style={{ paddingLeft: depth ? rowIndent(depth) : undefined }}
      onClick={onClick}
      onContextMenu={(e) => {
        if (!onMenu) return
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
      {...rest}
    >
      <div
        className="pointer-events-none absolute right-0 h-px scale-x-90 bg-[linear-gradient(90deg,transparent_0%,rgba(107,114,128,0.55)_22%,#6b7280_50%,rgba(107,114,128,0.55)_78%,transparent_100%)] opacity-0 transition-[opacity,scale] duration-200 ease-out group-hover/ins:scale-x-100 group-hover/ins:opacity-100"
        style={{ left: depth ? rowIndent(depth) : 0 }}
      />
      <span className="pointer-events-none relative z-10 flex h-[18px] w-[18px] scale-75 items-center justify-center rounded-[6px] bg-white text-[#4b5563] opacity-0 shadow-[0_0_0_1px_rgba(16,24,40,0.12),0_2px_5px_rgba(16,24,40,0.14),inset_0_-1px_0_rgba(16,24,40,0.05)] transition-[opacity,scale] duration-200 ease-out group-hover/ins:scale-100 group-hover/ins:opacity-100 group-active/ins:scale-95">
        <Plus className="h-3 w-3" strokeWidth={2.75} />
      </span>
    </div>
  )
}

/**
 * A ROW THAT LEAVES FOLDS AWAY. Deleting from the sidebar used to drop the
 * row in the same frame, so the list jumped and the eye never saw what went.
 * The row now fades and folds its height to nothing over 220ms, then the
 * delete happens. Without motion preferred, it goes at once.
 */
export function foldAway(el: HTMLElement | null, then: () => void) {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (!el || reduced) {
    then()
    return
  }
  const h = el.getBoundingClientRect().height
  el.style.height = `${h}px`
  el.style.overflow = "hidden"
  el.style.pointerEvents = "none"
  void el.offsetHeight
  el.style.transition = "height 220ms cubic-bezier(0.32,0.72,0,1), opacity 160ms ease-out, transform 220ms cubic-bezier(0.32,0.72,0,1)"
  el.style.height = "0px"
  el.style.opacity = "0"
  el.style.transform = "translateX(-6px)"
  window.setTimeout(() => {
    then()
    /* Still here a moment later (the delete asked first, or was refused): the row comes back as it was. */
    window.setTimeout(() => {
      if (!el.isConnected) return
      for (const k of ["height", "overflow", "pointerEvents", "transition", "opacity", "transform"] as const) el.style[k] = ""
    }, 60)
  }, 220)
}
