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
  compact = false,
  className,
}: {
  value: SortKey
  onChange: (next: SortKey) => void
  /** Phone: the label collapses to an icon. */
  compact?: boolean
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Sort: ${SORT_LABELS[value]}`}
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
            <span>Sort: {SORT_LABELS[value]}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <DropdownMenuItem key={key} className="cursor-pointer gap-2" onClick={() => onChange(key)}>
            <Check className={cn("h-4 w-4", key === value ? "opacity-100" : "opacity-0")} />
            {SORT_LABELS[key]}
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
  // Nothing to choose between: one category is not a filter.
  if (categories.length < 2) return null

  const active = value ? categories.find((c) => c.name === value) : null
  const label = active ? `${active.name} (${active.count})` : `All (${total})`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
      >
        <span className="max-w-[45vw] truncate sm:max-w-none">{label}</span>
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
  /** The controls. They sit at the right on every screen. */
  children: React.ReactNode
}) {
  return (
    <div className="mb-5 flex min-h-9 items-center gap-x-4">
      {title ? (
        <h2 className={cn("min-w-0 truncate font-semibold text-foreground", titleClassName)} style={titleStyle}>
          {title}
        </h2>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}
