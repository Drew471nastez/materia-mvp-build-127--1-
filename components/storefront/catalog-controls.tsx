"use client"

/**
 * The sort control and the category selector, shared by the Featured rail on
 * the Home tab and the grid on the Products tab.
 *
 * They live here because the two tabs kept ending up with different controls
 * for the same job — a native <select> reading "Most recent" on one and a
 * dropdown reading "Sort: Most Recent" on the other, a row of pills on one and
 * nothing on the other. Two vocabularies for one idea on one page is what
 * makes a page feel assembled rather than designed.
 *
 * ON MOBILE both shrink rather than wrap: the sort becomes an icon, because
 * "Sort: Most Recent" spends half a phone's width saying something the icon
 * says, and the category selector stays a single pill instead of a row of
 * chips that pushes the products off the screen.
 */

import * as React from "react"
import { ArrowUpDown, Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type SortKey = "recent" | "oldest" | "price-low" | "price-high" | "popular"

/** One vocabulary. If you change these, both tabs change together. */
export const SORT_LABELS: Record<SortKey, string> = {
  recent: "Most Recent",
  oldest: "Oldest",
  "price-low": "Price: Low → High",
  "price-high": "Price: High → Low",
  popular: "Most Popular",
}

export function SortControl({
  value,
  onChange,
  defaultLabel,
  compact = false,
  className,
}: {
  value: SortKey
  onChange: (next: SortKey) => void
  /**
   * What to call the default. "Most Recent" is accurate until a creator
   * arranges the catalogue by hand, at which point the list is in their order
   * and the label would be describing a sort that is not being applied.
   */
  defaultLabel?: string
  /** Phone: the label collapses to an icon. */
  compact?: boolean
  className?: string
}) {
  /* One place decides what each key is called, so the trigger and the menu
     cannot disagree about it. */
  const labelFor = (key: SortKey) => (key === "recent" && defaultLabel ? defaultLabel : SORT_LABELS[key])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Sort: ${labelFor(value)}`}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          /**
           * A 7px corner, not a circle.
           *
           * A perfect circle beside the category pill read as a second pill
           * with a letter missing — two fully-round shapes of different widths
           * sitting in one row look like a mistake rather than a pair. A
           * squared-off square says "button" instead, and the two shapes stop
           * competing.
           */
          compact ? "h-9 w-9 justify-center rounded-[7px] border border-border" : "rounded-full px-2 py-1",
          className,
        )}
      >
        {compact ? (
          <ArrowUpDown className="h-4 w-4" />
        ) : (
          <>
            <span>Sort: {labelFor(value)}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <DropdownMenuItem key={key} className="cursor-pointer gap-2" onClick={() => onChange(key)}>
            <Check className={cn("h-4 w-4", key === value ? "opacity-100" : "opacity-0")} />
            {labelFor(key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface CategoryOption {
  name: string
  count: number
}

/**
 * One pill that opens the list, rather than a row of chips.
 *
 * A chip row looks fine with two categories and falls apart with nine: it
 * wraps to three lines on a phone and pushes the products below the fold. A
 * single pill costs one line whatever the creator has, and the check mark says
 * which is active without needing a filled background to carry the meaning.
 *
 * IT SHOWS EVEN WHEN "ALL" IS THE ONLY OPTION. It used to return null below
 * two categories, on the reasoning that one choice is not a choice — but the
 * pill is also the row's left-hand anchor and the place the product count is
 * read from. Without it the header collapsed to a lone control floating at the
 * right, and the count vanished from a page that had every reason to state it.
 * `All (23)` is worth a line on its own.
 */
export function CategorySelect({
  categories,
  value,
  onChange,
  total,
  className,
}: {
  categories: CategoryOption[]
  value: string | null
  onChange: (next: string | null) => void
  total: number
  className?: string
}) {
  const active = value ? categories.find((c) => c.name === value) : null
  const label = active ? `${active.name} (${active.count})` : `All (${total})`

  const trigger = (
    <span className="max-w-[45vw] truncate sm:max-w-none">{label}</span>
  )
  /**
   * `shrink`, NOT `shrink-0`, and `min-w-0` with it.
   *
   * The pill was the only wide thing in a row that refuses to shrink, so on a
   * 390px phone the heading absorbed the whole shortfall: measured with a real
   * category name and the owner's Arrange control in the row, "Products" came
   * out 29px wide, which is one letter and an ellipsis. Its own label already
   * truncates at 45vw — it was built to give way — but `shrink-0` on the
   * outside meant it never had to.
   *
   * Letting it shrink puts the truncation where it belongs: on the label that
   * says "Limited edition prints", not on the word naming the tab.
   */
  const triggerClass = cn(
    "inline-flex h-9 min-w-0 shrink items-center gap-2 rounded-full border border-border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    className,
  )

  /**
   * With no categories to choose between, the pill is a LABEL, not a menu:
   * same shape, same place, same count, no chevron and nothing to open. A
   * control that opens a menu containing only the thing already showing is a
   * small lie about what it does.
   */
  if (categories.length === 0) {
    return <span className={triggerClass}>{trigger}</span>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(triggerClass, "hover:border-foreground/30")}>
        {trigger}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[13rem]">
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => onChange(null)}>
          <Check className={cn("h-4 w-4", value === null ? "opacity-100" : "opacity-0")} />
          All ({total})
        </DropdownMenuItem>
        {categories.map((category) => (
          <DropdownMenuItem
            key={category.name}
            className="cursor-pointer gap-2"
            onClick={() => onChange(category.name)}
          >
            <Check className={cn("h-4 w-4", value === category.name ? "opacity-100" : "opacity-0")} />
            {category.name} ({category.count})
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The row above a product grid: an optional title on the left, the filter and
 * the sort on the right, and a FIXED HEIGHT.
 *
 * The two tabs kept ending up a few pixels apart above their first card, and
 * each time the fix was to make two separate numbers agree — `mt-5` on the
 * Featured rail against `mb-6`, then `mb-5`, on the Products grid. They then
 * matched only by coincidence: both rows happened to be 36px tall, because the
 * compact sort button is 36px and nothing else in the row was taller. Anything
 * that changed one row's height — a heading that wraps on a narrow phone, a
 * category named something long, a second control — moved that tab's cards and
 * not the other's, and switching tab jumped the grid.
 *
 * `min-h-9` and one margin, in one component both tabs render, makes the
 * distance from the tab bar to the first card the same by construction rather
 * than by two numbers that have to be kept equal by hand. A title is optional
 * and does not change the height: at `text-lg`/`sm:text-xl` its line box is
 * 28-32px inside a 36px row.
 */
export function CatalogHeader({
  title,
  titleClassName,
  titleStyle,
  children,
}: {
  title?: React.ReactNode
  titleClassName?: string
  titleStyle?: React.CSSProperties
  /** The controls, if the tab has any. They sit at the right on every screen. */
  children?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex min-h-9 items-center gap-x-4">
      {title ? (
        <h2 className={cn("min-w-0 truncate font-semibold text-foreground", titleClassName)} style={titleStyle}>
          {title}
        </h2>
      ) : null}
      {/*
        No controls, no box for them — the Home rail is a heading and nothing
        else. `min-h-9` above is what keeps its row the same height as the
        Products tab's, so the two tabs still put their first card at the same
        distance from the tab strip.
      */}
      {/*
        `min-w-0` so the cluster can pass a squeeze down to the one control in
        it that knows how to truncate, rather than standing firm and letting
        the heading take all of it. Everything else in here is `shrink-0` on
        its own account, so only the category pill gives.
      */}
      {children ? <div className="ml-auto flex min-w-0 items-center gap-2">{children}</div> : null}
    </div>
  )
}
