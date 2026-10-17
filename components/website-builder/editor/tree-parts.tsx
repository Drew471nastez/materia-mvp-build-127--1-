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
  onClick?: () => void
  /** 0 for a section, 1 for a section's blocks, and so on. */
  depth?: number
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: rowIndent(depth) }}
      className="flex h-8 w-full items-center rounded-md pr-1 text-left text-[13px] font-medium text-[#4b5563] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 max-sm:h-11 max-sm:text-[15px] [-webkit-tap-highlight-color:transparent]"
      {...rest}
    >
      <TreeSpacer />
      <span aria-hidden className="flex h-6 w-5 shrink-0 items-center justify-center max-sm:h-8">
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      <span className="ml-1.5 truncate">{label}</span>
    </button>
  )
}
